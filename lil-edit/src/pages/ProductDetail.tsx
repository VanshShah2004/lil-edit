import { useEffect, useState } from "react";
import { Link, useParams, Navigate, useNavigate } from "react-router-dom";
import { ChevronRight, Heart, Star, StarHalf, BadgeCheck, ThumbsUp } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/Footer";
import product_images from "@/assets/products";
import ProductPreviewView from "@/components/ProductPreviewView";
import { Badge } from "@/components/ui/badge";
import type { Product } from "@/types/product";
import { getBackendBaseUrl } from "@/lib/backend";

import le0 from "@/assets/searchbar-frequent_searches/le-0.png";
import le1 from "@/assets/searchbar-frequent_searches/le-1.png";
import le2 from "@/assets/searchbar-frequent_searches/le-2.png";
import le3 from "@/assets/searchbar-frequent_searches/le-3.png";
import le4 from "@/assets/searchbar-frequent_searches/le-4.png";
import le5 from "@/assets/searchbar-frequent_searches/le-5.png";
import le6 from "@/assets/searchbar-frequent_searches/le-6.png";

const LAVENDER = "#B19CD9";
const TEAL = "#0B5B55";

// ⚡ Module-level product cache — persists across route changes within the session.
// Key = product slug. All variant SKUs of the same product share one entry.
const productCache = new Map<string, { product: Product; recommended: any[] }>();

