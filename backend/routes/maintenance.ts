import { Router, type Request, type Response } from "express";
import { type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { adminMutationLimiter } from "../middleware/rateLimiters.js";
import { createLog, type OpLogger } from "../lib/logger.js";
import {
  getMaintenanceSnapshot,
  refreshMaintenanceState,
  bustMaintenance,
} from "../lib/maintenance.js";

const router = Router();

const MIGRATION_HINT =
  "Maintenance mode isn't set up in the database yet. Run lil-edit/supabase/migrations/20260702_site_maintenance.sql in Supabase.";

// PostgREST errors meaning the RPC/table doesn't exist yet (migration not applied).
function isMissingObjectError(code?: string, message?: string): boolean {
  return (
    code === "42883" || // undefined_function
    code === "42P01" || // undefined_table
    code === "PGRST202" || // function not in schema cache
    code === "PGRST205" || // table not in schema cache
    /does not exist|find the (function|table)|schema cache/i.test(message ?? "")
  );
}

// Toggling writes the RLS-locked site_settings via a service_role-only RPC, so it
// REQUIRES the service role. Fail loudly with a clear message rather than a
// confusing 401/403 from the anon fallback.
function serviceClientOr503(res: Response, log: OpLogger): SupabaseClient | null {
  if (supabaseAdmin) return supabaseAdmin;
  log.error("SUPABASE_SERVICE_ROLE_KEY not configured — maintenance toggle unavailable").end("MAINTENANCE SET");
  res.status(503).json({
    error:
      "Maintenance control is unavailable: the backend is missing SUPABASE_SERVICE_ROLE_KEY. Set it in backend/.env and restart.",
  });
  return null;
}

// ─── GET /api/maintenance/status — PUBLIC, drives the frontend curtain ────────
// No auth: every visitor needs to know whether the storefront is live. Reads the
// in-memory snapshot (refreshed by the watcher + busted on toggle), so it's a
// cheap, always-available read even if the DB is momentarily unreachable.
router.get("/status", (_req: Request, res: Response) => {
  const snap = getMaintenanceSnapshot();
  res.json({ active: snap.active, message: snap.message, updatedAt: snap.updatedAt });
});

// ─── GET /api/maintenance — admin: current state + audit for the control UI ───
router.get("/", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const log = createLog().start("MAINTENANCE GET");
  try {
    const snap = await refreshMaintenanceState();
    log.success(`active=${snap.active}`).end("MAINTENANCE GET");
    res.json({
      active: snap.active,
      message: snap.message,
      updatedAt: snap.updatedAt,
      updatedByEmail: snap.updatedByEmail,
    });
  } catch (err) {
    log.error("unhandled error", err).end("MAINTENANCE GET");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── POST /api/maintenance — admin: flip the switch (confirmed on the client) ─
router.post("/", requireAuth, requireAdmin, adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("MAINTENANCE SET");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const actorId = (req as AuthenticatedRequest).userId;

  const body = (req.body ?? {}) as { active?: unknown; message?: unknown };
  if (typeof body.active !== "boolean") {
    log.warn(`invalid active=${String(body.active)}`).end("MAINTENANCE SET");
    res.status(400).json({ error: "Provide active: true or false." });
    return;
  }
  const active = body.active;
  // null → leave the stored message unchanged; "" → clear it (DB falls back to
  // the frontend default); any other string → set it.
  const message = typeof body.message === "string" ? body.message : null;
  log.step(`actor=${actorId}  active=${active}  message=${message === null ? "(unchanged)" : `"${message.slice(0, 40)}"`}`);

  try {
    const { data, error } = await db.rpc("set_maintenance_mode", {
      p_active: active,
      p_actor_id: actorId,
      p_message: message,
    });

    if (error) {
      if (isMissingObjectError((error as { code?: string }).code, error.message)) {
        log.warn("RPC missing — migration not applied").end("MAINTENANCE SET");
        res.status(503).json({ error: MIGRATION_HINT });
        return;
      }
      log.error(`rpc failed  code=${error.code}  msg=${error.message}`, error).end("MAINTENANCE SET");
      res.status(500).json({ error: error.message });
      return;
    }

    const result = (Array.isArray(data) ? data[0] : data) as { status?: string } | null;
    if (!result || result.status !== "ok") {
      // The RPC's only non-ok status is "forbidden" — the DB's final-arbiter admin
      // re-check failed. Shouldn't happen behind requireAdmin, but honour it.
      log.warn(`refused  status=${result?.status ?? "none"}`).end("MAINTENANCE SET");
      res.status(403).json({ error: "You don't have permission to change site availability." });
      return;
    }

    // Apply on THIS instance immediately rather than waiting for the next poll.
    const snap = await bustMaintenance();
    log.success(`ok  active=${snap.active}`).end("MAINTENANCE SET");
    res.json({
      active: snap.active,
      message: snap.message,
      updatedAt: snap.updatedAt,
      updatedByEmail: snap.updatedByEmail,
    });
  } catch (err) {
    log.error("unhandled error", err).end("MAINTENANCE SET");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
