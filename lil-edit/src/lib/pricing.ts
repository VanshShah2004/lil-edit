// Shared cart/checkout pricing math — one source of truth for subtotal, savings, and
// the shipping fee, so Cart and Checkout never drift.
//
// NOTE: the shipping rule is ALSO implemented authoritatively in the backend
// (backend/routes/checkout.ts). The frontend and backend are separate packages that
// can't share code, so the rule is duplicated and must be kept in sync by hand:
// ₹199 when 0 < subtotal ≤ 5000, free otherwise.

export const FREE_SHIPPING_THRESHOLD = 5000;
export const SHIPPING_FEE = 199;

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

export function computeShippingFee(subtotal: number): number {
  return subtotal > 0 && subtotal <= FREE_SHIPPING_THRESHOLD ? SHIPPING_FEE : 0;
}

export function freeShippingRemaining(subtotal: number): number {
  return Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
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

/** Full totals for a set of priced lines, with an optional coupon discount applied. */
export function computeCartTotals(items: PricedLineInput[], discount = 0): CartTotals {
  const subtotal = computeSubtotal(items);
  const originalTotal = computeOriginalTotal(items);
  const shippingFee = computeShippingFee(subtotal);
  return {
    subtotal,
    originalTotal,
    totalSavings: originalTotal - subtotal,
    shippingFee,
    discount,
    total: subtotal + shippingFee - discount,
    freeShippingRemaining: freeShippingRemaining(subtotal),
  };
}
