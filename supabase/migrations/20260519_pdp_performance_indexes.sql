-- =============================================================================
-- Migration: PDP Performance Indexes
-- Created:   2026-05-19
-- Purpose:   Reduce DB query latency for /api/products/detail and
--            /api/products/recommendations by adding targeted indexes on
--            the hot query paths identified in persistCatalog.ts.
--
-- Affected query functions (all in backend/lib/persistCatalog.ts):
--   • fetchProductBySlugAndSku()      — WHERE products.slug = ?
--   • fetchRecommendedProducts() Q1   — WHERE category_slug = ? AND slug != ?  LIMIT 5
--   • fetchRecommendedProducts() Q2   — WHERE slug != ?  LIMIT 10  (padding)
--   • deleteProductFromDatabase()     — WHERE product_images/product_variants.product_id = ?
--   • fetchFilteredProducts()         — ORDER BY products.updated_at DESC
--
-- Safety notes:
--   • All indexes use CREATE INDEX IF NOT EXISTS — idempotent, safe to re-run.
--   • No application logic, API contracts, or table schema is changed.
--   • B-Tree indexes do not break INSERT / UPDATE / DELETE; they add a small
--     write overhead (~1–3 µs per row) which is negligible for this catalog size.
--   • Supabase (PostgreSQL 15) fully supports all syntax used here.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: products  (published catalog — the PDP hot path)
-- ─────────────────────────────────────────────────────────────────────────────

-- INDEX 1: products.slug (unique lookup)
-- Query:    fetchProductBySlugAndSku  →  .eq("slug", slug)
-- Pattern:  WHERE slug = $1
-- Benefit:  Converts a sequential scan of the entire products table into a
--           single B-Tree lookup.  Expected cost: O(1) vs O(n).
-- Note:     slug is already unique per launchProductToDatabase (DELETE + INSERT
--           ensures one row per slug), but no UNIQUE index is declared in code.
--           We create a plain index (not UNIQUE constraint) so it mirrors what
--           Supabase already enforces at the application layer.  A UNIQUE index
--           would also work but is a stronger guarantee — flag for DBA review.
CREATE INDEX IF NOT EXISTS idx_products_slug
  ON public.products (slug);


-- INDEX 2: products.category_slug
-- Query:    fetchRecommendedProducts Q1  →  .eq("category_slug", categorySlug).neq("slug", slug)
-- Pattern:  WHERE category_slug = $1 AND slug != $2  LIMIT 5
-- Benefit:  PostgreSQL uses this index to restrict the scan to the matching
--           category rows before evaluating the slug != ? predicate.  Without
--           it the planner must read every row in products to filter by category.
CREATE INDEX IF NOT EXISTS idx_products_category_slug
  ON public.products (category_slug);


