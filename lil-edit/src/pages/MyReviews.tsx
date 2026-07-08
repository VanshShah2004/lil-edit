import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MessageSquare, Star, Clock, CheckCircle2 } from "lucide-react";

import Navbar from "@/components/layout/Navbar";
import RouteFallback from "@/components/RouteFallback";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { fetchOrders, type OrderSummary } from "@/lib/ordersApi";
import { getUserReviews, type Review } from "@/lib/reviewsApi";
import { ReviewHistorySection, type SidebarProduct } from "@/components/orders/OrdersSidebar";
import StatCard from "@/components/StatCard";

// Most-recent-first ordering, mirroring the Orders page so pending items surface
// the latest unreviewed purchases first.
function sortByNewest(orders: OrderSummary[]): OrderSummary[] {
  return [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

type Tab = "all" | "pending" | "reviewed";

const MyReviewsPage = () => {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("all");

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

  // sku → ordered title/image (sku is globally unique/self-identifying), with a
  // slug-only fallback for legacy reviews (sku='') written before the per-variant migration.
  const productInfoByVariant = useMemo(() => {
    const map = new Map<string, { title: string; image: string }>();
    for (const order of orders) {
      for (const item of order.items) {
        if (!map.has(item.sku)) map.set(item.sku, { title: item.title, image: item.image });
        if (!map.has(item.productSlug)) map.set(item.productSlug, { title: item.title, image: item.image });
      }
    }
    return map;
  }, [orders]);

  // Every unreviewed variant (most-recent first) — uncapped, unlike the Orders sidebar.
  const pendingItems = useMemo(() => {
    const reviewedKeys = new Set(reviews.map((r) => r.sku));
    const seen = new Set<string>();
    const pending: { item: SidebarProduct; orderId: string }[] = [];
    for (const order of sortByNewest(orders)) {
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

  // Only the active tab's slice is handed to the shared section. "All" shows both.
  const shownReviews = tab === "pending" ? [] : reviews;
  const shownPending = tab === "reviewed" ? [] : pendingItems;
  const nothingToShow = !loading && shownReviews.length === 0 && shownPending.length === 0;

  if (authLoading) {
    return <RouteFallback />;
  }

  const TABS: { value: Tab; label: string; count: number }[] = [
    { value: "all", label: "All", count: reviews.length + pendingItems.length },
    { value: "pending", label: "Pending", count: pendingItems.length },
    { value: "reviewed", label: "Reviewed", count: reviews.length },
  ];

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col text-gray-900 overflow-x-hidden">
      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1 flex flex-col w-full pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)]">
        {/* Breadcrumb */}
        <div className="page-container px-4 sm:px-6 pt-3 pb-2 mt-1.5">
          <div className="flex flex-wrap items-center text-base text-gray-500 gap-1 mb-3">
            <Link to="/" className="hover:underline">Home</Link>
            <ChevronRight className="w-4 h-4" />
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
              <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
                <StatCard
                  icon={<CheckCircle2 className="w-5 h-5 text-white" />}
                  value={reviews.length}
                  label="Reviews written"
                  accent="bg-[#B19CD9]"
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

              {/* Full-bleed separator between stats and the tabbed preview */}
              <hr className="-mx-3 sm:-mx-6 mb-5 border-t border-foreground/50" />

              {/* Tabbed preview — switch between Pending and Reviewed */}
              <DraggableTabs tabs={TABS} value={tab} onChange={setTab} />

              {/* Active tab panel */}
              {nothingToShow ? (
                <div className="w-full py-16 sm:py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
                  <MessageSquare size={48} className="text-brand-teal mb-4 opacity-40" />
                  <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">
                    {tab === "pending" ? "Nothing pending" : "No reviews yet"}
                  </p>
                  <p className="text-sm text-gray-500 mb-6 text-center max-w-sm">
                    {tab === "pending"
                      ? "You've reviewed everything you ordered. Nicely done!"
                      : tab === "reviewed"
                        ? "Reviews you write will show up here."
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
                  hideHeader
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

// A segmented control whose active-tab pill can be clicked, or grabbed and
// dragged to whichever tab it's released closest to.
function DraggableTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; count: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });
  const [dragging, setDragging] = useState(false);
  const activeIndex = tabs.findIndex((t) => t.value === value);

  const measure = useCallback((index: number) => {
    const el = tabRefs.current[index];
    const track = trackRef.current;
    if (!el || !track) return;
    const trackRect = track.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setPillStyle({ left: elRect.left - trackRect.left, width: elRect.width });
  }, []);

  useLayoutEffect(() => {
    measure(activeIndex);
  }, [activeIndex, measure, tabs.length]);

  useEffect(() => {
    const handleResize = () => measure(activeIndex);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeIndex, measure]);

  const nearestIndexToX = useCallback((clientX: number) => {
    let nearest = 0;
    let smallestDistance = Infinity;
    tabRefs.current.forEach((el, i) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const distance = Math.abs(clientX - center);
      if (distance < smallestDistance) {
        smallestDistance = distance;
        nearest = i;
      }
    });
    return nearest;
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const track = trackRef.current;
      if (!track) return;
      const trackRect = track.getBoundingClientRect();
      const index = nearestIndexToX(event.clientX);
      const el = tabRefs.current[index];
      if (!el) return;
      const elRect = el.getBoundingClientRect();
      setPillStyle({ left: elRect.left - trackRect.left, width: elRect.width });
    },
    [nearestIndexToX],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      setDragging(false);
      const index = nearestIndexToX(event.clientX);
      const next = tabs[index];
      if (next) onChange(next.value);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    },
    [handlePointerMove, nearestIndexToX, onChange, tabs],
  );

  const startDrag = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      setDragging(true);
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [handlePointerMove, handlePointerUp],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label="Reviews"
      className="relative flex items-center justify-center gap-6 border-b border-gray-200 mb-6 select-none"
    >
      <span
        onPointerDown={startDrag}
        className={`absolute -bottom-px h-0.5 rounded-full bg-brand-teal cursor-grab ${
          dragging ? "cursor-grabbing" : "transition-[left,width] duration-300 ease-out"
        }`}
        style={{ left: pillStyle.left, width: pillStyle.width }}
      />
      {tabs.map((t, i) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            ref={(el) => { tabRefs.current[i] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            onPointerDown={startDrag}
            className={`relative -mb-px flex items-center gap-2 pb-3 pt-1 text-sm font-semibold transition-colors touch-none ${
              active ? "text-brand-teal" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
            <span
              className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                active ? "bg-brand-teal/10 text-brand-teal" : "bg-gray-100 text-gray-600"
              }`}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default MyReviewsPage;
