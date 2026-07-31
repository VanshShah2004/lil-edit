import { Redis } from "ioredis";
import { createLog, type OpLogger } from "./logger.js";

// TTLs (seconds)
export const PRODUCT_TTL_S        = 5 * 60;   // 5 min  — PDP product detail
export const REC_TTL_S            = 10 * 60;  // 10 min — PDP recommendations
export const REVIEWS_TTL_S        = 5 * 60;   // 5 min  — PDP reviews; invalidate on new review
export const CATALOG_LIST_TTL_S   = 10 * 60;  // 10 min — catalog thin list
export const CATALOG_DETAIL_TTL_S = 2 * 60;   // 2 min  — catalog full detail per SKU
export const CART_TTL_S           = 60;        // 60s   — per-user cart; invalidated on every mutation
export const WISHLIST_TTL_S       = 60;        // 60s   — per-user wishlist; invalidated on every mutation
export const ORDER_TTL_S          = 60;        // 60s   — per-user orders; short so seeded/new rows surface quickly
export const SUGGESTION_TTL_S     = 5 * 60;   // 5 min  — search auto-suggestions
export const CURATION_TTL_S       = 5 * 60;   // 5 min  — resolved curated section (incl. random fallback)
export const CHECKOUT_TTL_S       = 30 * 60;  // 30 min — priced checkout snapshot held between /initiate and /verify

type RedisClient = InstanceType<typeof Redis>;
let client: RedisClient | null = null;

function createClient(): RedisClient | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    // TCP-level keepalive — prevents OS from silently dropping idle sockets
    keepAlive: 5000,
    // Auto-reconnect on connection reset (Upstash drops idle connections)
    reconnectOnError: (err) =>
      ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED"].some((code) =>
        err.message.includes(code)
      ),
  });

  redis.on("error", (err: Error) => {
    if (process.env.NODE_ENV !== "test") {
      const log = createLog();
      log.warn(`Redis connection error — falling back to DB : ${err.message}`);
    }
  });

  return redis;
}

const REDIS_PING_INTERVAL_MS = 250_000; // ~4.2 min — under Upstash's ~310s idle timeout, keeps the connection warm without burning the free-tier command quota

/**
 * Sends a PING every 30 seconds to keep the Upstash TCP connection alive.
 * Only logs on failure — no noise on success.
 * Call once after warmupRedis() in server startup.
 */
export function startRedisKeepalive(): void {
  const redis = getRedis();
  if (!redis) return;

  setInterval(async () => {
    const log = createLog().start("REDIS KEEPALIVE");
    try {
      await redis.ping();
      log.success("ping OK — connection alive").end("REDIS KEEPALIVE");
    } catch (err) {
      log.warn(`ping failed — connection may have dropped : ${(err as Error).message}`).end("REDIS KEEPALIVE");
    }
  }, REDIS_PING_INTERVAL_MS);

  const log = createLog().start("REDIS KEEPALIVE");
  log.success(`started — ping every ${REDIS_PING_INTERVAL_MS / 1000}s`).end("REDIS KEEPALIVE");
}

export function getRedis(): RedisClient | null {
  if (client === null) client = createClient();
  return client;
}

/** Get a parsed JSON value from Redis. Returns null on miss or error. */
export async function redisGet<T>(key: string, log: OpLogger): Promise<T | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const raw = await redis.get(key);
    if (raw) {
      log.step(`L2 Redis - HIT  key=${key}`);
      return JSON.parse(raw) as T;
    }
    log.step(`L2 Redis - MISS  key=${key}`);
    return null;
  } catch (err) {
    log.warn(`L2 Redis - GET failed  key=${key} : ${(err as Error).message}`);
    return null;
  }
}

/** Set a JSON value in Redis with a TTL in seconds. Silently ignores errors. */
export async function redisSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
  log: OpLogger,
): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    log.step(`L2 Redis - SET  key=${key}  TTL=${ttlSeconds}s`);
  } catch (err) {
    log.warn(`L2 Redis - SET failed  key=${key} : ${(err as Error).message}`);
  }
}

/**
 * Atomic single-use claim — `SET key value EX ttl NX`. Returns:
 *   "acquired"    — the key did not exist and is now set (caller holds the claim),
 *   "held"        — the key already existed (someone else holds it),
 *   "unavailable" — Redis is disabled or errored (caller should fail OPEN).
 * Used for short-lived reservations, e.g. "only one in-flight first-order coupon per user".
 */
export async function redisSetNX(
  key: string,
  value: string,
  ttlSeconds: number,
  log: OpLogger,
): Promise<"acquired" | "held" | "unavailable"> {
  try {
    const redis = getRedis();
    if (!redis) return "unavailable";
    const res = await redis.set(key, value, "EX", ttlSeconds, "NX");
    const acquired = res === "OK";
    log.step(`L2 Redis - SETNX  key=${key}  TTL=${ttlSeconds}s  → ${acquired ? "ACQUIRED" : "HELD"}`);
    return acquired ? "acquired" : "held";
  } catch (err) {
    log.warn(`L2 Redis - SETNX failed  key=${key} : ${(err as Error).message}`);
    return "unavailable";
  }
}

/** Delete one or more keys. log is first so rest-params spread stays clean. */
export async function redisDel(log: OpLogger, ...keys: string[]): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(...keys);
    log.step(`L2 Redis - DEL  ${keys.length} key(s) : ${keys.join(", ")}`);
  } catch (err) {
    log.warn(`L2 Redis - DEL failed : ${(err as Error).message}`);
  }
}

export function redisKey(
  prefix: "pdp" | "rec" | "reviews" | "catalog-list" | "catalog-detail" | "cart" | "wishlist" | "suggestions" | "search" | "order" | "curation" | "checkout" | "analytics",
  slug: string,
): string {
  return `${prefix}:${slug}`;
}

/** Eagerly connect and verify Redis. Called once at server startup. */
export async function warmupRedis(log: OpLogger): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    log.warn("REDIS_URL not set — L2 cache disabled, using DB directly");
    return;
  }
  try {
    await redis.connect();
    log.success("Redis connected — L2 cache active");
  } catch (err) {
    log.error("Redis connection failed — L2 cache disabled", err);
  }
}
