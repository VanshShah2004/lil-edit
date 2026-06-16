import { Star, Check, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Review } from "@/lib/reviewsApi";

interface ReviewsListProps {
  reviews: Review[];
  totalReviews: number;
  averageRating: number;
  distribution: { stars: number; count: number }[];
  compact?: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function ReviewCard({ review }: { review: any }) {
  const [expandedImages, setExpandedImages] = useState(false);

  return (
    <div className="pt-4 first:pt-0">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
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
            {review.verified && (
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-xs font-medium">
                <Check className="w-3 h-3" /> Verified
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-900 text-sm">{review.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            by {review.userName} • {formatDate(review.createdAt)}
          </p>
        </div>
      </div>
      {review.comment && (
        <p className="text-sm text-gray-700 leading-relaxed mb-2">{review.comment}</p>
      )}
      {/* Images */}
      {review.images && review.images.length > 0 && (
        <div className="mt-2 space-y-2">
          {!expandedImages ? (
            <button
              onClick={() => setExpandedImages(true)}
              className="inline-flex items-center gap-2 text-xs font-medium text-brand-teal hover:underline"
            >
              View {review.images.length} photo{review.images.length !== 1 ? "s" : ""}
              <ChevronRight className="w-3 h-3" />
            </button>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {review.images.map((imgUrl: string, idx: number) => (
                <img
                  key={idx}
                  src={imgUrl}
                  alt={`Review photo ${idx + 1}`}
                  className="w-full aspect-square object-cover rounded border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
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
  );
}

export default function ReviewsList({
  reviews,
  totalReviews,
  averageRating,
  distribution,
  compact = false,
}: ReviewsListProps) {
  if (totalReviews === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 text-sm">No reviews yet. Be the first to review!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Rating summary */}
      <div className={`space-y-3 ${compact ? "pb-4 border-b border-gray-200" : ""}`}>
        <div className="flex items-baseline gap-2">
          <span className={`font-bold ${compact ? "text-2xl" : "text-3xl"}`}>
            {averageRating.toFixed(1)}
          </span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-4 h-4 ${
                  star <= Math.round(averageRating)
                    ? "fill-amber-400 text-amber-400"
                    : "text-gray-300"
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500 ml-2">{totalReviews} review{totalReviews !== 1 ? "s" : ""}</span>
        </div>

        {/* Distribution bars */}
        <div className="space-y-2">
          {distribution.map(({ stars, count }) => {
            const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
            return (
              <div key={stars} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-12">{stars}★</span>
                <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-amber-400 h-full transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-8 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Individual reviews */}
      {!compact && (
        <div className="space-y-4 divide-y divide-gray-200">
          {reviews.slice(0, 5).map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}

      {/* "See all reviews" link */}
      {!compact && reviews.length > 5 && (
        <button className="text-sm font-medium text-brand-teal hover:underline">
          See all {reviews.length} reviews
        </button>
      )}
    </div>
  );
}
