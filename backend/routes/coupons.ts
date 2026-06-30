import { Router, type Request, type Response } from "express";
import { type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { adminMutationLimiter } from "../middleware/rateLimiters.js";
import { createLog, type OpLogger } from "../lib/logger.js";

const router = Router();
router.use(requireAuth, requireAdmin);

function serviceClientOr503(res: Response, log: OpLogger): SupabaseClient | null {
  if (supabaseAdmin) return supabaseAdmin;
  log.error("SUPABASE_SERVICE_ROLE_KEY not configured").end("COUPONS");
  res.status(503).json({ error: "Coupon management unavailable: missing SUPABASE_SERVICE_ROLE_KEY." });
  return null;
}

const CODE_RE = /^[A-Z0-9_-]{1,32}$/;

// A PostgREST error meaning the coupons table doesn't exist yet (migration not applied).
function isMissingTable(code?: string, message?: string): boolean {
  return (
    code === "42P01" || // undefined_table
    code === "PGRST205" || // PostgREST: table not in schema cache
    /does not exist|find the table|schema cache/i.test(message ?? "")
  );
}

const MIGRATION_HINT =
  "Coupons aren't set up in the database yet. Run lil-edit/supabase/migrations/20260630_coupons.sql in Supabase.";

// Map a Supabase error to an actionable response: a missing-table error becomes a 503
// with the migration hint; anything else is a generic 500 with the raw message.
function sendDbError(res: Response, log: OpLogger, label: string, error: { code?: string; message: string }): void {
  if (isMissingTable(error.code, error.message)) {
    log.warn("coupons table missing — migration not applied").end(label);
    res.status(503).json({ error: MIGRATION_HINT });
    return;
  }
  log.error(`code=${error.code}  ${error.message}`, error).end(label);
  res.status(500).json({ error: error.message });
}

// ─── GET / — list all coupons ─────────────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  const log = createLog().start("COUPONS LIST");
  const db = serviceClientOr503(res, log);
  if (!db) return;

  const { data, error } = await db
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    sendDbError(res, log, "COUPONS LIST", error);
    return;
  }
  log.success(`served ${data?.length ?? 0} coupons`).end("COUPONS LIST");
  res.json({ coupons: data ?? [] });
});

// ─── POST / — create coupon ───────────────────────────────────────────────────
router.post("/", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("COUPON CREATE");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const actorId = (req as AuthenticatedRequest).userId;

  const body = req.body as {
    code?: unknown;
    discount_type?: unknown;
    discount_value?: unknown;
    min_order_amount?: unknown;
    max_uses?: unknown;
    expires_at?: unknown;
    first_order_only?: unknown;
    once_per_user?: unknown;
    max_discount_amount?: unknown;
  };

  const code = String(body.code ?? "").trim().toUpperCase();
  const discount_type = String(body.discount_type ?? "");
  const discount_value = Number(body.discount_value);
  const min_order_amount = body.min_order_amount != null && body.min_order_amount !== "" ? Number(body.min_order_amount) : null;
  const max_uses = body.max_uses != null && body.max_uses !== "" ? Number(body.max_uses) : null;
  // Caps the rupee discount (mainly for % coupons). Only meaningful for percentage; ignored
  // for fixed (a fixed discount is already a flat amount).
  const max_discount_amount =
    discount_type === "percentage" && body.max_discount_amount != null && body.max_discount_amount !== ""
      ? Number(body.max_discount_amount)
      : null;
  const first_order_only = Boolean(body.first_order_only);
  // A first-order coupon is inherently once-per-customer, so persist that implication.
  const once_per_user = Boolean(body.once_per_user) || first_order_only;
  // The admin picks a bare date (<input type="date"> → "YYYY-MM-DD"), which means "valid
  // through that day". Store it as end-of-day IST so the coupon doesn't expire at the very
  // start of the chosen date, and still renders as that date in the en-IN admin list.
  const rawExpires = body.expires_at ? String(body.expires_at).trim() : "";
  const expires_at = rawExpires
    ? (/^\d{4}-\d{2}-\d{2}$/.test(rawExpires) ? `${rawExpires}T23:59:59+05:30` : rawExpires)
    : null;

  if (!CODE_RE.test(code)) {
    res.status(400).json({ error: "Code must be 1–32 uppercase letters, numbers, hyphens, or underscores." });
    return;
  }
  if (!["percentage", "fixed"].includes(discount_type)) {
    res.status(400).json({ error: "discount_type must be 'percentage' or 'fixed'." });
    return;
  }
  if (isNaN(discount_value) || discount_value <= 0) {
    res.status(400).json({ error: "discount_value must be a positive number." });
    return;
  }
  if (discount_type === "percentage" && discount_value > 100) {
    res.status(400).json({ error: "Percentage discount cannot exceed 100." });
    return;
  }
  if (max_discount_amount !== null && (isNaN(max_discount_amount) || max_discount_amount <= 0)) {
    res.status(400).json({ error: "Max discount must be a positive number." });
    return;
  }

  log.step(`actor=${actorId}  code=${code}  type=${discount_type}  value=${discount_value}  maxDisc=${max_discount_amount ?? "none"}`);

  const { data, error } = await db
    .from("coupons")
    .insert({ code, discount_type, discount_value, min_order_amount, max_uses, expires_at, first_order_only, once_per_user, max_discount_amount, created_by: actorId })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: `Coupon code "${code}" already exists.` });
    } else {
      sendDbError(res, log, "COUPON CREATE", error);
    }
    return;
  }
  log.success(`created  id=${data.id}  code=${code}`).end("COUPON CREATE");
  res.status(201).json({ coupon: data });
});

