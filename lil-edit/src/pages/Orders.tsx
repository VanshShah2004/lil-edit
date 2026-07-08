import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Package, ArrowRight, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Navbar from "@/components/layout/Navbar";
import RouteFallback from "@/components/RouteFallback";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { fetchOrders, type OrderSummary } from "@/lib/ordersApi";
import { getBackendBaseUrl } from "@/lib/backend";
import QuickViewDrawer, { type QuickViewProduct } from "@/components/product/QuickViewDrawer";
import { BuyAgainSection, YouMayLikeSection, ReviewHistorySection, type SidebarProduct } from "@/components/orders/OrdersSidebar";
import OrderCard from "@/components/orders/OrderCard";
import { useBuyAgainBadges } from "@/hooks/useBuyAgainBadges";
import { composeProductBadges } from "@/lib/productBadges";
import { getUserReviews, type Review } from "@/lib/reviewsApi";
import { type SortKey, SORT_OPTIONS, sortOrders } from "@/lib/ordersDisplay";

function OrdersSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((n) => (
        <div key={n} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm animate-pulse">
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex justify-between">
              <div className="h-5 bg-gray-200 rounded w-40" />
              <div className="h-6 bg-gray-200 rounded-full w-24" />
            </div>
            <div className="flex gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-16 h-16 bg-gray-200 rounded-lg" />
              ))}
            </div>
            <div className="h-9 bg-gray-200 rounded w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const OrdersPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { reorder } = useCart();
  const navigate = useNavigate();
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [recommendations, setRecommendations] = useState<SidebarProduct[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<QuickViewProduct | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const [reviewHistory, setReviewHistory] = useState<Review[]>([]);
  const [reviewHistoryLoading, setReviewHistoryLoading] = useState(false);

  const userId = user?.id ?? null;
  const sortedOrders = useMemo(() => sortOrders(orders, sortBy), [orders, sortBy]);
  const visibleOrders = useMemo(() => sortedOrders.slice(0, 5), [sortedOrders]);

  // Deduplicated items from order history — most-recent variant per product slug.
  const buyAgainItems = useMemo<SidebarProduct[]>(() => {
    const seen = new Set<string>();
    const items: SidebarProduct[] = [];
    for (const order of sortedOrders) {
      for (const item of order.items) {
        if (!seen.has(item.productSlug)) {
          seen.add(item.productSlug);
          items.push({
            title: item.title,
            slug: item.productSlug,
            categorySlug: item.categorySlug,
            price: item.unitPrice,
            originalPrice: item.originalPrice,
            image: item.image,
            sku: item.sku,
            productId: item.productId,
          });
        }
        if (items.length >= 5) break;
      }
      if (items.length >= 5) break;
    }
    return items;
  }, [sortedOrders]);
  const buyAgainItemsWithBadges = useBuyAgainBadges(buyAgainItems);

  // Map sku → its display title (and image) from order snapshots, so reviewed
  // variants read with the same naming/image as ordered instead of a de-slugified guess.
  // Reviews are per-variant; sku alone is globally unique and self-identifying, so it's
  // the key (no need to pair with slug). Also keys by slug alone as a fallback for
  // legacy reviews written before the per-variant migration (sku=''), which would
  // otherwise never match a real order-item sku.
  const productInfoByVariant = useMemo(() => {
    const map = new Map<string, { title: string; image: string }>();
    for (const order of orders) {
      for (const item of order.items) {
        if (!map.has(item.sku)) {
          map.set(item.sku, { title: item.title, image: item.image });
        }
        if (!map.has(item.productSlug)) {
          map.set(item.productSlug, { title: item.title, image: item.image });
        }
      }
    }
    return map;
  }, [orders]);

  // Last 5 unreviewed variants — always most-recent first, independent of the sort toggle.
  // Keyed per sku (globally unique) so each ordered colour variant is tracked separately.
  const pendingReviewItems = useMemo(() => {
    const reviewedKeys = new Set(reviewHistory.map((r) => r.sku));
    const seen = new Set<string>();
    const pending: { item: SidebarProduct; orderId: string }[] = [];
    const recentFirst = sortOrders(orders, "newest");
    for (const order of recentFirst) {
      for (const item of order.items) {
        const key = item.sku;
        if (reviewedKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        pending.push({
          orderId: order.id,
          item: {
            title: item.title,
            slug: item.productSlug,
            categorySlug: item.categorySlug,
            price: item.unitPrice,
            originalPrice: item.originalPrice,
            image: item.image,
            sku: item.sku,
            productId: item.productId,
          },
        });
        if (pending.length >= 5) return pending;
      }
    }
    return pending;
  }, [orders, reviewHistory]);

  // Orders fetch.
  useEffect(() => {
    if (!userId) {
      // Reset to the logged-out state — syncing to external auth state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrders([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    console.log(`[OrdersPage] fetching orders  user=${userId}`);
    setLoading(true);
    setError(null);
    fetchOrders()
      .then((data) => { if (!cancelled) setOrders(data); })
      .catch((err) => {
        if (!cancelled) {
          console.error("[OrdersPage] fetch failed", err);
          setError(err instanceof Error ? err.message : "Could not load orders");
          setOrders([]);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  // Review history fetch.
  const loadReviewHistory = useCallback(() => {
    if (!userId) {
      setReviewHistory([]);
      return;
    }
    setReviewHistoryLoading(true);
    getUserReviews()
      .then((data) => setReviewHistory(data))
      .catch((err) => {
        console.error("[OrdersPage] review history fetch failed", err);
        setReviewHistory([]);
      })
      .finally(() => setReviewHistoryLoading(false));
  }, [userId]);

  useEffect(() => { loadReviewHistory(); }, [loadReviewHistory]);

  // Recommendations fetch — anchored to the most recently ordered item.
  useEffect(() => {
    const anchor = sortedOrders[0]?.items[0];
    if (!anchor?.productSlug) { setRecommendations([]); return; }

    let cancelled = false;
    setRecsLoading(true);
    const url = `${getBackendBaseUrl()}/api/products/recommendations?slug=${encodeURIComponent(anchor.productSlug)}&category=${encodeURIComponent(anchor.categorySlug)}`;
    console.log(`[OrdersPage] fetching recommendations  anchor=${anchor.productSlug}`);

    fetch(url)
      .then((res) => (res.ok ? res.json() : { recommended: [] }))
      .then((data) => {
        if (!cancelled) {
          const recs: SidebarProduct[] = (data.recommended ?? []).slice(0, 5).map(
            (r: { title: string; slug: string; categorySlug: string; price: number; originalPrice: number; image: string; sku: string; badges?: string[] }) => ({
              title: r.title,
              slug: r.slug,
              categorySlug: r.categorySlug,
              price: r.price,
              originalPrice: r.originalPrice,
              image: r.image,
              sku: r.sku,
              badges: r.badges ?? [],
            }),
          );
          setRecommendations(recs);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[OrdersPage] recommendations fetch failed", err);
          setRecommendations([]);
        }
      })
      .finally(() => { if (!cancelled) setRecsLoading(false); });

    return () => { cancelled = true; };
  }, [sortedOrders]);

  if (authLoading) {
    return <RouteFallback />;
  }

  // Re-add every line of an order to the bag, then send the shopper to the cart.
  // preventDefault/stopPropagation keep the click off the card's wrapping <Link>.
  // Single-flight: while one card is reordering, other Reorder clicks no-op (but
  // still don't fall through to the card's navigation).
  const handleReorder = async (e: React.MouseEvent, order: OrderSummary) => {
    e.preventDefault();
    e.stopPropagation();
    if (reorderingId) return;
    setReorderingId(order.id);
    console.log(`[OrdersPage] reorder  order=${order.orderNumber}  items=${order.items.length}`);
    try {
      const { added, failed } = await reorder(
        order.items.map((it) => ({
          product_slug: it.productSlug,
          sku: it.sku,
          size: it.size,
          quantity: it.quantity,
        })),
      );
      if (added === 0) {
        toast.error("None of these items are available anymore.");
        return;
      }
      toast.success(
        failed > 0
          ? `Added ${added} item${added !== 1 ? "s" : ""} to your cart — ${failed} no longer available.`
          : "Added to your cart!",
      );
      navigate("/cart");
    } finally {
      setReorderingId(null);
    }
  };

  const openSidebarQuickView = (item: SidebarProduct) => {
    setSelectedProduct({
      source: "order",
      id: item.slug,
      productId: item.productId,
      sku: item.sku,
      slug: item.slug,
      categorySlug: item.categorySlug,
      title: item.title,
      price: item.price,
      originalPrice: item.originalPrice,
      image: item.image,
      images: item.image ? [item.image] : [],
      color: { name: "", hex: "" },
      badges: [],
      tags: [],
    });
    setQuickViewOpen(true);

    if (!item.slug || !item.sku) return;
    const url = `${getBackendBaseUrl()}/api/products/detail?slug=${encodeURIComponent(item.slug)}&sku=${encodeURIComponent(item.sku)}&category=${encodeURIComponent(item.categorySlug)}`;
    console.log(`[OrdersPage] sidebar quick-view fetch  ${url}`);
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const product = data?.product;
        if (!product) return;
        const matchColor = (product.colors ?? []).find((c: { sku: string }) => c.sku === item.sku);
        const urls: string[] = [
          ...((matchColor?.images ?? []) as { url: string }[]).map((im) => im.url),
          item.image,
          ...((product.images ?? []) as { url: string }[]).map((im) => im.url),
        ].filter(Boolean);
        const images = Array.from(new Set(urls));
        console.log(`[OrdersPage] sidebar quick-view → ${images.length} image(s)`);
        setSelectedProduct((prev) =>
          prev && prev.slug === item.slug
            ? { ...prev, images, badges: composeProductBadges(product), descriptionPoints: product.descriptionPoints ?? [] }
            : prev,
        );
      })
      .catch((err) => console.error("[OrdersPage] sidebar quick-view fetch failed", err));
  };

  const showSidebar = !!user && !loading && !error && orders.length > 0;

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col text-gray-900 overflow-x-hidden">
      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1 flex flex-col w-full pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)]">
        {/* Breadcrumb */}
        <div className="page-container px-4 sm:px-6 pt-3 pb-2 mt-1.5">
          <div className="flex flex-wrap items-center text-base text-gray-500 gap-1 mb-3">
            <Link to="/" className="hover:underline">Home</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-800 font-medium">Orders</span>
          </div>
        </div>

        <section className="page-container flex-1 w-full max-w-3xl mx-auto px-3 sm:px-6 pb-16">
          {/* Heading */}
          <div className="mb-2 flex flex-col sm:flex-row sm:gap-6 sm:items-end">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 flex items-center gap-2">
                Your Orders
                <Package className="w-6 h-6 sm:w-7 sm:h-7 text-brand-teal" />
              </h1>
              <div className="flex items-center justify-between gap-3 mt-1 w-full">
                <p className="text-sm text-gray-500">{orders.length} order{orders.length !== 1 ? "s" : ""} placed</p>
                {user && !loading && !error && orders.length > 1 && (
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                    <SelectTrigger className="h-8 w-auto gap-1.5 rounded-md border-gray-400 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:border-brand-teal/40 focus:ring-brand-teal/20 [&>svg]:h-3.5 [&>svg]:w-3.5">
                      <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {SORT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="hidden sm:block sm:w-[35%] sm:shrink-0" aria-hidden="true" />
          </div>

          <hr className="relative left-1/2 w-screen -translate-x-1/2 border-t border-foreground/50 mt-6 mb-8" />

          <div className="flex flex-col sm:flex-row sm:gap-6 sm:items-start">

            {/* ── Left column: orders list ─────────────────────────────────── */}
            <div className="flex-1 min-w-0">
              <div className="space-y-5">
              {loading ? (
                <OrdersSkeleton />
              ) : !user ? (
                <div className="w-full py-16 sm:py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
                  <Package size={48} className="text-brand-teal mb-4 opacity-40" />
                  <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">Track your orders</p>
                  <p className="text-sm text-gray-500 mb-6">Log in to view your order history.</p>
                  <Link to="/login" className="text-sm font-medium text-brand-teal underline underline-offset-2">Log in</Link>
                </div>
              ) : error ? (
                <div className="w-full py-16 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
                  <p className="text-lg font-semibold text-gray-800 mb-2">Couldn't load your orders</p>
                  <p className="text-sm text-gray-500">{error}</p>
                </div>
              ) : orders.length === 0 ? (
                <div className="w-full py-16 sm:py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
                  <Package size={48} className="text-brand-teal mb-4 opacity-40" />
                  <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">No orders yet</p>
                  <p className="text-sm text-gray-500 mb-6">When you place an order, it'll show up here.</p>
                  <Link to="/dashboard" className="text-sm font-medium text-brand-teal underline underline-offset-2">Start shopping</Link>
                </div>
              ) : (
                visibleOrders.map((order) => (
                  <OrderCard key={order.id} order={order} reorderingId={reorderingId} onReorder={handleReorder} />
                ))
              )}
              </div>

              {!loading && !error && sortedOrders.length > 5 && (
                <div className="flex justify-center mt-6">
                  <Link
                    to="/orders/all"
                    className="flex items-center gap-1.5 text-base font-semibold text-white bg-brand-teal border-[1.5px] border-brand-teal rounded-lg px-6 py-3 hover:bg-brand-teal/90 transition-colors"
                  >
                    View All <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </div>

            {/* ── Right sidebar: review history ──────────────────────────── */}
            {showSidebar && (
              <aside className="w-full sm:w-[35%] sm:shrink-0 mt-14 pt-14 border-t border-gray-400 sm:mt-0 sm:pt-0 sm:border-t-0 sm:sticky sm:top-[calc(var(--navbar-height)+24px)]">
                <div>
                <ReviewHistorySection
                  reviews={reviewHistory.slice(0, 5)}
                  loading={reviewHistoryLoading}
                  pendingItems={pendingReviewItems}
                  productInfoByVariant={productInfoByVariant}
                  onReviewSaved={loadReviewHistory}
                  viewAllHref="/reviews"
                />
                </div>
              </aside>
            )}
          </div>
        </section>

        {/* ── Buy Again + You May Like — full-width lavender band ─────── */}
        {showSidebar && (
          <div className="w-full bg-[#E8DDF7] mt-2">
            <section className="container py-10 space-y-7">
              <BuyAgainSection items={buyAgainItemsWithBadges} onItemClick={openSidebarQuickView} />
              <YouMayLikeSection items={recommendations} loading={recsLoading} onItemClick={openSidebarQuickView} />
            </section>
          </div>
        )}
      </main>

      <Footer />

      <QuickViewDrawer
        open={quickViewOpen}
        product={selectedProduct}
        onClose={() => setQuickViewOpen(false)}
      />
    </div>
  );
};

export default OrdersPage;
