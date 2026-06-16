import { supabase } from "@/lib/supabase";

export interface UploadedImage {
  file: File;
  preview: string;
  url?: string;
  uploading?: boolean;
  error?: string;
}

const BUCKET_NAME = "review-images";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadReviewImage(
  userId: string,
  productSlug: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<string> {
  // Validate
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Only JPEG, PNG, and WebP images are allowed");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Image must be less than 5MB");
  }

  // Generate unique path: reviews/{userId}/{productSlug}/{timestamp}-{random}.ext
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const ext = file.name.split(".").pop() || "jpg";
  const path = `reviews/${userId}/${productSlug}/${timestamp}-${random}.${ext}`;

  console.log(`[imageUpload] uploading  file=${file.name}  size=${file.size}  path=${path}`);

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, file, {
      cacheControl: "31536000", // 1 year
      upsert: false,
    });

  if (error) {
    console.error("[imageUpload] upload failed", error);
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path);

  console.log(`[imageUpload] uploaded  url=${urlData.publicUrl}`);
  return urlData.publicUrl;
}

export function createImagePreview(file: File): string {
  return URL.createObjectURL(file);
}

export function revokeImagePreview(preview: string): void {
  URL.revokeObjectURL(preview);
}

export async function deleteReviewImage(imageUrl: string): Promise<void> {
  // Extract path from URL: https://.../{path}
  // URL format: https://{project}.supabase.co/storage/v1/object/public/review-images/{path}
  const match = imageUrl.match(/\/review-images\/(.+)$/);
  if (!match) {
    console.warn("[imageUpload] could not extract path from URL", imageUrl);
    return;
  }

  const path = match[1];
  console.log(`[imageUpload] deleting  path=${path}`);

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([path]);

  if (error) {
    console.error("[imageUpload] delete failed", error);
    throw new Error(`Delete failed: ${error.message}`);
  }

  console.log("[imageUpload] deleted");
}
