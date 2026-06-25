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
import curationRouter from "./routes/curation.js";
import checkoutRouter, { webhookHandler } from "./routes/checkout.js";
import { resendWebhookHandler } from "./routes/emailWebhook.js";
import { globalLimiter, mutationLimiter } from "./middleware/rateLimiters.js";
import { warmupRedis, startRedisKeepalive, getRedis, redisSet, redisKey, CATALOG_LIST_TTL_S } from "./lib/redis.js";
import { fetchThinProductList } from "./lib/persistCatalog.js";
import { supabaseAdmin, supabaseAnon } from "./lib/supabase.js";
import { createLog } from "./lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();

// Trust ONE proxy hop (the platform LB / reverse proxy in front of us) so req.ip is the
// real client IP from X-Forwarded-For instead of the proxy's. Without this, rate limiting
// keys every request to the same proxy IP (one shared bucket for all users). Kept at `1`
// (not `true`) so clients can't spoof X-Forwarded-For to dodge the limiter.
app.set("trust proxy", 1);

const origin =
  process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean) ?? [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
  ];

// Rate limiters live in ./middleware/rateLimiters.ts. The admin write-limiter is applied
// inside the admin router on its PATCH handlers only (so admin GETs aren't throttled).

const PORT = Number(process.env.PORT) || 5000;

app.use(compression());
app.use(cors({ origin, credentials: true }));

// Razorpay webhook HMAC is computed over the RAW request bytes, so the webhook must
// be registered with a raw parser on its exact path BEFORE the global JSON middleware
// (which would otherwise consume the stream and leave nothing to verify the signature
// against). It also sits ahead of every limiter so Razorpay's retries are never
// throttled. Everything else on /api/checkout rides the JSON parser + router below.
app.use("/api/checkout/webhook", express.raw({ type: "*/*" }), webhookHandler);

// Resend's delivery webhook is signed the same way (HMAC over raw bytes, Svix headers),
// so it likewise needs the raw parser before express.json and sits ahead of the limiters.
app.use("/api/email/webhook", express.raw({ type: "*/*" }), resendWebhookHandler);

// Global JSON body limit: 1 MB is ample for any API payload here. The only
// exception is product image uploads (base64 encoded), which get their own
// higher limit applied directly on the products router.
app.use(express.json({ limit: "1mb" }));

// Global rate limiter — applied before routing so every path is covered.
app.use(globalLimiter);

app.use("/api/auth",         authRouter);
app.use("/api/products",     productsRouter);
app.use("/api/sku",          skuRouter);
// Limiter BEFORE the router so it actually gates the request (a router placed first
// would handle + respond before the limiter ever ran).
app.use("/api/cart",         mutationLimiter, cartRouter);
app.use("/api/wishlist",     mutationLimiter, wishlistRouter);
app.use("/api/orders",       ordersRouter);
// Admin GETs ride the global limiter; the tight write-limiter is applied to the PATCH
// handlers inside the router (see adminOrders.ts).
app.use("/api/admin/orders", adminOrdersRouter);
// Public GET /sections rides the global limiter; admin writes get the tight
// write-limiter applied to the PUT/PATCH handlers inside the router (see curation.ts).
app.use("/api/curation",     curationRouter);
// Checkout: /initiate + /verify apply mutationLimiter inside the router (so the
// webhook above and the /coupon GET aren't throttled). Placement runs through the
// service-role client + the place_order RPC.
app.use("/api/checkout",     checkoutRouter);

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
