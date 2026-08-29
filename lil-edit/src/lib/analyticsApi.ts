import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { getBackendBaseUrl } from "@/lib/backend";
import { authHeader } from "@/lib/apiAuth";

// ─── Analytics API client ─────────────────────────────────────────────────────
// One typed fetch per analytics page (mirrors the /api/admin/analytics router).
// Filters live in the URL query string so they persist across tab navigation and
// are shareable — the Shopify/Linear pattern.

export type Bucket = "day" | "week" | "month";

export interface AnalyticsParams {
  from: string;       // ISO date (inclusive)
  to: string;         // ISO date (exclusive)
  bucket: Bucket;
  category?: string;
  paymentMethod?: "cod" | "online";
  couponCode?: string;
  preset?: string;    // UI-only: which preset row is active (for highlighting)
}

export interface AnalyticsMeta {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  bucket: Bucket;
  filters: Record<string, string>;
  cached: boolean;
}

export interface AnalyticsEnvelope<T> {
  data: T;
  meta: AnalyticsMeta;
}

// ─── Date presets ─────────────────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function isoDate(d: Date): string {
  return d.toISOString();
}

export interface Preset {
  key: string;
  label: string;
  build: () => { from: string; to: string; bucket: Bucket };
}

const now = () => new Date();
const daysAgo = (n: number) => startOfDay(new Date(Date.now() - n * 86_400_000));
const endExclusive = () => isoDate(new Date(Date.now() + 60_000)); // now + slack → today counts

export const PRESETS: Preset[] = [
  { key: "today", label: "Today", build: () => ({ from: isoDate(startOfDay(now())), to: endExclusive(), bucket: "day" }) },
  { key: "7d", label: "Last 7 days", build: () => ({ from: isoDate(daysAgo(6)), to: endExclusive(), bucket: "day" }) },
  { key: "30d", label: "Last 30 days", build: () => ({ from: isoDate(daysAgo(29)), to: endExclusive(), bucket: "day" }) },
  { key: "90d", label: "Last 90 days", build: () => ({ from: isoDate(daysAgo(89)), to: endExclusive(), bucket: "week" }) },
  {
    key: "mtd",
    label: "Month to date",
    build: () => {
      const d = now();
      return { from: isoDate(new Date(d.getFullYear(), d.getMonth(), 1)), to: endExclusive(), bucket: "day" };
    },
  },
  { key: "12m", label: "Last 12 months", build: () => ({ from: isoDate(daysAgo(364)), to: endExclusive(), bucket: "month" }) },
];

const DEFAULT_PRESET = PRESETS[2]; // Last 30 days

// ─── URL-backed params hook ───────────────────────────────────────────────────
export function useAnalyticsParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params: AnalyticsParams = useMemo(() => {
    const preset = searchParams.get("preset") ?? DEFAULT_PRESET.key;
    const presetDef = PRESETS.find((p) => p.key === preset);

    // A named preset recomputes its window on every render (so "today" stays
    // today); a custom range reads explicit from/to off the URL.
    let from = searchParams.get("from") ?? "";
    let to = searchParams.get("to") ?? "";
    let bucket = (searchParams.get("bucket") as Bucket) ?? "day";
    if (presetDef && preset !== "custom") {
      const built = presetDef.build();
      from = built.from;
      to = built.to;
      bucket = (searchParams.get("bucket") as Bucket) ?? built.bucket;
    }
    if (!from || !to) {
      const built = DEFAULT_PRESET.build();
      from = built.from;
      to = built.to;
      bucket = built.bucket;
    }

    return {
      from,
      to,
      bucket,
      preset,
      category: searchParams.get("category") || undefined,
      paymentMethod: (searchParams.get("payment_method") as "cod" | "online") || undefined,
      couponCode: searchParams.get("coupon_code") || undefined,
    };
  }, [searchParams]);

  const setPreset = useCallback(
    (key: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("preset", key);
        next.delete("from");
        next.delete("to");
        next.delete("bucket");
        return next;
      });
    },
    [setSearchParams]
  );

  const setCustomRange = useCallback(
    (from: string, to: string, bucket: Bucket) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("preset", "custom");
        next.set("from", from);
        next.set("to", to);
        next.set("bucket", bucket);
        return next;
      });
    },
    [setSearchParams]
  );

  const setBucket = useCallback(
    (bucket: Bucket) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("bucket", bucket);
        return next;
      });
    },
    [setSearchParams]
  );

  const setFilter = useCallback(
    (key: "category" | "payment_method" | "coupon_code", value: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      });
    },
    [setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("category");
      next.delete("payment_method");
      next.delete("coupon_code");
      return next;
    });
  }, [setSearchParams]);

  return { params, setPreset, setCustomRange, setBucket, setFilter, clearFilters };
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────
function toQuery(params: AnalyticsParams): string {
  const q = new URLSearchParams();
  q.set("from", params.from);
  q.set("to", params.to);
  q.set("bucket", params.bucket);
  if (params.category) q.set("category", params.category);
  if (params.paymentMethod) q.set("payment_method", params.paymentMethod);
  if (params.couponCode) q.set("coupon_code", params.couponCode);
  return q.toString();
}

