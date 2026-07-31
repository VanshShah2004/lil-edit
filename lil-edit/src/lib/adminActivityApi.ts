import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

export type ActivityType =
  | "cart_add"
  | "wishlist_add"
  | "order_placed"
  | "review_submitted"
  | "search";

export interface ActivityUser {
  id: string;
  name: string;
  email: string;
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  productSlug: string | null;
  sku: string | null;
  // Type-specific extras — shape depends on `type` (see the backend trigger
  // functions / logActivity). Read defensively in the UI.
  metadata: Record<string, unknown>;
  createdAt: string;
  // Null for anonymous activity (e.g. a guest search).
  user: ActivityUser | null;
}

export interface ActivityResponse {
  activity: ActivityItem[];
  // Cursor for the next (older) page — pass as `before`. Null when there are no
  // more rows.
  nextCursor: string | null;
}

export interface ActivityQuery {
  limit?: number;
  type?: ActivityType;
  before?: string;
}

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  console.log("[adminActivityApi] token:", session?.access_token ? "present" : "missing");
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[adminActivityApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[adminActivityApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

export async function fetchActivity(query: ActivityQuery = {}): Promise<ActivityResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(query.limit ?? 50));
  if (query.type) params.set("type", query.type);
  if (query.before) params.set("before", query.before);

  const res = await authFetch(`/api/admin/activity?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[adminActivityApi] fetchActivity error:", body);
    throw new Error((body as { error?: string }).error ?? `Activity fetch failed (${res.status})`);
  }
  const data = (await res.json()) as ActivityResponse;
  console.log("[adminActivityApi] fetchActivity →", data.activity?.length ?? 0, "items");
  return data;
}
