import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ChevronRight, ChevronDown, ChevronUp, Heart, Star, StarHalf, BadgeCheck, ThumbsUp } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/Footer";
import product_images from "@/assets/products";
import ProductDetailSkeleton from "@/components/ProductDetailSkeleton";
import ProductPreviewView from "@/components/ProductPreviewView";
import type { Product, ReviewsData } from "@/types/product";
import { getBackendBaseUrl } from "@/lib/backend";
import { buildPdpPath } from "@/lib/pdpUrl";
import { getOptimizedUrlForVariant } from "@/lib/productImage";
import { PdpClientPerf } from "@/lib/pdpClientPerf";
import { useWishlist } from "@/contexts/WishlistContext";

import le0 from "@/assets/searchbar-frequent_searches/le-0.png";
import le1 from "@/assets/searchbar-frequent_searches/le-1.png";
import le2 from "@/assets/searchbar-frequent_searches/le-2.png";
import le3 from "@/assets/searchbar-frequent_searches/le-3.png";
import le4 from "@/assets/searchbar-frequent_searches/le-4.png";
import le5 from "@/assets/searchbar-frequent_searches/le-5.png";
import le6 from "@/assets/searchbar-frequent_searches/le-6.png";

const LAVENDER = "#B19CD9";
const TEAL = "#0B5B55";

// Review sort options. Backend returns reviews newest-first, so "newest" is the
// payload order, "oldest" is reversed, and rating sorts are stable on top of that.
const REVIEW_SORT_OPTIONS = [
  { value: "newest",  label: "Newest" },
  { value: "oldest",  label: "Oldest" },
  { value: "highest", label: "Highest rated" },
] as const;
type ReviewSort = (typeof REVIEW_SORT_OPTIONS)[number]["value"];

// O(1) LRU cache backed by Map insertion order.
// get() promotes the entry to most-recent; set() evicts the oldest when over cap.
class LRUCache<V> {
  private map = new Map<string, V>();
  private readonly max: number;
  private readonly name: string;

  constructor(max: number, name: string) { this.max = max; this.name = name; }

  // Full get: promotes to most-recent + logs. Use inside effects only.
  get(key: string): V | undefined {
    if (!this.map.has(key)) {
      console.log(`[LRU] ${this.name} MISS  key=${key}  size=${this.map.size}/${this.max}`);
      return undefined;
    }
    const val = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, val); // re-insert at end = most recent
    console.log(`[LRU] ${this.name} HIT   key=${key}  size=${this.map.size}/${this.max}`);
    return val;
  }

  // Silent read-only peek — no LRU promotion, no log. Use during render.
  peek(key: string): V | undefined {
    return this.map.get(key);
  }

  set(key: string, value: V): void {
    const isUpdate = this.map.has(key);
    if (isUpdate) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const evicted = this.map.keys().next().value!;
      this.map.delete(evicted);
      console.log(`[LRU] ${this.name} EVICT key=${evicted}  (added=${key})  size=${this.map.size}/${this.max}`);
    } else {
      console.log(`[LRU] ${this.name} ${isUpdate ? "UPDATE" : "SET   "}  key=${key}  size=${this.map.size}/${this.max}`);
    }
  }

  get size() { return this.map.size; }
}

// ⚡ Module-level product cache — persists across route changes within the session.
// Key = product slug. Capped at 30 entries each; oldest slug evicted when exceeded.
const productCache        = new LRUCache<{ product: Product;         cachedAt: number }>(30, "product");
const recommendationCache = new LRUCache<{ recommended: any[];       cachedAt: number }>(30, "recs");
const reviewsCache        = new LRUCache<{ reviewsData: ReviewsData; cachedAt: number }>(30, "reviews");
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const prefetchInFlight = new Set<string>();

