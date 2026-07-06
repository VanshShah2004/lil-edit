import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response, type NextFunction } from "express";
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
import adminAccessRouter from "./routes/adminAccess.js";
import adminActivityRouter from "./routes/adminActivity.js";
import adminAuditLogRouter from "./routes/adminAuditLog.js";
import couponsRouter from "./routes/coupons.js";
import adminReviewsRouter from "./routes/adminReviews.js";
import curationRouter from "./routes/curation.js";
import checkoutRouter, { webhookHandler } from "./routes/checkout.js";
import shareRouter from "./routes/share.js";
import newsletterRouter from "./routes/newsletter.js";
import maintenanceRouter from "./routes/maintenance.js";
import trackRouter from "./routes/track.js";
import adminAnalyticsRouter from "./routes/adminAnalytics.js";
import { maintenanceGate } from "./middleware/maintenanceGate.js";
import { startMaintenanceWatcher } from "./lib/maintenance.js";
import { startReceiptSweep } from "./lib/orderReceipt.js";
import { startAutoProcessNotifySweep } from "./lib/processingNotify.js";
import { buildProductOgMeta, injectOgIntoHtml } from "./lib/ogTags.js";
import { fetchProductBySku } from "./lib/persistCatalog.js";
import { publicSiteUrl } from "./lib/siteUrl.js";
import { globalLimiter, mutationLimiter } from "./middleware/rateLimiters.js";
import { warmupRedis, startRedisKeepalive, getRedis, redisSet, redisKey, CATALOG_LIST_TTL_S } from "./lib/redis.js";
import { fetchThinProductList } from "./lib/persistCatalog.js";
import { supabaseAdmin, supabaseAnon } from "./lib/supabase.js";
import { createLog } from "./lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

// Process-level backstop. The app deliberately runs best-effort, fire-and-forget tasks
// (confirmation email, review verification, cache busts) that are NOT awaited by the request
// — on modern Node a single unhandled rejection from one of those would crash the WHOLE
// server. Each such task is written to swallow its own errors, but this guarantees that even
// if one regresses, a stray async error logs instead of taking the API down. uncaughtException
// is the synchronous twin. We log and keep serving (never exit) — these paths are never
// critical enough to justify dropping every in-flight request.
process.on("unhandledRejection", (reason) => {
  console.error("[server] UNHANDLED PROMISE REJECTION — keeping the server alive:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[server] UNCAUGHT EXCEPTION — keeping the server alive:", err);
});

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

// Global JSON body limit: 1 MB is ample for any API payload here. The only
// exception is product image uploads (base64 encoded), which get their own
// higher limit applied directly on the products router.
app.use(express.json({ limit: "1mb" }));

// Global rate limiter — applied before routing so every path is covered.
app.use(globalLimiter);

// Mounted ABOVE the maintenance gate so they always work while the site is off:
//   /api/maintenance → public status (drives the coming-soon page) + admin toggle.
//   /api/auth        → login/OTP, so a logged-out admin can sign in and flip it back.
app.use("/api/maintenance",  maintenanceRouter);
app.use("/api/auth",         authRouter);

// Site kill switch. When ON, every customer-facing /api call below is refused with
// 503 for non-admins (the frontend shows the branded coming-soon page; this is the
// airtight API backstop). When OFF this is a single boolean read — no added latency.
app.use(maintenanceGate);

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
// Admin account management (grant/revoke admin status). GET rides the global limiter;
// the grant/revoke POSTs apply the tight admin write-limiter inside the router.
app.use("/api/admin/access",   adminAccessRouter);
app.use("/api/admin/coupons",  couponsRouter);
// Admin review moderation (verify/delete). Every endpoint is gated by
// requireAuth + requireAdmin inside the router.
app.use("/api/admin/reviews",  adminReviewsRouter);
// Admin activity feed (read-only). GETs ride the global limiter; every endpoint is
// gated by requireAuth + requireAdmin inside the router.
app.use("/api/admin/activity", adminActivityRouter);
// Admin audit log (read-only): the trail of actions taken BY admins. Written from
// the mutation routes via logAdminAction; gated by requireAuth + requireAdmin.
app.use("/api/admin/audit-log", adminAuditLogRouter);
// Public GET /sections rides the global limiter; admin writes get the tight
// write-limiter applied to the PUT/PATCH handlers inside the router (see curation.ts).
app.use("/api/curation",     curationRouter);
// Checkout: /initiate + /verify apply mutationLimiter inside the router (so the
// webhook above and the /coupon GET aren't throttled). Placement runs through the
// service-role client + the place_order RPC.
app.use("/api/checkout",     checkoutRouter);
app.use("/api/newsletter",   mutationLimiter, newsletterRouter);
// Analytics beacons (views/heartbeats): public, write-only, fire-and-forget.
// Rides the global limiter only — beacons are frequent by design and always 204.
app.use("/api/track",        trackRouter);
// Admin analytics platform (read-only aggregations). Every endpoint is gated by
// requireAuth + requireAdmin inside the router — analytics is admin-access ONLY.
app.use("/api/admin/analytics", adminAnalyticsRouter);

