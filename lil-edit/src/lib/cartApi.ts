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
  color: { name: string; hex: string };
  colors: { name: string; hex: string; sku: string }[];
  availability: string;
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
  console.log("[cartApi] token:", !!session?.access_token ? "present" : "missing");
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
    throw new Error((body as any).error ?? `Cart fetch failed (${res.status})`);
  }
  const data = await res.json();
  console.log("[cartApi] fetchCart →", (data.items ?? []).length, "items");
  return (data.items ?? []) as CartItem[];
}

export async function addToCart(payload: AddToCartPayload): Promise<void> {
  console.log("[cartApi] addToCart payload:", payload);
  const res = await authFetch("/api/cart/add", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[cartApi] addToCart error:", body);
    throw new Error((body as any).error ?? `Add to cart failed (${res.status})`);
  }
  console.log("[cartApi] addToCart success");
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
    throw new Error((body as any).error ?? `Color update failed (${res.status})`);
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
    throw new Error((body as any).error ?? `Size update failed (${res.status})`);
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
    throw new Error((body as any).error ?? `Quantity update failed (${res.status})`);
  }
}

export async function removeCartItem(cartItemId: string): Promise<void> {
  const res = await authFetch(`/api/cart/${cartItemId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Remove failed (${res.status})`);
  }
}

export async function clearCart(): Promise<void> {
  const res = await authFetch("/api/cart/clear", { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Clear cart failed (${res.status})`);
  }
}