function prefetchProductDetail(slug: string, sku: string, categorySlug: string): void {
  if (!slug || !sku) return;
  const cached = productCache.get(slug);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    console.log(`[Prefetch] SKIP  slug=${slug}  reason=cache_fresh`);
    return;
  }
  if (prefetchInFlight.has(slug)) {
    console.log(`[Prefetch] SKIP  slug=${slug}  reason=in_flight`);
    return;
  }
  console.log(`[Prefetch] START  slug=${slug}  sku=${sku}`);
  prefetchInFlight.add(slug);
  const base = getBackendBaseUrl();
  const t0 = performance.now();
  fetch(`${base}/api/products/detail?slug=${encodeURIComponent(slug)}&sku=${encodeURIComponent(sku)}&category=${encodeURIComponent(categorySlug)}`)
    .then(async (res) => {
      if (!res.ok) {
        console.warn(`[Prefetch] FAIL  slug=${slug}  status=${res.status}`);
        return;
      }
      const data = await res.json();
      if (data?.product) {
        productCache.set(slug, { product: data.product, cachedAt: Date.now() });
        console.log(`[Prefetch] DONE  slug=${slug}  ${Math.round(performance.now() - t0)}ms  cached=true`);
      }
    })
    .catch((err) => {
      console.warn(`[Prefetch] ERROR  slug=${slug}`, err);
    })
    .finally(() => { prefetchInFlight.delete(slug); });
}

function scheduleIdleTask(task: () => void): void {
  if ("requestIdleCallback" in window) {
    requestIdleCallback(task, { timeout: 2000 });
  } else {
    setTimeout(task, 100);
  }
}

