import { useEffect, useState } from "react";
import { MessageSquare, Star, Check } from "lucide-react";
import ReviewForm from "./ReviewForm";
import { getUserReviewForProduct, type Review } from "@/lib/reviewsApi";

interface CustomerReviewsSectionProps {
  productSlug: string;
  categorySlug: string;
  title: string;
}


export default function CustomerReviewsSection({
  productSlug,
  categorySlug,
  title,
}: CustomerReviewsSectionProps) {
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        console.log(`[CustomerReviewsSection] fetching user review  slug=${productSlug}`);
        const userRev = await getUserReviewForProduct(productSlug);
        if (!cancelled) setUserReview(userRev);
      } catch (err) {
        console.error("[CustomerReviewsSection] fetch error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [productSlug]);

  const handleReviewSuccess = (review: Review) => {
    setUserReview(review);
    setShowForm(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 sm:px-6 py-5 sm:py-6 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-brand-teal" />
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">Your Review</h2>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 sm:px-6 py-5 sm:py-6">
          {/* User's Review Section */}
          {userReview && !showForm && (
            <div className="py-5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Your Review</h3>
              <div className="bg-brand-teal/5 rounded-xl border border-brand-teal/20 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-4 h-4 ${
                              star <= userReview.rating
                                ? "fill-amber-400 text-amber-400"
                                : "text-gray-300"
                            }`}
                          />
                        ))}
                      </div>
                      {userReview.verified && (
                        <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium">
                          <Check className="w-3 h-3" /> Verified
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-900">{userReview.title}</p>
                  </div>
                </div>
                {userReview.comment && (
                  <p className="text-sm text-gray-700">{userReview.comment}</p>
                )}
                {userReview.images && userReview.images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {userReview.images.map((imgUrl, idx) => (
                      <img
                        key={idx}
                        src={imgUrl}
                        alt={`Your review photo ${idx + 1}`}
                        className="w-full aspect-square object-cover rounded-lg border border-gray-200"
                        onError={(e) => {
                          e.currentTarget.src = "/fallback-product.webp";
                        }}
                      />
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setShowForm(true)}
                  className="text-sm font-medium text-brand-teal hover:text-brand-teal/80 transition-colors"
                >
                  Edit your review
                </button>
              </div>
            </div>
          )}

          {/* Review Form (Add or Edit) */}
          {showForm && (
            <div className="py-5 border-b border-gray-100">
              <ReviewForm
                productSlug={productSlug}
                existingReview={userReview}
                onSuccess={handleReviewSuccess}
                onCancel={() => setShowForm(false)}
              />
            </div>
          )}

          {/* Add Review Button */}
          {!userReview && !showForm && (
            <div className="py-5 border-b border-gray-100">
              <button
                onClick={() => setShowForm(true)}
                className="w-full flex items-center justify-center gap-2 bg-brand-teal/10 text-brand-teal hover:bg-brand-teal/20 font-medium py-2.5 rounded-lg transition-colors border border-brand-teal/30"
              >
                <Star className="w-4 h-4" /> Share Your Review
              </button>
            </div>
          )}

      </div>
    </div>
  );
}
