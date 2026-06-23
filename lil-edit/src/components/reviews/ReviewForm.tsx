import { useState } from "react";
import { Star, X, Loader2, Upload, Trash2 } from "lucide-react";
import { createReview, updateReview, type CreateReviewInput, type UpdateReviewInput, type Review } from "@/lib/reviewsApi";
import { uploadReviewImage, createImagePreview, revokeImagePreview, type UploadedImage } from "@/lib/imageUpload";
import { useAuth } from "@/contexts/AuthContext";

interface ReviewFormProps {
  productSlug: string;
  // Variant SKU the review is for. Reviews are keyed per (productSlug, sku);
  // defaults to '' for legacy product-level callers.
  sku?: string;
  userName?: string;
  existingReview?: Review | null;
  onSuccess?: (review: Review) => void;
  onCancel?: () => void;
  compact?: boolean;
}

export default function ReviewForm({
  productSlug,
  sku = "",
  userName,
  existingReview,
  onSuccess,
  onCancel,
  compact = false,
}: ReviewFormProps) {
  const { user } = useAuth();
  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState(existingReview?.comment ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<UploadedImage[]>(
    existingReview?.images?.map((url) => ({ file: new File([], ""), preview: url, url })) ?? []
  );
  const [uploadingImages, setUploadingImages] = useState(false);

  const isEditing = !!existingReview;
  const displayRating = hoverRating || rating;
  const canAddMoreImages = images.length < 3;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newImages: UploadedImage[] = [];
    for (const file of files) {
      if (images.length + newImages.length >= 3) {
        setError("Maximum 3 images allowed");
        break;
      }

      const preview = createImagePreview(file);
      newImages.push({
        file,
        preview,
        uploading: true,
      });
    }

    setImages((prev) => [...prev, ...newImages]);
    setError(null);

    // Reset input
    e.target.value = "";
  };

  const handleRemoveImage = (index: number) => {
    const image = images[index];
    if (image.preview.startsWith("blob:")) {
      revokeImagePreview(image.preview);
    }
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) {
      setError("Please select a rating");
      return;
    }

    setLoading(true);
    setUploadingImages(true);
    setError(null);

    try {
      // Upload new images (those with blob: preview)
      const imageUrls: string[] = [];
      for (const img of images) {
        if (img.url) {
          // Already uploaded from existing review
          imageUrls.push(img.url);
        } else if (img.preview.startsWith("blob:") && user?.id) {
          // New image to upload
          try {
            const url = await uploadReviewImage(user.id, productSlug, img.file);
            imageUrls.push(url);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to upload image");
            return;
          }
        }
      }

      let review: Review | null;
      if (isEditing) {
        review = await updateReview(productSlug, sku, {
          rating,
          comment,
          images: imageUrls,
        } as UpdateReviewInput);
      } else {
        review = await createReview({
          productSlug,
          sku,
          rating,
          comment,
          images: imageUrls,
        } as CreateReviewInput);
      }

      if (review) {
        // Revoke blob URLs
        images.forEach((img) => {
          if (img.preview.startsWith("blob:")) {
            revokeImagePreview(img.preview);
          }
        });
        onSuccess?.(review);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save review");
      console.error("[ReviewForm] submit error", err);
    } finally {
      setLoading(false);
      setUploadingImages(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`bg-white rounded-lg border border-gray-200 p-4 space-y-4 ${
        compact ? "text-sm" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className={`font-semibold text-gray-900 ${compact ? "text-sm" : "text-base"}`}>
          {isEditing ? "Edit your review" : "Write a review"}
        </h3>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Rating stars */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            className="transition-colors"
          >
            <Star
              className={`w-6 h-6 ${
                star <= displayRating
                  ? "fill-amber-400 text-amber-400"
                  : "text-gray-300"
              }`}
            />
          </button>
        ))}
        {rating > 0 && (
          <span className={`ml-2 text-amber-600 font-medium ${compact ? "text-xs" : "text-sm"}`}>
            {rating} star{rating !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Comment */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Your review
        </label>
        <textarea
          maxLength={200}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your thoughts about this product"
          rows={compact ? 2 : 3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/50 resize-none"
        />
        <p className="text-xs text-gray-400 mt-1">{comment.length}/200</p>
      </div>

      {/* Images */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">
          Upload Photos ({images.length}/3)
        </label>

        {/* Image previews */}
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {images.map((img, idx) => (
              <div key={idx} className="relative group">
                <img
                  src={img.preview}
                  alt={`Review image ${idx + 1}`}
                  className="w-full aspect-square object-cover rounded-lg border border-gray-200"
                />
                {(img.uploading || uploadingImages) && (
                  <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  </div>
                )}
                {!uploadingImages && (
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute -top-2 -right-2 bg-rose-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* File input */}
        {canAddMoreImages && (
          <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand-teal/50 hover:bg-brand-teal/5 transition-colors">
            <Upload className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-600">Upload Photo</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={uploadingImages || loading}
              className="hidden"
            />
          </label>
        )}

        {images.length > 0 && images.length < 3 && (
          <p className="text-xs text-gray-500 mt-1">You can add {3 - images.length} more photo{3 - images.length !== 1 ? "s" : ""}</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}

      {/* Verified badge info */}
      {isEditing && existingReview?.verified && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">
          <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full" />
          Verified purchase
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={loading || uploadingImages}
          className="flex-1 bg-brand-teal text-white font-medium py-2 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {(loading || uploadingImages) && <Loader2 className="w-4 h-4 animate-spin" />}
          {uploadingImages ? "Uploading images..." : isEditing ? "Update review" : "Post review"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading || uploadingImages}
            className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
