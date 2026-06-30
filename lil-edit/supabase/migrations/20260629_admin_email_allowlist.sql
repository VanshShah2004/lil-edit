-- =============================================================================
-- Migration: admin email allowlist + atomic admin-grant/revoke RPC
-- Created:   2026-06-29
--
-- Adds the ability to grant or revoke an account's admin status from the admin
-- UI (General Settings), whether the account exists yet or not:
--
--   • EXISTING account  → profiles.role is flipped admin⇄customer.
--   • NO account yet     → the email is recorded in admin_email_allowlist, and
--                          the signup trigger (handle_new_user_profile) reads
--                          that list so the account is created as an admin.
--
-- SECURITY MODEL (must stay airtight — this is privilege escalation surface):
--   • admin_email_allowlist has RLS ENABLED with NO policies → anon/authenticated
--     (the public PostgREST roles, anon key ships in the frontend) can neither
--     read nor write it. The SECURITY DEFINER signup trigger and the service-role
--     backend bypass RLS, so the only legitimate paths keep working.
--   • admin_set_account_admin() is SECURITY DEFINER (so it can write the
--     role-locked profiles table), but EXECUTE is REVOKED from PUBLIC/anon/
--     authenticated and GRANTED only to service_role. Without that revoke, ANY
--     logged-in user could call it via /rest/v1/rpc and self-promote, defeating
--     the role-immutability lock in create_profiles.sql / secure_profile_role.sql.
--   • Root owner emails (is_root_admin) can never be demoted, and an admin can
--     never revoke their own access — both enforced INSIDE the function so the DB
--     is the final arbiter even if the backend guard were bypassed.
--
-- Canonical note: the table, is_root_admin(), and the updated trigger are also
-- folded into lil-edit/supabase/sql/create_profiles.sql so a fresh setup is
-- consistent. The admin-management RPC lives ONLY here. Everything is idempotent;
-- applying this on top of a fresh create_profiles.sql run is harmless.
--
-- ⚠️ MANUAL STEP: run this in the Supabase SQL editor. It is NOT auto-applied.
-- After applying, PostgREST normally reloads automatically; if an RPC 404s, run
-- `NOTIFY pgrst, 'reload schema';` or toggle the schema in the dashboard.
-- =============================================================================

