import { useEffect, useState } from "react";

import { getBackendBaseUrl } from "@/lib/backend";

// Shape returned by /api/products/recommendations (the subset the cart/wishlist
// "You May Also Like" grids render).
export interface RecommendedProduct {
  title: string;
  slug: string;
  categorySlug: string;
  price: number;
  originalPrice: number;
  image: string;
  sku: string;
  badges?: string[];
  /** Ride-along data so QuickAddButton can add without a hydration round-trip.
      Optional: older cached payloads may not carry them. */
  sizes?: string[];
  stock?: number | null;
  isUnlimited?: boolean;
}

export interface RecommendationAnchor {
  slug: string;
  categorySlug: string;
  // Anchor price helps the backend rank without an extra DB lookup; optional.
  price?: number;
}

// Fetches "You May Also Like" products from the shared recommendation engine,
// anchored to a single product (typically the first cart/wishlist item). The
// PDP and Orders page keep their own cached fetches; this is the lightweight
// version for pages that just need a one-shot list.
export function useRecommendations(anchor: RecommendationAnchor | null, limit = 5) {
  const [recommendations, setRecommendations] = useState<RecommendedProduct[]>([]);
  const [loading, setLoading] = useState(false);

  // Depend on primitives so a fresh anchor object each render doesn't re-fetch.
  const slug = anchor?.slug ?? "";
  const categorySlug = anchor?.categorySlug ?? "";
  const price = anchor?.price;

  useEffect(() => {
    if (!slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecommendations([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({ slug, category: categorySlug });
    if (price !== undefined) params.set("price", String(price));
    const url = `${getBackendBaseUrl()}/api/products/recommendations?${params.toString()}`;
    console.log(`[useRecommendations] fetching  anchor=${slug}`);

    fetch(url)
      .then((res) => (res.ok ? res.json() : { recommended: [] }))
      .then((data) => {
        if (cancelled) return;
        const recs: RecommendedProduct[] = (data.recommended ?? []).slice(0, limit);
        console.log(`[useRecommendations] → ${recs.length} recommendation(s)`);
        setRecommendations(recs);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[useRecommendations] fetch failed", err);
        setRecommendations([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [slug, categorySlug, price, limit]);

  return { recommendations, loading };
}
