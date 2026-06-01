import { getBackendBaseUrl } from "@/lib/backend";

export interface Suggestion {
  id: string;
  name: string;
  image: string;
  category: string;
  slug: string;
  categorySlug: string;
  sku: string;
}

/**
 * Fetch auto-suggestions from the backend.
 * Throws on AbortError so callers can distinguish cancellation from real failures.
 * Returns [] on any other network/HTTP error so the UI degrades gracefully.
 */
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
  console.log("[searchService] suggestions →", data.suggestions?.length ?? 0, "results for:", q);
  return (data.suggestions ?? []) as Suggestion[];
}
