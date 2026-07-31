-- Auto-subscribe every new profile to the newsletter. Identical to the
-- handle_new_user_profile() in 20260629_admin_email_allowlist.sql, EXCEPT it now also
-- inserts the new user's email into newsletter_subscribers — but only on TG_OP = 'INSERT'
-- (real account creation), never on UPDATE, so editing a profile later doesn't re-fire it.
-- Runs SECURITY DEFINER, so it bypasses newsletter_subscribers' RLS (anon insert-only)
-- the same way it already bypasses profiles' RLS.

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

      -- New account created — auto-subscribe to the newsletter (idempotent on email).
      IF TG_OP = 'INSERT' THEN
        INSERT INTO public.newsletter_subscribers (email)
        VALUES (NEW.email)
        ON CONFLICT (email) DO NOTHING;
      END IF;

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

-- Re-attach idempotently (no-op if already attached with this definition).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user_profile();
