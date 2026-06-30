import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

export interface Coupon {
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
  created_at: string;
}

export interface CreateCouponPayload {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_order_amount?: number | null;
  max_uses?: number | null;
  expires_at?: string | null;
  first_order_only?: boolean;
  once_per_user?: boolean;
}

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[couponsApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[couponsApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? `${fallback} (${res.status})`);
}

export async function fetchCoupons(): Promise<Coupon[]> {
  const res = await authFetch("/api/admin/coupons");
  if (!res.ok) throw await errorFrom(res, "Could not load coupons");
  const data = (await res.json()) as { coupons: Coupon[] };
  return data.coupons ?? [];
}

export async function createCoupon(payload: CreateCouponPayload): Promise<Coupon> {
  const res = await authFetch("/api/admin/coupons", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await errorFrom(res, "Could not create coupon");
  const data = (await res.json()) as { coupon: Coupon };
  return data.coupon;
}

export async function toggleCoupon(id: string, is_active: boolean): Promise<Coupon> {
  const res = await authFetch(`/api/admin/coupons/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active }),
  });
  if (!res.ok) throw await errorFrom(res, "Could not update coupon");
  const data = (await res.json()) as { coupon: Coupon };
  return data.coupon;
}

export async function deleteCoupon(id: string): Promise<void> {
  const res = await authFetch(`/api/admin/coupons/${id}`, { method: "DELETE" });
  if (!res.ok) throw await errorFrom(res, "Could not delete coupon");
}