-- INDEX 3: products.updated_at  (admin list ordering)
-- Query:    fetchAllProducts / fetchFilteredProducts  →  .order("updated_at", { ascending: false })
-- Pattern:  ORDER BY updated_at DESC
-- Benefit:  Lets PostgreSQL satisfy the ORDER BY with an index scan instead of
--           a sort.  Primarily benefits the admin Manage Products page; included
--           here because the same table is shared.
-- Note:     This is an admin-path index (not PDP critical).  Kept because the
--           write overhead is trivial and the admin list query is otherwise a
--           full-table sort.
CREATE INDEX IF NOT EXISTS idx_products_updated_at
  ON public.products (updated_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: product_variants  (joined to products in every PDP select)
-- ─────────────────────────────────────────────────────────────────────────────

-- INDEX 4: product_variants.product_id  (FK join support)
-- Query:    fetchProductBySlugAndSku / fetchRecommendedProducts — both select
--           product_variants(...) as a nested relation.  Supabase/PostgREST
--           resolves nested selects as a JOIN on product_variants.product_id = products.id.
-- Pattern:  WHERE product_variants.product_id = $1
-- Benefit:  Without this index Postgres does a sequential scan of product_variants
--           filtered by product_id for every product row returned — O(n) per
--           parent row.  With this index it becomes O(log n) per parent row.
-- Note:     PostgreSQL does NOT automatically create indexes on FK columns
--           (unlike MySQL).  This is a very common omission that silently hurts
--           JOIN performance.
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
  ON public.product_variants (product_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: product_images  (joined to products in every PDP select)
-- ─────────────────────────────────────────────────────────────────────────────

-- INDEX 5: product_images.product_id  (FK join support — mirrors index 4)
-- Query:    Same as above — product_images is always fetched alongside variants.
-- Pattern:  WHERE product_images.product_id = $1
-- Benefit:  Same reasoning as idx_product_variants_product_id.  Every PDP
--           response joins this table; without an index it is a sequential scan.
CREATE INDEX IF NOT EXISTS idx_product_images_product_id
  ON public.product_images (product_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: draft_products  (admin paths — write safety / matching indexes)
-- ─────────────────────────────────────────────────────────────────────────────

-- INDEX 6: draft_products.slug
-- Query:    saveDraftToDatabase  →  .delete().eq("slug", slug)
--           launchProductToDatabase  →  .delete().eq("slug", slug) on draft_products
-- Pattern:  WHERE slug = $1  (DELETE path)
-- Benefit:  DELETE by slug without an index is a full table scan.  With catalog
--           growth this becomes increasingly slow during save/launch operations.
CREATE INDEX IF NOT EXISTS idx_draft_products_slug
  ON public.draft_products (slug);


-- INDEX 7: draft_products.updated_at  (admin list ordering — mirrors index 3)
-- Query:    fetchAllProducts / fetchFilteredProducts  →  .order("updated_at", ...)
CREATE INDEX IF NOT EXISTS idx_draft_products_updated_at
  ON public.draft_products (updated_at DESC);


-- INDEX 8: draft_product_variants.product_id  (FK join — mirrors index 4)
-- Query:    fetchAllProducts / fetchFilteredProducts / deleteProductFromDatabase
--           — draft variant deletes also use .eq("product_id", id)
CREATE INDEX IF NOT EXISTS idx_draft_product_variants_product_id
  ON public.draft_product_variants (product_id);


-- INDEX 9: draft_product_images.product_id  (FK join — mirrors index 5)
CREATE INDEX IF NOT EXISTS idx_draft_product_images_product_id
  ON public.draft_product_images (product_id);


-- =============================================================================
-- COMPOSITE INDEX EVALUATION
-- =============================================================================
-- Considered:  (category_slug, status) composite
-- Decision:    NOT created.
-- Reason:      The products table has NO status column — the table itself is
--              the status discriminator (published rows live in "products",
--              drafts live in "draft_products").  There is no WHERE status = ?
--              predicate in any query path.  A composite index would be
--              redundant and wasteful.
--
-- Considered:  (category_slug, slug) composite for fetchRecommendedProducts Q1
-- Decision:    NOT created.
-- Reason:      idx_products_category_slug already allows Postgres to narrow to
--              the category subset cheaply.  The follow-up slug != ? filter is
--              cheap because category subsets are small (a few rows at most).
--              Adding slug as a second column would save negligible work while
--              doubling the index write overhead for every product insert.
-- =============================================================================


-- =============================================================================
-- REDUNDANCY CHECK
-- =============================================================================
-- base_sku UNIQUE constraint:  already added by 20240515_sku_counters.sql via
--   ALTER TABLE products ADD CONSTRAINT unique_product_sku UNIQUE (base_sku).
--   A UNIQUE constraint implicitly creates a B-Tree index.  We do NOT add
--   another index on base_sku.
--
-- products.id (PRIMARY KEY):  Supabase creates a B-Tree index automatically.
--   Not duplicated here.
--
-- product_variants.id, product_images.id:  Same — PK indexes exist.
-- =============================================================================


-- =============================================================================
-- EXPECTED PERFORMANCE IMPACT
-- =============================================================================
-- Before (cold cache, no indexes):
--   Product DB Query    : ~80–200 ms  (sequential scan, small catalog)
--   Recommendation Q1   : ~80–200 ms  (sequential scan on category_slug)
--   Recommendation Q2   : ~80–200 ms  (sequential scan, conditional)
--
-- After (cold cache, indexes applied):
--   Product DB Query    : ~5–15 ms   (B-Tree lookup on slug + FK index joins)
--   Recommendation Q1   : ~5–20 ms   (B-Tree category scan + FK index joins)
--   Recommendation Q2   : ~5–15 ms   (conditional; same FK benefit)
--
-- The 5-minute in-memory TTL cache (detailCache in products.ts) means most
-- real users will hit 0 ms DB cost after the first cold request.  These indexes
-- primarily benefit:
--   1. The first (cold) request per product per server instance.
--   2. Admin paths (manage products list, save/launch) which bypass the cache.
--   3. Scale scenarios where cache eviction is more frequent.
-- =============================================================================


-- =============================================================================
-- EXPLAIN / EXPLAIN ANALYZE SUGGESTIONS
-- =============================================================================
-- Run the following in the Supabase SQL Editor (or psql) to verify index usage
-- after applying this migration.  Replace placeholders with real values.
--
-- Query 1 — fetchProductBySlugAndSku:
--   EXPLAIN ANALYZE
--   SELECT p.*, pv.*, pi.*
--   FROM products p
--   LEFT JOIN product_variants pv ON pv.product_id = p.id
--   LEFT JOIN product_images   pi ON pi.product_id = p.id
--   WHERE p.slug = 'your-product-slug';
--   -- Expected plan: "Index Scan using idx_products_slug on products"
--   --                "Index Scan using idx_product_variants_product_id on product_variants"
--   --                "Index Scan using idx_product_images_product_id on product_images"
--
-- Query 2 — fetchRecommendedProducts Q1:
--   EXPLAIN ANALYZE
--   SELECT p.slug, p.category_slug
--   FROM products p
--   WHERE p.category_slug = 'your-category-slug'
--     AND p.slug != 'your-product-slug'
--   LIMIT 5;
--   -- Expected plan: "Index Scan using idx_products_category_slug on products"
--
-- Query 3 — padding query (Q2):
--   EXPLAIN ANALYZE
--   SELECT p.slug FROM products p
--   WHERE p.slug != 'your-product-slug'
--   LIMIT 10;
--   -- This query has NO filterable predicate — planner will likely do a
--   -- sequential scan with LIMIT (fast due to early termination).
--   -- No index can help a "not equal" only query on a large table, but
--   -- LIMIT 10 keeps cost low regardless.
-- =============================================================================