// Dynamic details page architecture
export default function ProductDetail() {
  const { category: categoryParam, productPath } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Parse productSlug and skuId from combined parameter (separated by $)
  const [productSlug, skuId] = productPath?.split('$') ?? [undefined, undefined];

  // Seed state from module cache immediately — renders in one frame if visited before
  const cached = productSlug ? productCache.get(productSlug) : undefined;
  const [product, setProduct] = useState<Product | null>(cached?.product ?? null);
  const [recommendedProducts, setRecommendedProducts] = useState<any[]>(cached?.recommended ?? []);
  const [loading, setLoading] = useState(!cached);  // skip spinner if cache hit
  const [error, setError] = useState<string | null>(null);

  // Fetch product details — stale-while-revalidate pattern:
  // If cache hit → render immediately, fetch runs silently in background to refresh.
  // If cache miss → show spinner until first response.
  useEffect(() => {
    if (!productSlug || !skuId) return;

    let cancelled = false;

    // Only show spinner on a true cold miss
    if (!productCache.has(productSlug)) setLoading(true);
    setError(null);

    const base = getBackendBaseUrl();
    fetch(`${base}/api/products/detail?slug=${encodeURIComponent(productSlug)}&sku=${encodeURIComponent(skuId)}&category=${encodeURIComponent(categoryParam ?? "")}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const errMsg = await res.json().catch(() => ({}));
          throw new Error(errMsg.error || "Product not found");
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        // Update module cache
        productCache.set(productSlug, { product: data.product, recommended: data.recommended || [] });
        setProduct(data.product);
        setRecommendedProducts(data.recommended || []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[ProductDetail] Error:", err);
        // Only show error if we have nothing cached to show
        if (!productCache.has(productSlug)) {
          setError(err instanceof Error ? err.message : "Failed to load product details");
          setProduct(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [productSlug, skuId, categoryParam]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white pt-[calc(var(--navbar-height)+20px)]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto" />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Product Details...</p>
        </div>
      </div>
    );
  }

  // Graceful failure for missing or validation-failed products
  if (error || !product) {
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

  // Determine if it's a full color SKU or just base SKU
  // Full color SKU format: EDIT-ETHNIC-102-WHT
  // Base SKU format: EDIT-ETHNIC-102
  let selectedColorName: string | undefined;
  let isValidSku = false;

  if (skuId && product.colors) {
    // Check if it matches a color SKU exactly
    const matchingColorBySku = product.colors.find(c => c.sku === skuId);
    if (matchingColorBySku) {
      // Full color SKU provided
      selectedColorName = matchingColorBySku.name;
      isValidSku = true;
    } else if (skuId === product.sku) {
      // Only base SKU provided - use primary color
      selectedColorName = product.colors[0]?.name;
      isValidSku = true;
    }
  }

  // Sku redirect to variant SKU if only base SKU is specified
  if (skuId === product.sku && selectedColorName && product.colors) {
    const primaryColor = product.colors.find(c => c.name === selectedColorName);
    if (primaryColor) {
      return <Navigate to={`/collections/${categoryParam}/product/${productSlug}$${primaryColor.sku}`} replace />;
    }
  }

  // Handle color change - update URL when color is selected
  const handleColorChange = (colorName: string) => {
    if (!product.colors) return;
    const selectedColor = product.colors.find(c => c.name === colorName);
    if (selectedColor) {
      navigate(`/collections/${categoryParam}/product/${productSlug}$${selectedColor.sku}`, { replace: false });
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)]">
      {user ? <UserNavbar /> : <Navbar />}

      {/* Breadcrumb */}
      <div className="page-container pt-1 pb-6 sm:pb-8 text-sm text-gray-500">
        <Link to="/" className="hover:text-slate-900 transition-colors">Home</Link>
        <ChevronRight className="inline w-4 h-4 mx-1" />
        <Link to={`/collections/${product.categorySlug}`} className="hover:text-slate-900 transition-colors">
          {product.category}
        </Link>
        <ChevronRight className="inline w-4 h-4 mx-1" />
        <span className="text-gray-800 font-medium">{product.title}</span>
      </div>

      <main className="page-container w-full pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:pb-[calc(env(safe-area-inset-bottom)+2rem)] md:pb-6">
        <ProductPreviewView product={product} initialColorName={selectedColorName} onColorChange={handleColorChange} />

        {/* Reviews & Ratings - Full Width Section */}
        <section className="mt-16 sm:mt-24 pt-12 border-t border-gray-100">
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
                    {product.reviewsData.averageRating}
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
                      {product.reviewsData.averageRating}
                    </div>
                    <div className="flex gap-1 mb-3">
                      {[...Array(5)].map((_, i) => {
                        const rating = product.reviewsData.averageRating;
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
                      Based on {product.reviewsData.totalReviews} reviews
                    </p>

                    <div className="w-full space-y-3">
                      {product.reviewsData.distribution.map((item: any) => {
                        const pct = product.reviewsData.totalReviews > 0 ? Math.round((item.count / product.reviewsData.totalReviews) * 100) : 0;
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

                    <button
                      onClick={() => alert("Review submission functionality coming soon!")}
                      className="w-full mt-10 py-4 rounded-2xl text-sm font-bold text-white shadow-xl shadow-teal-900/10 hover:brightness-95 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                      style={{ backgroundColor: TEAL }}
                    >
                      WRITE A REVIEW
                    </button>
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
                <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                  Sort by: <span className="text-slate-900 font-bold cursor-pointer hover:underline">Newest</span>
                </div>
              </div>

              <div className="space-y-6">
                {product.reviewsData.reviews.map((review: any) => (
                  <div
                    key={review.id}
                    className="relative p-6 sm:p-8 rounded-[2rem] border border-gray-100 bg-white hover:shadow-xl hover:shadow-slate-200/50 hover:border-teal-100/50 transition-all duration-500 group"
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

              <button
                onClick={() => alert("Pagination functionality coming soon!")}
                className="w-full mt-10 py-5 rounded-2xl text-sm font-bold text-teal-700 bg-teal-50 border border-teal-100 hover:bg-teal-100 hover:border-teal-200 transition-all duration-300 uppercase tracking-[0.2em] shadow-sm"
              >
                View All {product.reviewsData.totalReviews} Reviews
              </button>
            </div>
          </div>
        </section>

        {/* YOU MAY ALSO LIKE SECTION */}
        <section className="page-container w-full mt-14 pb-0 border-t border-gray-100 pt-6">
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
            {recommendedProducts.map((item) => (
              <div
                key={item.slug}
                className="group bg-card p-2 md:p-1.5 rounded-2xl shadow-sm border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all shrink-0 snap-start w-[240px] sm:w-auto"
              >
                <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-[4/5] mb-2 md:mb-1.5">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <button className="absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-muted-foreground hover:text-teal-600 transition-all">
                    <Heart className="w-3.5 h-3.5" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                    <Link
                      to={`/collections/${item.categorySlug}/product/${item.slug}$${item.sku}`}
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
                    {(item.tags ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.tags?.map((tag: string, idx: number) => (
                          <Badge
                            key={idx}
                            variant="secondary"
                            className="bg-gradient-to-r from-purple-50 to-indigo-50 text-indigo-800 border border-indigo-100 text-[9px] px-1.5 py-0 rounded font-medium shadow-sm"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
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
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}