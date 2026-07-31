-- =============================================================================
-- Migration: product_reviews per-variant (sku)
-- Created:   2026-06-23
-- Purpose:   Reviews were keyed by product_slug only, so all colour variants of a
--            product shared one review (and one "reviewed/pending" state). We now
--            key a review by (product_slug, sku) so each colour variant is
--            reviewed separately — on the Orders sidebar and on the PDP.
--
-- Adds a `sku` column (the variant SKU the review is for; '' = legacy
-- product-level review), and swaps the per-(user, slug) uniqueness for
-- per-(user, slug, sku). Idempotent — safe to re-run.
-- =============================================================================

ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS sku TEXT NOT NULL DEFAULT '';

-- One review per (user, product, variant). Replaces uq_product_reviews_user_slug,
-- which allowed only one review per product across all variants.
DROP INDEX IF EXISTS public.uq_product_reviews_user_slug;
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_reviews_user_slug_sku
  ON public.product_reviews (user_id, product_slug, sku)
  WHERE user_id IS NOT NULL;

-- PDP groups by (slug, sku) to show the current variant's reviews first.
CREATE INDEX IF NOT EXISTS idx_product_reviews_slug_sku_created
  ON public.product_reviews (product_slug, sku, created_at DESC);
