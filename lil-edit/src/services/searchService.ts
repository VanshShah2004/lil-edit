import { getBackendBaseUrl } from "@/lib/backend";

export type SuggestionType = "product" | "occasion" | "category";

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
  const valid = new Set<string>(["product", "occasion", "category"]);
  const filtered = (data.suggestions ?? []).filter((s: any) => valid.has(s.type)) as Suggestion[];
  console.log("[searchService] suggestions →", filtered.length, "results for:", q, "(raw:", data.suggestions?.length ?? 0, ")");
  return filtered;
}
