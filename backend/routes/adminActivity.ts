import { performance } from "perf_hooks";
import { Router, type Request, type Response } from "express";
import { type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { createLog, fms, type OpLogger } from "../lib/logger.js";

const router = Router();

// Every endpoint requires a valid token AND an admin role (server-side).
router.use(requireAuth, requireAdmin);

// The feed groups its event kinds into CATEGORIES, one per filter pill — the same
// shape adminAuditLog.ts uses. Grouping (rather than one pill per kind) is what lets
// the account and review-lifecycle events added in 20260828_activity_coverage.sql
// appear at all without the pill row growing without bound.
//
// activity_log also carries analytics-only kinds (cart_remove / wishlist_remove /
// checkout_started — see 20260711_analytics_foundation.sql) which are deliberately in
// NO category here: they surface in the admin Analytics platform instead.
const FEED_CATEGORIES: Record<string, readonly string[]> = {
  cart: ["cart_add"],
  wishlist: ["wishlist_add"],
  // A coupon attempt is part of the buying flow, so it files with orders.
  orders: ["order_placed", "coupon_applied"],
  reviews: ["review_submitted", "review_updated", "review_removed"],
  search: ["search"],
  // Everything about the account itself: auth, profile, addresses, newsletter.
  account: [
    "signup",
    "login",
    "profile_updated",
    "phone_verified",
    "address_added",
    "address_updated",
    "address_default_changed",
    "address_removed",
    "newsletter_subscribed",
  ],
};

// Flattened whitelist — the default set for an unfiltered read.
const KNOWN_TYPES = Object.values(FEED_CATEGORIES).flat();

// hasOwnProperty rather than `in`: `in` also walks the prototype chain, so
// ?category=constructor would pass the check and hand a function to .in().
const isCategory = (k: string): boolean => Object.prototype.hasOwnProperty.call(FEED_CATEGORIES, k);

// Reading the feed needs the service role: activity_log is RLS-locked (no anon/
// authenticated policies), so the anon fallback would return nothing. Fail loudly
// with an actionable message instead of degrading into a confusing empty list.
function serviceClientOr503(res: Response, log: OpLogger): SupabaseClient | null {
  if (supabaseAdmin) return supabaseAdmin;
  log.error("SUPABASE_SERVICE_ROLE_KEY not configured — activity feed unavailable").end("ADMIN ACTIVITY");
  res.status(503).json({
    error:
      "The activity feed is unavailable: the backend is missing SUPABASE_SERVICE_ROLE_KEY. Set it in backend/.env and restart.",
  });
  return null;
}

// A PostgREST error meaning the table doesn't exist yet (migration not applied).
function isMissingTableError(code?: string, message?: string): boolean {
  return (
    code === "42P01" || // undefined_table
    code === "PGRST205" || // PostgREST: table not in schema cache
    /does not exist|find the table|schema cache/i.test(message ?? "")
  );
}

const MIGRATION_HINT =
  "The activity feed isn't set up in the database yet. Run lil-edit/supabase/migrations/20260702_activity_log.sql in Supabase.";

interface ActivityRow {
  id: string;
  user_id: string | null;
  type: string;
  product_slug: string | null;
  sku: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

// Fetch the profile rows for a set of user ids, returned as an id→row map. Done as
// a separate query because activity_log.user_id → auth.users and profiles.id →
// auth.users are sibling FKs (no direct relationship for PostgREST to embed) —
// same approach as adminOrders.loadProfiles.
async function loadProfiles(db: SupabaseClient, userIds: string[]): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await db
    .from("profiles")
    .select("id, email, first_name, last_name")
    .in("id", unique);
  for (const p of (data ?? []) as ProfileRow[]) map.set(p.id, p);
  return map;
}

function userOf(userId: string | null, profile: ProfileRow | undefined) {
  if (!userId) return null; // anonymous (e.g. a guest search)
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  return {
    id: userId,
    name: name || "",
    email: profile?.email ?? "",
  };
}

// ─── GET /api/admin/activity — newest-first activity feed ─────────────────────
// Query params:
//   • limit     — page size (default 50, max 100)
//   • category  — restrict to one pill's group of kinds (cart|wishlist|orders|
//                 reviews|search|account); anything else is ignored (= all).
//   • type      — restrict to ONE exact event kind (must be a KNOWN_TYPE). Kept for
//                 back-compat with callers that predate `category`; when both are
//                 sent, `type` wins because it is the narrower filter.
//   • before    — ISO timestamp cursor; returns rows strictly OLDER than it (paging
//                 down / "load more"). Omit to get the most recent page.
// Polling for new activity = just re-fetch the first page and merge by id client-side.
router.get("/", async (req: Request, res: Response) => {
  const log = createLog().start("ADMIN ACTIVITY");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const adminId = (req as AuthenticatedRequest).userId;

  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const rawType = (req.query.type as string | undefined)?.trim();
  const type = rawType && KNOWN_TYPES.includes(rawType) ? rawType : null;
  const rawCategory = (req.query.category as string | undefined)?.trim();
  const category = rawCategory && isCategory(rawCategory) ? rawCategory : null;
  const before = (req.query.before as string | undefined)?.trim() || null;
  log.step(`admin=${adminId}  limit=${limit}  category=${category ?? "all"}  type=${type ?? "any"}  before=${before ?? "none"}`);

  try {
    const t0 = performance.now();
    // Filters MUST be applied before transforms (order/limit) — PostgREST's builder
    // only exposes .eq/.lt on the filter builder (same ordering as adminOrders.ts).
    let filter = db
      .from("activity_log")
      .select("id, user_id, type, product_slug, sku, metadata, created_at");

    // Narrowest wins: one exact kind, else one category's kinds, else the whole
    // curated set — so the analytics-only event types never appear here either way.
    if (type) filter = filter.eq("type", type);
    else if (category) filter = filter.in("type", FEED_CATEGORIES[category] as string[]);
    else filter = filter.in("type", KNOWN_TYPES);
    if (before) filter = filter.lt("created_at", before);

    // created_at is the primary sort; id breaks ties so pagination is stable when
    // several rows share the same timestamp.
    const { data, error } = await filter
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    log.step(`DB activity: ${fms(performance.now() - t0)}  rows=${data?.length ?? 0}`);

    if (error) {
      if (isMissingTableError((error as { code?: string }).code, error.message)) {
        log.warn("activity_log table missing — migration not applied").end("ADMIN ACTIVITY");
        res.status(503).json({ error: MIGRATION_HINT });
        return;
      }
      log.error(`activity query failed  code=${error.code}  msg=${error.message}`, error).end("ADMIN ACTIVITY");
      res.status(500).json({ error: error.message });
      return;
    }

    const rows = (data ?? []) as ActivityRow[];
    const profiles = await loadProfiles(db, rows.map((r) => r.user_id ?? "").filter(Boolean));

    const activity = rows.map((r) => ({
      id: r.id,
      type: r.type,
      productSlug: r.product_slug,
      sku: r.sku,
      metadata: r.metadata ?? {},
      createdAt: r.created_at,
      user: userOf(r.user_id, r.user_id ? profiles.get(r.user_id) : undefined),
    }));

    // A full page implies there may be older rows — hand back a cursor to fetch them.
    const lastRow = rows[rows.length - 1];
    const nextCursor = rows.length === limit && lastRow ? lastRow.created_at : null;

    log.success(`served  rows=${activity.length}  nextCursor=${nextCursor ? "yes" : "none"}  total=${fms(log.elapsed())}`).end("ADMIN ACTIVITY");
    res.json({ activity, nextCursor });
  } catch (err) {
    log.error("unhandled error", err).end("ADMIN ACTIVITY");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
