import { performance } from "perf_hooks";
import { Router, type Request, type Response } from "express";
import { type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { adminMutationLimiter } from "../middleware/rateLimiters.js";
import { redisGet, redisSet, redisKey } from "../lib/redis.js";
import { createLog, fms, type OpLogger } from "../lib/logger.js";
import { logAdminAction } from "../lib/adminAudit.js";

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

// ─── Dashboard layout (global, admin-curated card visibility) ─────────────────
// Backs the iPhone-style hide/show for analytics cards (frontend: customize.tsx).
// State is GLOBAL — one shared set of hidden cards per page for ALL admins — stored
// in dashboard_hidden_widgets, where a row exists ⇔ the card is hidden. Reads and
// writes go through the service-role client; the table is RLS-locked so the
// PostgREST client roles can't touch it directly. See migration
// 20260714_dashboard_widget_layout.sql.
const LAYOUT_MIGRATION_HINT =
  "Dashboard layout isn't set up in the database yet. Run lil-edit/supabase/" +
  "migrations/20260714_dashboard_widget_layout.sql in the Supabase SQL editor.";

const MAX_KEY_LEN = 120;
const isValidKey = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.trim().length <= MAX_KEY_LEN;

// Current hidden widget_ids for a page, sorted for a stable response.
async function readHiddenWidgets(db: SupabaseClient, page: string): Promise<string[]> {
  const { data, error } = await db
    .from("dashboard_hidden_widgets")
    .select("widget_id")
    .eq("page_key", page);
  if (error) throw error;
  return ((data ?? []) as Array<{ widget_id: string }>).map((r) => r.widget_id).sort();
}

// GET /layout?page=executive → { page, hidden: string[] }
// Fail-OPEN: if the table is missing (migration not run) or the read otherwise
// fails, return an empty list so the dashboard still renders every card. A layout
// preference must never black out the page.
router.get("/layout", async (req: Request, res: Response) => {
  const log = createLog().start("ANALYTICS LAYOUT GET");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const page = (req.query.page as string | undefined)?.trim() ?? "";
  if (!isValidKey(page)) {
    log.warn(`invalid page="${page}"`).end("ANALYTICS LAYOUT GET");
    res.status(400).json({ error: "Provide a page." });
    return;
  }
  try {
    const hidden = await readHiddenWidgets(db, page);
    log.success(`page=${page}  hidden=${hidden.length}`).end("ANALYTICS LAYOUT GET");
    res.json({ page, hidden });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (isMissingObjectError(e.code, e.message)) {
      log.warn("table missing — fail-open to []").end("ANALYTICS LAYOUT GET");
      res.json({ page, hidden: [] });
      return;
    }
    log.error("read failed", err).end("ANALYTICS LAYOUT GET");
    res.status(500).json({ error: e.message ?? String(err) });
  }
});

// POST /layout { page, widgetId, hidden } → { page, hidden: string[] }
// hidden:true upserts a row (card hidden); hidden:false deletes it (card restored).
// Admin-only (whole router) + rate-limited + audit-logged.
router.post("/layout", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("ANALYTICS LAYOUT SET");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const actorId = (req as AuthenticatedRequest).userId;

  const body = (req.body ?? {}) as { page?: unknown; widgetId?: unknown; hidden?: unknown };
  if (!isValidKey(body.page) || !isValidKey(body.widgetId) || typeof body.hidden !== "boolean") {
    log.warn("invalid body").end("ANALYTICS LAYOUT SET");
    res.status(400).json({ error: "Provide page, widgetId and hidden (boolean)." });
    return;
  }
  const page = body.page.trim();
  const widgetId = body.widgetId.trim();
  const hidden = body.hidden;
  log.step(`actor=${actorId}  page=${page}  widget=${widgetId}  hidden=${hidden}`);

  try {
    if (hidden) {
      // Record the actor's email for a self-contained "who hid this" (parity with
      // site_settings). One cheap PK lookup; toggles are infrequent + rate-limited.
      const { data: prof } = await db.from("profiles").select("email").eq("id", actorId).maybeSingle();
      const email = (prof as { email?: string | null } | null)?.email ?? null;
      const { error } = await db.from("dashboard_hidden_widgets").upsert(
        { page_key: page, widget_id: widgetId, hidden_by: actorId, hidden_by_email: email, hidden_at: new Date().toISOString() },
        { onConflict: "page_key,widget_id" },
      );
      if (error) throw error;
    } else {
      const { error } = await db
        .from("dashboard_hidden_widgets")
        .delete()
        .eq("page_key", page)
        .eq("widget_id", widgetId);
      if (error) throw error;
    }

    const list = await readHiddenWidgets(db, page);
    log.success(`ok  page=${page}  hidden=${list.length}`).end("ANALYTICS LAYOUT SET");
    void logAdminAction({
      adminId: actorId,
      action: hidden ? "dashboard_widget_hidden" : "dashboard_widget_shown",
      targetType: "analytics",
      targetId: `${page}:${widgetId}`,
      summary: hidden
        ? `Hid the "${widgetId}" card on the ${page} analytics page`
        : `Restored the "${widgetId}" card on the ${page} analytics page`,
      metadata: { page, widgetId, hidden },
    });
    res.json({ page, hidden: list });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (isMissingObjectError(e.code, e.message)) {
      log.warn("table missing — migration not applied").end("ANALYTICS LAYOUT SET");
      res.status(503).json({ error: LAYOUT_MIGRATION_HINT });
      return;
    }
    log.error("write failed", err).end("ANALYTICS LAYOUT SET");
    res.status(500).json({ error: e.message ?? String(err) });
  }
});

export default router;
