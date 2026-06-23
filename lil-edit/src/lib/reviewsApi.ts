import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

export interface Review {
  id: string;
  productSlug: string;
  // Variant SKU the review is for ('' = legacy product-level review). A user can
  // hold one review per (productSlug, sku).
  sku: string;
  userId: string | null;
  userName: string;
  rating: number;
  comment: string;
  verified: boolean;
  images: string[];
  createdAt: string;
}

export interface ReviewsData {
  totalReviews: number;
  averageRating: number;
  distribution: { stars: number; count: number }[];
  reviews: Review[];
}

export interface CreateReviewInput {
  productSlug: string;
  sku: string;
  rating: number;
  comment: string;
  images?: string[];
}

export interface UpdateReviewInput {
  rating?: number;
  comment?: string;
  images?: string[];
}

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function fetchReviewsForProduct(slug: string): Promise<ReviewsData> {
  const url = `${getBackendBaseUrl()}/api/products/reviews?slug=${encodeURIComponent(slug)}`;
  console.log(`[reviewsApi] fetching reviews  ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    console.error("[reviewsApi] fetch failed", res.status);
    return { totalReviews: 0, averageRating: 0, distribution: [], reviews: [] };
  }

  const data = await res.json();
  console.log(`[reviewsApi] fetched  total=${data.reviewsData?.totalReviews ?? 0}`);

  if (!data.reviewsData) {
    return { totalReviews: 0, averageRating: 0, distribution: [], reviews: [] };
  }

  // Map backend format to frontend Review type
  const reviewsData = data.reviewsData;
  const mappedReviews = (reviewsData.reviews || []).map((r: any) => ({
    id: r.id,
    productSlug: slug,
    sku: r.sku || "",
    userId: null,
    userName: r.user || "Anonymous",
    rating: r.rating,
    comment: r.comment,
    verified: r.verified,
    images: r.images || [],
    createdAt: r.date || new Date().toISOString(),
  }));

  return {
    totalReviews: reviewsData.totalReviews,
    averageRating: reviewsData.averageRating,
    distribution: reviewsData.distribution,
    reviews: mappedReviews,
  };
}

export async function createReview(input: CreateReviewInput): Promise<Review | null> {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  console.log(`[reviewsApi] creating review  product=${input.productSlug}  sku=${input.sku}  rating=${input.rating}`);

  const { data, error } = await supabase
    .from("product_reviews")
    .insert({
      product_slug: input.productSlug,
      sku: input.sku,
      user_id: user.id,
      user_name: user.user_metadata?.name || user.email || "Anonymous",
      rating: input.rating,
      comment: input.comment,
      images: input.images || [],
    })
    .select()
    .single();

  if (error) {
    console.error("[reviewsApi] create failed", error);
    throw new Error(error.message);
  }

  console.log("[reviewsApi] created review", data.id);
  return data ? mapReview(data) : null;
}

export async function updateReview(
  productSlug: string,
  sku: string,
  input: UpdateReviewInput,
): Promise<Review | null> {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  console.log(`[reviewsApi] updating review  product=${productSlug}  sku=${sku}`);

  const { data, error } = await supabase
    .from("product_reviews")
    .update({
      ...(input.rating !== undefined && { rating: input.rating }),
      ...(input.comment !== undefined && { comment: input.comment }),
      ...(input.images !== undefined && { images: input.images }),
    })
    .eq("product_slug", productSlug)
    .eq("sku", sku)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    console.error("[reviewsApi] update failed", error);
    throw new Error(error.message);
  }

  console.log("[reviewsApi] updated review");
  return data ? mapReview(data) : null;
}

export async function deleteReview(productSlug: string, sku: string): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  console.log(`[reviewsApi] deleting review  product=${productSlug}  sku=${sku}`);

  const { error } = await supabase
    .from("product_reviews")
    .delete()
    .eq("product_slug", productSlug)
    .eq("sku", sku)
    .eq("user_id", user.id);

  if (error) {
    console.error("[reviewsApi] delete failed", error);
    throw new Error(error.message);
  }

  console.log("[reviewsApi] deleted review");
}

export async function getUserReviewForProduct(productSlug: string, sku: string): Promise<Review | null> {
  const user = await getUser();
  if (!user) return null;

  console.log(`[reviewsApi] fetching user review  product=${productSlug}  sku=${sku}  user=${user.id}`);

  const { data, error } = await supabase
    .from("product_reviews")
    .select("*")
    .eq("product_slug", productSlug)
    .eq("sku", sku)
    .eq("user_id", user.id)
    .single();

  if (error && error.code === "PGRST116") {
    // Not found
    return null;
  }

  if (error) {
    console.error("[reviewsApi] fetch user review failed", error);
    return null;
  }

  return data ? mapReview(data) : null;
}

export async function getUserReviews(): Promise<Review[]> {
  const user = await getUser();
  if (!user) return [];

  console.log(`[reviewsApi] fetching all reviews for user=${user.id}`);

  const { data, error } = await supabase
    .from("product_reviews")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[reviewsApi] fetch user reviews failed", error);
    return [];
  }

  return (data ?? []).map(mapReview);
}

function mapReview(row: any): Review {
  return {
    id: row.id,
    productSlug: row.product_slug,
    sku: row.sku || "",
    userId: row.user_id || null,
    // Handle both direct Supabase (user_name) and backend API (user) responses
    userName: row.user_name || row.user || "Anonymous",
    rating: row.rating,
    comment: row.comment,
    verified: row.verified,
    images: row.images || [],
    // Handle both direct Supabase (created_at) and backend API (date) responses
    createdAt: row.created_at || row.date,
  };
}