// Dynamic details page architecture
export default function ProductDetail() {
  const { category: categoryParam, productPath } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isWishlisted, addToWishlist, removeFromWishlist, wishlistItems } = useWishlist();

  // Parse productSlug and skuId from combined parameter (separated by $)
  const [productSlug, skuId] = productPath?.split('$') ?? [undefined, undefined];

  // Seed state from module cache immediately — renders in one frame if visited before
  // peek() — no LRU promotion, no log (runs on every render; get() is for effects only)
  const productCached = productSlug ? productCache.peek(productSlug) : undefined;
  const recCached = productSlug ? recommendationCache.peek(productSlug) : undefined;
  const reviewsCached = productSlug ? reviewsCache.peek(productSlug) : undefined;

  // Check if caches are still valid (not expired)
  const isProductCacheFresh = productCached && (Date.now() - productCached.cachedAt < CACHE_TTL_MS);
  const isRecCacheFresh = recCached && (Date.now() - recCached.cachedAt < CACHE_TTL_MS);
  const isReviewsCacheFresh = reviewsCached && (Date.now() - reviewsCached.cachedAt < CACHE_TTL_MS);

  const [product, setProduct] = useState<Product | null>(isProductCacheFresh ? productCached.product : null);
  const [recommendedProducts, setRecommendedProducts] = useState<any[]>(isRecCacheFresh ? recCached.recommended : []);
  const [reviewsData, setReviewsData] = useState<ReviewsData | null>(
    isReviewsCacheFresh ? reviewsCached.reviewsData : null
  );
  const [loading, setLoading] = useState(!isProductCacheFresh);  // skip spinner if product cache hit
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lazyLoadSlugRef = useRef<string | undefined>(undefined);
  const cacheHitRef = useRef(!!isProductCacheFresh);

  // ── Review sorting (client-side) ──────────────────────────────────────────
  const [reviewSort, setReviewSort] = useState<ReviewSort>("newest");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [visibleReviewCount, setVisibleReviewCount] = useState(3); // grows by 3 per "Show more"

  // Sort always runs over the FULL review set (not just the visible cards).
  const sortedReviews = useMemo(() => {
    const list = [...(reviewsData?.reviews ?? [])]; // payload is newest-first
    switch (reviewSort) {
      case "oldest":  return list.reverse();
      case "highest": return list.sort((a, b) => b.rating - a.rating);
      default:        return list; // newest
    }
  }, [reviewsData, reviewSort]);

  // Show the first `visibleReviewCount` of the chosen order (starts at 3, grows by
  // 3 via the "Show more" button). Sort runs over ALL reviews, so the slice
  // reflects the full set, not just a reorder of what was visible.
  const displayedReviews = sortedReviews.slice(0, visibleReviewCount);

  // Collapse back to the first 3 only when navigating to a different product.
  // Changing the sort keeps however many reviews are currently expanded (X).
  useEffect(() => {
    setVisibleReviewCount(3);
  }, [productSlug]);

  // Close the sort menu on outside click
  useEffect(() => {
    if (!sortMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [sortMenuOpen]);

  // ── Perf tracker — one instance per slug, stable across re-renders ────────
  const perfRef     = useRef<PdpClientPerf | null>(null);
  const lastSlugRef = useRef<string | undefined>(undefined);
  if (!perfRef.current || lastSlugRef.current !== productSlug) {
    perfRef.current   = new PdpClientPerf(productSlug ?? "unknown");
    lastSlugRef.current = productSlug;
  }
  const perf = perfRef.current;

  // Mark nav start once on mount (captures React bootstrap + effect scheduling)
  useEffect(() => {
    perf.mark("navStart");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSlug]);

  // Mark renderEnd after React commits the product state to the DOM
  useLayoutEffect(() => {
    if (product) {
      perf.mark("renderEnd");
      perf.log(cacheHitRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  // ⚡ CRITICAL PATH: Fetch product details ONLY (non-blocking)
  // Uses stale-while-revalidate pattern:
  // - If cache hit → render immediately, fetch runs silently in background to refresh
  // - If cache miss → show spinner until first response
  // Recommendations are loaded separately via requestIdleCallback (non-blocking)
  useEffect(() => {
    if (!productSlug || !skuId) return;

    const controller = new AbortController();
    let cancelled = false;

    // Snapshot cache at effect run time — keeps isProductCacheFresh out of deps (it changing after
    // the first fetch set the cache was causing the double-fetch loop)
    const cached = productCache.get(productSlug);
    const cacheHit = !!cached && (Date.now() - cached.cachedAt < CACHE_TTL_MS);
    cacheHitRef.current = cacheHit;

    console.log(`[DepLoop] product effect RAN  slug=${productSlug}  cacheHit=${cacheHit}`);

    if (!cacheHit) setLoading(true);
    setError(null);

    const base = getBackendBaseUrl();

    console.log(`[AbortController] product fetch START  slug=${productSlug}`);
    perf.mark("fetchStart");
    fetch(`${base}/api/products/detail?slug=${encodeURIComponent(productSlug)}&sku=${encodeURIComponent(skuId)}&category=${encodeURIComponent(categoryParam ?? "")}`, { signal: controller.signal })
      .then(async (res) => {
        if (cancelled) return;
        perf.mark("fetchEnd");
        if (!res.ok) {
          const errMsg = await res.json().catch(() => ({}));
          throw new Error(errMsg.error || "Product not found");
        }
        const data = await res.json();
        perf.mark("parseEnd");
        return data;
      })
      .then((data) => {
        if (cancelled || !data) return;
        perf.mark("renderStart");
        // Update module cache with product data only
        productCache.set(productSlug, { product: data.product, cachedAt: Date.now() });
        setProduct(data.product);
      })
      .catch((err) => {
        if (err.name === 'AbortError') {
          console.log(`[AbortController] product fetch ABORTED  slug=${productSlug}`);
          return;
        }
        if (cancelled) return;
        console.error("[ProductDetail] Error:", err);
        if (!cacheHit) {
          setError(err instanceof Error ? err.message : "Failed to load product details");
          setProduct(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      console.log(`[AbortController] product fetch CLEANUP  slug=${productSlug}  aborting=${!controller.signal.aborted}`);
      cancelled = true;
      controller.abort();
    };
    // SKU in URL is for display/validation only — same product slug = same payload (no refetch on color change)
  }, [productSlug, categoryParam]);

  // Canonicalize base-SKU URLs to primary variant SKU without remounting or refetching
  useEffect(() => {
    if (!product || !skuId || !productSlug || !categoryParam) return;
    if (skuId !== product.sku) return;
    const primary = product.colors?.[0];
    if (!primary || primary.sku === skuId) return;
    navigate(buildPdpPath(categoryParam, productSlug, primary.sku), { replace: true });
  }, [product, skuId, productSlug, categoryParam, navigate]);

  // Reset lazy-load state when navigating to a different product
  useEffect(() => {
    if (lazyLoadSlugRef.current === productSlug) return;
    lazyLoadSlugRef.current = productSlug;

    const revCached = productSlug ? reviewsCache.get(productSlug) : undefined;
    const revFresh = !!revCached && (Date.now() - revCached.cachedAt < CACHE_TTL_MS);
    const recCachedNow = productSlug ? recommendationCache.get(productSlug) : undefined;
    const recFresh = !!recCachedNow && (Date.now() - recCachedNow.cachedAt < CACHE_TTL_MS);

    setReviewsData(revFresh ? revCached!.reviewsData : null);
    setRecommendedProducts(recFresh ? recCachedNow!.recommended : []);
    setReviewsLoading(false);
    setReviewsError(null);
    setRecommendationsLoading(false);
    setRecommendationsError(null);
  }, [productSlug]);

  // ⚡ LAZY LOAD: Reviews + recommendations after product renders (non-blocking)
  useEffect(() => {
    if (!product || !productSlug) return;

    const base = getBackendBaseUrl();
    const reviewsController = new AbortController();
    const recsController = new AbortController();
    let cancelled = false;

    // Snapshot cache at effect run time — keeps cache-derived booleans out of deps
    // (they changing after each fetch resolved was causing the lazy effect to loop)
    const revCachedNow = reviewsCache.get(productSlug);
    const isRevFresh = !!revCachedNow && (Date.now() - revCachedNow.cachedAt < CACHE_TTL_MS);
    const recCachedNow = recommendationCache.get(productSlug);
    const isRecFreshNow = !!recCachedNow && (Date.now() - recCachedNow.cachedAt < CACHE_TTL_MS);

    console.log(`[DepLoop] lazy effect RAN  slug=${productSlug}  reviewsCacheHit=${isRevFresh}  recsCacheHit=${isRecFreshNow}`);

    const fetchReviews = () => {
      if (isRevFresh && revCachedNow) {
        setReviewsData(revCachedNow.reviewsData);
        return;
      }
      setReviewsLoading(true);
      setReviewsError(null);
      console.log(`[AbortController] reviews fetch START  slug=${productSlug}`);
      fetch(`${base}/api/products/reviews?slug=${encodeURIComponent(productSlug)}`, { signal: reviewsController.signal })
        .then(async (res) => {
          if (!res.ok) {
            const errMsg = await res.json().catch(() => ({}));
            throw new Error(errMsg.error || "Failed to load reviews");
          }
          return res.json();
        })
        .then((data) => {
          if (cancelled || !data?.reviewsData) return;
          reviewsCache.set(productSlug, { reviewsData: data.reviewsData, cachedAt: Date.now() });
          setReviewsData(data.reviewsData);
        })
        .catch((err) => {
          if (err.name === 'AbortError') {
            console.log(`[AbortController] reviews fetch ABORTED  slug=${productSlug}`);
            return;
          }
          if (cancelled) return;
          console.warn("[ProductDetail] Reviews error:", err instanceof Error ? err.message : String(err));
          setReviewsError(err instanceof Error ? err.message : "Failed to load reviews");
        })
        .finally(() => {
          if (!cancelled) setReviewsLoading(false);
        });
    };

    const fetchRecommendations = () => {
      if (isRecFreshNow && recCachedNow) {
        setRecommendedProducts(recCachedNow.recommended);
        return;
      }
      setRecommendationsLoading(true);
      setRecommendationsError(null);
      console.log(`[AbortController] recs fetch START  slug=${productSlug}`);
      fetch(
        `${base}/api/products/recommendations?slug=${encodeURIComponent(productSlug)}&category=${encodeURIComponent(product.categorySlug)}`,
        { signal: recsController.signal }
      )
        .then(async (res) => {
          if (!res.ok) {
            const errMsg = await res.json().catch(() => ({}));
            throw new Error(errMsg.error || "Failed to load recommendations");
          }
          return res.json();
        })
        .then((data) => {
          if (cancelled) return;
          recommendationCache.set(productSlug, {
            recommended: data.recommended || [],
            cachedAt: Date.now(),
          });
          setRecommendedProducts(data.recommended || []);
        })
        .catch((err) => {
          if (err.name === 'AbortError') {
            console.log(`[AbortController] recs fetch ABORTED  slug=${productSlug}`);
            return;
          }
          if (cancelled) return;
          console.warn(
            "[ProductDetail] Recommendations error:",
            err instanceof Error ? err.message : String(err)
          );
          setRecommendationsError(
            err instanceof Error ? err.message : "Failed to load recommendations"
          );
          setRecommendedProducts([]);
        })
        .finally(() => {
          if (!cancelled) setRecommendationsLoading(false);
        });
    };

    scheduleIdleTask(() => {
      if (!cancelled) {
        fetchReviews();
        fetchRecommendations();
      }
    });

    return () => {
      console.log(`[AbortController] lazy fetch CLEANUP  slug=${productSlug}  aborting reviews=${!reviewsController.signal.aborted}  aborting recs=${!recsController.signal.aborted}`);
      cancelled = true;
      reviewsController.abort();
      recsController.abort();
    };
  }, [product, productSlug]);

  const showSkeleton = loading && !product;
  const showNotFound = !loading && (error || !product);

  if (showNotFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-4 bg-white pt-[calc(var(--navbar-height)+20px)]">
        <h2 className="text-2xl font-bold mb-4 text-slate-900">Product Not Found</h2>
        <p className="text-gray-500 mb-8 max-w-sm">
          {error || "The product you're looking for doesn't exist or is no longer available in this collection."}
        </p>
        <Link 
          to="/collections" 
          className="px-8 py-3 rounded-full text-[10px] font-bold text-white uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-teal-900/10"
          style={{ backgroundColor: TEAL }}
        >
          Browse Collections
        </Link>
      </div>
    );
  }

  let selectedColorName: string | undefined;
  if (product && skuId && product.colors?.length) {
    const matchingColor = product.colors.find((c) => c.sku === skuId);
    selectedColorName = matchingColor?.name ?? product.colors[0]?.name;
  }

  const handleColorChange = (colorName: string) => {
    if (!product?.colors || !categoryParam || !productSlug) return;
    const selectedColor = product.colors.find((c) => c.name === colorName);
    if (selectedColor) {
      navigate(buildPdpPath(categoryParam, productSlug, selectedColor.sku), { replace: false });
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)]">
      {user ? <UserNavbar /> : <Navbar />}

      {/* Breadcrumb */}
      <div className="page-container pt-1 pb-6 sm:pb-8 text-sm text-gray-500">
        <Link to="/" className="hover:text-slate-900 transition-colors">Home</Link>
        <ChevronRight className="inline w-4 h-4 mx-1" />
        <Link to="/collections" className="hover:text-slate-900 transition-colors">Collections</Link>
        <ChevronRight className="inline w-4 h-4 mx-1" />
        {showSkeleton ? (
          <>
            <span className="inline-block h-4 w-24 bg-gray-200 rounded animate-pulse align-middle" />
            <ChevronRight className="inline w-4 h-4 mx-1" />
            <span className="inline-block h-4 w-40 bg-gray-200 rounded animate-pulse align-middle" />
          </>
        ) : (
          <>
            <Link to={`/collections/${product!.categorySlug}`} className="hover:text-slate-900 transition-colors">
              {product!.category}
            </Link>
            <ChevronRight className="inline w-4 h-4 mx-1" />
            <span className="text-gray-800 font-medium">{product!.title}</span>
          </>
        )}
      </div>

      <main className="page-container w-full pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:pb-[calc(env(safe-area-inset-bottom)+2rem)] md:pb-6">
        {showSkeleton ? (
          <ProductDetailSkeleton />
        ) : (
        <ProductPreviewView product={product!} initialColorName={selectedColorName} onColorChange={handleColorChange} />
        )}

        {!showSkeleton && (
        <>
        {/* Reviews & Ratings — lazy-loaded; hidden entirely when the product has zero reviews */}
        {!(reviewsData && reviewsData.totalReviews === 0) && (
        <section className="mt-16 sm:mt-24">
          {/* Full-bleed divider — breaks out of page-container to span the viewport */}
          <div aria-hidden className="w-screen relative left-1/2 -translate-x-1/2 border-t border-gray-400 mb-12" />
          {reviewsLoading && !reviewsData && (
            <div className="flex flex-col md:flex-row gap-12 animate-pulse" aria-hidden>
              <div className="w-full md:w-1/3 h-80 rounded-3xl bg-gray-100" />
              <div className="w-full md:w-2/3 space-y-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-40 rounded-[2rem] bg-gray-100" />
                ))}
              </div>
            </div>
          )}

          {!reviewsLoading && !reviewsData && reviewsError && (
            <p className="text-center text-gray-400 text-sm py-8">
              Customer reviews are temporarily unavailable.
            </p>
          )}

          {reviewsData && reviewsData.totalReviews > 0 && (
          <div className="flex flex-col md:flex-row gap-12">
            {/* Left Column: Summary */}
            <div className="w-full md:w-1/3">
              <div className="sticky top-24">
                <div className="flex items-center gap-3 mb-6">
                  <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
                    Customer Reviews
                  </h2>
                  <span
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold text-white shadow-sm"
                    style={{ backgroundColor: TEAL }}
                  >
                    <Star size={12} fill="currentColor" />
                    {reviewsData.averageRating}
                  </span>
                </div>

                <div
                  className="relative rounded-3xl overflow-hidden p-8 sm:p-10 mb-8"
                  style={{
                    background: "linear-gradient(135deg, #f0fdf4 0%, #f5f3ff 50%, #fef9ee 100%)",
                    border: "1px solid rgba(15,118,110,0.1)",
                  }}
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-1.5"
                    style={{ background: `linear-gradient(90deg, ${TEAL}, ${LAVENDER}, ${TEAL})` }}
                  />


                  <div className="flex flex-col items-center">
                    <div
                      className="text-6xl font-extrabold mb-3 tracking-tighter"
                      style={{ color: TEAL }}
                    >
                      {reviewsData.averageRating}
                    </div>
                    <div className="flex gap-1 mb-3">
                      {[...Array(5)].map((_, i) => {
                        const rating = reviewsData.averageRating;
                        if (i < Math.floor(rating)) {
                          return <Star key={i} size={22} fill="#F59E0B" stroke="#F59E0B" className="drop-shadow-sm" />;
                        } else if (i === Math.floor(rating) && rating % 1 >= 0.5) {
                          return <StarHalf key={i} size={22} fill="#F59E0B" stroke="#F59E0B" className="drop-shadow-sm" />;
                        } else {
                          return <Star key={i} size={22} fill="none" stroke="#D1D5DB" className="drop-shadow-sm" />;
                        }
                      })}
                    </div>
                    <p className="text-gray-500 font-medium mb-8">
                      Based on {reviewsData.totalReviews} reviews
                    </p>

                    <div className="w-full space-y-3">
                      {reviewsData.distribution.map((item: any) => {
                        const pct = reviewsData.totalReviews > 0 ? Math.round((item.count / reviewsData.totalReviews) * 100) : 0;
                        return (
                          <div key={item.stars} className="flex items-center gap-4 group">
                            <div className="w-12 shrink-0 flex items-center gap-1.5 text-sm font-bold text-slate-600">
                              {item.stars}
                              <Star size={14} fill="#F59E0B" stroke="#F59E0B" />
                            </div>
                            <div className="flex-1 h-2 bg-gray-200/50 rounded-full overflow-hidden shadow-inner">
                              <div
                                className="h-full rounded-full transition-all duration-1000 ease-out"
                                style={{
                                  width: `${pct}%`,
                                  background: item.stars >= 4
                                    ? `linear-gradient(90deg, ${TEAL}, #14B8A6)`
                                    : item.stars === 3
                                      ? "#F59E0B"
                                      : "#EF4444",
                                }}
                              />
                            </div>
                            <div className="w-10 text-right text-xs font-bold text-gray-400 group-hover:text-slate-600 transition-colors">
                              {item.count}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Review List */}
            <div className="w-full md:w-2/3">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-lg font-bold text-slate-800">
                  Most Relevant Reviews
                </h3>
                <div ref={sortMenuRef} className="relative flex items-center gap-2 text-sm text-gray-500 font-medium">
                  <span>Sort by:</span>
                  <button
                    type="button"
                    onClick={() => setSortMenuOpen((o) => !o)}
                    aria-haspopup="listbox"
                    aria-expanded={sortMenuOpen}
                    className="inline-flex items-center gap-1 text-slate-900 font-bold hover:underline focus:outline-none"
                  >
                    {REVIEW_SORT_OPTIONS.find((o) => o.value === reviewSort)?.label}
                    <ChevronDown size={14} className={`transition-transform duration-200 ${sortMenuOpen ? "rotate-180" : ""}`} />
                  </button>
                  {sortMenuOpen && (
                    <div
                      role="listbox"
                      className="absolute right-0 top-full mt-2 z-20 w-44 rounded-xl border border-gray-100 bg-white shadow-xl shadow-slate-200/50 py-1.5 overflow-hidden"
                    >
                      {REVIEW_SORT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={reviewSort === opt.value}
                          onClick={() => { setReviewSort(opt.value); setSortMenuOpen(false); }}
                          className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-gray-50 ${
                            reviewSort === opt.value ? "text-teal-700 font-bold" : "text-slate-600 font-medium"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                {displayedReviews.map((review: any) => (
                  <div
                    key={review.id}
                    className="relative p-6 sm:p-8 rounded-[2rem] border border-slate-300 bg-slate-50 shadow-md shadow-slate-400/30 sm:hover:bg-white sm:hover:-translate-y-1.5 sm:hover:shadow-2xl sm:hover:shadow-slate-900/25 sm:hover:border-teal-500 transition-all duration-300 group"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div className="flex items-center gap-4">
                        <div
                          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-lg font-bold text-white shadow-inner transform transition-transform duration-500"
                          style={{ background: `linear-gradient(135deg, ${TEAL}, #14B8A6)` }}
                        >
                          {review.user.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">
                              {review.user}
                            </span>
                            {review.verified && (
                              <BadgeCheck size={16} className="text-teal-600" fill="rgba(20, 184, 166, 0.1)" />
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <div className="flex gap-0.5">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  size={14}
                                  fill={i < review.rating ? "#F59E0B" : "none"}
                                  stroke={i < review.rating ? "#F59E0B" : "#D1D5DB"}
                                />
                              ))}
                            </div>
                            <span className="text-xs text-gray-400 font-bold tracking-tight uppercase">
                              {review.date}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-800 text-lg leading-snug">
                        {review.title}
                      </h4>
                      <p className="text-slate-600 leading-relaxed text-[15px]">
                        {review.comment}
                      </p>

                      {review.images && (
                        <div className="flex flex-wrap gap-3 mt-6">
                          {review.images.map((img: any, idx: number) => (
                            <div key={idx} className="relative w-24 h-32 rounded-xl overflow-hidden border border-gray-100 shadow-sm cursor-zoom-in group/img">
                              <img src={img} alt="Review" className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110" />
                              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors" />
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-6 pt-4 mt-6 border-t border-gray-50">
                        <button onClick={() => alert("Helpful rating recorded!")} className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-teal-700 transition-colors font-bold uppercase tracking-widest">
                          <ThumbsUp size={14} />
                          Helpful (0)
                        </button>
                        <button onClick={() => alert("Review reported!")} className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-slate-700 transition-colors font-bold uppercase tracking-widest">
                          Report
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {(displayedReviews.length < sortedReviews.length || visibleReviewCount > 3) && (
                <div className="mt-10 flex gap-3">
                  {displayedReviews.length < sortedReviews.length && (
                    <button
                      onClick={() => setVisibleReviewCount((c) => c + 3)}
                      className="flex-1 py-5 rounded-2xl text-sm font-extrabold text-black hover:brightness-95 transition-all duration-300 uppercase tracking-[0.2em] shadow-sm flex items-center justify-center gap-2"
                      style={{ backgroundColor: LAVENDER }}
                    >
                      Show More Reviews
                      <ChevronDown size={16} className="stroke-[3]" />
                    </button>
                  )}
                  {visibleReviewCount > 3 && (
                    <button
                      onClick={() => setVisibleReviewCount(3)}
                      className="flex-1 py-5 rounded-2xl text-sm font-extrabold text-black bg-transparent border border-gray-300 hover:bg-gray-50 transition-all duration-300 uppercase tracking-[0.2em] shadow-sm flex items-center justify-center gap-2"
                    >
                      Show Less Reviews
                      <ChevronUp size={16} className="stroke-[3]" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          )}
        </section>
        )}

        {/* YOU MAY ALSO LIKE SECTION */}
        <section className="page-container w-full mt-14 pb-0 pt-6">
          {/* Full-bleed divider — spans the viewport (matches the divider above the reviews) */}
          <div aria-hidden className="w-screen relative left-1/2 -translate-x-1/2 border-t border-gray-400 -mt-6 mb-6" />
          <div className="flex items-end justify-between mb-6 sm:mb-8">
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">
                You May Also Like
              </h2>
              <p className="text-sm text-gray-500 mt-1">Similar styles you’ll love</p>
            </div>
            <button className="hidden sm:block text-sm font-semibold hover:underline" style={{ color: TEAL }}>
              View All
            </button>
          </div>

          <div className="flex sm:grid overflow-x-auto sm:overflow-visible flex-nowrap sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6 no-scrollbar snap-x snap-mandatory px-1 sm:px-0">
            {/* Loading Skeleton */}
            {recommendationsLoading && recommendedProducts.length === 0 && (
              <>
                {[...Array(5)].map((_, idx) => (
                  <div
                    key={`skeleton-${idx}`}
                    className="group bg-card p-2 md:p-1.5 rounded-2xl shadow-sm border border-border shrink-0 snap-start w-[240px] sm:w-auto animate-pulse"
                  >
                    <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-[4/5] mb-2 md:mb-1.5 bg-gray-200" />
                    <div className="px-1 pb-0.5 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                      <div className="h-3 bg-gray-200 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Loaded Recommendations */}
            {recommendedProducts.map((item) => (
              <div
                key={item.slug}
                onMouseEnter={() => prefetchProductDetail(item.slug, item.sku, item.categorySlug)}
                className="group bg-card p-2 md:p-1.5 rounded-2xl shadow-sm border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all shrink-0 snap-start w-[240px] sm:w-auto"
              >
                <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-[4/5] mb-2 md:mb-1.5">
                  {item.image && (
                  <img
                    src={getOptimizedUrlForVariant(item.image, "thumbnail")}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      if (e.currentTarget.src !== item.image) {
                        e.currentTarget.src = item.image;
                      }
                    }}
                  />
                  )}
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      console.log("[rec-heart] clicked slug=", item.slug, "sku=", item.sku);
                      const wishlisted = isWishlisted(item.slug, item.sku);
                      if (wishlisted) {
                        const entry = wishlistItems.find(
                          (w) => w.productSlug === item.slug && w.sku === item.sku
                        );
                        if (entry) await removeFromWishlist(entry.id);
                      } else {
                        await addToWishlist(item.slug, item.sku);
                      }
                    }}
                    title={isWishlisted(item.slug, item.sku) ? "Remove from wishlist" : "Add to wishlist"}
                    className="absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center transition-all"
                  >
                    <Heart
                      className={`w-3.5 h-3.5 ${isWishlisted(item.slug, item.sku) ? "text-primary" : "text-muted-foreground"}`}
                      fill={isWishlisted(item.slug, item.sku) ? "currentColor" : "none"}
                    />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                    <Link
                      to={buildPdpPath(item.categorySlug, item.slug, item.sku)}
                      className="w-full py-1.5 bg-white/90 backdrop-blur text-slate-900 rounded-lg font-medium text-[10px] md:text-xs hover:bg-[#0F766E] hover:text-white transition-colors shadow-sm block text-center"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
                <div className="px-1 pb-0.5 flex justify-between items-start gap-2">
                  <div className="flex-1">
                    <h3 className="font-display text-xs md:text-sm font-medium text-slate-900 leading-snug line-clamp-2">
                      {item.title}
                    </h3>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-body text-xs font-semibold text-[#0F766E]">
                      ₹{item.price}
                    </p>
                    {item.originalPrice > item.price && (
                      <p className="text-[10px] text-gray-400 line-through">₹{item.originalPrice}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Empty State */}
            {!recommendationsLoading && recommendedProducts.length === 0 && !recommendationsError && (
              <div className="col-span-full text-center py-8 text-gray-500">
                <p>No recommendations available at this time</p>
              </div>
            )}

            {/* Error State (but PDP still works) */}
            {recommendationsError && recommendedProducts.length === 0 && (
              <div className="col-span-full text-center py-8">
                <p className="text-gray-400 text-sm">Unable to load recommendations, but your product is ready!</p>
              </div>
            )}
          </div>
        </section>
        </>
        )}

      </main>

      <Footer />
    </div>
  );
}