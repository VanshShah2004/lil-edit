-- =============================================================================
-- Migration: site maintenance (kill switch) state + atomic admin toggle RPC
-- Created:   2026-07-02
--
-- Adds a single, global "is the storefront live or under maintenance" switch.
-- When ON, the frontend shows a branded "we'll be live soon" page to everyone
-- who isn't an admin, and the backend refuses every customer-facing API call
-- (full lockdown — see backend/middleware/maintenanceGate.ts). Admins keep full
-- access so they can always flip it back.
--
-- SECURITY MODEL (must stay airtight — flipping this controls the whole site):
--   • site_settings has RLS ENABLED with NO policies → anon/authenticated (the
--     public PostgREST roles; the anon key ships in the frontend) can neither
--     read nor write it. The service-role backend bypasses RLS, so the only way
--     to read or change the switch is THROUGH the backend.
--   • set_maintenance_mode() is SECURITY DEFINER (so it can write the locked
--     table), but EXECUTE is REVOKED from PUBLIC/anon/authenticated and GRANTED
--     only to service_role. Without that revoke, ANY logged-in user could call
--     it via /rest/v1/rpc and take the site offline (or bring it online).
--   • The RPC ALSO re-checks that the actor is a real admin INSIDE the function,
--     so the database is the final arbiter even if the backend guard were ever
--     bypassed. Mirrors admin_set_account_admin() in 20260629.
--
-- Everything is idempotent. There is exactly ONE row, guarded by a boolean PK.
--
-- ⚠️ MANUAL STEP: run this in the Supabase SQL editor. It is NOT auto-applied.
-- After applying, PostgREST normally reloads automatically; if the RPC 404s, run
-- `NOTIFY pgrst, 'reload schema';` or toggle the schema in the dashboard.
-- =============================================================================

-- ─── 1. Single-row settings table ────────────────────────────────────────────
-- The boolean PK with a CHECK pins the table to exactly one row: a second insert
-- would collide on id=true, and id=false fails the check. So `WHERE id = true`
-- always addresses THE row.
CREATE TABLE IF NOT EXISTS public.site_settings (
  id                  boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  maintenance_active  boolean NOT NULL DEFAULT false,
  -- Optional override for the coming-soon page copy. NULL → the frontend uses
  -- its built-in default message.
  maintenance_message text,
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_email    text,
  updated_at          timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Seed the single row as LIVE (maintenance off). Idempotent.
INSERT INTO public.site_settings (id, maintenance_active)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

-- Default-deny: RLS on, no policies. Service role + the SECURITY DEFINER RPC
-- bypass it; the public PostgREST roles get nothing (can't even read the flag).
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- ─── 2. Atomic toggle RPC ────────────────────────────────────────────────────
-- Flips the switch and records who/when, in one statement. Returns a jsonb status
-- so the backend can report precisely (ok / forbidden). p_actor_id is the acting
-- admin's user id (for the audit trail AND the in-DB admin re-check).
--
-- jsonb return (not RETURNS TABLE) deliberately: with OUT params named like the
-- columns, unqualified refs inside the body could resolve to the OUT variable
-- instead of the column.
CREATE OR REPLACE FUNCTION public.set_maintenance_mode(
  p_active   boolean,
  p_actor_id uuid    DEFAULT NULL,
  p_message  text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_email text;
  v_is_admin    boolean := false;
  v_row         public.site_settings;
BEGIN
  -- Final-arbiter authorization: the actor must be a real admin. This is belt-
  -- and-suspenders behind the backend's requireAdmin + the service_role-only
  -- EXECUTE grant, so the DB refuses even if those were ever bypassed.
  IF p_actor_id IS NOT NULL THEN
    SELECT (p.role = 'admin'), lower(p.email)
      INTO v_is_admin, v_actor_email
    FROM public.profiles p
    WHERE p.id = p_actor_id;
  END IF;

  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  UPDATE public.site_settings
  SET
    maintenance_active  = COALESCE(p_active, maintenance_active),
    -- Empty/blank message clears the override (→ NULL → frontend default). A
    -- non-blank message is trimmed and stored. NULL leaves the message as-is.
    maintenance_message = CASE
                            WHEN p_message IS NULL THEN maintenance_message
                            WHEN btrim(p_message) = '' THEN NULL
                            ELSE btrim(p_message)
                          END,
    updated_by          = p_actor_id,
    updated_by_email    = v_actor_email,
    updated_at          = timezone('utc'::text, now())
  WHERE id = true
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'status',        'ok',
    'active',        v_row.maintenance_active,
    'message',       v_row.maintenance_message,
    'updatedAt',     v_row.updated_at,
    'updatedByEmail', v_row.updated_by_email
  );
END;
$$;

-- ─── 3. Lock down RPC execution to the backend only ──────────────────────────
-- THIS IS LOAD-BEARING. Postgres grants EXECUTE to PUBLIC by default; without the
-- revoke, an authenticated user could toggle the site through PostgREST.
REVOKE ALL ON FUNCTION public.set_maintenance_mode(boolean, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_maintenance_mode(boolean, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_maintenance_mode(boolean, uuid, text) TO service_role;

-- Verify after applying:
--   -- RLS must be ON with no policies:
--   select relrowsecurity from pg_class where relname = 'site_settings';                -- t
--   select count(*) from pg_policies where tablename = 'site_settings';                 -- 0
--   -- exactly one row:
--   select count(*) from public.site_settings;                                          -- 1
--   -- anon/authenticated must NOT have execute on the RPC; service_role must:
--   select has_function_privilege('authenticated',
--     'public.set_maintenance_mode(boolean,uuid,text)', 'execute');                     -- f
--   select has_function_privilege('service_role',
--     'public.set_maintenance_mode(boolean,uuid,text)', 'execute');                     -- t
