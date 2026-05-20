import { Redis } from "ioredis";

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
    maxRetriesPerRequest: 1,   // fail fast so we fall through to DB
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  redis.on("error", (err: Error) => {
    // Log once; don't crash the server
    if (process.env.NODE_ENV !== "test") {
      console.warn("[Redis] connection error — falling back to DB:", err.message);
    }
  });

  return redis;
}

export function getRedis(): RedisClient | null {
  if (client === null) {
    client = createClient();
  }
  return client;
}

const DEV = process.env.NODE_ENV !== "production";

/** Get a parsed JSON value from Redis. Returns null on miss or error. */
export async function redisGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const raw = await redis.get(key);
    if (DEV) console.log(`[Redis] GET ${key} →`, raw ? "HIT" : "MISS");
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    if (DEV) console.warn(`[Redis] GET ${key} failed:`, (err as Error).message);
    return null;
  }
}

/** Set a JSON value in Redis with a TTL in seconds. Silently ignores errors. */
export async function redisSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    if (DEV) console.log(`[Redis] SET ${key} (TTL ${ttlSeconds}s)`);
  } catch (err) {
    if (DEV) console.warn(`[Redis] SET ${key} failed:`, (err as Error).message);
  }
}

/** Delete one or more keys. Silently ignores errors. */
export async function redisDel(...keys: string[]): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(...keys);
    if (DEV) console.log(`[Redis] DEL ${keys.join(", ")}`);
  } catch (err) {
    if (DEV) console.warn(`[Redis] DEL ${keys.join(", ")} failed:`, (err as Error).message);
  }
}

export function redisKey(
  prefix: "pdp" | "rec" | "catalog-list" | "catalog-detail",
  slug: string
): string {
  return `${prefix}:${slug}`;
}

/** Eagerly connect and verify Redis. Called once at server startup. */
export async function warmupRedis(): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    console.log("[Redis] REDIS_URL not set — L2 cache disabled, using L1 only.");
    return;
  }
  try {
    await redis.connect();
    console.log("[Redis] Connected ✓ — L2 cache active.");
  } catch (err) {
    console.warn("[Redis] Connection failed — L2 cache disabled:", (err as Error).message);
  }
}
