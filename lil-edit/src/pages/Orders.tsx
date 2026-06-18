import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Package, ArrowRight, RotateCcw, ArrowUpDown } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { fetchOrders, type OrderStatus, type OrderSummary } from "@/lib/ordersApi";
import { getBackendBaseUrl } from "@/lib/backend";
import QuickViewDrawer, { type QuickViewProduct } from "@/components/product/QuickViewDrawer";
import { BuyAgainSection, YouMayLikeSection, ReviewHistorySection, type SidebarProduct } from "@/components/orders/OrdersSidebar";
import { useBuyAgainBadges } from "@/hooks/useBuyAgainBadges";
import { composeProductBadges } from "@/lib/productBadges";
import { getUserReviews, type Review } from "@/lib/reviewsApi";

// Status → badge colours. Keys match the DB status CHECK constraint.
const STATUS_STYLES: Record<OrderStatus, string> = {
  pending:    "bg-indigo-50 text-indigo-700 border-indigo-200",
  confirmed:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  processing: "bg-emerald-50 text-emerald-700 border-emerald-200",
  shipped:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  delivered:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  cancelled:  "bg-rose-50 text-rose-700 border-rose-200",
};

// Solid accent colours for the card's top strip — keyed to the same statuses.
const STATUS_ACCENT: Record<OrderStatus, string> = {
  pending:    "bg-indigo-400",
  confirmed:  "bg-indigo-400",
  processing: "bg-emerald-400",
  shipped:    "bg-emerald-400",
  delivered:  "bg-indigo-400",
  cancelled:  "bg-rose-400",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]},${d.getFullYear()}`;
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

type SortKey = "newest" | "oldest";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

function sortOrders(orders: OrderSummary[], key: SortKey): OrderSummary[] {
  const copy = [...orders];
  const time = (o: OrderSummary) => new Date(o.createdAt).getTime();
  return key === "oldest"
    ? copy.sort((a, b) => time(a) - time(b))
    : copy.sort((a, b) => time(b) - time(a));
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${STATUS_STYLES[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

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

  // Map product slug → its display title (and image) from order snapshots, so reviewed
  // products read with the same naming as everywhere else instead of a de-slugified guess.
  const productInfoBySlug = useMemo(() => {
    const map = new Map<string, { title: string; image: string }>();
    for (const order of orders) {
      for (const item of order.items) {
        if (!map.has(item.productSlug)) {
          map.set(item.productSlug, { title: item.title, image: item.image });
        }
      }
    }
    return map;
  }, [orders]);

  // Last 5 unreviewed products — always most-recent first, independent of the sort toggle.
  const pendingReviewItems = useMemo(() => {
    const reviewedSlugs = new Set(reviewHistory.map((r) => r.productSlug));
    const seen = new Set<string>();
    const pending: { item: SidebarProduct; orderId: string }[] = [];
    const recentFirst = sortOrders(orders, "newest");
    for (const order of recentFirst) {
      for (const item of order.items) {
        if (reviewedSlugs.has(item.productSlug) || seen.has(item.productSlug)) continue;
        seen.add(item.productSlug);
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
  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReviewHistory([]);
      return;
    }
    let cancelled = false;
    setReviewHistoryLoading(true);
    getUserReviews()
      .then((data) => { if (!cancelled) setReviewHistory(data); })
      .catch((err) => {
        if (!cancelled) {
          console.error("[OrdersPage] review history fetch failed", err);
          setReviewHistory([]);
        }
      })
      .finally(() => { if (!cancelled) setReviewHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

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
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

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
        <div className="page-container px-4 sm:px-6 pt-1 pb-6">
          <div className="flex flex-wrap items-center text-xs sm:text-sm text-gray-600 gap-y-2">
            <Link to="/" className="hover:underline">Home</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <span className="text-gray-800 font-medium">Your Orders</span>
          </div>
        </div>

        <section className="page-container flex-1 w-full max-w-3xl mx-auto px-3 sm:px-6 pb-16">
          <div className="flex flex-col sm:flex-row sm:gap-6 sm:items-start">

            {/* ── Left column: orders list ─────────────────────────────────── */}
            <div className="flex-1 min-w-0">
              {/* Heading */}
              <div className="mb-2">
                <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 flex items-center gap-2">
                  Your Orders
                  <Package className="w-6 h-6 sm:w-7 sm:h-7 text-brand-teal" />
                </h1>
                {/* Order count + sort — sort only meaningful with >1 order */}
                <div className="flex items-center justify-between gap-3 mt-1 w-full">
                  <p className="text-sm text-gray-500">{orders.length} order{orders.length !== 1 ? "s" : ""} placed</p>
                  {user && !loading && !error && orders.length > 1 && (
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                      <SelectTrigger className="relative -top-[12px] h-8 w-auto gap-1.5 rounded-full border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:border-brand-teal/40 focus:ring-brand-teal/20 [&>svg]:h-3.5 [&>svg]:w-3.5">
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
                sortedOrders.map((order) => (
                  <Link key={order.id} to={`/orders/${order.id}`} className="block group w-full">
                    <Card className="relative bg-white border border-gray-400 rounded-2xl overflow-hidden shadow-lg ring-1 ring-black/10 sm:min-h-[210px] hover:shadow-2xl hover:-translate-y-0.5 hover:border-brand-teal/60 transition-all duration-300">
                      {/* Status accent strip */}
                      <div className={`h-1 w-full ${STATUS_ACCENT[order.status]}`} />

                      <div className="p-4 sm:px-5 sm:py-7 space-y-1 sm:space-y-2">
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{order.orderNumber}</p>
                            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight line-clamp-2 mt-0.5">
                              {order.items.length > 0
                                ? order.items.map((i) => i.title).join(", ")
                                : order.orderNumber}
                            </h2>
                            <p className="text-xs text-gray-500 mt-2">Placed on {formatDate(order.createdAt)}</p>
                          </div>
                          <StatusBadge status={order.status} />
                        </div>

                        {/* Media + meta + actions — single row on desktop; on mobile the thumbnails
                            take their own row and the meta + Reorder share the row below. */}
                        <div className="flex flex-wrap items-center gap-y-4 gap-x-3 sm:flex-nowrap sm:gap-0 border-t border-gray-300 pt-2 sm:pt-4">
                          {/* Thumbnail strip — overlapping stack. Full row on mobile; fixed width on desktop
                              (wider than the 4-thumb max) so the meta never sits flush and lines up across cards. */}
                          <div className="flex items-center w-full sm:w-[290px] sm:shrink-0 sm:overflow-hidden">
                            <div className="flex -space-x-3">
                              {order.items.slice(0, 4).map((item) => (
                                <div key={item.id} className="w-14 h-16 sm:w-16 sm:h-20 rounded-xl overflow-hidden bg-gray-100 shrink-0 ring-2 ring-white shadow-sm">
                                  {item.image ? (
                                    <img
                                      src={item.image}
                                      alt={item.title}
                                      loading="lazy"
                                      onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                                      <Package size={20} />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                            {order.items.length > 4 && (
                              <span className="ml-3 text-xs font-medium text-gray-500">+{order.items.length - 4} more</span>
                            )}
                          </div>

                          {/* Item count + total — fills the left of the mobile row; pushes actions right on desktop */}
                          <div className="flex flex-col flex-1 sm:flex-none sm:ml-20 sm:mr-auto">
                            <span className="text-xs text-gray-500">
                              {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
                            </span>
                            <span className="text-base sm:text-lg font-bold text-gray-900 leading-tight">{inr(order.total)}</span>
                          </div>

                          {/* Actions — far right on desktop; right of the meta on mobile */}
                          <div className="flex items-center gap-3 shrink-0">
                            {/* Reorder — placeholder for now; only blocks the card's link nav */}
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-white bg-brand-teal rounded-full px-3 py-1.5 hover:bg-brand-teal/90 transition-colors shadow-sm shrink-0"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Reorder
                            </button>
                            <span className="hidden sm:flex items-center gap-1 text-sm font-semibold text-brand-teal group-hover:gap-2 transition-all shrink-0">
                              View details <ArrowRight className="w-4 h-4" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))
              )}
              </div>
            </div>

            {/* ── Right sidebar: review history ──────────────────────────── */}
            {showSidebar && (
              <aside className="w-full sm:w-[35%] sm:shrink-0 mt-8 sm:mt-7 sm:sticky sm:top-[calc(var(--navbar-height)+24px)]">
                <div className="mt-10 sm:mt-16" style={{ position: "relative", top: "-12px" }}>
                <ReviewHistorySection
                  reviews={reviewHistory.slice(0, 5)}
                  loading={reviewHistoryLoading}
                  pendingItems={pendingReviewItems}
                  productInfoBySlug={productInfoBySlug}
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
