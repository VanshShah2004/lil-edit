import { getBackendBaseUrl } from "@/lib/backend";
import { getVisitorId } from "@/lib/track";
import { authHeader } from "@/lib/apiAuth";

export type SuggestionType = "product" | "category" | "occasion" | "tag" | "badge" | "fabric" | "fit" | "color" | "trend" | "keyword";

export interface Suggestion {
  type:         SuggestionType;
  id:           string;
  label:        string;   // display text (product title or metadata value)
  sublabel:     string;   // category for products, type label for metadata
  image:        string;   // only populated for products
  slug:         string;   // only populated for products
  categorySlug: string;   // only populated for products + category metadata
  sku:          string;   // only populated for products
}

export async function fetchSuggestions(q: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const url = `${getBackendBaseUrl()}/api/products/suggestions?q=${encodeURIComponent(q)}`;
  console.log("[searchService] GET", url);

  const res = await fetch(url, { signal });
  console.log("[searchService] GET", url, "→", res.status);

  if (!res.ok) {
    console.error("[searchService] suggestions error:", res.status);
    return [];
  }

  const data = await res.json();
  const valid = new Set<string>(["product", "category", "occasion", "tag", "badge", "fabric", "fit", "color", "trend", "keyword"]);
  const filtered = (data.suggestions ?? []).filter((s: Suggestion) => valid.has(s.type)) as Suggestion[];
  console.log("[searchService] suggestions →", filtered.length, "results for:", q, "(raw:", data.suggestions?.length ?? 0, ")");
  return filtered;
}

export interface SearchProduct {
  id:           string;
  title:        string;
  slug:         string;
  sku:          string;
  category:     string;
  categorySlug: string;
  price:        number;
  originalPrice: number;
  image:        string;
  badges:       string[];
  color:        { name: string; hex: string };
  inStock:      boolean;
}

export interface SearchResultsResponse {
  query:    string;
  count:    number;
  products: SearchProduct[];
}

export async function searchProducts(q: string, signal?: AbortSignal): Promise<SearchResultsResponse> {
  const url = `${getBackendBaseUrl()}/api/products/search?q=${encodeURIComponent(q)}`;
  console.log("[searchService] GET", url);

  // The visitor id lets analytics join a search to its result clicks (search CTR)
  // even for guests — same id the view/heartbeat beacons carry. The auth header
  // (when a session exists) lets the backend attribute the search to the actual
  // shopper instead of always logging it as a guest.
  const res = await fetch(url, {
    signal,
    headers: { "X-Visitor-Id": getVisitorId(), ...(await authHeader()) },
  });
  console.log("[searchService] GET", url, "→", res.status);

  if (!res.ok) {
    console.error("[searchService] search error:", res.status);
    return { query: q, count: 0, products: [] };
  }

  const data = (await res.json()) as SearchResultsResponse;
  console.log("[searchService] search →", data.products?.length ?? 0, "results for:", q);
  return { query: data.query ?? q, count: data.count ?? 0, products: data.products ?? [] };
}

export interface NewArrivalProduct extends SearchProduct {
  createdAt: string;
  occasion?: string;
  isTrending?: boolean;
}

export async function fetchNewArrivals(
  limit = 48,
  signal?: AbortSignal,
  gender?: "girls" | "boys",
  trending?: boolean,
): Promise<NewArrivalProduct[]> {
  const url = `${getBackendBaseUrl()}/api/products/new-arrivals?limit=${limit}${gender ? `&gender=${gender}` : ""}${trending ? "&trending=1" : ""}`;
  console.log("[searchService] GET", url);

  const res = await fetch(url, { signal });
  console.log("[searchService] GET", url, "→", res.status);

  if (!res.ok) {
    console.error("[searchService] new-arrivals error:", res.status);
    return [];
  }

  const data = (await res.json()) as { count: number; products: NewArrivalProduct[] };
  console.log("[searchService] new-arrivals →", data.products?.length ?? 0, "products");
  return data.products ?? [];
}