export class AnalyticsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function fetchPage<T>(page: string, params: AnalyticsParams | null): Promise<AnalyticsEnvelope<T>> {
  const suffix = params ? `?${toQuery(params)}` : "";
  const url = `${getBackendBaseUrl()}/api/admin/analytics/${page}${suffix}`;
  console.log(`[analyticsApi] GET ${url}`);
  const res = await fetch(url, { headers: { ...(await authHeader()) } });
  console.log(`[analyticsApi] GET ${url} → ${res.status}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new AnalyticsError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as AnalyticsEnvelope<T>;
}

// Generic page hook. `T` is the page's `data` shape (typed per page below).
export function useAnalytics<T>(page: string, params: AnalyticsParams): UseQueryResult<AnalyticsEnvelope<T>, Error> {
  return useQuery({
    queryKey: ["analytics", page, params.from, params.to, params.bucket, params.category, params.paymentMethod, params.couponCode],
    queryFn: () => fetchPage<T>(page, params),
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof AnalyticsError && err.status >= 400 && err.status < 500) && count < 2,
  });
}

// Per-product deep-dive (slug in the path).
export function useProductAnalytics<T>(slug: string, params: AnalyticsParams): UseQueryResult<AnalyticsEnvelope<T>, Error> {
  return useQuery({
    queryKey: ["analytics", "product", slug, params.from, params.to, params.bucket],
    queryFn: () => fetchPage<T>(`product/${encodeURIComponent(slug)}`, params),
    enabled: !!slug,
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof AnalyticsError && err.status >= 400 && err.status < 500) && count < 2,
  });
}

// Live dashboard — no window params, short poll.
export function useLiveAnalytics<T>(pollMs = 10_000): UseQueryResult<AnalyticsEnvelope<T>, Error> {
  return useQuery({
    queryKey: ["analytics", "live"],
    queryFn: () => fetchPage<T>("live", null),
    refetchInterval: pollMs,
    staleTime: 0,
    retry: (count, err) => !(err instanceof AnalyticsError && err.status >= 400 && err.status < 500) && count < 2,
  });
}

// ─── Payload types (per page) ─────────────────────────────────────────────────
// Loosely typed where the backend returns broad jsonb; the pages read defensively.
export type Kpis = Record<string, number | null>;

export interface Bucketed {
  bucket: string;
  [k: string]: string | number;
}

export interface ProductRef {
  slug: string;
  title: string;
  image?: string;
  revenue?: number;
  units?: number;
  views?: number;
  visitors?: number;
}

export interface ExecutivePayload {
  kpis: Kpis;
  previous: Kpis;
  revenue_orders_series: Bucketed[];
  top_products_by_revenue: ProductRef[];
  revenue_by_category: { category: string; revenue: number; units: number }[];
  best_sellers: ProductRef[];
}

export interface RevenuePayload {
  kpis: Kpis;
  previous: Kpis;
  revenue_series: Bucketed[];
  revenue_by_category: { category: string; revenue: number; units: number; orders: number }[];
  revenue_by_payment: { method: string; revenue: number; orders: number }[];
}

export interface OrdersPayload {
  kpis: Kpis;
  previous: Kpis;
  orders_series: Bucketed[];
}

export interface ProductsPayload {
  kpis: Kpis;
  previous: Kpis;
  top_selling: ProductRef[];
  most_viewed: ProductRef[];
  sales_series: Bucketed[];
  products_table: ProductTableRow[];
}

export interface ProductTableRow {
  slug: string;
  title: string;
  category: string;
  price: number;
  stock: number;
  is_unlimited: boolean;
  units: number;
  revenue: number;
  views: number;
  wishlist_adds: number;
  cart_adds: number;
  conversion: number | null;
  rating: number | null;
  reviews: number;
}

export interface CustomersPayload {
  kpis: Kpis;
  previous: Kpis;
  growth_series: Bucketed[];
  new_vs_returning: { new_orders: number; returning_orders: number };
  top_customers: { user_id: string; name: string; email: string; orders: number; spend: number; last_order: string }[];
  by_gender: { gender: string; buyers: number; orders: number; revenue: number }[];
}

export interface WishlistPayload {
  kpis: Kpis & {
    most_wishlisted?: { slug: string; title: string; adds: number } | null;
    fastest_growing?: { slug: string; title: string; delta: number } | null;
  };
  previous: Kpis;
  table: {
    slug: string; title: string; adds: number; removes: number; active: number;
    moved_to_cart: number; purchased: number;
  }[];
}

export interface CartPayload {
  kpis: Kpis & {
    highest_carted?: { slug: string; title: string; adds: number } | null;
    highest_abandonment?: { slug: string; title: string; abandonment_pct: number } | null;
  };
  previous: Kpis;
  table: {
    slug: string; title: string; adds: number; removes: number; active: number;
    users: number; purchased: number;
  }[];
}

export interface SearchPayload {
  kpis: Kpis;
  previous: Kpis;
  search_series: Bucketed[];
  top_terms: { query: string; count: number; avg_results: number; clicks: number; ctr: number }[];
  zero_terms: { query: string; count: number }[];
}

export interface ReviewsPayload {
  kpis: Kpis;
  previous: Kpis;
  reviews_trend: Bucketed[];
  rating_distribution: { rating: number; count: number }[];
  by_product: { slug: string; title: string; count: number; avg_rating: number; verified: number; low_ratings: number }[];
}

export interface CouponsPayload {
  kpis: Kpis;
  previous: Kpis;
  table: {
    code: string; discount_type: string; discount_value: number; status: string;
    lifetime_uses: number; expires_at: string | null; orders: number; revenue: number;
    discount: number; aov: number | null; roi: number | null; new_customers: number; cancelled: number;
    // Attempt counts from the coupon_applied activity events (20260828). Optional:
    // a database still running the pre-20260828 analytics_coupons omits them.
    attempts?: number; failed?: number;
  }[];
  // Why codes were refused, busiest reason first. Same caveat as above - absent
  // until 20260828_analytics_activity_coverage.sql is applied.
  failures?: { reason: string; count: number; codes: string[] }[];
}

export interface InventoryPayload {
  kpis: Kpis;
  fastest_selling: { slug: string; title: string; units: number; stock: number | null; per_day: number; days_of_cover: number | null }[];
  slowest_selling: { slug: string; title: string; units: number; stock: number; views: number }[];
  low_stock_rows: { slug: string; title: string; sku: string; color: string; stock: number }[];
}

export interface ProductDetailPayload {
  product: { slug: string; title: string; category: string | null; price: number | null; stock: number | null; is_unlimited: boolean | null; in_catalog: boolean };
  overview: Kpis;
  views: Kpis;
  views_series: Bucketed[];
  wishlist: Kpis;
  cart: Kpis;
  purchases: Kpis;
  sales_series: Bucketed[];
  funnel: { views: number; wishlist: number; cart: number; checkout: number; purchase: number; repeat: number };
  gender: { segment: string; views: number; wishlists: number; cart_adds: number; orders: number; revenue: number; conversion: number | null }[];
  by_color: { sku: string; color: string; hex: string | null; views: number; wishlists: number; cart_adds: number; orders: number; units: number; revenue: number; conversion: number | null }[];
  by_size: { size: string; cart_adds: number; orders: number; units: number; revenue: number; conversion: number | null }[];
  reviews: Kpis;
  rating_distribution: { rating: number; count: number }[];
  rating_trend: Bucketed[];
  search: Kpis;
  top_queries: { query: string; count: number }[];
  rankings: Kpis;
}

export interface LivePayload {
  kpis: Kpis;
  feed: {
    type: string; at: string; slug: string | null; sku: string | null;
    title: string | null; user_name: string | null; metadata: Record<string, unknown>;
  }[];
  as_of: string;
}
