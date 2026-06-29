import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ChevronRight, ChevronDown, ChevronUp, ChevronLeft, Heart, Star, StarHalf, BadgeCheck, ThumbsUp, X, ArrowRight, ArrowUpDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/Footer";
import ProductDetailSkeleton from "@/components/ProductDetailSkeleton";
import ProductPreviewView from "@/components/ProductPreviewView";
import type { Product, ReviewsData } from "@/types/product";
import { getBackendBaseUrl } from "@/lib/backend";
import { buildPdpPath } from "@/lib/pdpUrl";
import { getOptimizedUrlForVariant } from "@/lib/productImage";
import { PdpClientPerf } from "@/lib/pdpClientPerf";
import { useWishlist } from "@/contexts/WishlistContext";
import { BRAND } from "@/components/PageTitle";

const LAVENDER = "#B19CD9";
const TEAL = "#0B5B55";

// Review sort options. Backend returns reviews newest-first, so "newest" is the
// payload order, "oldest" is reversed, and rating sorts are stable on top of that.
const REVIEW_SORT_OPTIONS = [
  { value: "newest",  label: "Newest First" },
  { value: "oldest",  label: "Oldest First" },
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

interface RecommendedProduct {
  slug: string;
  sku: string;
  categorySlug: string;
  image: string;
  title: string;
  price: number;
  originalPrice: number;
}

// ⚡ Module-level caches — persist across route changes within the session, capped at
// 30 entries (oldest evicted). productCache and reviewsCache are keyed by SKU: slugs
// are non-unique now (two products can share one), so the sku is the identifier.
// Recommendations stay slug-grained on the backend (category/style based, not a
// per-variant concern), so that one stays keyed by slug.
const productCache        = new LRUCache<{ product: Product;         cachedAt: number }>(30, "product");
const recommendationCache = new LRUCache<{ recommended: RecommendedProduct[]; cachedAt: number }>(30, "recs");
const reviewsCache        = new LRUCache<{ reviewsData: ReviewsData; cachedAt: number }>(30, "reviews");
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const prefetchInFlight = new Set<string>();

function prefetchProductDetail(slug: string, sku: string, categorySlug: string): void {
  if (!slug || !sku) return;
  const cached = productCache.get(sku);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    console.log(`[Prefetch] SKIP  sku=${sku}  reason=cache_fresh`);
    return;
  }
  if (prefetchInFlight.has(sku)) {
    console.log(`[Prefetch] SKIP  sku=${sku}  reason=in_flight`);
    return;
  }
  console.log(`[Prefetch] START  slug=${slug}  sku=${sku}`);
  prefetchInFlight.add(sku);
  const base = getBackendBaseUrl();
  const t0 = performance.now();
  fetch(`${base}/api/products/detail?slug=${encodeURIComponent(slug)}&sku=${encodeURIComponent(sku)}&category=${encodeURIComponent(categorySlug)}`)
    .then(async (res) => {
      if (!res.ok) {
        console.warn(`[Prefetch] FAIL  sku=${sku}  status=${res.status}`);
        return;
      }
      const data = await res.json();
      if (data?.product) {
        // Cache under every sku this product is reachable by (base + each colour).
        const p = data.product as Product;
        const skus = [p.sku, ...((p.colors ?? []).map((c) => c.sku))].filter(Boolean) as string[];
        for (const s of skus) productCache.set(s, { product: p, cachedAt: Date.now() });
        console.log(`[Prefetch] DONE  sku=${sku}  ${Math.round(performance.now() - t0)}ms  cached=${skus.length} sku(s)`);
      }
    })
    .catch((err) => {
      console.warn(`[Prefetch] ERROR  sku=${sku}`, err);
    })
    .finally(() => { prefetchInFlight.delete(sku); });
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
  const productCached = skuId ? productCache.peek(skuId) : undefined;
  const recCached = productSlug ? recommendationCache.peek(productSlug) : undefined;
  const reviewsCached = skuId ? reviewsCache.peek(skuId) : undefined;

  // Check if caches are still valid (not expired)
  const isProductCacheFresh = productCached && (Date.now() - productCached.cachedAt < CACHE_TTL_MS);
  const isRecCacheFresh = recCached && (Date.now() - recCached.cachedAt < CACHE_TTL_MS);
  const isReviewsCacheFresh = reviewsCached && (Date.now() - reviewsCached.cachedAt < CACHE_TTL_MS);

  const [product, setProduct] = useState<Product | null>(isProductCacheFresh ? productCached.product : null);
  const [recommendedProducts, setRecommendedProducts] = useState<RecommendedProduct[]>(isRecCacheFresh ? recCached.recommended : []);
  const [reviewsData, setReviewsData] = useState<ReviewsData | null>(
    isReviewsCacheFresh ? reviewsCached.reviewsData : null
  );
  const [loading, setLoading] = useState(!isProductCacheFresh);  // skip spinner if product cache hit
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [, setReviewsLoading] = useState(false);
  const [, setReviewsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lazyLoadSlugRef = useRef<string | undefined>(undefined);
  // SKUs of the currently-loaded product (base + every colour). Lets a colour switch —
  // which changes the URL sku — skip the refetch, while navigating to a different
  // product that merely shares the slug (a sku we don't hold) still triggers one.
  const loadedSkusRef = useRef<Set<string>>(new Set());
  const cacheHitRef = useRef(!!isProductCacheFresh);

  // ── Review sorting (client-side) ──────────────────────────────────────────
  const [reviewSort, setReviewSort] = useState<ReviewSort>("newest");
  const [visibleReviewCount, setVisibleReviewCount] = useState(3); // grows by 3 per "Show more"
  const [reviewLightbox, setReviewLightbox] = useState<{ images: string[]; index: number } | null>(null);

  // Sort always runs over the FULL review set (not just the visible cards).
  const sortedReviews = useMemo(() => {
    const list = [...(reviewsData?.reviews ?? [])]; // payload is newest-first
    switch (reviewSort) {
      case "oldest":  list.reverse(); break;
      case "highest": list.sort((a, b) => b.rating - a.rating); break;
      default:        break; // newest
    }
    // Three-tier ordering: the selected variant's reviews first, then the base-SKU
    // reviews (incl. legacy product-level ones with sku ''), then the remaining
    // variants'. The tier sort below is stable, so the chosen sort above is preserved
    // within each tier. product.sku is the base_sku; colours carry the variant skus.
    const baseSku = product?.sku;
    const rank = (sku: string | undefined): number => {
      if (skuId && sku === skuId) return 0;               // selected variant
      if (baseSku && (sku === baseSku || !sku)) return 1; // base sku + legacy ('')
      return 2;                                           // other variants
    };
    return list.sort((a, b) => rank(a.sku) - rank(b.sku));
  }, [reviewsData, reviewSort, skuId, product?.sku]);

  // Show the first `visibleReviewCount` of the chosen order (starts at 3, grows by
  // 3 via the "Show more" button). Sort runs over ALL reviews, so the slice
  // reflects the full set, not just a reorder of what was visible.
  const displayedReviews = sortedReviews.slice(0, visibleReviewCount);

  // Collapse back to the first 3 only when navigating to a different product.
  // Changing the sort keeps however many reviews are currently expanded (X).
  useEffect(() => {
    setVisibleReviewCount(3);
  }, [productSlug]);


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

    // Colour switch within the SAME product changes the URL sku but not the payload
    // (the loaded product already carries every colour), so skip the refetch. A
    // different product that merely shares the slug won't be in loadedSkusRef and
    // falls through to a real fetch — which is why we key on sku now that slugs aren't
    // unique.
    if (loadedSkusRef.current.has(skuId)) {
      console.log(`[DepLoop] sku=${skuId} already in loaded product — no refetch`);
      cacheHitRef.current = true;
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    // Snapshot cache at effect run time — keeps isProductCacheFresh out of deps (it changing after
    // the first fetch set the cache was causing the double-fetch loop). Keyed by sku.
    const cached = productCache.get(skuId);
    const cacheHit = !!cached && (Date.now() - cached.cachedAt < CACHE_TTL_MS);
    cacheHitRef.current = cacheHit;

    console.log(`[DepLoop] product effect RAN  slug=${productSlug}  sku=${skuId}  cacheHit=${cacheHit}`);

    if (!cacheHit) setLoading(true);
    setError(null);

    const base = getBackendBaseUrl();

    console.log(`[AbortController] product fetch START  slug=${productSlug}  sku=${skuId}`);
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
        // Cache under EVERY sku this product is reachable by (base + each colour) so a
        // colour switch is a cache hit (and the guard above skips its refetch). Keyed
        // by sku because slugs are non-unique.
        const p: Product = data.product;
        const skus = [p.sku, ...((p.colors ?? []).map((c) => c.sku))].filter(Boolean) as string[];
        loadedSkusRef.current = new Set(skus);
        for (const s of skus) productCache.set(s, { product: p, cachedAt: Date.now() });
        setProduct(p);
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
    // Keyed on sku: a colour switch (sku change, same product) is handled by the guard
    // above; a different same-slug product (new sku) refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuId, categoryParam]);

  // Reflect the loaded product's name in the browser tab. PageTitle shows the
  // generic "Product" fallback for this route until the product resolves here.
  useEffect(() => {
    if (product?.title) document.title = `${product.title} | ${BRAND}`;
  }, [product?.title]);

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

    // Every sku this product is reachable by (base + each colour) — reviews are
    // fetched/cached by sku, never by slug, since slugs aren't unique.
    const productSkus = [product.sku, ...((product.colors ?? []).map((c) => c.sku))].filter(Boolean) as string[];

    // Snapshot cache at effect run time — keeps cache-derived booleans out of deps
    // (they changing after each fetch resolved was causing the lazy effect to loop)
    const revCachedNow = skuId ? reviewsCache.get(skuId) : undefined;
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
      console.log(`[AbortController] reviews fetch START  skus=${productSkus.join(",")}`);
      fetch(`${base}/api/products/reviews?skus=${encodeURIComponent(productSkus.join(","))}`, { signal: reviewsController.signal })
        .then(async (res) => {
          if (!res.ok) {
            const errMsg = await res.json().catch(() => ({}));
            throw new Error(errMsg.error || "Failed to load reviews");
          }
          return res.json();
        })
        .then((data) => {
          if (cancelled || !data?.reviewsData) return;
          for (const s of productSkus) {
            reviewsCache.set(s, { reviewsData: data.reviewsData, cachedAt: Date.now() });
          }
          setReviewsData(data.reviewsData);
        })
        .catch((err) => {
          if (err.name === 'AbortError') {
            console.log(`[AbortController] reviews fetch ABORTED  skus=${productSkus.join(",")}`);
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
        // Pass the anchor's gender + price so the backend can rank without an extra DB lookup
        `${base}/api/products/recommendations?slug=${encodeURIComponent(productSlug)}&category=${encodeURIComponent(product.categorySlug)}&gender=${encodeURIComponent(product.gender ?? "")}&price=${encodeURIComponent(String(product.price ?? ""))}`,
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
  }, [product, productSlug, skuId]);

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

      <main className={`page-container w-full ${showSkeleton ? "pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:pb-[calc(env(safe-area-inset-bottom)+2rem)] md:pb-6" : ""}`}>
        {showSkeleton ? (
          <ProductDetailSkeleton />
        ) : (
        <ProductPreviewView product={product!} initialColorName={selectedColorName} onColorChange={handleColorChange} />
        )}

        {!showSkeleton && (
        <>
        {/* Reviews & Ratings — lazy-loaded; only takes up space once we know reviews exist,
            so products with zero reviews never reserve room for a loading skeleton */}
        {reviewsData && reviewsData.totalReviews > 0 && (
        <section className="mt-16 sm:mt-24">
          {/* Full-bleed divider — breaks out of page-container; a solid 1px hairline
              spanning the full viewport width */}
          <div aria-hidden className="w-screen relative left-1/2 -translate-x-1/2 mb-12 h-px bg-slate-400" />
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
                      {reviewsData.distribution.map((item) => {
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
              <div className="flex items-center justify-between gap-4 mb-8">
                <h3 className="text-lg font-bold text-slate-800 whitespace-nowrap">
                  Most Relevant Reviews
                </h3>
                <Select value={reviewSort} onValueChange={(v) => setReviewSort(v as ReviewSort)}>
                  <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:border-brand-teal/40 focus:ring-0 [&>svg]:h-3.5 [&>svg]:w-3.5">
                    <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {REVIEW_SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-6">
                {displayedReviews.map((review) => (
                  <div
                    key={review.id}
                    className="relative p-6 sm:p-8 rounded-[2rem] border border-slate-300 bg-slate-50 shadow-md shadow-slate-400/30 sm:hover:bg-white sm:hover:-translate-y-1.5 sm:hover:shadow-2xl sm:hover:shadow-slate-900/25 sm:hover:border-teal-500 transition-all duration-300 group"
                  >
                    <button type="button" className="absolute top-6 right-6 sm:top-8 sm:right-8 w-8 h-8 rounded-full bg-white text-slate-900 border border-slate-300 shadow-sm hover:bg-teal-700 hover:text-white hover:border-teal-700 transition-all duration-300 shrink-0 flex items-center justify-center">
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
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

                    <div className="space-y-4 min-w-0">
                      {review.images && review.images.length > 0 && (
                        <div className="flex -space-x-2">
                          {review.images.map((img: string, idx: number) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setReviewLightbox({ images: review.images!, index: idx })}
                              className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden ring-2 ring-white shadow-sm cursor-zoom-in group/img"
                            >
                              <img src={img} alt="Review" className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110" />
                              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors" />
                            </button>
                          ))}
                        </div>
                      )}

                      <p className="text-slate-600 leading-relaxed text-[15px] break-words whitespace-pre-wrap">
                        {review.comment}
                      </p>

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
        </section>
        )}

        {reviewLightbox && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setReviewLightbox(null)}
          >
            <button
              type="button"
              onClick={() => setReviewLightbox(null)}
              className="absolute top-4 right-4 text-white/80 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
            {reviewLightbox.images.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setReviewLightbox((prev) =>
                    prev ? { ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length } : prev
                  );
                }}
                className="absolute left-4 text-white/80 hover:text-white"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
            )}
            <img
              src={reviewLightbox.images[reviewLightbox.index]}
              alt="Review"
              className="max-w-full max-h-full object-contain rounded"
              onClick={(e) => e.stopPropagation()}
            />
            {reviewLightbox.images.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setReviewLightbox((prev) =>
                    prev ? { ...prev, index: (prev.index + 1) % prev.images.length } : prev
                  );
                }}
                className="absolute right-4 text-white/80 hover:text-white"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            )}
          </div>
        )}

        {/* YOU MAY ALSO LIKE SECTION */}
        <section className="mt-32">
          <div className="w-screen relative left-1/2 -translate-x-1/2 pt-6 [padding-bottom:calc(env(safe-area-inset-bottom)+2.5rem)] md:[padding-bottom:calc(env(safe-area-inset-bottom)+1.5rem)] bg-[#E8DDF7]">
          <div className="page-container">
          <div className="flex items-end justify-between mb-6 sm:mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
                You May Also Like
              </h2>
              <p className="text-sm text-gray-500 mt-1">Similar styles you’ll love</p>
            </div>
            <Link to="/collections" onClick={() => window.scrollTo(0, 0)} className="hidden sm:block text-sm font-semibold hover:underline" style={{ color: TEAL }}>
              View All
            </Link>
          </div>

          {/* Mobile: 2×2 grid capped at 4 cards (5th+ hidden via max-sm:hidden below).
              sm and up keeps the wider grid and shows every recommendation. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
            {/* Loading Skeleton */}
            {recommendationsLoading && recommendedProducts.length === 0 && (
              <>
                {[...Array(5)].map((_, idx) => (
                  <div
                    key={`skeleton-${idx}`}
                    className={`group bg-card p-2 md:p-1.5 rounded-2xl shadow-sm border border-border animate-pulse ${idx >= 4 ? "max-sm:hidden" : ""}`}
                  >
                    <div className="relative rounded-xl overflow-hidden aspect-[3/4] sm:aspect-[4/5] md:aspect-[5/6] mb-2 md:mb-1.5 bg-gray-200" />
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
            {recommendedProducts.map((item, idx) => (
              <div
                key={item.slug}
                onMouseEnter={() => prefetchProductDetail(item.slug, item.sku, item.categorySlug)}
                className={`group bg-card p-2 md:p-1.5 rounded-2xl shadow-sm border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all ${idx >= 4 ? "max-sm:hidden" : ""}`}
              >
                <div className="relative rounded-xl overflow-hidden aspect-[3/4] sm:aspect-[4/5] md:aspect-[5/6] mb-2 md:mb-1.5">
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
          </div>
          </div>
        </section>
        </>
        )}

      </main>

      <Footer />
    </div>
  );
}