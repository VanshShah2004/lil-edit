-- =============================================================================
-- Migration: Activity Log coverage — account, address and review-lifecycle events
-- Created:   2026-08-28
-- Depends:   20260702_activity_log.sql  (the activity_log table + the original
--            cart/wishlist/order/review INSERT triggers)
--
-- Purpose:   Close the capture gaps in the User Activity feed. Before this, the
--            feed only ever saw ADDITIONS (cart add, wishlist add, order placed,
--            review submitted) plus searches. Everything below was invisible:
--
--              • a customer EDITING or DELETING their own review — the original
--                trigger is AFTER INSERT only, so a 5-star review quietly rewritten
--                to 1 star left the old row standing and produced no new event;
--              • every address change — AddressManager.tsx / Checkout.tsx write
--                `addresses` straight from the browser with the anon key, so no
--                backend route ever sees them;
--              • every profile change — Profile.tsx and PhoneVerify.tsx likewise
--                write `profiles` directly, including phone verification.
--
-- ── Why triggers (not app code) ──────────────────────────────────────────────
--   All three of these tables are written DIRECTLY FROM THE BROWSER against
--   PostgREST under the customer's own JWT. There is no Express route to
--   instrument — a trigger is the only place that can see the write at all. Same
--   reasoning that made product_reviews a trigger in 20260702.
--
-- ── The auth.uid() guard (important) ─────────────────────────────────────────
--   Every function below logs ONLY when auth.uid() matches the row's owner, i.e.
--   the customer did it themselves in the browser. This does real work:
--
--     • Admin/service-role writes are excluded. The service role has no auth.uid(),
--       so an admin deleting a review (adminReviews.ts) does NOT also appear in
--       the CUSTOMER feed as if the customer removed it — that is already recorded
--       in admin_action_log, and duplicating it here would misattribute it.
--     • The signup trigger's own profile upsert is excluded, so account creation
--       does not masquerade as the customer editing their profile.
--     • Cascade deletes (auth.users → profiles → addresses) are excluded, so
--       deleting an account does not spray address_removed rows — and cannot hit an
--       FK error inserting activity_log for a user row that is being deleted.
--
--   NOTE the guard itself runs INSIDE each function's protective block. auth.uid()
--   is not infallible — it casts a GUC (`request.jwt.claims`) to jsonb/uuid, which
--   raises on a malformed or unexpected claim — and a raise there would abort the
--   customer's own INSERT/UPDATE/DELETE. Since the whole promise of this file is
--   that logging can never break a real user action, EVERYTHING the function does
--   (guard, field diffing, and the INSERT) sits inside BEGIN/EXCEPTION.
--
-- ── Noise control ────────────────────────────────────────────────────────────
--   AddressManager.tsx and Checkout.tsx clear `is_default` across ALL of a user's
--   addresses before saving a new default. A naive UPDATE trigger would emit one
--   row per address on every save. log_address_activity() therefore ignores an
--   update that only turns is_default OFF, and reports the one that turns it ON as
--   its own 'address_default_changed' event.
--
--   profiles is upserted by handle_new_user_profile() on every auth.users change
--   (including password resets), so the profile trigger watches ONLY the fields a
--   customer can actually edit and never fires on updated_at / password_hash /
--   role churn.
--
-- ── Two known, accepted imprecisions (documented, not bugs to hunt later) ────
--   1. Because the "clear every default, then set the new one" sequence is TWO
--      statements, pressing Save on an address that is ALREADY the default while
--      changing nothing else emits one 'address_default_changed' row (the row goes
--      default → not-default → default within the transaction). Harmless and rare;
--      suppressing it would need transaction-level state a row trigger cannot see.
--   2. Profile.tsx autosaves through persistProfile(partial), so a customer who
--      edits three fields in one sitting may produce up to three 'profile_updated'
--      rows. Each row IS a real database write, so the feed is telling the truth —
--      it is just finer-grained than "one edit session".
--
-- Run in the Supabase SQL editor as the project owner. Idempotent — safe to re-run.
-- =============================================================================

