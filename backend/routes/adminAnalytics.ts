import { performance } from "perf_hooks";
import { Router, type Request, type Response } from "express";
import { type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { redisGet, redisSet, redisKey } from "../lib/redis.js";
import { createLog, fms, type OpLogger } from "../lib/logger.js";

// ─── Admin Analytics API ──────────────────────────────────────────────────────
// Read-only aggregation endpoints for the admin analytics platform. Every page
// maps to ONE SQL function (20260712/20260713 migrations) returning the page's
// full payload in a single DB round trip; this router only:
//   • validates the date range / bucket / filters,
//   • derives the comparison window (same length, immediately before),
//   • caches the payload in Redis (60s — dashboards poll, the DB shouldn't),
//   • degrades with actionable 503s when a migration hasn't been run yet.
// ACCESS IS ADMIN-ONLY: requireAuth + requireAdmin on the whole router, and the
// RPCs themselves are EXECUTE-revoked from anon/authenticated in SQL.

const router = Router();
router.use(requireAuth, requireAdmin);

const ANALYTICS_TTL_S = 60;   // dashboards refetch freely; the DB sees ≤1 query/min/page
const MAX_RANGE_DAYS  = 400;  // hard clamp — a runaway range can't table-scan years

// Reading analytics needs the service role: every analytics table/RPC is locked
// away from the PostgREST client roles.
function serviceClientOr503(res: Response, log: OpLogger): SupabaseClient | null {
  if (supabaseAdmin) return supabaseAdmin;
  log.error("SUPABASE_SERVICE_ROLE_KEY not configured — analytics unavailable").end("ADMIN ANALYTICS");
  res.status(503).json({
    error:
      "Analytics is unavailable: the backend is missing SUPABASE_SERVICE_ROLE_KEY. Set it in backend/.env and restart.",
  });
  return null;
}

// PostgREST codes for "function/table missing" → the migration wasn't applied.
function isMissingObjectError(code?: string, message?: string): boolean {
  return (
    code === "42883" ||   // undefined_function
    code === "42P01" ||   // undefined_table
    code === "PGRST202" || // function not in schema cache
    code === "PGRST205" || // table not in schema cache
    /does not exist|find the function|find the table|schema cache/i.test(message ?? "")
  );
}

const MIGRATION_HINT =
  "Analytics isn't set up in the database yet. Run lil-edit/supabase/migrations/" +
  "20260711_analytics_foundation.sql, 20260712_analytics_rpcs_core.sql and " +
  "20260713_analytics_rpcs_detail.sql in the Supabase SQL editor.";

// ─── Window parsing ───────────────────────────────────────────────────────────
interface Window {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  bucket: "day" | "week" | "month";
}

// Defaults to the last 30 days. `to` is EXCLUSIVE (pass tomorrow to include
// today). The comparison window is the same length immediately before `from`.
function parseWindow(req: Request): Window | { error: string } {
  const now = new Date();
  const defTo = new Date(now.getTime() + 60_000); // "now" + slack so today counts
  const defFrom = new Date(defTo.getTime() - 30 * 86_400_000);

  const rawFrom = (req.query.from as string | undefined)?.trim();
  const rawTo = (req.query.to as string | undefined)?.trim();

  const from = rawFrom ? new Date(rawFrom) : defFrom;
  const to = rawTo ? new Date(rawTo) : defTo;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { error: "from/to must be ISO dates" };
  }
  if (to <= from) return { error: "'to' must be after 'from'" };

  const spanMs = to.getTime() - from.getTime();
  if (spanMs > MAX_RANGE_DAYS * 86_400_000) {
    return { error: `Date range too large (max ${MAX_RANGE_DAYS} days)` };
  }

  const rawBucket = (req.query.bucket as string | undefined)?.trim();
  const bucket = rawBucket === "week" || rawBucket === "month" ? rawBucket : "day";

  return {
    from,
    to,
    prevFrom: new Date(from.getTime() - spanMs),
    prevTo: from,
    bucket,
  };
}

// Optional cross-page filters, forwarded to the RPCs as jsonb.
function parseFilters(req: Request): Record<string, string> {
  const filters: Record<string, string> = {};
  const category = (req.query.category as string | undefined)?.trim();
  const payment = (req.query.payment_method as string | undefined)?.trim();
  const coupon = (req.query.coupon_code as string | undefined)?.trim();
  if (category && category.length <= 120) filters.category = category;
  if (payment === "cod" || payment === "online") filters.payment_method = payment;
  if (coupon && coupon.length <= 60) filters.coupon_code = coupon.toUpperCase();
  return filters;
}

// ─── Shared handler: cache → RPC → respond ────────────────────────────────────
type ArgsBuilder = (w: Window, filters: Record<string, string>, req: Request) => Record<string, unknown>;

