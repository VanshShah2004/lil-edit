-- =============================================================================
-- Migration: Product Reviews / Ratings
-- Created:   2026-06-02
-- Purpose:   Replace the hard-coded mock reviews payload (buildMockReviewsData
--            in backend/routes/products.ts) with a real, per-product reviews
--            table feeding GET /api/products/reviews.
--
-- ── Association design (important) ───────────────────────────────────────────
-- Reviews are associated to a product by its SLUG (a stable, UNIQUE business
-- key — see products_slug_unique in lil_edit_product_catalog.sql), stored in a
-- plain indexed TEXT column with NO foreign key.
--
-- Why no FK to products(id) or products(slug)?
--   launch_product_atomic() (20260520_atomic_product_mutations.sql) re-publishes
--   an edited product via  DELETE FROM products WHERE slug = ?  then  INSERT.
--   This regenerates products.id on every edit, so:
--     • A FK to products(id) ON DELETE CASCADE would DELETE every review each
--       time an admin edits the product.
--     • A FK to products(slug) ON DELETE CASCADE would do the same on every edit.
--     • A FK with RESTRICT/NO ACTION would make the launch DELETE fail outright,
--       breaking product edits.
--   Associating by slug with no cascading FK is therefore the correct design:
--   reviews survive product edits/re-launches (editing a product must not erase
--   its customer reviews) and remain matched by the same slug the PDP requests.
--
--   True product deletion leaves reviews orphaned but harmless (no PDP renders
--   them). See the commented cleanup hook at the bottom if you later want
--   delete_product_atomic to also purge reviews on a genuine PUBLISHED delete.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.product_reviews (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug  TEXT        NOT NULL,
  -- Author. user_id is nullable so the row survives account deletion (the
  -- displayed name is denormalized into user_name and kept regardless).
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name     TEXT        NOT NULL,
  rating        SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title         TEXT        NOT NULL DEFAULT '',
  comment       TEXT        NOT NULL DEFAULT '',
  -- "Verified purchase" badge shown next to the reviewer name.
  verified      BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Optional reviewer-uploaded image URLs.
  images        TEXT[]      NOT NULL DEFAULT '{}'::text[],
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot path: GET /api/products/reviews → WHERE product_slug = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_product_reviews_slug_created
  ON public.product_reviews (product_slug, created_at DESC);

-- One review per (user, product) — a logged-in user can't spam multiple reviews
-- on the same product. Anonymous/seeded rows (user_id IS NULL) are exempt
-- because NULLs are distinct in a UNIQUE index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_reviews_user_slug
  ON public.product_reviews (user_id, product_slug)
  WHERE user_id IS NOT NULL;

-- ── Row-level security ───────────────────────────────────────────────────────
-- The backend reads/writes via the service-role client, which bypasses RLS.
-- These policies govern any direct (anon/authenticated) client access:
--   • reviews are PUBLICLY readable (anyone viewing a PDP sees them)
--   • a logged-in user may create/update/delete only their OWN review
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews: public read"   ON public.product_reviews;
DROP POLICY IF EXISTS "reviews: insert own"    ON public.product_reviews;
DROP POLICY IF EXISTS "reviews: update own"    ON public.product_reviews;
DROP POLICY IF EXISTS "reviews: delete own"    ON public.product_reviews;

CREATE POLICY "reviews: public read"
  ON public.product_reviews FOR SELECT
  USING (true);

CREATE POLICY "reviews: insert own"
  ON public.product_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reviews: update own"
  ON public.product_reviews FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reviews: delete own"
  ON public.product_reviews FOR DELETE
  USING (auth.uid() = user_id);

-- ── Lock the `verified` flag (system-controlled) ─────────────────────────────
-- The insert/update policies above only check ownership, not which columns
-- change — so without this guard a user could give their own review a fake
-- "Verified purchase" badge (verified=true). `verified` is trust data set by the
-- system after confirming a real purchase; it must not be writable by the
-- reviewer. This trigger forces client roles (anon/authenticated) to
-- verified=false on INSERT and blocks them from changing it on UPDATE, while the
-- service-role backend still sets it freely. Canonical standalone copy:
-- 20260603_review_verified_lock.sql (both idempotent; applying either/both is fine).
CREATE OR REPLACE FUNCTION public.enforce_review_verified_system_only()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY INVOKER (the default) is REQUIRED: the guard relies on current_user
-- reflecting the actual caller.
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.verified := FALSE;
    ELSIF TG_OP = 'UPDATE' AND NEW.verified IS DISTINCT FROM OLD.verified THEN
      RAISE EXCEPTION 'product_reviews.verified is system-controlled'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_review_verified ON public.product_reviews;
CREATE TRIGGER trg_enforce_review_verified
  BEFORE INSERT OR UPDATE ON public.product_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_review_verified_system_only();

-- =============================================================================
-- OPTIONAL FOLLOW-UP (not applied here):
-- To purge reviews when a product is permanently deleted (not merely edited),
-- add this line inside the ELSE branch of delete_product_atomic, after the
-- product row is deleted:
--
--     DELETE FROM product_reviews WHERE product_slug = v_slug;
--
-- It is intentionally omitted now so this migration changes no existing hot
-- path. Orphaned reviews are inert — no PDP exists to render them.
-- =============================================================================
