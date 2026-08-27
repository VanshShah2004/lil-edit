// Shared cart/checkout pricing math — one source of truth for subtotal, savings,
// the delivery fee and gift wrapping, so Cart and Checkout never drift.
//
// The RULE lives here; the NUMBERS do not. The delivery fee, the subtotal above
// which delivery is free, and the per-item gift-wrap rate are admin-set in
// General Settings and fetched from the backend (GET /api/store-charges, via
// useStoreCharges). They used to be hardcoded constants here AND in
// backend/routes/checkout.ts, kept in sync by hand.
//
// The backend still prices authoritatively (backend/routes/checkout.ts +
// lib/storeCharges.ts) — everything here is display. But both sides now read the
// same values from the same place, so the amount shown and the amount charged
// agree instead of depending on two copies of a constant matching.

import { DEFAULT_STORE_CHARGES, type StoreCharges } from "@/lib/storeChargesApi";

export type { StoreCharges };

export interface PricedLineInput {
  price: number;
  originalPrice: number;
  quantity: number;
}

export function computeSubtotal(items: PricedLineInput[]): number {
  return items.reduce((sum, it) => sum + it.price * it.quantity, 0);
}

export function computeOriginalTotal(items: PricedLineInput[]): number {
  return items.reduce((sum, it) => sum + it.originalPrice * it.quantity, 0);
}

/** Delivery fee when 0 < subtotal <= threshold; free above it, and free on an empty cart. */
export function computeShippingFee(subtotal: number, charges: StoreCharges = DEFAULT_STORE_CHARGES): number {
  return subtotal > 0 && subtotal <= charges.freeDeliveryThreshold ? charges.deliveryFee : 0;
}

/** How much more the customer must spend to unlock free delivery (0 once they have). */
export function freeShippingRemaining(subtotal: number, charges: StoreCharges = DEFAULT_STORE_CHARGES): number {
  return Math.max(0, charges.freeDeliveryThreshold - subtotal);
}

/**
 * Gift wrapping for a whole order: the per-item rate × the number of UNITS.
 * Rounded to paise so a fractional rate can't produce a long float in the UI.
 */
export function computeGiftWrapFee(itemCount: number, charges: StoreCharges = DEFAULT_STORE_CHARGES): number {
  if (itemCount <= 0) return 0;
  return Math.max(0, Math.round(itemCount * charges.giftWrapFee * 100) / 100);
}

export interface CartTotals {
  subtotal: number;
  originalTotal: number;
  totalSavings: number;
  shippingFee: number;
  discount: number;
  total: number;
  freeShippingRemaining: number;
}

/**
 * Full totals for a set of priced lines, with an optional coupon discount applied.
 * Gift wrapping is NOT included — it's a checkout-only opt-in, so Checkout adds it
 * on top of `total` rather than having every caller pass a flag it doesn't use.
 */
export function computeCartTotals(
  items: PricedLineInput[],
  discount = 0,
  charges: StoreCharges = DEFAULT_STORE_CHARGES,
): CartTotals {
  const subtotal = computeSubtotal(items);
  const originalTotal = computeOriginalTotal(items);
  const shippingFee = computeShippingFee(subtotal, charges);
  return {
    subtotal,
    originalTotal,
    totalSavings: originalTotal - subtotal,
    shippingFee,
    discount,
    total: subtotal + shippingFee - discount,
    freeShippingRemaining: freeShippingRemaining(subtotal, charges),
  };
}
