// Order/cart/wishlist snapshots don't store badges, so when we enrich a quick-view
// (or Buy Again card) from the live product, we compose the badge list the same way
// the cart/wishlist endpoints do: custom badges first, then the merchandising flags
// rendered as labels.
export interface BadgeSource {
  badges?: string[];
  featured?: boolean;
  newArrival?: boolean;
  trending?: boolean;
  bestseller?: boolean;
}

export function composeProductBadges(product: BadgeSource): string[] {
  return [
    ...(product.badges ?? []),
    ...(product.newArrival ? ["New Arrival"] : []),
    ...(product.trending ? ["Trending"] : []),
    ...(product.bestseller ? ["Bestseller"] : []),
    ...(product.featured ? ["Featured"] : []),
  ];
}