-- ─── 1. Allowlist table ──────────────────────────────────────────────────────
-- One row per pre-authorized admin email. Email is stored normalized (lower +
-- trimmed); the CHECK makes a non-normalized insert impossible, so reads can rely
-- on exact lowercase matching.
CREATE TABLE IF NOT EXISTS public.admin_email_allowlist (
  email          text PRIMARY KEY CHECK (email = lower(btrim(email)) AND email <> ''),
  added_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  added_by_email text,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Default-deny: RLS on, no policies. Service role + the SECURITY DEFINER trigger
-- bypass it; the public PostgREST roles get nothing.
ALTER TABLE public.admin_email_allowlist ENABLE ROW LEVEL SECURITY;

-- ─── 2. Root owner helper ────────────────────────────────────────────────────
-- Single source of truth for the hardcoded owner emails that must ALWAYS be admin
-- and can NEVER be demoted. Used by both the signup trigger and the grant/revoke
-- RPC. Keep this list in sync with create_profiles.sql.
CREATE OR REPLACE FUNCTION public.is_root_admin(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(coalesce(p_email, ''))) = ANY (ARRAY[
    'shahvanshm23.4.2004@gmail.com',
    'meghnashahm@gmail.com'
  ]);
$$;

-- It only reveals whether an email is one of two compile-time constants, but
-- there's no reason to expose it via PostgREST. Definer callers (trigger, RPC)
-- run as the owner and are unaffected by this revoke.
REVOKE ALL ON FUNCTION public.is_root_admin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_root_admin(text) FROM anon, authenticated;

-- ─── 3. Signup trigger: consult roots + allowlist for the initial role ────────
-- Identical to create_profiles.sql section 2 EXCEPT the role-assignment block now
-- reads is_root_admin() + admin_email_allowlist instead of a hardcoded array, so
-- a pre-authorized email becomes an admin the moment its account is created.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  provider_text text;
  providers_text text;
  is_google boolean := false;
  is_email boolean := false;
  is_completed_email boolean := false;

  user_role text;
BEGIN
  provider_text := lower(COALESCE(NEW.raw_app_meta_data->>'provider', ''));
  providers_text := lower(COALESCE(NEW.raw_app_meta_data->>'providers', ''));
  is_google := provider_text = 'google' OR providers_text LIKE '%google%';
  is_email := provider_text = 'email' OR providers_text LIKE '%email%';

  -- Email signup completion check
  IF is_email THEN
    is_completed_email :=
      COALESCE(NULLIF(NEW.encrypted_password, ''), '') <> ''
      AND NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'first_name', '')), '') IS NOT NULL;
  END IF;

  -- Assign role: hardcoded owners OR any email pre-authorized in the allowlist.
  -- (This runs SECURITY DEFINER, so it can read the RLS-locked allowlist.)
  IF public.is_root_admin(NEW.email)
     OR EXISTS (
       SELECT 1 FROM public.admin_email_allowlist a
       WHERE a.email = lower(btrim(NEW.email))
     ) THEN
    user_role := 'admin';
  ELSE
    user_role := 'customer';
  END IF;

  -- Create/update profile
  IF is_google OR is_completed_email THEN
    IF TG_OP = 'INSERT'
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.raw_user_meta_data IS DISTINCT FROM OLD.raw_user_meta_data
       OR NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
       OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id)
    THEN

      INSERT INTO public.profiles (
        id,
        email,
        first_name,
        last_name,
        password_hash,
        role,
        phone_number,
        is_phone_number_verified,
        dob,
        gender
      )
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
          NEW.raw_user_meta_data->>'first_name',
          NEW.raw_user_meta_data->>'given_name',
          split_part(NEW.raw_user_meta_data->>'full_name', ' ', 1),
          split_part(NEW.raw_user_meta_data->>'name', ' ', 1)
        ),
        COALESCE(
          NEW.raw_user_meta_data->>'last_name',
          NEW.raw_user_meta_data->>'family_name',
          split_part(NEW.raw_user_meta_data->>'full_name', ' ', 2),
          split_part(NEW.raw_user_meta_data->>'name', ' ', 2)
        ),
        NEW.encrypted_password,
        user_role,
        NEW.raw_user_meta_data->>'phone_number',
        COALESCE((NEW.raw_user_meta_data->>'is_phone_number_verified')::boolean, false),
        NULLIF(NEW.raw_user_meta_data->>'dob', '')::date,
        NEW.raw_user_meta_data->>'gender'
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        first_name = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
        last_name = COALESCE(EXCLUDED.last_name, public.profiles.last_name),
        password_hash = COALESCE(EXCLUDED.password_hash, public.profiles.password_hash),
        phone_number = COALESCE(EXCLUDED.phone_number, public.profiles.phone_number),
        is_phone_number_verified = COALESCE(EXCLUDED.is_phone_number_verified, public.profiles.is_phone_number_verified),
        dob = COALESCE(EXCLUDED.dob, public.profiles.dob),
        gender = COALESCE(EXCLUDED.gender, public.profiles.gender),
        updated_at = NOW();

    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Password reset handling
    IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
      UPDATE public.profiles
      SET
        password_hash = NEW.encrypted_password,
        updated_at = NOW()
      WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach idempotently (no-op if create_profiles.sql already created it).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user_profile();

