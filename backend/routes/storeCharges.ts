import { Router, type Request, type Response } from "express";
import { type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { adminMutationLimiter } from "../middleware/rateLimiters.js";
import { createLog, type OpLogger } from "../lib/logger.js";
import { logAdminAction } from "../lib/adminAudit.js";
import {
  getStoreCharges,
  refreshStoreCharges,
  bustStoreCharges,
} from "../lib/storeCharges.js";

// ─── Store charges: delivery fee, free-delivery threshold, gift-wrap rate ─────
// Read publicly (the storefront needs to show what it will charge) and written
// only by an admin through the service_role-only set_store_charges RPC.
//
// The public GET is what keeps the Cart/Checkout display and the amount actually
// charged at /initiate in agreement: both come from the same cached snapshot on
// the same backend, instead of two hand-synced copies of a constant.

const router = Router();

const MIGRATION_HINT =
  "Store charges aren't set up in the database yet. Run lil-edit/supabase/migrations/20260827_store_charges.sql in Supabase.";

// Sanity ceilings. Not business rules — just a guard against a slipped decimal
// or a paste accident putting an absurd amount on a customer's card.
const MAX_FEE = 100_000;
const MAX_THRESHOLD = 10_000_000;

// PostgREST errors meaning the RPC/columns don't exist yet (migration not applied).
function isMissingObjectError(code?: string, message?: string): boolean {
  return (
    code === "42883" || // undefined_function
    code === "42P01" || // undefined_table
    code === "42703" || // undefined_column
    code === "PGRST202" || // function not in schema cache
    code === "PGRST204" || // column not in schema cache
    code === "PGRST205" || // table not in schema cache
    /does not exist|find the (function|table|column)|schema cache/i.test(message ?? "")
  );
}

// Writing goes through an RPC that only service_role may execute, so the write
// path REQUIRES the service role. Fail loudly rather than with a confusing 403.
function serviceClientOr503(res: Response, log: OpLogger): SupabaseClient | null {
  if (supabaseAdmin) return supabaseAdmin;
  log.error("SUPABASE_SERVICE_ROLE_KEY not configured — store charges are read-only").end("CHARGES SET");
  res.status(503).json({
    error:
      "Store charges can't be changed: the backend is missing SUPABASE_SERVICE_ROLE_KEY. Set it in backend/.env and restart.",
  });
  return null;
}

/**
 * Parse one optional money field from the body. Returns:
 *   { ok: true, value: number | null } — null meaning "not provided, leave as is"
 *   { ok: false, error }               — present but not a usable amount
 * Amounts are rounded to paise so a float like 199.999 can't reach the DB.
 */
function parseAmount(
  raw: unknown,
  label: string,
  max: number,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a number.` };
  if (n < 0) return { ok: false, error: `${label} can't be negative.` };
  if (n > max) return { ok: false, error: `${label} looks too large (max ₹${max.toLocaleString("en-IN")}).` };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

// ─── GET /api/store-charges — PUBLIC, drives Cart + Checkout pricing display ──
// No auth: every shopper (including a logged-out one) needs to know the delivery
// rule and the wrapping rate before they commit. Serves the in-memory snapshot,
// so it's cheap and stays available even if the DB blips.
router.get("/", (_req: Request, res: Response) => {
  const c = getStoreCharges();
  res.json({
    deliveryFee: c.deliveryFee,
    freeDeliveryThreshold: c.freeDeliveryThreshold,
    giftWrapFee: c.giftWrapFee,
  });
});

// ─── GET /api/store-charges/admin — admin: current values + audit line ────────
router.get("/admin", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const log = createLog().start("CHARGES GET");
  try {
    const c = await refreshStoreCharges();
    log.success(`delivery=₹${c.deliveryFee}  freeAbove=₹${c.freeDeliveryThreshold}  gift=₹${c.giftWrapFee}`).end("CHARGES GET");
    res.json({
      deliveryFee: c.deliveryFee,
      freeDeliveryThreshold: c.freeDeliveryThreshold,
      giftWrapFee: c.giftWrapFee,
      updatedAt: c.updatedAt,
      updatedByEmail: c.updatedByEmail,
    });
  } catch (err) {
    log.error("unhandled error", err).end("CHARGES GET");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── POST /api/store-charges — admin: change what customers are charged ───────
// Every field is optional; an omitted field is left exactly as it was (the RPC
// COALESCEs), so the panel can save one charge without echoing the others back.
router.post("/", requireAuth, requireAdmin, adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("CHARGES SET");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const actorId = (req as AuthenticatedRequest).userId;

  const body = (req.body ?? {}) as {
    deliveryFee?: unknown;
    freeDeliveryThreshold?: unknown;
    giftWrapFee?: unknown;
  };

  const delivery = parseAmount(body.deliveryFee, "Delivery charge", MAX_FEE);
  if (!delivery.ok) {
    log.warn(`invalid deliveryFee: ${delivery.error}`).end("CHARGES SET");
    res.status(400).json({ error: delivery.error });
    return;
  }
  const threshold = parseAmount(body.freeDeliveryThreshold, "Free-delivery threshold", MAX_THRESHOLD);
  if (!threshold.ok) {
    log.warn(`invalid freeDeliveryThreshold: ${threshold.error}`).end("CHARGES SET");
    res.status(400).json({ error: threshold.error });
    return;
  }
  const gift = parseAmount(body.giftWrapFee, "Gift wrapping charge", MAX_FEE);
  if (!gift.ok) {
    log.warn(`invalid giftWrapFee: ${gift.error}`).end("CHARGES SET");
    res.status(400).json({ error: gift.error });
    return;
  }

  if (delivery.value === null && threshold.value === null && gift.value === null) {
    log.warn("nothing to change").end("CHARGES SET");
    res.status(400).json({ error: "Provide at least one charge to update." });
    return;
  }

  const before = getStoreCharges();
  log.step(
    `actor=${actorId}  delivery=${delivery.value ?? "(unchanged)"}  freeAbove=${threshold.value ?? "(unchanged)"}  gift=${gift.value ?? "(unchanged)"}`,
  );

  try {
    const { data, error } = await db.rpc("set_store_charges", {
      p_actor_id: actorId,
      p_delivery_fee: delivery.value,
      p_free_delivery_threshold: threshold.value,
      p_gift_wrap_fee: gift.value,
    });

    if (error) {
      if (isMissingObjectError((error as { code?: string }).code, error.message)) {
        log.warn("RPC missing — migration not applied").end("CHARGES SET");
        res.status(503).json({ error: MIGRATION_HINT });
        return;
      }
      log.error(`rpc failed  code=${error.code}  msg=${error.message}`, error).end("CHARGES SET");
      res.status(500).json({ error: error.message });
      return;
    }

    const result = (Array.isArray(data) ? data[0] : data) as { status?: string; reason?: string } | null;
    if (!result || result.status !== "ok") {
      if (result?.status === "invalid") {
        log.warn(`refused  reason=${result.reason ?? "invalid"}`).end("CHARGES SET");
        res.status(400).json({ error: result.reason ?? "Those charges aren't valid." });
        return;
      }
      // "forbidden" — the DB's final-arbiter admin re-check failed. Shouldn't
      // happen behind requireAdmin, but honour it.
      log.warn(`refused  status=${result?.status ?? "none"}`).end("CHARGES SET");
      res.status(403).json({ error: "You don't have permission to change store charges." });
      return;
    }

    // Apply on THIS instance immediately rather than waiting for the next poll,
    // so a checkout started right after the save is already priced at the new rate.
    const c = await bustStoreCharges();
    log.success(`ok  delivery=₹${c.deliveryFee}  freeAbove=₹${c.freeDeliveryThreshold}  gift=₹${c.giftWrapFee}`).end("CHARGES SET");

    // Audit the money change with both the old and new values — "who set delivery
    // to ₹0" is exactly the question this log exists to answer.
    const changes: string[] = [];
    if (delivery.value !== null && delivery.value !== before.deliveryFee) changes.push(`delivery ₹${before.deliveryFee} → ₹${c.deliveryFee}`);
    if (threshold.value !== null && threshold.value !== before.freeDeliveryThreshold) changes.push(`free above ₹${before.freeDeliveryThreshold} → ₹${c.freeDeliveryThreshold}`);
    if (gift.value !== null && gift.value !== before.giftWrapFee) changes.push(`gift wrap ₹${before.giftWrapFee} → ₹${c.giftWrapFee}`);
    void logAdminAction({
      adminId: actorId,
      action: "store_charges_updated",
      targetType: "site",
      targetId: "charges",
      summary: changes.length > 0 ? `Updated store charges: ${changes.join(", ")}` : "Saved store charges (no change)",
      metadata: {
        before: {
          deliveryFee: before.deliveryFee,
          freeDeliveryThreshold: before.freeDeliveryThreshold,
          giftWrapFee: before.giftWrapFee,
        },
        after: {
          deliveryFee: c.deliveryFee,
          freeDeliveryThreshold: c.freeDeliveryThreshold,
          giftWrapFee: c.giftWrapFee,
        },
      },
    });

    res.json({
      deliveryFee: c.deliveryFee,
      freeDeliveryThreshold: c.freeDeliveryThreshold,
      giftWrapFee: c.giftWrapFee,
      updatedAt: c.updatedAt,
      updatedByEmail: c.updatedByEmail,
    });
  } catch (err) {
    log.error("unhandled error", err).end("CHARGES SET");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
