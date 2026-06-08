import { useEffect, useMemo, useState } from "react";

import { getBackendBaseUrl } from "@/lib/backend";
import type { SidebarProduct } from "@/components/orders/OrdersSidebar";

// Buy Again items come from order snapshots, which don't store badges (orders aren't
// linked to live products). This enriches them with the current product's badges,
// fetched on demand — same endpoint the sidebar quick-view uses for its image gallery.
export function useBuyAgainBadges(items: SidebarProduct[]): SidebarProduct[] {
  const [badgesBySku, setBadgesBySku] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    items.forEach((item) => {
      if (!item.slug || !item.sku) return;
      const key = `${item.slug}-${item.sku}`;
      const url = `${getBackendBaseUrl()}/api/products/detail?slug=${encodeURIComponent(item.slug)}&sku=${encodeURIComponent(item.sku)}&category=${encodeURIComponent(item.categorySlug)}`;
      fetch(url)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const product = data?.product;
          if (!product) return;
          // Custom badges plus the merchandising flags rendered as labels — same
          // composition the cart/wishlist endpoints use for their badge lists.
          const productBadges: string[] = [
            ...(product.badges ?? []),
            ...(product.featured ? ["Featured"] : []),
            ...(product.newArrival ? ["New Arrival"] : []),
            ...(product.trending ? ["Trending"] : []),
            ...(product.bestseller ? ["Bestseller"] : []),
          ];
          if (!cancelled && productBadges.length > 0) {
            setBadgesBySku((prev) => ({ ...prev, [key]: productBadges }));
          }
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [items]);

  return useMemo(
    () => items.map((item) => ({ ...item, badges: badgesBySku[`${item.slug}-${item.sku}`] ?? item.badges })),
    [items, badgesBySku],
  );
}
