import { getBackendBaseUrl } from "@/lib/backend";

/**
 * Display view for a single SKU, resolved server-side by GET /api/products/by-skus.
 * A superset of what CartItem and WishlistItem each need, so the guest contexts can
 * build either shape from it. Public endpoint — no auth token required.
 */
export interface ResolvedSkuView {
  sku: string;
  title: string;
  slug: string;
  categorySlug: string;
  brand: string;
  price: number;
  originalPrice: number;
  image: string;
  images: string[];
  color: { name: string; hex: string };
  colors: { name: string; hex: string; sku: string }[];
  availability: string;
  stock: number | null;
  isUnlimited: boolean;
  sizes: string[];
  tags: string[];
  badges: string[];
}

/**
 * Resolve display data for a set of SKUs in one batched request. Returns a Map keyed by
 * the requested sku; SKUs that no longer resolve (deleted product / removed variant) are
 * simply absent, so callers drop those guest lines (heal-not-delete). Never throws — a
 * network/CORS failure returns an empty map so a guest cart just renders nothing rather
 * than erroring.
 */
export async function hydrateSkus(skus: string[]): Promise<Map<string, ResolvedSkuView>> {
  const unique = [...new Set(skus.filter(Boolean))];
  if (unique.length === 0) return new Map();
  try {
    const url = `${getBackendBaseUrl()}/api/products/by-skus?skus=${encodeURIComponent(unique.join(","))}`;
    console.log(`[productHydration] GET ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[productHydration] by-skus failed (${res.status})`);
      return new Map();
    }
    const data = (await res.json()) as { items?: ResolvedSkuView[] };
    const map = new Map<string, ResolvedSkuView>();
    for (const item of data.items ?? []) map.set(item.sku, item);
    console.log(`[productHydration] resolved ${map.size}/${unique.length} skus`);
    return map;
  } catch (err) {
    console.error("[productHydration] by-skus error", err);
    return new Map();
  }
}