// Link-preview Open Graph tags for shared PDP URLs (host-agnostic — see routes/share.ts).
app.use("/share", shareRouter);

// ─── Optional: host the built storefront from this server ─────────────────────
// Off by default — pure-API deployments (frontend on a separate static host) are
// untouched. When SERVE_FRONTEND=true and a build exists, this server serves the
// SPA AND injects per-product Open Graph tags into the PDP's HTML, so link-preview
// crawlers (WhatsApp/Telegram/Facebook/iMessage/Slack) show the product photo,
// title and price on the SAME clean PDP URL — no separate /share link needed.
function setupFrontendServing(): boolean {
  if (process.env.SERVE_FRONTEND !== "true") return false;

  const distDir = process.env.FRONTEND_DIST_DIR
    ? path.resolve(process.env.FRONTEND_DIST_DIR)
    : path.join(__dirname, "../lil-edit/dist");
  const indexPath = path.join(distDir, "index.html");

  if (!fs.existsSync(indexPath)) {
    console.warn(`[server] SERVE_FRONTEND=true but no build at ${indexPath} — skipping SPA serving`);
    return false;
  }

  const indexTemplate = fs.readFileSync(indexPath, "utf8");

  // Hashed asset files (JS/CSS/images). index:false so "/" flows to our handler below.
  app.use(express.static(distDir, { index: false, maxAge: "1y" }));

  const PDP_RE = /^\/collections\/([^/]+)\/product\/([^/]+)\/?$/;

  // Catch-all (Express 5 regex route). PDP paths get product OG tags injected;
  // every other route gets the plain SPA shell. /api and /share are excluded.
  app.get(/.*/, async (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/share")) {
      next();
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    const match = req.path.match(PDP_RE);
    if (!match) {
      res.send(indexTemplate);
      return;
    }

    const category = decodeURIComponent(match[1] ?? "");
    const productPath = decodeURIComponent(match[2] ?? "");
    const sep = productPath.indexOf("$");
    const slug = sep >= 0 ? productPath.slice(0, sep) : productPath;
    const sku = sep >= 0 ? productPath.slice(sep + 1) : "";

    if (!sku) {
      res.send(indexTemplate);
      return;
    }

    const log = createLog().start("OG INJECT");
    try {
      const product = await fetchProductBySku(sku, log);
      if (!product || product.slug !== slug || product.category_slug !== category) {
        log.warn("no match — serving plain shell").end("OG INJECT");
        res.send(indexTemplate);
        return;
      }
      const canonicalUrl = `${publicSiteUrl()}${req.path}`;
      const meta = buildProductOgMeta(product, canonicalUrl, sku);
      log.success(`injected  image=${meta.image ? "yes" : "none"}`).end("OG INJECT");
      res.send(injectOgIntoHtml(indexTemplate, meta));
    } catch (err) {
      log.error("failed — serving plain shell", err).end("OG INJECT");
      res.send(indexTemplate);
    }
  });

  console.log(`[server] serving storefront from ${distDir} (with PDP OG injection)`);
  return true;
}

// Health check. Always available at /healthz; also at "/" unless this server is
// hosting the storefront (in which case "/" serves the SPA home).
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, message: "new-ecomm backend" });
});

const servingFrontend = setupFrontendServing();

if (!servingFrontend) {
  app.get("/", (_req, res) => {
    res.json({ ok: true, message: "new-ecomm backend" });
  });
}

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

  // Prime the maintenance flag and keep it fresh (fail-open to live).
  startMaintenanceWatcher();

  // Self-healing receipt recovery: periodically re-send confirmation receipts that were
  // lost at placement (works even when the Razorpay webhook isn't configured).
  startReceiptSweep();

  // Email customers when the scheduled confirmed→processing transition (auto_confirm_to_
  // processing, run by pg_cron) moves their order — the DB-side transition can't reach the
  // Node mailer, so this sweep sends the "now processing" notice on its own.
  startAutoProcessNotifySweep();
});
