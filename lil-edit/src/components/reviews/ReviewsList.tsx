import { Star, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const images: string[] = review.images ?? [];

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
      {/* Thumbnail strip */}
      {images.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
          {images.map((imgUrl, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setLightboxIndex(idx)}
              className="w-14 h-14 shrink-0 rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity"
            >
              <img
                src={imgUrl}
                alt={`Review photo ${idx + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = "/fallback-product.webp";
                }}
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((lightboxIndex - 1 + images.length) % images.length);
              }}
              className="absolute left-4 text-white/80 hover:text-white"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}
          <img
            src={images[lightboxIndex]}
            alt={`Review photo ${lightboxIndex + 1}`}
            className="max-w-full max-h-full object-contain rounded"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              e.currentTarget.src = "/fallback-product.webp";
            }}
          />
          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((lightboxIndex + 1) % images.length);
              }}
              className="absolute right-4 text-white/80 hover:text-white"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
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
