import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

export interface CartItem {
  id: string;
  sku: string;
  size: string;
  sizes: string[];
  quantity: number;
  title: string;
  slug: string;
  categorySlug: string;
  price: number;
  originalPrice: number;
  image: string;
  images: string[];
  color: { name: string; hex: string };
  colors: { name: string; hex: string; sku: string }[];
  availability: string;
  stock: number | null;
  isUnlimited: boolean;
  tags: string[];
  badges: string[];
}

export interface AddToCartPayload {
  product_slug: string;
  sku: string;
  size: string;
  quantity?: number;
}

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  console.log("[cartApi] token:", session?.access_token ? "present" : "missing");
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[cartApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[cartApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

export async function fetchCart(): Promise<CartItem[]> {
  const res = await authFetch("/api/cart");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[cartApi] fetchCart error:", body);
    throw new Error((body as { error?: string }).error ?? `Cart fetch failed (${res.status})`);
  }
  const data = await res.json();
  console.log("[cartApi] fetchCart →", (data.items ?? []).length, "items");
  return (data.items ?? []) as CartItem[];
}

export interface AddToCartResult {
  outOfStock: boolean;
  /** Quantity actually added this call (0 = line was already at the stock cap). */
  applied: number;
  /** Quantity the caller asked for. */
  requested: number;
  /** Per-line ceiling the backend clamped against (min(99, stock); 99 if unlimited/OOS). */
  maxAllowed: number;
  /** The sku the line was STORED under — a base_sku add resolves server-side to the primary variant. */
  sku: string;
}

export async function addToCart(payload: AddToCartPayload): Promise<AddToCartResult> {
  console.log("[cartApi] addToCart payload:", payload);
  const res = await authFetch("/api/cart/add", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[cartApi] addToCart error:", body);
    throw new Error((body as { error?: string }).error ?? `Add to cart failed (${res.status})`);
  }
  const requested = payload.quantity ?? 1;
  const b = body as { outOfStock?: boolean; applied?: number; maxAllowed?: number; sku?: string };
  console.log("[cartApi] addToCart success", { applied: b.applied, maxAllowed: b.maxAllowed, sku: b.sku });
  return {
    outOfStock: !!b.outOfStock,
    // Older backend without the field → assume fully applied (previous behavior).
    applied: typeof b.applied === "number" ? b.applied : requested,
    requested,
    maxAllowed: typeof b.maxAllowed === "number" ? b.maxAllowed : 99,
    sku: typeof b.sku === "string" && b.sku ? b.sku : payload.sku,
  };
}

export async function updateCartItemColor(
  cartItemId: string,
  sku: string
): Promise<void> {
  const res = await authFetch(`/api/cart/${cartItemId}/color`, {
    method: "PATCH",
    body: JSON.stringify({ sku }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Color update failed (${res.status})`);
  }
}

export async function updateCartItemSize(
  cartItemId: string,
  size: string
): Promise<void> {
  const res = await authFetch(`/api/cart/${cartItemId}/size`, {
    method: "PATCH",
    body: JSON.stringify({ size }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Size update failed (${res.status})`);
  }
}

export async function updateCartItemQty(
  cartItemId: string,
  quantity: number
): Promise<void> {
  const res = await authFetch(`/api/cart/${cartItemId}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Quantity update failed (${res.status})`);
  }
}

export async function removeCartItem(cartItemId: string): Promise<void> {
  const res = await authFetch(`/api/cart/${cartItemId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Remove failed (${res.status})`);
  }
}

export async function clearCart(): Promise<void> {
  const res = await authFetch("/api/cart/clear", { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Clear cart failed (${res.status})`);
  }
}
