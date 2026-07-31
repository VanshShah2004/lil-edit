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

// The feed filters by CATEGORY rather than by every individual action kind: the UI
// shows a handful of pills (Products, Coupons, …), each expanding to the set of
// action strings below. Keeps the ?category= param a small, validated allowlist and
// means adding a new action only touches the relevant array.
const ACTION_CATEGORIES: Record<string, readonly string[]> = {
  products: ["product_launched", "product_draft_saved", "product_deleted"],
  // Merchandising = coupons/promotions + Spotlight (curation) sections.
  merchandising: [
    "coupon_created",
    "coupon_updated",
    "coupon_deleted",
    "curation_updated",
    "curation_section_updated",
    "size_chart_created",
    "size_chart_updated",
    "size_chart_deleted",
  ],
  orders: ["order_status_changed", "payment_status_changed"],
  // Platform = admin-access changes + site maintenance toggles (both platform-level).
  platform: [
    "admin_access_granted",
    "admin_access_revoked",
    "maintenance_enabled",
    "maintenance_disabled",
  ],
};

// Reading the trail needs the service role: admin_action_log is RLS-locked (no anon/
// authenticated policies), so the anon fallback would return nothing. Fail loudly
// with an actionable message instead of degrading into a confusing empty list.
function serviceClientOr503(res: Response, log: OpLogger): SupabaseClient | null {
  if (supabaseAdmin) return supabaseAdmin;
  log.error("SUPABASE_SERVICE_ROLE_KEY not configured — admin audit log unavailable").end("ADMIN AUDIT");
  res.status(503).json({
    error:
      "The admin activity log is unavailable: the backend is missing SUPABASE_SERVICE_ROLE_KEY. Set it in backend/.env and restart.",
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
  "The admin activity log isn't set up in the database yet. Run lil-edit/supabase/migrations/20260708_admin_action_log.sql in Supabase.";

interface ActionRow {
  id: string;
  admin_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

// Fetch the profile rows for a set of admin ids, returned as an id→row map. Done as
// a separate query because admin_action_log.admin_id → auth.users and profiles.id →
// auth.users are sibling FKs (no direct relationship for PostgREST to embed) — same
// approach as adminActivity.loadProfiles / adminOrders.loadProfiles.
async function loadProfiles(db: SupabaseClient, adminIds: string[]): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>();
  const unique = [...new Set(adminIds.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await db
    .from("profiles")
    .select("id, email, first_name, last_name")
    .in("id", unique);
  for (const p of (data ?? []) as ProfileRow[]) map.set(p.id, p);
  return map;
}

function adminOf(adminId: string | null, profile: ProfileRow | undefined) {
  if (!adminId) return null; // actor account removed since (ON DELETE SET NULL)
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  return {
    id: adminId,
    name: name || "",
    email: profile?.email ?? "",
  };
}

// ─── GET /api/admin/audit-log — newest-first admin audit trail ────────────────
// Query params:
//   • limit    — page size (default 50, max 100)
//   • category — restrict to one category (products|merchandising|orders|
//                platform); anything else is ignored (= all).
//   • before   — ISO timestamp cursor; returns rows strictly OLDER than it (paging
//                down / "load more"). Omit to get the most recent page.
// Polling for new actions = just re-fetch the first page and merge by id client-side.
router.get("/", async (req: Request, res: Response) => {
  const log = createLog().start("ADMIN AUDIT");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const adminId = (req as AuthenticatedRequest).userId;

  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const rawCategory = (req.query.category as string | undefined)?.trim();
  const category = rawCategory && rawCategory in ACTION_CATEGORIES ? rawCategory : null;
  const before = (req.query.before as string | undefined)?.trim() || null;
  log.step(`admin=${adminId}  limit=${limit}  category=${category ?? "all"}  before=${before ?? "none"}`);

  try {
    const t0 = performance.now();
    // Filters MUST be applied before transforms (order/limit) — PostgREST's builder
    // only exposes .in/.lt on the filter builder (same ordering as adminActivity.ts).
    let filter = db
      .from("admin_action_log")
      .select("id, admin_id, action, target_type, target_id, summary, metadata, created_at");

    if (category) filter = filter.in("action", ACTION_CATEGORIES[category] as string[]);
    if (before) filter = filter.lt("created_at", before);

    // created_at is the primary sort; id breaks ties so pagination is stable when
    // several rows share the same timestamp.
    const { data, error } = await filter
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    log.step(`DB audit: ${fms(performance.now() - t0)}  rows=${data?.length ?? 0}`);

    if (error) {
      if (isMissingTableError((error as { code?: string }).code, error.message)) {
        log.warn("admin_action_log table missing — migration not applied").end("ADMIN AUDIT");
        res.status(503).json({ error: MIGRATION_HINT });
        return;
      }
      log.error(`audit query failed  code=${error.code}  msg=${error.message}`, error).end("ADMIN AUDIT");
      res.status(500).json({ error: error.message });
      return;
    }

    const rows = (data ?? []) as ActionRow[];
    const profiles = await loadProfiles(db, rows.map((r) => r.admin_id ?? "").filter(Boolean));

    const actions = rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      summary: r.summary ?? "",
      metadata: r.metadata ?? {},
      createdAt: r.created_at,
      admin: adminOf(r.admin_id, r.admin_id ? profiles.get(r.admin_id) : undefined),
    }));

    // A full page implies there may be older rows — hand back a cursor to fetch them.
    const lastRow = rows[rows.length - 1];
    const nextCursor = rows.length === limit && lastRow ? lastRow.created_at : null;

    log.success(`served  rows=${actions.length}  nextCursor=${nextCursor ? "yes" : "none"}  total=${fms(log.elapsed())}`).end("ADMIN AUDIT");
    res.json({ actions, nextCursor });
  } catch (err) {
    log.error("unhandled error", err).end("ADMIN AUDIT");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
