import type { Insight } from "./InsightCard";
import type { ProductDetailPayload } from "@/lib/analyticsApi";
import { num, pct, prettySlug } from "./format";

// ─── Rule-based product intelligence (no LLM) ─────────────────────────────────
// Deterministic threshold rules over the product's own metrics — fast, free, and
// fully explainable. Mirrors the spec's "Product Intelligence" examples, minus
// the returns/quality rule (this store has no returns flow).
//
// Each rule states the SIGNAL it detected and the recommended ACTION, so the
// insight reads like advice, not a restatement of the numbers.

const n = (v: number | null | undefined): number => (v == null || Number.isNaN(v) ? 0 : v);

export function productInsights(p: ProductDetailPayload): Insight[] {
  const out: Insight[] = [];

  const views = n(p.views?.total_views);
  const cartAdds = n(p.cart?.adds);
  const wishAdds = n(p.wishlist?.adds);
  const orders = n(p.overview?.orders);
  const units = n(p.overview?.units);
  const stock = p.product?.is_unlimited ? Infinity : n(p.product?.stock);
  const rating = n(p.reviews?.avg_rating_all_time);
  const reviewCount = n(p.reviews?.all_time);
  const viewToCart = n(p.cart?.view_to_cart_pct);
  const cartToPurchase = n(p.cart?.cart_to_purchase_pct);
  const wishToPurchase = n(p.wishlist?.to_purchase_pct);

  // Views are the gate for most view-relative rules; guard so we don't fire on noise.
  const hasViewData = views >= 30;
  const hasCartData = cartAdds >= 5;

  // 1. High views + low cart → pricing / merchandising issue
  if (hasViewData && viewToCart > 0 && viewToCart < 3) {
    out.push({
      id: "views-low-cart",
      tone: "warning",
      title: "Lots of views, few carts",
      body: `${num(views)} views but only ${pct(viewToCart)} add to cart. The price, imagery, or size availability on the page may be turning shoppers away.`,
    });
  }

  // 2. High wishlist + low orders → hesitation (often price/timing)
  if (wishAdds >= 8 && wishToPurchase > 0 && wishToPurchase < 15) {
    out.push({
      id: "wishlist-hesitation",
      tone: "warning",
      title: "Wishlisted but not bought",
      body: `${num(wishAdds)} wishlist adds convert to purchase only ${pct(wishToPurchase)} of the time. Shoppers want it but hesitate — a targeted offer or restock nudge could unlock these.`,
    });
  }

  // 3. High cart + low purchase → checkout friction
  if (hasCartData && cartToPurchase > 0 && cartToPurchase < 25) {
    out.push({
      id: "cart-friction",
      tone: "critical",
      title: "Carts aren’t converting",
      body: `Only ${pct(cartToPurchase)} of carts for this product complete checkout. Shipping cost, payment friction, or a missing size at checkout are the usual culprits.`,
    });
  }

  // 4. High rating + low views → promote it
  if (rating >= 4.3 && reviewCount >= 3 && views < 50) {
    out.push({
      id: "hidden-gem",
      tone: "good",
      title: "Loved but under-seen",
      body: `A ${rating.toFixed(1)}★ average across ${num(reviewCount)} reviews, yet only ${num(views)} views. Featuring it in The Spotlight or a collection could turn goodwill into sales.`,
    });
  }

  // 5. Low stock + high sales → restock
  if (stock !== Infinity && stock <= 5 && units >= 5) {
    out.push({
      id: "restock",
      tone: "critical",
      title: "Selling fast, running low",
      body: `${num(units)} units sold this period with just ${num(stock)} left in stock. Restock soon to avoid losing demand you already have.`,
    });
  }

  // 6. Trending — strong conversion with real volume
  if (orders >= 8 && hasViewData && viewToCart >= 8) {
    out.push({
      id: "trending",
      tone: "good",
      title: "This product is trending",
      body: `${num(orders)} orders with a healthy ${pct(viewToCart)} view-to-cart rate. Keep it stocked and consider it for homepage placement.`,
    });
  }

  // 7. Out of stock but still wanted
  if (stock === 0 && (views >= 20 || wishAdds >= 3)) {
    out.push({
      id: "oos-demand",
      tone: "warning",
      title: "Out of stock, still in demand",
      body: `Out of stock but still drawing ${num(views)} views and ${num(wishAdds)} wishlist adds. Every day unstocked is lost revenue.`,
    });
  }

  // 8. No demand signal at all — candidate to retire or reposition
  if (hasViewData && orders === 0 && cartAdds === 0 && wishAdds === 0) {
    out.push({
      id: "no-traction",
      tone: "info",
      title: "Views but no engagement",
      body: `${num(views)} views yet no carts, wishlists, or orders. The listing may be mismatched to what these visitors expected — revisit title, category, or price.`,
    });
  }

  return out;
}

// ─── Executive-level signals (dashboard) ──────────────────────────────────────
export function executiveInsights(
  kpis: Record<string, number | null>,
  prev: Record<string, number | null>,
  topProduct?: { slug: string; title: string; revenue?: number }
): Insight[] {
  const out: Insight[] = [];
  const cur = (k: string) => n(kpis[k]);
  const was = (k: string) => n(prev[k]);
  const change = (k: string): number => {
    const p = was(k);
    return p === 0 ? 0 : ((cur(k) - p) / Math.abs(p)) * 100;
  };

  const revChange = change("net_revenue");
  if (Math.abs(revChange) >= 10 && was("net_revenue") > 0) {
    out.push({
      id: "revenue-move",
      tone: revChange > 0 ? "good" : "critical",
      title: revChange > 0 ? "Revenue is climbing" : "Revenue is slipping",
      body: `Net revenue is ${revChange > 0 ? "up" : "down"} ${pct(Math.abs(revChange))} versus the previous period. ${
        revChange > 0 ? "Whatever changed is working — double down." : "Worth digging into which category or channel softened."
      }`,
    });
  }

  const cancelRate = cur("cancellation_rate");
  if (cancelRate >= 10) {
    out.push({
      id: "cancellations",
      tone: cancelRate >= 20 ? "critical" : "warning",
      title: "Cancellations are elevated",
      body: `${pct(cancelRate)} of orders were cancelled this period. Check stock accuracy and delivery timelines — the usual drivers.`,
    });
  }

  const conv = cur("conversion_rate");
  if (conv > 0 && conv < 1.5 && cur("product_views") >= 100) {
    out.push({
      id: "low-conversion",
      tone: "warning",
      title: "Conversion has room to grow",
      body: `Store conversion is ${pct(conv)} on ${num(cur("product_views"))} views. A/B testing the PDP and checkout could lift this meaningfully.`,
    });
  }

  const repeat = cur("repeat_purchase_rate");
  if (repeat >= 25) {
    out.push({
      id: "loyal",
      tone: "good",
      title: "Customers are coming back",
      body: `${pct(repeat)} of buyers this period have ordered before — a strong loyalty signal for a kids’ brand where repeat need is high.`,
    });
  }

  if (topProduct && n(topProduct.revenue) > 0) {
    out.push({
      id: "top-product",
      tone: "info",
      title: "Top performer",
      body: `“${topProduct.title || prettySlug(topProduct.slug)}” led revenue this period. Keep it stocked and featured.`,
      action: { to: `/admin/settings-panel/analytics/product/${encodeURIComponent(topProduct.slug)}`, label: "View product analytics" },
    });
  }

  return out;
}