async function servePage(
  req: Request,
  res: Response,
  page: string,
  rpc: string,
  buildArgs: ArgsBuilder,
  opts: { cacheable?: boolean; windowed?: boolean } = {}
): Promise<void> {
  const { cacheable = true, windowed = true } = opts;
  const log = createLog().start("ADMIN ANALYTICS");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const adminId = (req as AuthenticatedRequest).userId;

  let win: Window | null = null;
  let filters: Record<string, string> = {};
  if (windowed) {
    const parsed = parseWindow(req);
    if ("error" in parsed) {
      log.warn(`bad window: ${parsed.error}`).end("ADMIN ANALYTICS");
      res.status(400).json({ error: parsed.error });
      return;
    }
    win = parsed;
    filters = parseFilters(req);
  }

  const meta = win
    ? {
        from: win.from.toISOString(),
        to: win.to.toISOString(),
        prevFrom: win.prevFrom.toISOString(),
        prevTo: win.prevTo.toISOString(),
        bucket: win.bucket,
        filters,
      }
    : {};

  log.step(`admin=${adminId}  page=${page}  ${win ? `from=${meta.from}  to=${meta.to}  bucket=${win.bucket}` : "live"}  filters=${JSON.stringify(filters)}`);

  // Cache key covers every input that changes the payload.
  const slugPart = typeof req.params.slug === "string" ? `:${req.params.slug}` : "";
  const cacheKey = redisKey(
    "analytics",
    `${page}${slugPart}:${win ? `${meta.from}:${meta.to}:${win.bucket}:${JSON.stringify(filters)}` : "live"}`
  );

  try {
    if (cacheable) {
      const cached = await redisGet<Record<string, unknown>>(cacheKey, log);
      if (cached) {
        log.success(`cache HIT  page=${page}  total=${fms(log.elapsed())}`).end("ADMIN ANALYTICS");
        res.json({ ...cached, meta: { ...meta, cached: true } });
        return;
      }
    }

    const t0 = performance.now();
    const { data, error } = await db.rpc(rpc, buildArgs(win as Window, filters, req));
    log.step(`DB rpc ${rpc}: ${fms(performance.now() - t0)}`);

    if (error) {
      if (isMissingObjectError((error as { code?: string }).code, error.message)) {
        log.warn(`${rpc} missing — analytics migrations not applied`).end("ADMIN ANALYTICS");
        res.status(503).json({ error: MIGRATION_HINT });
        return;
      }
      log.error(`rpc ${rpc} failed  code=${error.code}  msg=${error.message}`, error).end("ADMIN ANALYTICS");
      res.status(500).json({ error: error.message });
      return;
    }

    const payload = { data: data ?? {} };
    if (cacheable) void redisSet(cacheKey, payload, ANALYTICS_TTL_S, log);

    log.success(`served  page=${page}  total=${fms(log.elapsed())}`).end("ADMIN ANALYTICS");
    res.json({ ...payload, meta: { ...meta, cached: false } });
  } catch (err) {
    log.error("unhandled error", err).end("ADMIN ANALYTICS");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

// Standard 7-arg builder for the core page functions.
const coreArgs: ArgsBuilder = (w, filters) => ({
  p_from: w.from.toISOString(),
  p_to: w.to.toISOString(),
  p_prev_from: w.prevFrom.toISOString(),
  p_prev_to: w.prevTo.toISOString(),
  p_tz: "Asia/Kolkata",
  p_bucket: w.bucket,
  p_filters: filters,
});

// 4-arg builder (window only — wishlist/cart/coupons).
const windowArgs: ArgsBuilder = (w) => ({
  p_from: w.from.toISOString(),
  p_to: w.to.toISOString(),
  p_prev_from: w.prevFrom.toISOString(),
  p_prev_to: w.prevTo.toISOString(),
});

// 6-arg builder (window + tz/bucket — search/reviews).
const bucketArgs: ArgsBuilder = (w) => ({
  p_from: w.from.toISOString(),
  p_to: w.to.toISOString(),
  p_prev_from: w.prevFrom.toISOString(),
  p_prev_to: w.prevTo.toISOString(),
  p_tz: "Asia/Kolkata",
  p_bucket: w.bucket,
});

// ─── Routes (one per analytics page) ──────────────────────────────────────────
router.get("/executive", (req, res) => void servePage(req, res, "executive", "analytics_executive", coreArgs));
router.get("/revenue",   (req, res) => void servePage(req, res, "revenue",   "analytics_revenue",   coreArgs));
router.get("/orders",    (req, res) => void servePage(req, res, "orders",    "analytics_orders",    coreArgs));
router.get("/products",  (req, res) => void servePage(req, res, "products",  "analytics_products",  coreArgs));
router.get("/customers", (req, res) => void servePage(req, res, "customers", "analytics_customers", coreArgs));
router.get("/wishlist",  (req, res) => void servePage(req, res, "wishlist",  "analytics_wishlist",  windowArgs));
router.get("/cart",      (req, res) => void servePage(req, res, "cart",      "analytics_cart",      windowArgs));
router.get("/search",    (req, res) => void servePage(req, res, "search",    "analytics_search",    bucketArgs));
router.get("/reviews",   (req, res) => void servePage(req, res, "reviews",   "analytics_reviews",   bucketArgs));
router.get("/coupons",   (req, res) => void servePage(req, res, "coupons",   "analytics_coupons",   windowArgs));

router.get("/inventory", (req, res) =>
  void servePage(req, res, "inventory", "analytics_inventory", (w) => ({
    p_from: w.from.toISOString(),
    p_to: w.to.toISOString(),
  }))
);

// Per-product deep-dive. The slug arrives URL-encoded from the frontend.
router.get("/product/:slug", (req, res) => {
  const slug = (req.params.slug ?? "").trim();
  if (!slug || slug.length > 200) {
    res.status(400).json({ error: "Invalid product slug" });
    return;
  }
  void servePage(req, res, "product", "analytics_product", (w) => ({
    p_slug: slug,
    p_from: w.from.toISOString(),
    p_to: w.to.toISOString(),
    p_prev_from: w.prevFrom.toISOString(),
    p_prev_to: w.prevTo.toISOString(),
    p_tz: "Asia/Kolkata",
    p_bucket: w.bucket,
  }));
});

// Live dashboard: fixed windows inside the RPC, polled every ~10s — never cached.
router.get("/live", (req, res) =>
  void servePage(req, res, "live", "analytics_live", () => ({}), { cacheable: false, windowed: false })
);

export default router;
