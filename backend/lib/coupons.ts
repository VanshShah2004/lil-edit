import { type SupabaseClient } from "@supabase/supabase-js";
import { type OpLogger } from "./logger.js";

// ─── Shared coupon validation + discount math ────────────────────────────────────
// Single source of truth used by the live /coupon check, /initiate pricing, and the
// /verify re-price fallback. The discount is ALWAYS computed here server-side — the
// browser-supplied amount is never trusted. Whole-rupee discounts (Math.round) keep the
// paise math (amount = round(total*100)) exact and match the built-in FIRST10 convention.
//
// NOTE: this covers the admin-managed `coupons` table only. FIRST10 is a separate,
// order-history-derived coupon handled directly in routes/checkout.ts.

export interface CouponRow {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_order_amount: number | null;
  max_uses: number | null;
  uses_count: number;
  expires_at: string | null;
  is_active: boolean;
  first_order_only: boolean;
  once_per_user: boolean;
  max_discount_amount: number | null;
}

export interface CouponValidation {
  valid: boolean;
  discount: number; // whole rupees
  reason: string;
  coupon: CouponRow | null;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Discount in whole rupees, capped at max_discount_amount (if set) and the subtotal. */
export function computeCouponDiscount(coupon: CouponRow, subtotal: number): number {
  let raw =
    coupon.discount_type === "percentage"
      ? (subtotal * Number(coupon.discount_value)) / 100
      : Number(coupon.discount_value);
  if (coupon.max_discount_amount != null) raw = Math.min(raw, Number(coupon.max_discount_amount));
  return Math.max(0, Math.round(Math.min(raw, subtotal)));
}

// Count a user's placed orders (for first_order_only). RLS is bypassed by the service
// client the backend passes in. A query error fails CLOSED (treats as "has orders") so a
// glitch can't hand out a first-order discount to a returning customer.
async function userOrderCount(db: SupabaseClient, userId: string, log: OpLogger): Promise<number> {
  const { count, error } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    log.warn(`order-count check failed for user ${userId}: ${error.message}`);
    return Number.POSITIVE_INFINITY;
  }
  return count ?? 0;
}

// How many of the user's orders already used this coupon (for once_per_user). Same
// fail-closed posture.
async function userCouponUseCount(db: SupabaseClient, userId: string, code: string, log: OpLogger): Promise<number> {
  const { count, error } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("coupon_code", code);
  if (error) {
    log.warn(`coupon-use check failed for user ${userId} code ${code}: ${error.message}`);
    return Number.POSITIVE_INFINITY;
  }
  return count ?? 0;
}

/**
 * Validate an admin-managed coupon against a subtotal (rupees) for a specific user. Any
 * lookup failure (missing table, no service role, unknown code) resolves to a clean
 * "invalid" — never an exception — so a coupon problem can never crash or block checkout.
 * Per-user rules (first_order_only / once_per_user) are checked against the orders table.
 */
export async function validateCoupon(
  db: SupabaseClient,
  rawCode: string,
  subtotal: number,
  userId: string,
  log: OpLogger,
): Promise<CouponValidation> {
  const code = (rawCode ?? "").trim().toUpperCase();
  const invalid = (reason: string, coupon: CouponRow | null = null): CouponValidation => ({
    valid: false,
    discount: 0,
    reason,
    coupon,
  });

  if (!code) return invalid("Invalid coupon code.");

  const { data, error } = await db
    .from("coupons")
    .select("id, code, discount_type, discount_value, min_order_amount, max_uses, uses_count, expires_at, is_active, first_order_only, once_per_user")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    log.warn(`coupon lookup failed for "${code}": ${error.message}`);
    return invalid("Invalid coupon code.");
  }
  if (!data) return invalid("Invalid coupon code.");

  const coupon = data as CouponRow;

  if (!coupon.is_active) return invalid("This coupon is no longer active.", coupon);
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now())
    return invalid("This coupon has expired.", coupon);
  if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses)
    return invalid("This coupon has reached its usage limit.", coupon);
  if (coupon.min_order_amount !== null && subtotal < Number(coupon.min_order_amount)) {
    const shortfall = Math.max(1, Math.round(Number(coupon.min_order_amount) - subtotal));
    return invalid(`Add ${inr(shortfall)} to apply this coupon.`, coupon);
  }

  // Per-user rules (checked against the user's order history).
  if (coupon.first_order_only) {
    if (await userOrderCount(db, userId, log) > 0)
      return invalid("This coupon is only valid on your first order.", coupon);
  } else if (coupon.once_per_user) {
    // (first_order_only already implies once-per-user, so only check when it's off.)
    if (await userCouponUseCount(db, userId, coupon.code, log) > 0)
      return invalid("You've already used this coupon.", coupon);
  }

  const discount = computeCouponDiscount(coupon, subtotal);
  if (discount <= 0) return invalid("This coupon doesn't apply to your order.", coupon);

  const reason =
    coupon.discount_type === "percentage"
      ? `${Number(coupon.discount_value)}% off applied!`
      : `${inr(Number(coupon.discount_value))} off applied!`;
  return { valid: true, discount, reason, coupon };
}
