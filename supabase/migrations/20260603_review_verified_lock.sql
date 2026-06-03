-- =============================================================================
-- Migration: lock product_reviews.verified so it is system-controlled
-- Created:   2026-06-03
--
-- The "reviews: insert own" / "reviews: update own" RLS policies
-- (20260602_product_reviews.sql) only check ownership (auth.uid() = user_id) and
-- place NO restriction on the `verified` column. A logged-in user could therefore
-- give their own review a fake "Verified purchase" badge straight from the
-- browser (the anon key is public, so they can hit PostgREST directly):
--
--     supabase.from('product_reviews')
--       .insert({ product_slug, user_id: myId, user_name, rating, verified: true })
--
-- `verified` is trust data set by the system after confirming a real purchase —
-- it must not be writable by the reviewer it describes. This BEFORE trigger forces
-- client roles (anon / authenticated) to verified=false on INSERT and blocks them
-- from changing it on UPDATE. The service-role backend, SECURITY DEFINER functions,
-- and superuser/migration sessions are unaffected, so legitimate verification and
-- seeding still work.
--
-- A trigger (not a tighter WITH CHECK of `verified = false`) is used deliberately:
-- a blanket WITH CHECK would also block a user from editing the text of an already
-- system-verified review. The trigger guards only the column, leaving the rest of
-- the row freely editable by its owner.
--
-- Idempotent: safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_review_verified_system_only()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY INVOKER (the default) is REQUIRED: the guard relies on current_user
-- reflecting the actual caller. SECURITY DEFINER would rewrite current_user to the
-- function owner and silently defeat the check.
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      -- Clients may never create a pre-verified review.
      NEW.verified := FALSE;
    ELSIF TG_OP = 'UPDATE' AND NEW.verified IS DISTINCT FROM OLD.verified THEN
      -- Clients may never flip the verified flag on an existing review.
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
