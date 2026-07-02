import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

// ─── Razorpay checkout.js (loaded via <script>, no npm types on the frontend) ─────
export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

// ─── API shapes ───────────────────────────────────────────────────────────────────
export interface CheckoutItemInput {
  product_slug: string;
  sku: string;
  size: string;
  quantity: number;
}

export interface PricedItem {
  product_id: string | null;
  product_slug: string;
  category_slug: string;
  sku: string;
  size: string;
  title: string;
  image_url: string;
  color_name: string;
  color_hex: string;
  unit_price: number;
  original_price: number;
  quantity: number;
  line_total: number;
}

export interface CheckoutPricing {
  items: PricedItem[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  itemCount: number;
  couponApplied: string | null;
}

export interface InitiateResult {
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  pricing: CheckoutPricing;
}

export interface InitiatePayload {
  mode: "cart" | "direct";
  item?: CheckoutItemInput;
  addressId: string;
  couponCode?: string;
  /** Cart mode only — checkout just these cart_items ids instead of the whole cart. */
  itemIds?: string[];
}

export interface CouponResult {
  valid: boolean;
  discount: number;
  reason: string;
}

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  console.log("[checkoutApi] token:", session?.access_token ? "present" : "missing");
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[checkoutApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[checkoutApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

export async function initiateCheckout(payload: InitiatePayload): Promise<InitiateResult> {
  console.log("[checkoutApi] initiate:", payload.mode, payload.couponCode ?? "");
  const res = await authFetch("/api/checkout/initiate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[checkoutApi] initiate error:", body);
    throw new Error((body as { error?: string }).error ?? `Checkout failed (${res.status})`);
  }
  return (await res.json()) as InitiateResult;
}

export async function verifyCheckout(payload: RazorpaySuccess): Promise<{ orderId: string; orderNumber: string }> {
  console.log("[checkoutApi] verify:", payload.razorpay_payment_id);
  const res = await authFetch("/api/checkout/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[checkoutApi] verify error:", body);
    throw new Error((body as { error?: string }).error ?? `Payment verification failed (${res.status})`);
  }
  const data = await res.json();
  console.log("[checkoutApi] verify → order", data.orderNumber ?? "?");
  return { orderId: data.orderId as string, orderNumber: data.orderNumber as string };
}

export async function validateCoupon(code: string, subtotal: number): Promise<CouponResult> {
  const res = await authFetch(`/api/checkout/coupon?code=${encodeURIComponent(code)}&subtotal=${Math.round(subtotal)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Coupon check failed (${res.status})`);
  }
  return (await res.json()) as CouponResult;
}

export interface ActiveCoupon {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_order_amount: number | null;
  max_discount_amount: number | null;
  first_order_only: boolean;
  once_per_user: boolean;
  applicable: boolean;
  reason: string;
}

/** Rupee savings for this cart subtotal — mirrors backend computeCouponDiscount. */
export function computeCouponSavings(
  coupon: Pick<ActiveCoupon, "discount_type" | "discount_value" | "max_discount_amount">,
  subtotal: number,
): number {
  let raw =
    coupon.discount_type === "percentage"
      ? (subtotal * coupon.discount_value) / 100
      : coupon.discount_value;
  if (coupon.max_discount_amount != null) raw = Math.min(raw, coupon.max_discount_amount);
  return Math.max(0, Math.round(Math.min(raw, subtotal)));
}

export function formatCouponSavings(subtotal: number, coupon: ActiveCoupon): string {
  const amount = computeCouponSavings(coupon, subtotal);
  return amount > 0 ? `Save ₹${amount.toLocaleString("en-IN")}` : "—";
}

/** e.g. "12% OFF upto ₹500" or "12% OFF" or "₹200 OFF" */
export function formatCouponOffer(coupon: ActiveCoupon): string {
  if (coupon.discount_type === "percentage") {
    const base = `${coupon.discount_value}% OFF`;
    if (coupon.max_discount_amount != null) {
      return `${base} upto ₹${Math.round(coupon.max_discount_amount).toLocaleString("en-IN")}`;
    }
    return base;
  }
  return `₹${Math.round(coupon.discount_value).toLocaleString("en-IN")} OFF`;
}

export async function fetchActiveCoupons(subtotal = 0): Promise<ActiveCoupon[]> {
  const res = await authFetch(`/api/checkout/active-coupons?subtotal=${Math.round(subtotal)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Failed to fetch active coupons (${res.status})`);
  }
  const data = await res.json();
  return (data.coupons ?? []) as ActiveCoupon[];
}

// Inject checkout.js once; resolves true when window.Razorpay is available.
let razorpayScriptPromise: Promise<boolean> | null = null;
export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.getElementById("razorpay-checkout-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-checkout-js";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => { console.log("[checkoutApi] razorpay checkout.js loaded"); resolve(true); };
    script.onerror = () => { console.error("[checkoutApi] razorpay checkout.js failed to load"); razorpayScriptPromise = null; resolve(false); };
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
}
