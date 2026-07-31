import { getBackendBaseUrl } from "@/lib/backend";

/**
 * Display view for a single SKU, resolved server-side by GET /api/products/by-skus.
 * A superset of what CartItem and WishlistItem each need, so the guest contexts can
 * build either shape from it. Public endpoint — no auth token required.
 */
export interface ResolvedSkuView {
  sku: string;
  /** The product's base_sku — lets callers match a variant row against a placard's base sku. */
  baseSku: string;
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
/**
 * Resolve a possibly-base SKU to the concrete colour-variant SKU a placard displays.
 * Placards carry the product's base_sku, which isn't purchasable on its own — an empty
 * resolved colour name is the signal we got one, so we re-resolve to the primary colour
 * variant (colors[0], the same variant whose image the placard shows). Falls back to the
 * input sku when hydration fails — never blocks the caller's action.
 */
export async function resolveVariantSku(
  sku: string
): Promise<{ sku: string; view?: ResolvedSkuView }> {
  let view = (await hydrateSkus([sku])).get(sku);
  // Requested sku IS the base_sku and the product has colour variants → re-resolve
  // to the primary variant so the caller acts on a real, purchasable variant.
  if (view && view.baseSku === sku && view.colors.length > 0 && view.colors[0].sku !== sku) {
    const primarySku = view.colors[0].sku;
    console.log(`[productHydration] resolveVariantSku  base=${sku} → primary=${primarySku}`);
    view = (await hydrateSkus([primarySku])).get(primarySku) ?? view;
  }
  return { sku: view?.sku ?? sku, view };
}

// Short-lived per-sku cache: repeat interactions (hover → click, heart after quick
// add, guest re-adds) skip the by-skus round-trip entirely. 30s keeps stock views
// reasonably fresh — the backend re-clamps authoritatively on every write anyway.
const VIEW_TTL_MS = 30_000;
const viewCache = new Map<string, { view: ResolvedSkuView; at: number }>();

export async function hydrateSkus(skus: string[]): Promise<Map<string, ResolvedSkuView>> {
  const unique = [...new Set(skus.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const now = Date.now();
  const map = new Map<string, ResolvedSkuView>();
  const misses: string[] = [];
  for (const sku of unique) {
    const cached = viewCache.get(sku);
    if (cached && now - cached.at < VIEW_TTL_MS) map.set(sku, cached.view);
    else misses.push(sku);
  }
  if (misses.length === 0) {
    console.log(`[productHydration] cache HIT all ${unique.length} sku(s)`);
    return map;
  }
  if (map.size > 0) console.log(`[productHydration] cache HIT ${map.size}/${unique.length}, fetching ${misses.length}`);

  try {
    const url = `${getBackendBaseUrl()}/api/products/by-skus?skus=${encodeURIComponent(misses.join(","))}`;
    console.log(`[productHydration] GET ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[productHydration] by-skus failed (${res.status})`);
      return map;
    }
    const data = (await res.json()) as { items?: ResolvedSkuView[] };
    for (const item of data.items ?? []) {
      map.set(item.sku, item);
      viewCache.set(item.sku, { view: item, at: now });
    }
    console.log(`[productHydration] resolved ${map.size}/${unique.length} skus`);
    return map;
  } catch (err) {
    console.error("[productHydration] by-skus error", err);
    return map;
  }
}