-- ─── Reviews: edits and deletions ────────────────────────────────────────────
-- The INSERT case stays in log_review_activity() (20260702); this adds the rest of
-- the lifecycle. rating / comment / images are the customer-editable fields — the
-- admin `verified` toggle runs as service role and is filtered out by the
-- auth.uid() guard anyway. (`title` was dropped in 20260623_drop_review_title.sql.)
CREATE OR REPLACE FUNCTION public.log_review_update_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  BEGIN
    IF NEW.user_id IS NOT NULL
       AND auth.uid() = NEW.user_id
       AND (NEW.rating  IS DISTINCT FROM OLD.rating
         OR NEW.comment IS DISTINCT FROM OLD.comment
         OR NEW.images  IS DISTINCT FROM OLD.images)
    THEN
      INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata)
      VALUES (
        NEW.user_id, 'review_updated', NEW.product_slug, NEW.sku,
        jsonb_build_object(
          'rating',      NEW.rating,
          'from_rating', OLD.rating,
          -- Snippet only — keep the feed row small; the full review lives on the PDP.
          'comment',     left(coalesce(NEW.comment, ''), 140),
          -- Lets the feed say "changed the photos" when nothing else moved.
          'photos_changed', NEW.images IS DISTINCT FROM OLD.images
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'activity_log(review_updated) failed: %', SQLERRM;
  END;
  RETURN NULL; -- AFTER trigger: return value ignored.
END;
$fn$;

CREATE OR REPLACE FUNCTION public.log_review_delete_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  BEGIN
    -- auth.uid() guard = "the customer deleted their own review". An admin deletion
    -- (service role, no uid) is recorded in admin_action_log instead.
    IF OLD.user_id IS NOT NULL AND auth.uid() = OLD.user_id THEN
      INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata)
      VALUES (
        OLD.user_id, 'review_removed', OLD.product_slug, OLD.sku,
        jsonb_build_object('rating', OLD.rating)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'activity_log(review_removed) failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$fn$;

-- ─── Addresses: add / edit / set-default / remove ─────────────────────────────
CREATE OR REPLACE FUNCTION public.log_address_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  owner_id     uuid;
  event_type   text;
  changed      text[];
  addr_id      uuid;
  addr_type    text;
  addr_label   text;
  addr_city    text;
  addr_default boolean;
BEGIN
  BEGIN
    -- NEW is unassigned in a DELETE trigger and OLD is unassigned in an INSERT one,
    -- and PL/pgSQL raises on a field access into an unassigned record (it does NOT
    -- read as NULL). So each branch below touches only the record that actually
    -- exists — never a COALESCE(NEW.x, OLD.x) spanning both.
    IF TG_OP = 'DELETE' THEN
      owner_id     := OLD.user_id;
      addr_id      := OLD.id;
      addr_type    := OLD.type;
      addr_label   := OLD.label;
      addr_city    := OLD.city;
      addr_default := COALESCE(OLD.is_default, false);
      event_type   := 'address_removed';
    ELSE
      owner_id     := NEW.user_id;
      addr_id      := NEW.id;
      addr_type    := NEW.type;
      addr_label   := NEW.label;
      addr_city    := NEW.city;
      addr_default := COALESCE(NEW.is_default, false);

      IF TG_OP = 'INSERT' THEN
        event_type := 'address_added';
      ELSE
        -- UPDATE: both records are valid here. Which substantive fields moved?
        -- is_default is handled separately so the "clear every other default first"
        -- sweep does not produce a row per address.
        SELECT array_agg(f) INTO changed FROM (
          SELECT 'type' AS f WHERE NEW.type IS DISTINCT FROM OLD.type
          UNION ALL SELECT 'label'    WHERE NEW.label    IS DISTINCT FROM OLD.label
          UNION ALL SELECT 'line1'    WHERE NEW.line1    IS DISTINCT FROM OLD.line1
          UNION ALL SELECT 'line2'    WHERE NEW.line2    IS DISTINCT FROM OLD.line2
          UNION ALL SELECT 'landmark' WHERE NEW.landmark IS DISTINCT FROM OLD.landmark
          UNION ALL SELECT 'city'     WHERE NEW.city     IS DISTINCT FROM OLD.city
          UNION ALL SELECT 'state'    WHERE NEW.state    IS DISTINCT FROM OLD.state
          UNION ALL SELECT 'country'  WHERE NEW.country  IS DISTINCT FROM OLD.country
          UNION ALL SELECT 'pincode'  WHERE NEW.pincode  IS DISTINCT FROM OLD.pincode
        ) s;

        IF changed IS NOT NULL AND array_length(changed, 1) > 0 THEN
          event_type := 'address_updated';
        ELSIF COALESCE(NEW.is_default, false) AND NOT COALESCE(OLD.is_default, false) THEN
          event_type := 'address_default_changed';
        ELSE
          RETURN NULL; -- is_default cleared, or a no-op write: not worth a feed row
        END IF;
      END IF;
    END IF;

    -- Only the owner acting in their own browser session is logged (see header).
    IF owner_id IS NULL OR auth.uid() IS DISTINCT FROM owner_id THEN
      RETURN NULL;
    END IF;

    INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata)
    VALUES (
      owner_id, event_type, NULL, NULL,
      jsonb_build_object(
        'address_id', addr_id,
        'type',       addr_type,
        'label',      addr_label,
        'city',       addr_city,
        'is_default', addr_default,
        'fields',     to_jsonb(COALESCE(changed, ARRAY[]::text[]))
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'activity_log(address %) failed: %', COALESCE(event_type, TG_OP), SQLERRM;
  END;
  RETURN NULL;
END;
$fn$;

-- ─── Profile: customer-editable fields + phone verification ──────────────────
CREATE OR REPLACE FUNCTION public.log_profile_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  changed text[];
BEGIN
  BEGIN
    -- Excludes the signup trigger's own upsert and any admin role change: neither
    -- runs with the customer's auth.uid().
    IF auth.uid() IS DISTINCT FROM NEW.id THEN
      RETURN NULL;
    END IF;

    -- Phone verification is its own milestone, not a generic profile edit.
    -- PhoneVerify.tsx writes phone_number and is_phone_number_verified in ONE
    -- update, so this covers both the first verification and re-verifying after
    -- switching to a different number (verified already true, only the number moved).
    IF NEW.is_phone_number_verified
       AND (NOT COALESCE(OLD.is_phone_number_verified, false)
            OR NEW.phone_number IS DISTINCT FROM OLD.phone_number)
    THEN
      INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata)
      VALUES (NEW.id, 'phone_verified', NULL, NULL, jsonb_build_object('phone_number', NEW.phone_number));
      RETURN NULL;
    END IF;

    -- Watch ONLY what a customer can edit. updated_at / password_hash / role are
    -- deliberately absent: they churn on every auth.users write.
    SELECT array_agg(f) INTO changed FROM (
      SELECT 'first_name' AS f WHERE NEW.first_name IS DISTINCT FROM OLD.first_name
      UNION ALL SELECT 'last_name'    WHERE NEW.last_name    IS DISTINCT FROM OLD.last_name
      UNION ALL SELECT 'phone_number' WHERE NEW.phone_number IS DISTINCT FROM OLD.phone_number
      UNION ALL SELECT 'dob'          WHERE NEW.dob          IS DISTINCT FROM OLD.dob
      UNION ALL SELECT 'gender'       WHERE NEW.gender       IS DISTINCT FROM OLD.gender
    ) s;

    IF changed IS NULL OR array_length(changed, 1) = 0 THEN
      RETURN NULL;
    END IF;

    INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata)
    VALUES (NEW.id, 'profile_updated', NULL, NULL, jsonb_build_object('fields', to_jsonb(changed)));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'activity_log(profile_updated) failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$fn$;

-- ─── Triggers (guarded: attach only to tables that exist) ────────────────────
-- Same tolerant pattern as 20260702 — a missing source table is a NOTICE, not an
-- abort, so this applies cleanly on a partially-migrated database.
DO $do$
BEGIN
  IF to_regclass('public.product_reviews') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_log_review_update_activity ON public.product_reviews;
    CREATE TRIGGER trg_log_review_update_activity
      AFTER UPDATE ON public.product_reviews
      FOR EACH ROW EXECUTE FUNCTION public.log_review_update_activity();

    DROP TRIGGER IF EXISTS trg_log_review_delete_activity ON public.product_reviews;
    CREATE TRIGGER trg_log_review_delete_activity
      AFTER DELETE ON public.product_reviews
      FOR EACH ROW EXECUTE FUNCTION public.log_review_delete_activity();
  ELSE
    RAISE NOTICE 'product_reviews missing — review edit/delete logging not attached. Run 20260602_product_reviews.sql.';
  END IF;

  IF to_regclass('public.addresses') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_log_address_activity ON public.addresses;
    CREATE TRIGGER trg_log_address_activity
      AFTER INSERT OR UPDATE OR DELETE ON public.addresses
      FOR EACH ROW EXECUTE FUNCTION public.log_address_activity();
  ELSE
    -- Deliberately does NOT tell you to run sql/addresses_schema.sql: that file opens
    -- with `DROP TABLE IF EXISTS public.addresses`, so running it on a live database
    -- destroys every saved address. If the table is genuinely missing, create it from
    -- that file's CREATE TABLE section by hand.
    RAISE NOTICE 'addresses missing — address logging not attached. Create the table from the CREATE TABLE section of sql/addresses_schema.sql (do NOT run that file as-is: it starts with DROP TABLE).';
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_log_profile_activity ON public.profiles;
    CREATE TRIGGER trg_log_profile_activity
      AFTER UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.log_profile_activity();
  ELSE
    RAISE NOTICE 'profiles missing — profile logging not attached. Run sql/create_profiles.sql.';
  END IF;
END
$do$;
