import { getBackendBaseUrl } from "@/lib/backend";
import type { SearchProduct } from "@/services/searchService";

// A category listing card: ONE COLOURWAY of one product. A kurta cut in three
// colours arrives as three of these, each with its own sku, photograph, colour
// and stock — the same unit the search results page uses.
//
// Fields beyond the search card are what a category browse needs and a search
// result doesn't: createdAt, and the attributes the filter panel reads back so an
// active chip can be labelled off the product itself.
export interface CategoryProduct extends SearchProduct {
  createdAt: string;
  occasion: string;
  gender: string;
  sizes: string[];
  /** Whole percent off, 0 when undiscounted. */
  discountPct: number;
  isTrending?: boolean;
}

/** One filterable value, with how many products in the whole category carry it. */
export interface FacetValue {
  /** Wire value — lowercased, what the query string carries. */
  value: string;
  /** Spelled as it is on the product, for labels. */
  label: string;
  count: number;
}

export interface ColorFacetValue extends FacetValue {
  hex: string;
}

/**
 * Age bands are ordered and continuous, so the page gives them their own rail;
 * garment letters and one-offs ("Free Size") are an unordered set and stay in the
 * drawer. The backend classifies them so both ends agree on what an age is.
 */
export type SizeKind = "age" | "garment" | "other";

export interface SizeFacetValue extends FacetValue {
  kind: SizeKind;
}

/**
 * Every filter this category can offer. Counted over the WHOLE category, not the
 * filtered view, so options hold still (and keep their counts) while the panel is
 * being used. An empty list means the category has nothing to filter on there and
 * the group is not rendered at all.
 */
export interface CategoryFacets {
  genders: FacetValue[];
  occasions: FacetValue[];
  tags: FacetValue[];
  sizes: SizeFacetValue[];
  colors: ColorFacetValue[];
  badges: FacetValue[];
  priceBuckets: FacetValue[];
  onSale: number;
  inStock: number;
  /** Cheapest piece in the category — the placard's "from" price. 0 when empty. */
  priceFrom: number;
}

export const EMPTY_FACETS: CategoryFacets = {
  genders: [], occasions: [], tags: [], sizes: [], colors: [], badges: [], priceBuckets: [],
  onSale: 0, inStock: 0, priceFrom: 0,
};

export type CategorySort = "newest" | "price-asc" | "price-desc" | "discount";

/** The listing's filter + sort state. Every list holds lowercased facet values. */
export interface CategoryFilters {
  sort: CategorySort;
  genders: string[];
  occasions: string[];
  tags: string[];
  sizes: string[];
  colors: string[];
  badges: string[];
  priceBuckets: string[];
  onSale: boolean;
  inStockOnly: boolean;
}

export const EMPTY_FILTERS: CategoryFilters = {
  sort: "newest",
  genders: [], occasions: [], tags: [], sizes: [], colors: [], badges: [], priceBuckets: [],
  onSale: false, inStockOnly: false,
};

/** How many pieces are actually selected — the badge on the Filters button. */
export function activeFilterCount(f: CategoryFilters): number {
  return (
    f.genders.length + f.occasions.length + f.tags.length + f.sizes.length +
    f.colors.length + f.badges.length + f.priceBuckets.length +
    (f.onSale ? 1 : 0) + (f.inStockOnly ? 1 : 0)
  );
}

export interface CategoryListing {
  slug: string;
  /** The whole category, before any filter — what the placard prints. */
  total: number;
  /** What survives the filters, before the page window — what the toolbar counts. */
  matched: number;
  /** Where this window starts, echoed back so a late response can be placed correctly. */
  offset: number;
  /** Whether another page can be loaded after this one. */
  hasMore: boolean;
  products: CategoryProduct[];
  facets: CategoryFacets;
}

/** How many published colourways each category holds, keyed by category slug. */
export type CategoryCounts = Record<string, number>;

/**
 * Every category's size in one request — what the "More categories" tiles at the
 * foot of a listing print, so a tile says how much is behind it rather than only
 * where it goes.
 *
 * Degrades to an empty object on any failure: the tiles are a navigation aid, and
 * one that renders without its counts is far better than a page that doesn't.
 */
export async function fetchCategoryCounts(signal?: AbortSignal): Promise<CategoryCounts> {
  const url = `${getBackendBaseUrl()}/api/products/category-counts`;
  console.log("[categoryService] GET", url);

  const res = await fetch(url, { signal });
  console.log("[categoryService] GET", url, "→", res.status);

  if (!res.ok) {
    console.error("[categoryService] category-counts error:", res.status);
    return {};
  }

  const data = (await res.json()) as { counts?: CategoryCounts };
  console.log("[categoryService] category-counts →", data.counts);
  return data.counts ?? {};
}

/** The listing's filters as URL query params, omitting anything at its default. */
function toQuery(filters: CategoryFilters, limit: number, offset: number): string {
  const p = new URLSearchParams();
  p.set("limit", String(limit));
  if (offset) p.set("offset", String(offset));
  if (filters.sort !== "newest") p.set("sort", filters.sort);

  const lists: Array<[string, string[]]> = [
    ["gender", filters.genders],
    ["occasion", filters.occasions],
    ["tag", filters.tags],
    ["size", filters.sizes],
    ["color", filters.colors],
    ["badge", filters.badges],
    ["price", filters.priceBuckets],
  ];
  for (const [key, values] of lists) if (values.length) p.set(key, values.join(","));

  if (filters.onSale) p.set("sale", "1");
  if (filters.inStockOnly) p.set("stock", "1");
  return p.toString();
}

/**
 * One page of a category's products.
 *
 * Categories are the product taxonomy (every product carries exactly one), so
 * this deliberately does NOT go through the collections/new-arrivals endpoints —
 * a category page is a permanent browse rather than a curated or derived view.
 *
 * Filtering, sorting and paging are all the server's: the page only ever holds a
 * window of the category, and sorting a window locally would make "Price: Low to
 * High" mean "cheapest of the 24 already downloaded". Facets ride along on every
 * response, so the filter panel is always described by the same request that
 * fills the grid.
 *
 * An unknown slug 404s server-side; that degrades to an empty listing here so the
 * page renders its empty state instead of throwing.
 */
export async function fetchCategoryProducts(
  slug: string,
  filters: CategoryFilters = EMPTY_FILTERS,
  signal?: AbortSignal,
  limit = 24,
  offset = 0,
): Promise<CategoryListing> {
  const url = `${getBackendBaseUrl()}/api/products/category/${encodeURIComponent(slug)}?${toQuery(filters, limit, offset)}`;
  console.log("[categoryService] GET", url);

  const res = await fetch(url, { signal });
  console.log("[categoryService] GET", url, "→", res.status);

  if (!res.ok) {
    console.error("[categoryService] category error:", res.status, "for slug:", slug);
    return { slug, total: 0, matched: 0, offset, hasMore: false, products: [], facets: EMPTY_FACETS };
  }

  const data = (await res.json()) as Partial<CategoryListing>;
  console.log(
    "[categoryService] category →", data.products?.length ?? 0,
    "rows  matched:", data.matched ?? 0, " total:", data.total ?? 0, " for:", slug,
  );

  return {
    slug,
    total: data.total ?? 0,
    matched: data.matched ?? 0,
    offset: data.offset ?? offset,
    hasMore: data.hasMore ?? false,
    products: data.products ?? [],
    // Facets come back null on the error paths; the panel then simply has nothing
    // to offer rather than the page failing to render.
    facets: data.facets ?? EMPTY_FACETS,
  };
}
