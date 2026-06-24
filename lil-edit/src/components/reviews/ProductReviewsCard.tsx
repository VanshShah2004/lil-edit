import { useEffect, useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import ReviewForm from "./ReviewForm";
import ReviewsList from "./ReviewsList";
import { fetchReviewsForProduct, getUserReviewForProduct, type Review, type ReviewsData } from "@/lib/reviewsApi";

interface ProductReviewsCardProps {
  productSlug: string;
  sku: string;
  categorySlug: string;
  title: string;
}

export default function ProductReviewsCard({
  productSlug,
  sku,
  categorySlug,
  title,
}: ProductReviewsCardProps) {
  const [reviewsData, setReviewsData] = useState<ReviewsData | null>(null);
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        console.log(`[ProductReviewsCard] fetching reviews  sku=${sku}`);
        const data = await fetchReviewsForProduct([sku]);
        if (!cancelled) setReviewsData(data);

        const userRev = await getUserReviewForProduct(productSlug, sku);
        if (!cancelled) setUserReview(userRev);
      } catch (err) {
        console.error("[ProductReviewsCard] fetch error", err);
        if (!cancelled) setReviewsData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [productSlug, sku]);

  const handleReviewSuccess = (review: Review) => {
    setUserReview(review);
    setShowForm(false);
    if (reviewsData) {
      const updatedReviews = [review, ...reviewsData.reviews.filter(r => r.id !== review.id)];
      const newTotal = userReview ? reviewsData.totalReviews : reviewsData.totalReviews + 1;
      const newSum = updatedReviews.reduce((sum, r) => sum + r.rating, 0);
      setReviewsData({
        ...reviewsData,
        totalReviews: newTotal,
        averageRating: Math.round((newSum / newTotal) * 10) / 10,
        reviews: updatedReviews,
      });
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-brand-teal" />
        Customer Reviews
      </h3>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : !reviewsData ? (
        <p className="text-sm text-gray-500">Could not load reviews</p>
      ) : (
        <div className="space-y-4">
          {/* User's review or form */}
          {userReview && !showForm ? (
            <div className="bg-brand-teal/5 border border-brand-teal/20 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex gap-0.5 mb-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className={`text-sm ${
                          star <= userReview.rating
                            ? "text-amber-400"
                            : "text-gray-300"
                        }`}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  <p className="font-semibold text-sm text-gray-900">{userReview.title}</p>
                </div>
                {userReview.verified && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-medium shrink-0">
                    ✓ Verified
                  </span>
                )}
              </div>
              {userReview.comment && (
                <p className="text-xs text-gray-600">{userReview.comment}</p>
              )}
              {userReview.images && userReview.images.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5">
                  {userReview.images.map((imgUrl, idx) => (
                    <img
                      key={idx}
                      src={imgUrl}
                      alt={`Review photo ${idx + 1}`}
                      className="w-full aspect-square object-cover rounded border border-gray-200"
                      onError={(e) => {
                        e.currentTarget.src = "/fallback-product.webp";
                      }}
                    />
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowForm(true)}
                className="text-xs font-medium text-brand-teal hover:underline"
              >
                Edit review
              </button>
            </div>
          ) : showForm && userReview ? (
            <ReviewForm
              productSlug={productSlug}
              sku={sku}
              existingReview={userReview}
              onSuccess={handleReviewSuccess}
              onCancel={() => setShowForm(false)}
              compact
            />
          ) : showForm ? (
            <ReviewForm
              productSlug={productSlug}
              sku={sku}
              onSuccess={handleReviewSuccess}
              onCancel={() => setShowForm(false)}
              compact
            />
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full bg-white border border-gray-300 text-gray-900 font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              + Add your review
            </button>
          )}

          {/* Reviews summary and list */}
          <ReviewsList
            reviews={reviewsData.reviews}
            totalReviews={reviewsData.totalReviews}
            averageRating={reviewsData.averageRating}
            distribution={reviewsData.distribution}
            compact
          />
        </div>
      )}
    </div>
  );
}
