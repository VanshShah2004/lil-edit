-- =============================================================================
-- Security fix: make profiles.role unforgeable
--
-- The "Users can update own profile" policy (create_profiles.sql) lets a user
-- UPDATE their own row but does NOT restrict which columns change. Because
-- authorization (admin vs customer) is stored in profiles.role, any logged-in
-- user could self-promote straight from the browser:
--
--     supabase.from('profiles').update({ role: 'admin' }).eq('id', myId)
--
-- Authorization data must never be writable by the principal it authorizes.
-- This BEFORE UPDATE trigger rejects any change to `role` made by the PostgREST
-- client roles (anon / authenticated). The service-role backend, the
-- SECURITY DEFINER signup trigger (handle_new_user_profile), and superuser /
-- migration sessions are unaffected, so legitimate role assignment still works:
--   • initial role is set by handle_new_user_profile on INSERT (this is an
--     UPDATE trigger, so it never fires there), and
--   • an admin can still promote a user via the SQL editor or service role.
--
-- Idempotent: safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_profile_role_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY INVOKER (the default) is REQUIRED here: the guard relies on
-- current_user reflecting the actual caller. SECURITY DEFINER would rewrite
-- current_user to the function owner and silently defeat the check.
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'profiles.role is read-only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_role_immutable ON public.profiles;
CREATE TRIGGER trg_enforce_profile_role_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_role_immutable();

-- Defense in depth: give the update policy an explicit WITH CHECK so its intent
-- (the row must remain the caller's own) is self-documenting rather than relying
-- on Postgres' implicit "WITH CHECK falls back to USING" behaviour. The trigger
-- above is what actually protects the role column; this is belt-and-suspenders.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
