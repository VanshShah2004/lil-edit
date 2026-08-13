import { getBackendBaseUrl } from "@/lib/backend";
import type { SearchProduct } from "@/services/searchService";

// A category listing card. Same shape the search results use, plus createdAt —
// the listing sorts on it, and it's what the backend already sends.
export interface CategoryProduct extends SearchProduct {
  createdAt: string;
}

export interface CategoryListing {
  slug: string;
  /** Size of the whole category, before the request's limit — what the page counts. */
  total: number;
  products: CategoryProduct[];
}

/**
 * One category's products, newest first.
 *
 * Categories are the product taxonomy (every product carries exactly one), so
 * this deliberately does NOT go through the collections/new-arrivals endpoints —
 * a category page is a permanent browse rather than a curated or derived view.
 *
 * An unknown slug 404s server-side; that degrades to an empty listing here so
 * the page renders its empty state instead of throwing.
 */
export async function fetchCategoryProducts(
  slug: string,
  signal?: AbortSignal,
  limit = 48,
): Promise<CategoryListing> {
  const url = `${getBackendBaseUrl()}/api/products/category/${encodeURIComponent(slug)}?limit=${limit}`;
  console.log("[categoryService] GET", url);

  const res = await fetch(url, { signal });
  console.log("[categoryService] GET", url, "→", res.status);

  if (!res.ok) {
    console.error("[categoryService] category error:", res.status, "for slug:", slug);
    return { slug, total: 0, products: [] };
  }

  const data = (await res.json()) as CategoryListing;
  console.log("[categoryService] category →", data.products?.length ?? 0, "of", data.total ?? 0, "for:", slug);
  return { slug, total: data.total ?? 0, products: data.products ?? [] };
}
