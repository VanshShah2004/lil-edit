import { useEffect, useState } from "react";
import { MessageSquare, Star, Check } from "lucide-react";
import { getUserReviewForProduct, type Review } from "@/lib/reviewsApi";
import type { OrderItem } from "@/lib/ordersApi";

interface YourReviewsSectionProps {
  items: OrderItem[];
}

export default function YourReviewsSection({ items }: YourReviewsSectionProps) {
  const [userReviews, setUserReviews] = useState<Record<string, Review | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReviews = async () => {
      const reviews: Record<string, Review | null> = {};
      for (const item of items) {
        try {
          const review = await getUserReviewForProduct(item.productSlug);
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

  const reviewedCount = Object.values(userReviews).filter((r) => r !== null).length;
  const progressPercent = Math.round((reviewedCount / items.length) * 100);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-6">
        <div className="flex justify-center">
          <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-6 h-6 text-brand-teal" />
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Your Reviews</h2>
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                {reviewedCount} of {items.length} products
              </span>
              <span className="text-sm font-bold text-brand-teal">{progressPercent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-brand-teal h-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Product Cards */}
        <div className="p-4 sm:p-6 space-y-3">
          {items.map((item) => {
            const review = userReviews[item.id];
            const isReviewed = review !== null;

            return (
              <div
                key={item.id}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 text-left"
              >
                {/* Product Image */}
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
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

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1">{item.title}</p>

                  {isReviewed ? (
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
                  ) : (
                    <p className="text-xs text-gray-500">Not reviewed yet</p>
                  )}
                </div>

                {/* Action Button */}
                <div className="shrink-0">
                  <div
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      isReviewed
                        ? "text-brand-teal border border-brand-teal/30 bg-brand-teal/5"
                        : "text-white bg-brand-teal"
                    }`}
                  >
                    {isReviewed ? "Edit Review" : "Write Review"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
    </div>
  );
}
