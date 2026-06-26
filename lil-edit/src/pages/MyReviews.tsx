import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MessageSquare, Star, Clock, CheckCircle2 } from "lucide-react";

import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { fetchOrders, type OrderSummary } from "@/lib/ordersApi";
import { getUserReviews, type Review } from "@/lib/reviewsApi";
import { ReviewHistorySection, type SidebarProduct } from "@/components/orders/OrdersSidebar";

// Most-recent-first ordering, mirroring the Orders page so pending items surface
// the latest unreviewed purchases first.
function sortByNewest(orders: OrderSummary[]): OrderSummary[] {
  return [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

type Filter = "all" | "pending" | "reviewed";

function StatCard({ icon, value, label, accent }: { icon: React.ReactNode; value: number | string; label: string; accent: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <span className={`flex items-center justify-center w-10 h-10 rounded-full ${accent} shrink-0`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

const MyReviewsPage = () => {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const userId = user?.id ?? null;

  // Orders fetch — needed for pending items and to give reviewed variants their
  // ordered title/image (instead of a de-slugified guess).
  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrders([]);
      return;
    }
    let cancelled = false;
    console.log(`[MyReviewsPage] fetching orders  user=${userId}`);
    setOrdersLoading(true);
    fetchOrders()
      .then((data) => { if (!cancelled) setOrders(data); })
      .catch((err) => {
        if (!cancelled) {
          console.error("[MyReviewsPage] orders fetch failed", err);
          setOrders([]);
        }
      })
      .finally(() => { if (!cancelled) setOrdersLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  // Review history fetch.
  const loadReviews = useCallback(() => {
    if (!userId) {
      setReviews([]);
      return;
    }
    setReviewsLoading(true);
    getUserReviews()
      .then((data) => setReviews(data))
      .catch((err) => {
        console.error("[MyReviewsPage] reviews fetch failed", err);
        setReviews([]);
      })
      .finally(() => setReviewsLoading(false));
  }, [userId]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  // (slug + sku) → ordered title/image, with a slug-only fallback for legacy
  // reviews (sku='') written before the per-variant migration.
  const productInfoByVariant = useMemo(() => {
    const map = new Map<string, { title: string; image: string }>();
    for (const order of orders) {
      for (const item of order.items) {
        const variantKey = `${item.productSlug}|${item.sku}`;
        if (!map.has(variantKey)) map.set(variantKey, { title: item.title, image: item.image });
        if (!map.has(item.productSlug)) map.set(item.productSlug, { title: item.title, image: item.image });
      }
    }
    return map;
  }, [orders]);

  // Every unreviewed variant (most-recent first) — uncapped, unlike the Orders sidebar.
  const pendingItems = useMemo(() => {
    const reviewedKeys = new Set(reviews.map((r) => `${r.productSlug}|${r.sku}`));
    const seen = new Set<string>();
    const pending: { item: SidebarProduct; orderId: string }[] = [];
    for (const order of sortByNewest(orders)) {
      for (const item of order.items) {
        const key = `${item.productSlug}|${item.sku}`;
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
      }
    }
    return pending;
  }, [orders, reviews]);

  const avgRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return Math.round((sum / reviews.length) * 10) / 10;
  }, [reviews]);

  const loading = ordersLoading || reviewsLoading;

  // Filtered slices handed to the shared section.
  const shownReviews = filter === "pending" ? [] : reviews;
  const shownPending = filter === "reviewed" ? [] : pendingItems;
  const nothingToShow = !loading && shownReviews.length === 0 && shownPending.length === 0;

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const TABS: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: reviews.length + pendingItems.length },
    { value: "pending", label: "Pending", count: pendingItems.length },
    { value: "reviewed", label: "Reviewed", count: reviews.length },
  ];

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col text-gray-900 overflow-x-hidden">
      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1 flex flex-col w-full pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)]">
        {/* Breadcrumb */}
        <div className="page-container px-4 sm:px-6 pt-1 pb-6">
          <div className="flex flex-wrap items-center text-xs sm:text-sm text-gray-600 gap-y-2">
            <Link to="/" className="hover:underline">Home</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <span className="text-gray-800 font-medium">Reviews</span>
          </div>
        </div>

        <section className="page-container flex-1 w-full max-w-3xl mx-auto px-3 sm:px-6 pb-16">
          {/* Heading */}
          <div className="mb-5">
            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 flex items-center gap-2">
              Your Reviews
              <MessageSquare className="w-6 h-6 sm:w-7 sm:h-7 text-brand-teal" />
            </h1>
            <p className="text-sm text-gray-500 mt-1">Spill the tea, rate the fit, explore the cuteness ✨</p>
          </div>

          {!user ? (
            <div className="w-full py-16 sm:py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
              <MessageSquare size={48} className="text-brand-teal mb-4 opacity-40" />
              <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">See your reviews</p>
              <p className="text-sm text-gray-500 mb-6">Log in to view and write product reviews.</p>
              <Link to="/login" className="text-sm font-medium text-brand-teal underline underline-offset-2">Log in</Link>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                <StatCard
                  icon={<CheckCircle2 className="w-5 h-5 text-white" />}
                  value={reviews.length}
                  label="Reviews written"
                  accent="bg-emerald-500"
                />
                <StatCard
                  icon={<Clock className="w-5 h-5 text-white" />}
                  value={pendingItems.length}
                  label="Pending reviews"
                  accent="bg-brand-teal"
                />
                <StatCard
                  icon={<Star className="w-5 h-5 text-white fill-white" />}
                  value={avgRating || "—"}
                  label="Avg. rating given"
                  accent="bg-amber-400"
                />
              </div>

              {/* Full-bleed separator between stats and the filter tabs */}
              <hr className="-mx-3 sm:-mx-6 mb-6 border-t border-foreground/50" />

              {/* Filter tabs */}
              <div className="flex flex-wrap gap-2 mb-5">
                {TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setFilter(tab.value)}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                      filter === tab.value
                        ? "bg-brand-teal text-white border-brand-teal shadow-sm"
                        : "bg-white text-gray-700 border-gray-200 hover:border-brand-teal/40"
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                        filter === tab.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* List */}
              {nothingToShow ? (
                <div className="w-full py-16 sm:py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
                  <MessageSquare size={48} className="text-brand-teal mb-4 opacity-40" />
                  <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">
                    {filter === "reviewed"
                      ? "No reviews yet"
                      : filter === "pending"
                        ? "Nothing pending"
                        : "No reviews yet"}
                  </p>
                  <p className="text-sm text-gray-500 mb-6 text-center max-w-sm">
                    {filter === "reviewed"
                      ? "Reviews you write will show up here."
                      : filter === "pending"
                        ? "You've reviewed everything you ordered. Nicely done!"
                        : "Place an order, then come back to share what you think."}
                  </p>
                  <Link to="/orders" className="text-sm font-medium text-brand-teal underline underline-offset-2">
                    Go to your orders
                  </Link>
                </div>
              ) : (
                <ReviewHistorySection
                  reviews={shownReviews}
                  loading={loading}
                  pendingItems={shownPending}
                  productInfoByVariant={productInfoByVariant}
                  onReviewSaved={loadReviews}
                />
              )}
            </>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default MyReviewsPage;
