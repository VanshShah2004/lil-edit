/**
 * Build PDP route path. SKU is separated from slug with `$` (see ProductDetail route).
 */
export function buildPdpPath(
  categorySlug: string,
  productSlug: string,
  sku: string
): string {
  return `/collections/${categorySlug}/product/${productSlug}$${sku}`;
}

/** Prefer variant SKU for links; falls back to base product SKU. */
export function resolvePdpSku(
  baseSku: string,
  colors?: Array<{ sku: string }>
): string {
  return colors?.[0]?.sku ?? baseSku;
}

/**
 * Absolute PDP URL, for sharing. Same path as buildPdpPath — the static host
 * rewrites it to the backend, which returns this same page with per-product Open
 * Graph tags injected, so the link both unfurls into a product card and IS the
 * canonical product URL. See render.yaml and backend/routes/pdpShell.ts.
 */
export function buildPdpUrl(
  categorySlug: string,
  productSlug: string,
  sku: string
): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${buildPdpPath(categorySlug, productSlug, sku)}`;
}
