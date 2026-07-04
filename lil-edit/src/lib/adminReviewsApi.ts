import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

export interface AdminReview {
  id: string;
  productSlug: string;
  sku: string;
  userName: string;
  rating: number;
  comment: string;
  verified: boolean;
  images: string[];
  createdAt: string;
}

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[adminReviewsApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[adminReviewsApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? `${fallback} (${res.status})`);
}

function mapReview(row: any): AdminReview {
  return {
    id: row.id,
    productSlug: row.product_slug,
    sku: row.sku || "",
    userName: row.user_name || "Anonymous",
    rating: row.rating,
    comment: row.comment,
    verified: row.verified,
    images: row.images || [],
    createdAt: row.created_at,
  };
}

export async function fetchAllReviews(): Promise<AdminReview[]> {
  const res = await authFetch(`/api/admin/reviews`);
  if (!res.ok) throw await errorFrom(res, "Could not load reviews");
  const data = (await res.json()) as { reviews: any[] };
  return (data.reviews ?? []).map(mapReview);
}

export async function setReviewVerified(id: string, verified: boolean): Promise<AdminReview> {
  const res = await authFetch(`/api/admin/reviews/${id}/verify`, {
    method: "PATCH",
    body: JSON.stringify({ verified }),
  });
  if (!res.ok) throw await errorFrom(res, "Could not update review");
  const data = (await res.json()) as { review: any };
  return mapReview(data.review);
}

export async function deleteAdminReview(id: string): Promise<void> {
  const res = await authFetch(`/api/admin/reviews/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw await errorFrom(res, "Could not delete review");
}