// ─── PATCH /:id — toggle active / full edit ───────────────────────────────────
router.patch("/:id", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("COUPON UPDATE");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const { id } = req.params as { id: string };
  const body = req.body as {
    is_active?: unknown;
    code?: unknown;
    discount_type?: unknown;
    discount_value?: unknown;
    min_order_amount?: unknown;
    max_uses?: unknown;
    expires_at?: unknown;
    first_order_only?: unknown;
    once_per_user?: unknown;
    max_discount_amount?: unknown;
  };

  const updates: Record<string, unknown> = {};

  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);

  if (body.code !== undefined) {
    const code = String(body.code).trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      res.status(400).json({ error: "Code must be 1–32 uppercase letters, numbers, hyphens, or underscores." });
      return;
    }
    updates.code = code;
  }

  if (body.discount_type !== undefined) {
    if (!["percentage", "fixed"].includes(String(body.discount_type))) {
      res.status(400).json({ error: "discount_type must be 'percentage' or 'fixed'." });
      return;
    }
    updates.discount_type = body.discount_type;
  }

  if (body.discount_value !== undefined) {
    const v = Number(body.discount_value);
    if (isNaN(v) || v <= 0) { res.status(400).json({ error: "discount_value must be a positive number." }); return; }
    const dtype = String(body.discount_type ?? updates.discount_type ?? "percentage");
    if (dtype === "percentage" && v > 100) { res.status(400).json({ error: "Percentage discount cannot exceed 100." }); return; }
    updates.discount_value = v;
  }

  if (body.min_order_amount !== undefined) {
    updates.min_order_amount = body.min_order_amount != null && body.min_order_amount !== "" ? Number(body.min_order_amount) : null;
  }

  if (body.max_uses !== undefined) {
    updates.max_uses = body.max_uses != null && body.max_uses !== "" ? Number(body.max_uses) : null;
  }

  if (body.expires_at !== undefined) {
    const rawExpires = body.expires_at ? String(body.expires_at).trim() : "";
    updates.expires_at = rawExpires
      ? (/^\d{4}-\d{2}-\d{2}$/.test(rawExpires) ? `${rawExpires}T23:59:59+05:30` : rawExpires)
      : null;
  }

  if (body.first_order_only !== undefined) updates.first_order_only = Boolean(body.first_order_only);
  if (body.once_per_user !== undefined) updates.once_per_user = Boolean(body.once_per_user);

  if (body.max_discount_amount !== undefined) {
    const dtype = String(body.discount_type ?? "percentage");
    const mda = body.max_discount_amount != null && body.max_discount_amount !== "" ? Number(body.max_discount_amount) : null;
    if (mda !== null && (isNaN(mda) || mda <= 0)) { res.status(400).json({ error: "Max discount must be a positive number." }); return; }
    updates.max_discount_amount = dtype === "percentage" ? mda : null;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updatable fields provided." });
    return;
  }

  const { data, error } = await db
    .from("coupons")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: `Coupon code already exists.` });
      return;
    }
    sendDbError(res, log, "COUPON UPDATE", error);
    return;
  }
  log.success(`updated  id=${id}`).end("COUPON UPDATE");
  res.json({ coupon: data });
});

// ─── DELETE /:id — delete coupon ──────────────────────────────────────────────
router.delete("/:id", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("COUPON DELETE");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const { id } = req.params as { id: string };

  const { error } = await db.from("coupons").delete().eq("id", id);
  if (error) {
    sendDbError(res, log, "COUPON DELETE", error);
    return;
  }
  log.success(`deleted  id=${id}`).end("COUPON DELETE");
  res.status(204).send();
});

export default router;
