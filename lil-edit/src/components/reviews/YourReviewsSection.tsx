import { useEffect, useState } from "react";
import { MessageSquare, Star, Check } from "lucide-react";
import { getUserReviewForProduct, type Review } from "@/lib/reviewsApi";
import type { OrderItem } from "@/lib/ordersApi";
import ReviewForm from "./ReviewForm";

interface YourReviewsSectionProps {
  items: OrderItem[];
}

export default function YourReviewsSection({ items }: YourReviewsSectionProps) {
  const [userReviews, setUserReviews] = useState<Record<string, Review | null>>({});
  const [loading, setLoading] = useState(true);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  useEffect(() => {
    const fetchReviews = async () => {
      const reviews: Record<string, Review | null> = {};
      for (const item of items) {
        try {
          const review = await getUserReviewForProduct(item.productSlug, item.sku);
          reviews[item.id] = review;
        } catch (err) {
          console.error("[YourReviewsSection] fetch error for", item.productSlug, err);
          reviews[item.id] = null;
        }
      }
      setUserReviews(reviews);
      setLoading(false);
    };

    fetchReviews();
  }, [items]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-400 shadow-lg ring-1 ring-black/10 overflow-hidden p-6">
        <div className="flex justify-center">
          <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-400 shadow-xl ring-1 ring-black/10 overflow-hidden">
        {/* Accent strip */}
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-teal via-[#B19CD9] to-emerald-400" />

        {/* Header — tinted band so the panel reads as its own surface */}
        <div className="p-4 sm:p-6 bg-gradient-to-br from-brand-teal/10 via-[#E8DDF7]/50 to-emerald-50 border-b border-[#B19CD9]/25">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-teal text-white shadow-sm shrink-0">
              <MessageSquare className="w-5 h-5" />
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Your Reviews</h2>
            <span className="ml-auto text-xs font-bold text-gray-900 bg-white border border-brand-teal/30 rounded-full px-2.5 py-1 shadow-sm">
              {items.length}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1.5">Spill the tea, rate the fit, explore the cuteness ✨</p>
        </div>

        {/* Product Cards */}
        <div className="p-4 sm:p-6 space-y-3 bg-gray-50">
          {items.map((item) => {
            const review = userReviews[item.id];
            const isReviewed = review !== null;
            const isOpen = openItemId === item.id;
            const hasPhotos = isReviewed && Boolean(review.images && review.images.length > 0);
            const tall = isReviewed && item.title.length > 30 && hasPhotos;

            return (
              <div key={item.id} className="rounded-xl border border-gray-400 bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18)] overflow-hidden">
                <div className="w-full flex items-stretch gap-4 p-4 text-left">
                  {/* Product Image — width stays w-24; height only stretches to the
                      bottom of the review-photo thumbnail strip when the title is
                      long and photos are present, otherwise stays h-24 */}
                  <div className={`w-24 ${tall ? "self-stretch" : "h-24"} rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-100`}>
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "/fallback-product.webp";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <MessageSquare size={20} />
                      </div>
                    )}
                  </div>

                  {/* Product Info — top content stays top, action row pinned to the image's baseline */}
                  <div className={`flex-1 min-w-0 flex flex-col ${tall ? "gap-2" : "justify-between"}`}>
                    {isReviewed ? (
                      <>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1">{item.title}</p>
                          <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-600" />
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`w-3.5 h-3.5 ${
                                    star <= review.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"
                                  }`}
                                />
                              ))}
                            </div>
                            {review.verified && (
                              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                Verified
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Review-attached photos + edit action — same line, bottom-aligned with the image */}
                        <div className={`flex items-end justify-between gap-2 ${tall ? "" : "mt-2"}`}>
                          {review.images && review.images.length > 0 ? (
                            <div className="flex -space-x-2">
                              {review.images.map((url, idx) => (
                                <div
                                  key={idx}
                                  className={`w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0 ring-2 ring-white shadow-sm ${idx > 0 ? "hidden sm:block" : ""}`}
                                >
                                  <img
                                    src={url}
                                    alt={`Review photo ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      e.currentTarget.src = "/fallback-product.webp";
                                    }}
                                  />
                                </div>
                              ))}
                              {/* Mobile-only — collapses remaining photos into a count badge */}
                              {review.images.length > 1 && (
                                <div className="sm:hidden w-10 h-10 rounded-lg bg-gray-200 ring-2 ring-white shadow-sm shrink-0 flex items-center justify-center text-xs font-semibold text-gray-600">
                                  +{review.images.length - 1}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div />
                          )}

                          <button
                            type="button"
                            onClick={() => setOpenItemId(isOpen ? null : item.id)}
                            className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium text-brand-teal border border-brand-teal/30 bg-brand-teal/5 hover:bg-brand-teal/10 transition-colors"
                          >
                            {isOpen ? "Close" : "Edit Review"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1">{item.title}</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-gray-500">Not yet reviewed</p>
                          <button
                            type="button"
                            onClick={() => setOpenItemId(isOpen ? null : item.id)}
                            className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-teal hover:bg-brand-teal/90 transition-colors"
                          >
                            {isOpen ? "Close" : "Write Review"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="p-4 pt-0">
                    <ReviewForm
                      compact
                      productSlug={item.productSlug}
                      sku={item.sku}
                      existingReview={review}
                      onCancel={() => setOpenItemId(null)}
                      onSuccess={(saved) => {
                        setUserReviews((prev) => ({ ...prev, [item.id]: saved }));
                        setOpenItemId(null);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
    </div>
  );
}
