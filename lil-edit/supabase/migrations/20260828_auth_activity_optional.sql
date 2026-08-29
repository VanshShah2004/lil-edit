-- =============================================================================
-- Migration: Activity Log — signup & login events   ** OPTIONAL / OPT-IN **
-- Created:   2026-08-28
-- Depends:   20260702_activity_log.sql
--
-- Purpose:   The User Activity feed had no account events at all. backend/routes/
--            auth.ts exposes exactly ONE endpoint (POST /signup/send-otp) —
--            signup, login, logout and password reset all go browser → Supabase
--            Auth directly, so no Express route and no public-schema table ever
--            sees them. The only place that can observe them is the auth schema.
--
-- ── Why this is a SEPARATE, optional migration ───────────────────────────────
--   Everything else in this feature set touches only the `public` schema. This
--   file attaches triggers to `auth.users` and `auth.sessions`, which Supabase
--   owns and migrates on its own schedule. That is not unprecedented here — the
--   project already runs on_auth_user_created on auth.users (see
--   20260706_auto_newsletter_on_signup.sql) — but it is a heavier commitment, so
--   it ships on its own and you can skip it without affecting anything else.
--
--   Risk is contained the same way the rest of the logging is: SECURITY DEFINER,
--   AFTER triggers, and every INSERT wrapped in its own BEGIN/EXCEPTION block, so
--   a logging failure can never block a signup or a login. Worst case you stop
--   getting these rows; nobody is locked out.
--
--   To remove later:
--     DROP TRIGGER IF EXISTS trg_log_signup_activity ON auth.users;
--     DROP TRIGGER IF EXISTS trg_log_login_activity  ON auth.sessions;
--
-- Run in the Supabase SQL editor as the project owner. Idempotent — safe to re-run.
-- =============================================================================

-- ─── Signup ──────────────────────────────────────────────────────────────────
-- A separate trigger rather than an edit to handle_new_user_profile(): that
-- function is owned by another migration and re-created by it, so folding logging
-- into it would be silently reverted the next time that file is re-run.
--
-- ⚠️ Why this is NOT a plain AFTER INSERT trigger.
--   Email signup here goes through signInWithOtp() (AuthContext.tsx / backend
--   routes/auth.ts) with GoTrue's default shouldCreateUser = true, so the
--   auth.users row is INSERTed the moment the OTP is SENT — long before anyone
--   proves they own the address. A trigger that fired on the raw INSERT would log
--   a 'signup' for every address ever typed into the form and abandoned, and
--   because handle_new_user_profile() correctly refuses to create a profile for an
--   incomplete signup, each phantom would render as a nameless "A customer created
--   an account". The feed's signup count would not be a signup count.
--
--   So this mirrors handle_new_user_profile()'s OWN completion gate (20260706):
--     • OAuth (Google) users are complete the instant the row appears;
--     • email users are complete only once encrypted_password is set AND a
--       first_name exists — the updateUser({ password, data }) call that finishes
--       signup — which arrives as an UPDATE, hence AFTER INSERT OR UPDATE.
--   A NOT EXISTS check keeps it to exactly one 'signup' row per account, so later
--   password resets and profile edits can never emit a second one.
CREATE OR REPLACE FUNCTION public.log_signup_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  provider_text text;
  is_google     boolean;
  is_complete   boolean;
BEGIN
  BEGIN
    provider_text := lower(COALESCE(NEW.raw_app_meta_data->>'provider', ''))
                     || ' ' || lower(COALESCE(NEW.raw_app_meta_data->>'providers', ''));
    is_google := provider_text LIKE '%google%';

    -- Same definition of "the account actually exists now" as the profile trigger.
    is_complete := is_google OR (
      COALESCE(NULLIF(NEW.encrypted_password, ''), '') <> ''
      AND NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'first_name', '')), '') IS NOT NULL
    );

    IF is_complete AND NOT EXISTS (
      SELECT 1 FROM public.activity_log
      WHERE user_id = NEW.id AND type = 'signup'
    ) THEN
      INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata)
      VALUES (
        NEW.id, 'signup', NULL, NULL,
        jsonb_build_object(
          'email',    NEW.email,
          -- 'google' | 'email' — lets the feed distinguish social from email signup.
          'provider', CASE WHEN is_google THEN 'google' ELSE 'email' END
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'activity_log(signup) insert failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$fn$;

-- ─── Login ───────────────────────────────────────────────────────────────────
-- One row per new session. A token REFRESH reuses the existing session row, so
-- this fires on real sign-ins, not on every token rotation.
--
-- ip / user_agent are read via to_jsonb(NEW) ->> '…' rather than NEW.ip / NEW.
-- user_agent on purpose: those columns have come and gone across GoTrue versions,
-- and a direct reference to a missing column would fail at runtime (silently, in
-- the exception block) and cost you the whole row. Through to_jsonb a missing key
-- is simply NULL.
CREATE OR REPLACE FUNCTION public.log_login_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  row_json jsonb;
BEGIN
  BEGIN
    row_json := to_jsonb(NEW);
    INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata)
    VALUES (
      NEW.user_id, 'login', NULL, NULL,
      jsonb_build_object(
        'session_id', NEW.id,
        'ip',         row_json->>'ip',
        'user_agent', left(coalesce(row_json->>'user_agent', ''), 200)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'activity_log(login) insert failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$fn$;

-- ─── Attach (guarded) ────────────────────────────────────────────────────────
DO $do$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_log_signup_activity ON auth.users;
    -- INSERT *OR UPDATE*: an email signup only becomes real on the UPDATE that
    -- sets the password + first name (see the note on the function above).
    CREATE TRIGGER trg_log_signup_activity
      AFTER INSERT OR UPDATE ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.log_signup_activity();
  ELSE
    RAISE NOTICE 'auth.users missing — signup logging not attached.';
  END IF;

  IF to_regclass('auth.sessions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_log_login_activity ON auth.sessions;
    CREATE TRIGGER trg_log_login_activity
      AFTER INSERT ON auth.sessions
      FOR EACH ROW EXECUTE FUNCTION public.log_login_activity();
  ELSE
    RAISE NOTICE 'auth.sessions missing — login logging not attached (GoTrue version without a sessions table).';
  END IF;
END
$do$;
