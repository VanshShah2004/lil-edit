import { useEffect, useState } from "react";
import { Loader2, MessageSquare, ChevronRight, Check, Star } from "lucide-react";
import ReviewForm from "./ReviewForm";
import { fetchReviewsForProduct, getUserReviewForProduct, type Review, type ReviewsData } from "@/lib/reviewsApi";

interface CustomerReviewsSectionProps {
  productSlug: string;
  categorySlug: string;
  title: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function ReviewCardItem({ review, isExpanded, onToggleExpand }: { review: Review; isExpanded: boolean; onToggleExpand: () => void }) {
  return (
    <div className="border-b border-gray-200 last:border-0 py-5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-4">
        {/* Reviewer avatar */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-teal to-brand-teal/60 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">
            {(review.userName || "A").charAt(0).toUpperCase()}
          </span>
        </div>

        {/* Review content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* Rating stars */}
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-3.5 h-3.5 ${
                    star <= review.rating
                      ? "fill-amber-400 text-amber-400"
                      : "text-gray-300"
                  }`}
                />
              ))}
            </div>
            {/* Verified badge */}
            {review.verified && (
              <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium ml-1">
                <Check className="w-3 h-3" /> Verified
              </span>
            )}
          </div>

          {/* Title */}
          <p className="font-semibold text-gray-900 text-sm mb-0.5">{review.title}</p>

          {/* Reviewer info */}
          <p className="text-xs text-gray-500 mb-2">
            by {review.userName || "Anonymous"} • {formatDate(review.createdAt)}
          </p>

          {/* Comment */}
          {review.comment && (
            <p className="text-sm text-gray-700 leading-relaxed mb-3">{review.comment}</p>
          )}

          {/* Images */}
          {review.images && review.images.length > 0 && (
            <div className="space-y-2 mt-3">
              {!isExpanded ? (
                <button
                  onClick={onToggleExpand}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-teal hover:text-brand-teal/80 transition-colors"
                >
                  <span>View {review.images.length} photo{review.images.length !== 1 ? "s" : ""}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {review.images.map((imgUrl, idx) => (
                    <img
                      key={idx}
                      src={imgUrl}
                      alt={`Review photo ${idx + 1}`}
                      className="w-full aspect-square object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity cursor-pointer"
                      onError={(e) => {
                        e.currentTarget.src = "/fallback-product.webp";
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomerReviewsSection({
  productSlug,
  categorySlug,
  title,
}: CustomerReviewsSectionProps) {
  const [reviewsData, setReviewsData] = useState<ReviewsData | null>(null);
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedImageReviewId, setExpandedImageReviewId] = useState<string | null>(null);
  const [showAllReviews, setShowAllReviews] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        console.log(`[CustomerReviewsSection] fetching reviews  slug=${productSlug}`);
        const data = await fetchReviewsForProduct(productSlug);
        if (!cancelled) setReviewsData(data);

        const userRev = await getUserReviewForProduct(productSlug);
        if (!cancelled) setUserReview(userRev);
      } catch (err) {
        console.error("[CustomerReviewsSection] fetch error", err);
        if (!cancelled) setReviewsData(null);
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

  const displayedReviews = showAllReviews ? reviewsData?.reviews || [] : (reviewsData?.reviews || []).slice(0, 3);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 sm:px-6 py-5 sm:py-6 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-5 h-5 text-brand-teal" />
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">Customer Reviews</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : !reviewsData || reviewsData.totalReviews === 0 ? (
          <div className="text-center py-6">
            <p className="text-gray-600 mb-4">No reviews yet. Be the first to review this product!</p>
            {!userReview && (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 bg-brand-teal text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-teal/90 transition-colors"
              >
                <Star className="w-4 h-4" /> Write a Review
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Rating Summary */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              {/* Average rating */}
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-gray-900">
                  {reviewsData.averageRating.toFixed(1)}
                </span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${
                        star <= Math.round(reviewsData.averageRating)
                          ? "fill-amber-400 text-amber-400"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-gray-600 ml-2">
                  ({reviewsData.totalReviews} review{reviewsData.totalReviews !== 1 ? "s" : ""})
                </span>
              </div>

              {/* Distribution bars */}
              <div className="flex-1 space-y-1.5">
                {reviewsData.distribution.map(({ stars, count }) => {
                  const percentage = reviewsData.totalReviews > 0 ? (count / reviewsData.totalReviews) * 100 : 0;
                  return (
                    <div key={stars} className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-600 w-8">{stars}★</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-amber-400 h-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-6 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {reviewsData && reviewsData.totalReviews > 0 && (
        <div className="px-5 sm:px-6">
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

          {/* Other Reviews Section */}
          {reviewsData.totalReviews > 0 && (
            <div className="py-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">
                {userReview ? "Other Reviews" : "Top Reviews"}
              </h3>
              <div className="space-y-2">
                {displayedReviews.map((review) => (
                  <ReviewCardItem
                    key={review.id}
                    review={review}
                    isExpanded={expandedImageReviewId === review.id}
                    onToggleExpand={() =>
                      setExpandedImageReviewId(expandedImageReviewId === review.id ? null : review.id)
                    }
                  />
                ))}
              </div>

              {/* Show all reviews button */}
              {!showAllReviews && reviewsData.totalReviews > 3 && (
                <button
                  onClick={() => setShowAllReviews(true)}
                  className="w-full text-sm font-medium text-brand-teal hover:text-brand-teal/80 py-3 transition-colors flex items-center justify-center gap-1"
                >
                  View all {reviewsData.totalReviews} reviews
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
