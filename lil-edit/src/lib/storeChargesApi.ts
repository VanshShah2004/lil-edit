import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

// ─── Store charges: delivery + gift wrapping (mirrors backend/routes/storeCharges.ts) ──
// These are admin-set in General Settings and served by the backend. The storefront
// can't read them from Supabase directly — site_settings is RLS-locked precisely so
// the browser can't touch numbers that decide what a customer pays.

export interface StoreCharges {
  /** Flat delivery fee on an order at or below the free-delivery threshold. */
  deliveryFee: number;
  /** Delivery is FREE above this subtotal. Fee applies when 0 < subtotal <= this. */
  freeDeliveryThreshold: number;
  /** Gift wrapping, charged per ITEM (per unit, not per line). */
  giftWrapFee: number;
}

export interface StoreChargesAdminState extends StoreCharges {
  updatedAt: string | null;
  updatedByEmail: string | null;
}

/**
 * The values the hardcoded constants used to hold. Used when the charges haven't
 * loaded yet or the request failed, so pricing renders sane numbers instead of
 * flashing ₹0 delivery — which would read as "free!" and then correct itself.
 * The backend falls back to these same numbers, so a failure degrades to the
 * old behaviour rather than to a wrong quote.
 */
export const DEFAULT_STORE_CHARGES: StoreCharges = {
  deliveryFee: 199,
  freeDeliveryThreshold: 5000,
  giftWrapFee: 100,
};

function coerce(data: Partial<StoreCharges> | null | undefined): StoreCharges {
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    deliveryFee: num(data?.deliveryFee, DEFAULT_STORE_CHARGES.deliveryFee),
    freeDeliveryThreshold: num(data?.freeDeliveryThreshold, DEFAULT_STORE_CHARGES.freeDeliveryThreshold),
    giftWrapFee: num(data?.giftWrapFee, DEFAULT_STORE_CHARGES.giftWrapFee),
  };
}

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[storeChargesApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[storeChargesApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? `${fallback} (${res.status})`);
}

/** PUBLIC read — what Cart and Checkout price with. No auth (guests check out too). */
export async function fetchStoreCharges(signal?: AbortSignal): Promise<StoreCharges> {
  const url = `${getBackendBaseUrl()}/api/store-charges`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Could not load store charges (${res.status})`);
  return coerce((await res.json()) as Partial<StoreCharges>);
}

/** Admin read — current charges plus who last changed them, for the settings panel. */
export async function fetchStoreChargesAdmin(): Promise<StoreChargesAdminState> {
  const res = await authFetch("/api/store-charges/admin");
  if (!res.ok) throw await errorFrom(res, "Could not load store charges");
  const data = (await res.json()) as Partial<StoreChargesAdminState>;
  return {
    ...coerce(data),
    updatedAt: data.updatedAt ?? null,
    updatedByEmail: data.updatedByEmail ?? null,
  };
}

/**
 * Admin write. Every field is optional — an omitted one is left untouched, so the
 * panel can save just the charge that changed.
 */
export async function saveStoreCharges(patch: Partial<StoreCharges>): Promise<StoreChargesAdminState> {
  const res = await authFetch("/api/store-charges", {
    method: "POST",
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await errorFrom(res, "Could not update store charges");
  const data = (await res.json()) as Partial<StoreChargesAdminState>;
  return {
    ...coerce(data),
    updatedAt: data.updatedAt ?? null,
    updatedByEmail: data.updatedByEmail ?? null,
  };
}
