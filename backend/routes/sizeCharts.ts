import { Router, type Request, type Response } from "express";
import { type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { adminMutationLimiter } from "../middleware/rateLimiters.js";
import { createLog, type OpLogger } from "../lib/logger.js";
import { logAdminAction } from "../lib/adminAudit.js";

const router = Router();
router.use(requireAuth, requireAdmin);

function serviceClientOr503(res: Response, log: OpLogger): SupabaseClient | null {
  if (supabaseAdmin) return supabaseAdmin;
  log.error("SUPABASE_SERVICE_ROLE_KEY not configured").end("SIZE_CHARTS");
  res.status(503).json({ error: "Sizing chart management unavailable: missing SUPABASE_SERVICE_ROLE_KEY." });
  return null;
}

// A PostgREST error meaning the size_charts table doesn't exist yet (migration not applied).
function isMissingTable(code?: string, message?: string): boolean {
  return (
    code === "42P01" || // undefined_table
    code === "PGRST205" || // PostgREST: table not in schema cache
    /does not exist|find the table|schema cache/i.test(message ?? "")
  );
}

const MIGRATION_HINT =
  "Sizing charts aren't set up in the database yet. Run lil-edit/supabase/migrations/20260709_size_charts.sql in Supabase.";

function sendDbError(res: Response, log: OpLogger, label: string, error: { code?: string; message: string }): void {
  if (isMissingTable(error.code, error.message)) {
    log.warn("size_charts table missing — migration not applied").end(label);
    res.status(503).json({ error: MIGRATION_HINT });
    return;
  }
  log.error(`code=${error.code}  ${error.message}`, error).end(label);
  res.status(500).json({ error: error.message });
}

const MEASUREMENT_KEYS = ["topLength", "chest", "sleeve", "bottomLength", "waist"] as const;

function isValidMeasurementSet(value: unknown): value is Record<(typeof MEASUREMENT_KEYS)[number], number> {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return MEASUREMENT_KEYS.every((key) => typeof obj[key] === "number" && isFinite(obj[key] as number) && (obj[key] as number) >= 0);
}

function isValidRow(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.sizeFrom === "number" && isFinite(row.sizeFrom) && row.sizeFrom >= 0 &&
    typeof row.sizeTo === "number" && isFinite(row.sizeTo) && row.sizeTo > 0 && row.sizeTo >= row.sizeFrom &&
    (row.sizeUnit === "Months" || row.sizeUnit === "Years") &&
    isValidMeasurementSet(row.inches) &&
    isValidMeasurementSet(row.centimeters)
  );
}

function validateRows(rows: unknown): string | null {
  if (!Array.isArray(rows)) return "rows must be an array.";
  if (!rows.every(isValidRow)) {
    return "Every row needs a valid size range (from/to/unit) plus inches/centimeters values for topLength, chest, sleeve, bottomLength, and waist.";
  }
  return null;
}

// The display label is always derived server-side from sizeFrom/sizeTo/sizeUnit —
// never trust a client-supplied `size` string, so renames of the range fields can't
// desync from the label shown in the table.
function canonicalizeRows(rows: unknown[]): unknown[] {
  return rows.map((value) => {
    const row = value as Record<string, unknown>;
    return { ...row, size: `${row.sizeFrom} - ${row.sizeTo} ${row.sizeUnit}` };
  });
}

// ─── GET / — list all sizing charts ───────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  const log = createLog().start("SIZE_CHARTS LIST");
  const db = serviceClientOr503(res, log);
  if (!db) return;

  const { data, error } = await db
    .from("size_charts")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    sendDbError(res, log, "SIZE_CHARTS LIST", error);
    return;
  }
  log.success(`served ${data?.length ?? 0} charts`).end("SIZE_CHARTS LIST");
  res.json({ charts: data ?? [] });
});

// ─── POST / — create a chart ──────────────────────────────────────────────────
router.post("/", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("SIZE_CHART CREATE");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const actorId = (req as AuthenticatedRequest).userId;

  const body = req.body as { name?: unknown; rows?: unknown };
  const name = String(body.name ?? "").trim();
  const rows = body.rows ?? [];

  if (!name) {
    res.status(400).json({ error: "Chart name is required." });
    return;
  }
  const rowsError = validateRows(rows);
  if (rowsError) {
    res.status(400).json({ error: rowsError });
    return;
  }

  const { data, error } = await db
    .from("size_charts")
    .insert({ name, rows: canonicalizeRows(rows as unknown[]), created_by: actorId })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: `A chart named "${name}" already exists.` });
    } else {
      sendDbError(res, log, "SIZE_CHART CREATE", error);
    }
    return;
  }
  log.success(`created  id=${data.id}  name=${name}`).end("SIZE_CHART CREATE");
  void logAdminAction({
    adminId: actorId,
    action: "size_chart_created",
    targetType: "size_chart",
    targetId: data.id,
    summary: `Created sizing chart "${name}"`,
    metadata: { chartId: data.id, name, rowCount: Array.isArray(rows) ? rows.length : 0 },
  });
  res.status(201).json({ chart: data });
});

// ─── PATCH /:id — rename and/or replace rows ─────────────────────────────────
router.patch("/:id", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("SIZE_CHART UPDATE");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const { id } = req.params as { id: string };
  const actorId = (req as AuthenticatedRequest).userId;
  const body = req.body as { name?: unknown; rows?: unknown };

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) {
      res.status(400).json({ error: "Chart name is required." });
      return;
    }
    updates.name = name;
  }

  if (body.rows !== undefined) {
    const rowsError = validateRows(body.rows);
    if (rowsError) {
      res.status(400).json({ error: rowsError });
      return;
    }
    updates.rows = canonicalizeRows(body.rows as unknown[]);
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updatable fields provided." });
    return;
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from("size_charts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: "A chart with that name already exists." });
      return;
    }
    sendDbError(res, log, "SIZE_CHART UPDATE", error);
    return;
  }
  log.success(`updated  id=${id}`).end("SIZE_CHART UPDATE");
  void logAdminAction({
    adminId: actorId,
    action: "size_chart_updated",
    targetType: "size_chart",
    targetId: id,
    summary: `Updated sizing chart "${data.name}" (${Object.keys(updates).filter((k) => k !== "updated_at").join(", ")})`,
    metadata: { chartId: id, fields: Object.keys(updates).filter((k) => k !== "updated_at") },
  });
  res.json({ chart: data });
});

// ─── DELETE /:id — delete a chart ─────────────────────────────────────────────
router.delete("/:id", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("SIZE_CHART DELETE");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const { id } = req.params as { id: string };
  const actorId = (req as AuthenticatedRequest).userId;

  const { data: existing } = await db.from("size_charts").select("name").eq("id", id).maybeSingle();
  const deletedName = (existing as { name?: string } | null)?.name ?? null;

  const { error } = await db.from("size_charts").delete().eq("id", id);
  if (error) {
    sendDbError(res, log, "SIZE_CHART DELETE", error);
    return;
  }
  log.success(`deleted  id=${id}`).end("SIZE_CHART DELETE");
  void logAdminAction({
    adminId: actorId,
    action: "size_chart_deleted",
    targetType: "size_chart",
    targetId: id,
    summary: `Deleted sizing chart "${deletedName ?? id}"`,
    metadata: { chartId: id, name: deletedName },
  });
  res.status(204).send();
});

export default router;