-- ─── 4. Atomic grant / revoke RPC ────────────────────────────────────────────
-- Performs the allowlist write AND the profiles.role flip in ONE transaction so
-- the two can never half-apply. Returns a jsonb status so the backend can report
-- precisely (granted / revoked / already_* / *_blocked / invalid_email).
--
-- jsonb return (not RETURNS TABLE) deliberately: with OUT params named like the
-- `email`/`role` columns, unqualified column refs inside the body would silently
-- resolve to the OUT variable instead of the column.
--
-- p_actor_id is the acting admin's user id (for the self-revoke guard + audit).
CREATE OR REPLACE FUNCTION public.admin_set_account_admin(
  p_email      text,
  p_make_admin boolean,
  p_actor_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email        text := lower(btrim(coalesce(p_email, '')));
  v_actor_email  text;
  v_profile_id   uuid;
  v_profile_role text;
BEGIN
  -- Basic email-shape validation (mirrors the backend + signup regex). Returned
  -- as a status, not raised, so the caller gets a clean 400 rather than a 500.
  IF v_email = '' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('status', 'invalid_email', 'email', v_email,
                              'profileExists', false, 'role', NULL);
  END IF;

  -- Resolve an existing account by email (case-insensitive). Oldest first, so a
  -- pathological duplicate-email pair resolves deterministically.
  SELECT p.id, p.role INTO v_profile_id, v_profile_role
  FROM public.profiles p
  WHERE lower(p.email) = v_email
  ORDER BY p.created_at ASC
  LIMIT 1;

  IF p_make_admin THEN
    SELECT lower(p2.email) INTO v_actor_email
    FROM public.profiles p2 WHERE p2.id = p_actor_id;

    -- Record intent so a not-yet-registered email is created as admin, and an
    -- existing admin survives future auth-row updates (the signup trigger's
    -- ON CONFLICT path preserves role; this list is the durable source of truth).
    INSERT INTO public.admin_email_allowlist (email, added_by, added_by_email)
    VALUES (v_email, p_actor_id, v_actor_email)
    ON CONFLICT (email) DO NOTHING;

    IF v_profile_id IS NULL THEN
      RETURN jsonb_build_object('status', 'granted', 'email', v_email,
                                'profileExists', false, 'role', NULL);
    ELSIF v_profile_role = 'admin' THEN
      RETURN jsonb_build_object('status', 'already_admin', 'email', v_email,
                                'profileExists', true, 'role', 'admin');
    ELSE
      UPDATE public.profiles SET role = 'admin', updated_at = now() WHERE id = v_profile_id;
      RETURN jsonb_build_object('status', 'granted', 'email', v_email,
                                'profileExists', true, 'role', 'admin');
    END IF;
  END IF;

  -- ── Revoke path ────────────────────────────────────────────────────────────
  -- Owners are permanent — refuse before touching anything.
  IF public.is_root_admin(v_email) THEN
    RETURN jsonb_build_object('status', 'root_blocked', 'email', v_email,
                              'profileExists', v_profile_id IS NOT NULL, 'role', v_profile_role);
  END IF;

  -- No self-demotion (lockout guard). Final arbiter even if the backend missed it.
  IF p_actor_id IS NOT NULL THEN
    SELECT lower(p3.email) INTO v_actor_email
    FROM public.profiles p3 WHERE p3.id = p_actor_id;
    IF v_actor_email IS NOT NULL AND v_actor_email = v_email THEN
      RETURN jsonb_build_object('status', 'self_revoke_blocked', 'email', v_email,
                                'profileExists', v_profile_id IS NOT NULL, 'role', v_profile_role);
    END IF;
  END IF;

  DELETE FROM public.admin_email_allowlist WHERE email = v_email;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('status', 'revoked', 'email', v_email,
                              'profileExists', false, 'role', NULL);
  ELSIF v_profile_role <> 'admin' THEN
    RETURN jsonb_build_object('status', 'already_not_admin', 'email', v_email,
                              'profileExists', true, 'role', v_profile_role);
  ELSE
    UPDATE public.profiles SET role = 'customer', updated_at = now() WHERE id = v_profile_id;
    RETURN jsonb_build_object('status', 'revoked', 'email', v_email,
                              'profileExists', true, 'role', 'customer');
  END IF;
END;
$$;

-- ─── 5. Lock down RPC execution to the backend only ──────────────────────────
-- THIS IS LOAD-BEARING. Postgres grants EXECUTE to PUBLIC by default; without the
-- revoke, an authenticated user could self-promote through PostgREST.
REVOKE ALL ON FUNCTION public.admin_set_account_admin(text, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_account_admin(text, boolean, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_account_admin(text, boolean, uuid) TO service_role;

-- Verify after applying:
--   -- RLS must be ON with no policies:
--   select relrowsecurity from pg_class where relname = 'admin_email_allowlist';      -- t
--   select count(*) from pg_policies where tablename = 'admin_email_allowlist';        -- 0
--   -- anon/authenticated must NOT have execute on the RPC:
--   select has_function_privilege('authenticated',
--     'public.admin_set_account_admin(text,boolean,uuid)', 'execute');                 -- f
--   select has_function_privilege('service_role',
--     'public.admin_set_account_admin(text,boolean,uuid)', 'execute');                 -- t
