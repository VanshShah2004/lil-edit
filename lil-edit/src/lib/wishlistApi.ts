import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

export interface WishlistItem {
  id: string;
  sku: string;
  productSlug: string;
  title: string;
  slug: string;
  categorySlug: string;
  brand: string;
  price: number;
  originalPrice: number;
  image: string;
  color: { name: string; hex: string };
  inStock: boolean;
  tags: string[];
  badges: string[];
  createdAt: string;
}

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  console.log("[wishlistApi] token:", !!session?.access_token ? "present" : "missing");
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[wishlistApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[wishlistApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

export async function fetchWishlist(): Promise<WishlistItem[]> {
  const res = await authFetch("/api/wishlist");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[wishlistApi] fetchWishlist error:", body);
    throw new Error((body as any).error ?? `Wishlist fetch failed (${res.status})`);
  }
  const data = await res.json();
  console.log("[wishlistApi] fetchWishlist →", (data.items ?? []).length, "items");
  return (data.items ?? []) as WishlistItem[];
}

export async function addToWishlist(product_slug: string, sku: string): Promise<void> {
  console.log("[wishlistApi] addToWishlist payload:", { product_slug, sku });
  const res = await authFetch("/api/wishlist/add", {
    method: "POST",
    body: JSON.stringify({ product_slug, sku }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // 409 means already in wishlist — not an error worth throwing
    if (res.status === 409) {
      console.log("[wishlistApi] addToWishlist: already in wishlist");
      return;
    }
    console.error("[wishlistApi] addToWishlist error:", body);
    throw new Error((body as any).error ?? `Add to wishlist failed (${res.status})`);
  }
  console.log("[wishlistApi] addToWishlist success");
}

export async function removeWishlistItem(wishlistItemId: string): Promise<void> {
  console.log("[wishlistApi] removeWishlistItem id:", wishlistItemId);
  const res = await authFetch(`/api/wishlist/${wishlistItemId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[wishlistApi] removeWishlistItem error:", body);
    throw new Error((body as any).error ?? `Remove from wishlist failed (${res.status})`);
  }
  console.log("[wishlistApi] removeWishlistItem success");
}

export async function clearWishlist(): Promise<void> {
  console.log("[wishlistApi] clearWishlist");
  const res = await authFetch("/api/wishlist/clear", { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[wishlistApi] clearWishlist error:", body);
    throw new Error((body as any).error ?? `Clear wishlist failed (${res.status})`);
  }
  console.log("[wishlistApi] clearWishlist success");
}

export async function moveToCart(wishlistItemId: string): Promise<void> {
  console.log("[wishlistApi] moveToCart id:", wishlistItemId);
  const res = await authFetch(`/api/wishlist/move-to-cart/${wishlistItemId}`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[wishlistApi] moveToCart error:", body);
    throw new Error((body as any).error ?? `Move to cart failed (${res.status})`);
  }
  console.log("[wishlistApi] moveToCart success");
}

export async function moveAllToCart(): Promise<{ moved: number; skipped: number }> {
  console.log("[wishlistApi] moveAllToCart");
  const res = await authFetch("/api/wishlist/move-all-to-cart", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[wishlistApi] moveAllToCart error:", body);
    throw new Error((body as any).error ?? `Move all to cart failed (${res.status})`);
  }
  const data = await res.json();
  console.log("[wishlistApi] moveAllToCart →", data.moved, "moved,", data.skipped, "skipped");
  return { moved: data.moved ?? 0, skipped: data.skipped ?? 0 };
}
