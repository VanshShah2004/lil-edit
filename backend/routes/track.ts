import { Router, type Request, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { optionalUserId } from "../lib/activityLog.js";

// ─── Analytics tracking beacons ──────────────────────────────────────────────
// Public, WRITE-ONLY endpoints fed by the storefront (guests included):
//   POST /api/track/view       → product_views     (one row per PDP view)
//   POST /api/track/heartbeat  → live_presence     (upsert; powers Live Visitors)
//
// Design contract:
//   • Fire-and-forget: respond 204 immediately, do the DB work off the response
//     path. A beacon must NEVER slow the storefront down or surface an error.
//   • Nothing here is readable by clients — both tables are RLS-locked to the
//     service role (20260711_analytics_foundation.sql); reads happen only via
//     the admin-gated analytics endpoints.
//   • Validation is strict but silent: malformed payloads are dropped with a
//     204 (a beacon has no user to show an error to; logging junk would let a
//     hostile client bloat the tables).
//   • Pre-migration / no-service-role: no-ops with a console warning, so the
//     storefront works even before the migration is applied.

const router = Router();

// Matches the client-minted visitor id (crypto.randomUUID or similar) and the
// DB CHECK constraint (8–72 chars).
const VISITOR_ID_RE = /^[A-Za-z0-9_-]{8,72}$/;

// Must mirror the product_views.source CHECK constraint; anything else → 'other'.
const KNOWN_SOURCES = new Set([
  "direct", "search", "collection", "home", "wishlist",
  "cart", "spotlight", "share", "recommendation", "other",
]);

// A PostgREST error meaning the table doesn't exist yet (migration not applied).
function isMissingTableError(code?: string, message?: string): boolean {
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /does not exist|find the table|schema cache/i.test(message ?? "")
  );
}

const MIGRATION_HINT =
  "Run lil-edit/supabase/migrations/20260711_analytics_foundation.sql in Supabase.";

// Rate-limit the "migration missing" warning so an unapplied migration doesn't
// spam the console on every single page view.
let lastMissingWarn = 0;
function warnMissing(table: string): void {
  const now = Date.now();
  if (now - lastMissingWarn > 60_000) {
    lastMissingWarn = now;
    console.warn(`[track] ${table} table missing — ${MIGRATION_HINT}`);
  }
}

function cleanString(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > maxLen) return null;
  return s;
}

// ─── POST /api/track/view ──────────────────────────────────────────────────────
// Body: { visitorId, slug, sku?, categorySlug?, source? }
router.post("/view", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const visitorId = cleanString(body.visitorId, 72);
  const slug = cleanString(body.slug, 200);
  if (!visitorId || !VISITOR_ID_RE.test(visitorId) || !slug) {
    res.status(204).end();
    return;
  }
  const sku = cleanString(body.sku, 64);
  const categorySlug = cleanString(body.categorySlug, 120);
  const rawSource = cleanString(body.source, 32) ?? "direct";
  const source = KNOWN_SOURCES.has(rawSource) ? rawSource : "other";

  // Respond before the DB work — the PDP must never wait on analytics.
  res.status(204).end();

  if (!supabaseAdmin) {
    console.warn("[track] skip view — no service-role client configured");
    return;
  }

  void (async () => {
    try {
      const userId = await optionalUserId(req);
      const { error } = await supabaseAdmin.from("product_views").insert({
        visitor_id: visitorId,
        user_id: userId,
        product_slug: slug,
        sku,
        category_slug: categorySlug,
        source,
      });
      if (error) {
        if (isMissingTableError((error as { code?: string }).code, error.message)) warnMissing("product_views");
        else console.warn(`[track] view insert failed: ${error.message}`);
        return;
      }
      console.log(`[track] view  slug=${slug}  sku=${sku ?? "∅"}  source=${source}  user=${userId ?? "guest"}`);
    } catch (e) {
      console.warn(`[track] view threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  })();
});

// ─── POST /api/track/heartbeat ─────────────────────────────────────────────────
// Body: { visitorId, path? }. Sent ~every 30s while a storefront tab is visible.
router.post("/heartbeat", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const visitorId = cleanString(body.visitorId, 72);
  if (!visitorId || !VISITOR_ID_RE.test(visitorId)) {
    res.status(204).end();
    return;
  }
  // Path only (no query string) — keep presence rows small and PII-free.
  const rawPath = cleanString(body.path, 200);
  const path = rawPath && rawPath.startsWith("/") ? rawPath.split("?")[0] : null;

  res.status(204).end();

  if (!supabaseAdmin) return; // beacons are frequent — stay quiet without service role

  void (async () => {
    try {
      const userId = await optionalUserId(req);
      const { error } = await supabaseAdmin.from("live_presence").upsert(
        { visitor_id: visitorId, user_id: userId, path, last_seen: new Date().toISOString() },
        { onConflict: "visitor_id" }
      );
      if (error) {
        if (isMissingTableError((error as { code?: string }).code, error.message)) warnMissing("live_presence");
        else console.warn(`[track] heartbeat upsert failed: ${error.message}`);
        return;
      }

      // Opportunistic prune (~2% of heartbeats): presence rows are ephemeral,
      // so anything a day old is dead weight. Best-effort.
      if (Math.random() < 0.02) {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { error: pruneErr } = await supabaseAdmin
          .from("live_presence")
          .delete()
          .lt("last_seen", cutoff);
        if (pruneErr) console.warn(`[track] presence prune failed (non-fatal): ${pruneErr.message}`);
        else console.log("[track] pruned stale presence rows (>24h)");
      }
    } catch (e) {
      console.warn(`[track] heartbeat threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  })();
});

export default router;
