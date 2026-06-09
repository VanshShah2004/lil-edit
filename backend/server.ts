import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import compression from "compression";
import dotenv from "dotenv";
import authRouter from "./routes/auth.js";
import productsRouter from "./routes/products.js";
import skuRouter from "./routes/sku.js";
import cartRouter from "./routes/cart.js";
import wishlistRouter from "./routes/wishlist.js";
import ordersRouter from "./routes/orders.js";
import adminOrdersRouter from "./routes/adminOrders.js";
import { rateLimit } from "express-rate-limit";
import { warmupRedis, startRedisKeepalive, getRedis, redisSet, redisKey, CATALOG_LIST_TTL_S } from "./lib/redis.js";
import { fetchThinProductList } from "./lib/persistCatalog.js";
import { supabaseAdmin, supabaseAnon } from "./lib/supabase.js";
import { createLog } from "./lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();

const origin =
  process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean) ?? [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
  ];

// ─── Rate limiters ─────────────────────────────────────────────────────────────
// Three tiers, applied at the point where specificity is needed:
//
//  globalLimiter         — every route; generous ceiling to stop hammering
//  mutationLimiter       — user-facing writes (orders, cart, wishlist)
//  adminMutationLimiter  — admin status/payment PATCH; tightest, since a stolen
//                          admin token doing a few hundred RPCs would spam the
//                          audit trail and cause significant DB write pressure
//
// windowMs=15 minutes is the standard; shorter windows mean faster reset after
// a genuine spike but also weaker protection against sustained abuse.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 min
  limit: 500,                  // 500 req / IP / window across all routes
  standardHeaders: "draft-8",  // Return RateLimit-* headers (RFC 9110 draft)
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down." },
});

const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,                  // 100 writes / IP / 15 min
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down." },
});

const adminMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,                   // 60 admin writes / IP / 15 min (~1 every 15 s sustained)
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many admin requests — please slow down." },
});

const PORT = Number(process.env.PORT) || 5000;

app.use(compression());
app.use(cors({ origin, credentials: true }));
// Global JSON body limit: 1 MB is ample for any API payload here. The only
// exception is product image uploads (base64 encoded), which get their own
// higher limit applied directly on the products router.
app.use(express.json({ limit: "1mb" }));

// Global rate limiter — applied before routing so every path is covered.
app.use(globalLimiter);

app.use("/api/auth",         authRouter);
app.use("/api/products",     productsRouter);
app.use("/api/sku",          skuRouter);
app.use("/api/cart",         cartRouter,         mutationLimiter);
app.use("/api/wishlist",     wishlistRouter,      mutationLimiter);
app.use("/api/orders",       ordersRouter);
app.use("/api/admin/orders", adminMutationLimiter, adminOrdersRouter);

app.get("/", (_req, res) => {
  res.json({ ok: true, message: "new-ecomm backend" });
});

const DB_KEEPALIVE_MS = 4 * 60 * 1000; // 4 min — Supabase idles after ~5 min

function startDbKeepAlive(): void {
  const client = supabaseAdmin ?? supabaseAnon;
  setInterval(async () => {
    const log = createLog().start("DB KEEPALIVE");
    try {
      await client.from("products").select("id").limit(1);
      log.success("ping OK").end("DB KEEPALIVE");
    } catch (err) {
      log.error("ping failed", err).end("DB KEEPALIVE");
    }
  }, DB_KEEPALIVE_MS);
}

async function warmupCatalogCache(): Promise<void> {
  if (!getRedis() || !supabaseAdmin) return;
  const log = createLog().start("CATALOG WARMUP");

  const targets: Array<{ status: "ALL" | "PUBLISHED" | "DRAFT"; limit: number | undefined }> = [
    { status: "ALL",       limit: undefined },
    { status: "PUBLISHED", limit: undefined },
    { status: "ALL",       limit: 10 },
  ];

  await Promise.all(
    targets.map(async ({ status, limit }) => {
      const key = redisKey("catalog-list", `${status}:${limit ?? "ALL"}`);
      try {
        const result = await fetchThinProductList(status, limit, log);
        await redisSet(key, result, CATALOG_LIST_TTL_S, log);
      } catch (err) {
        log.warn(`failed to warm  key=${key} : ${(err as Error).message}`);
      }
    })
  );

  log.success("3 catalog keys warmed").end("CATALOG WARMUP");
}

async function warmupStorage(): Promise<void> {
  if (!supabaseAdmin) return;
  const log = createLog().start("STORAGE WARMUP");
  const { error } = await supabaseAdmin.storage.createBucket("product-images", { public: true });
  if (error && !error.message.toLowerCase().includes("already exists")) {
    log.error(`bucket creation failed: ${error.message}`, error).end("STORAGE WARMUP");
  } else {
    log.success('bucket "product-images" ready').end("STORAGE WARMUP");
  }
}

app.listen(PORT, () => {
  console.log(`\nAPI listening on http://localhost:${PORT}`);

  const log = createLog().start("REDIS WARMUP");
  void warmupRedis(log).then(() => {
    log.end("REDIS WARMUP");
    startRedisKeepalive();
    void warmupCatalogCache();
  });

  void warmupStorage();

  startDbKeepAlive();
});
