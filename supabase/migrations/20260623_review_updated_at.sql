-- =============================================================================
-- Migration: product_reviews.updated_at
-- Created:   2026-06-23
-- Purpose:   Track when a review was last written OR edited, so the Orders page
--            "Recently Reviewed Products" panel (getUserReviews) can order by the
--            most recent activity. created_at alone never moves when a review is
--            edited, so an updated review would wrongly stay at its original spot.
--
-- Adds updated_at (defaults to created_at for existing rows), a trigger to bump
-- it on every UPDATE, and an index for the per-user "newest activity" ordering.
-- Idempotent — safe to re-run.
-- =============================================================================

ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill existing rows so the column is meaningful from day one.
UPDATE public.product_reviews
  SET updated_at = created_at
  WHERE updated_at IS DISTINCT FROM created_at AND created_at IS NOT NULL;

-- Bump updated_at on every row update. SECURITY INVOKER is fine here (no role
-- checks), unlike the verified-lock trigger.
CREATE OR REPLACE FUNCTION public.touch_review_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_review_updated_at ON public.product_reviews;
CREATE TRIGGER trg_touch_review_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_review_updated_at();

-- Hot path: getUserReviews → WHERE user_id = ? ORDER BY updated_at DESC
CREATE INDEX IF NOT EXISTS idx_product_reviews_user_updated
  ON public.product_reviews (user_id, updated_at DESC);
