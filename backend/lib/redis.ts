import { Redis } from "ioredis";
import { createLog, type OpLogger } from "./logger.js";

// TTLs (seconds)
export const PRODUCT_TTL_S        = 5 * 60;   // 5 min  — PDP product detail
export const REC_TTL_S            = 10 * 60;  // 10 min — PDP recommendations
export const CATALOG_LIST_TTL_S   = 10 * 60;  // 10 min — catalog thin list
export const CATALOG_DETAIL_TTL_S = 2 * 60;   // 2 min  — catalog full detail per SKU

type RedisClient = InstanceType<typeof Redis>;
let client: RedisClient | null = null;

function createClient(): RedisClient | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  redis.on("error", (err: Error) => {
    if (process.env.NODE_ENV !== "test") {
      const log = createLog();
      log.warn(`Redis connection error — falling back to DB : ${err.message}`);
    }
  });

  return redis;
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
  prefix: "pdp" | "rec" | "catalog-list" | "catalog-detail",
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
