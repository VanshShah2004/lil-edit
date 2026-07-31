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
