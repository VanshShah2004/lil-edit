// Loose row shapes for Supabase catalog query results.
//
// The Supabase client infers types from the literal select strings, which makes
// those inferred types awkward to name and reuse across the route/mapper code
// (and they don't carry the embedded relation rows in a convenient shape). These
// interfaces describe the columns the catalog code actually reads, so the mapper
// functions can be typed without falling back to `any`. Fields are optional/
// nullable to mirror the database, where most columns are nullable.

export interface VariantRow {
  id?: string;
  variant_sku: string;
  color_name?: string | null;
  color_hex?: string | null;
  stock?: number | null;
  is_unlimited?: boolean | null;
  sort_order?: number;
}

export interface ImageRow {
  id?: string;
  image_url: string;
  is_primary?: boolean | null;
  sort_order?: number;
  variant_id?: string | null;
}

export interface ProductRow {
  title?: string;
  slug?: string;
  category_slug?: string;
  brand?: string | null;
  base_sku?: string;
  category?: string | null;
  gender?: string | null;
  price?: number;
  original_price?: number | null;
  tags?: string[] | null;
  badges?: string[] | null;
  description_points?: string[] | null;
  fabric?: string | null;
  fit?: string | null;
  occasion?: string | null;
  care_instructions?: string | null;
  size_chart_id?: string | null;
  /** Embedded sizing chart (PDP select only) via the size_chart_id FK. */
  size_charts?: { id: string; name: string; rows: unknown[] } | null;
  sizes?: string[] | null;
  is_featured?: boolean | null;
  is_new_arrival?: boolean | null;
  is_bestseller?: boolean | null;
  is_trending?: boolean | null;
  is_unlimited?: boolean | null;
  product_images?: ImageRow[];
  product_variants?: VariantRow[];
  draft_product_images?: ImageRow[];
  draft_product_variants?: VariantRow[];
}
