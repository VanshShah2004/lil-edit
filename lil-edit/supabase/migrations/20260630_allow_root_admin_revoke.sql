-- =============================================================================
-- Migration: allow revoking root/owner admin accounts
-- Created:   2026-06-30
--
-- Replaces admin_set_account_admin() to remove the root_blocked guard so that
-- owner emails can have their admin role revoked from the General Settings UI.
-- Note: is_root_admin() is kept and is still used by the signup trigger — a
-- revoked owner will regain admin only if their auth row is re-inserted/updated
-- (i.e. they re-register), not on every login.
--
-- ⚠️ MANUAL STEP: run this in the Supabase SQL editor after 20260629.
-- =============================================================================

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
  IF v_email = '' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('status', 'invalid_email', 'email', v_email,
                              'profileExists', false, 'role', NULL);
  END IF;

  SELECT p.id, p.role INTO v_profile_id, v_profile_role
  FROM public.profiles p
  WHERE lower(p.email) = v_email
  ORDER BY p.created_at ASC
  LIMIT 1;

  IF p_make_admin THEN
    SELECT lower(p2.email) INTO v_actor_email
    FROM public.profiles p2 WHERE p2.id = p_actor_id;

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

  -- ── Revoke path ──────────────────────────────────────────────────────────────
  -- No self-demotion (lockout guard).
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

-- Re-lock execution (CREATE OR REPLACE resets grants to default).
REVOKE ALL ON FUNCTION public.admin_set_account_admin(text, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_account_admin(text, boolean, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_account_admin(text, boolean, uuid) TO service_role;
