-- 1. Create the profile table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email text,
  first_name text,
  last_name text,
  password_hash text,
  role text DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

--------------------------------------------------------

-- 2. Trigger Function (FINAL FIXED)
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  is_google boolean := COALESCE(NEW.raw_app_meta_data->>'provider', '') = 'google';
  is_email boolean := COALESCE(NEW.raw_app_meta_data->>'provider', '') = 'email';

  -- Email signup completes ONLY after password + metadata is set
  is_completed_email boolean := is_email
    AND NEW.encrypted_password IS NOT NULL
    AND NEW.raw_user_meta_data->>'first_name' IS NOT NULL;

  user_role text;
BEGIN
  -- Assign role (clean + scalable)
  IF NEW.email = ANY (ARRAY[
    'shahvanshm23.4.2004@gmail.com',
    'meghnashahm@gmail.com'
  ]) THEN
    user_role := 'admin';
  ELSE
    user_role := 'customer';
  END IF;

  -- Create/update profile ONLY when signup is complete
  IF is_google OR is_completed_email THEN
    INSERT INTO public.profiles (
      id,
      email,
      first_name,
      last_name,
      password_hash,
      role
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
      user_role
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      first_name = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
      last_name = COALESCE(EXCLUDED.last_name, public.profiles.last_name),
      password_hash = COALESCE(EXCLUDED.password_hash, public.profiles.password_hash),
      updated_at = NOW();
      -- 🔒 role is NOT updated intentionally
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------

-- 3. Public helper RPCs used by signup/login flows
CREATE OR REPLACE FUNCTION public.is_profile_registered(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(email) = lower(trim(p_email))
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_profile_registered(text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_profile_registered(text) TO authenticated;

--------------------------------------------------------

-- 4. Attach Trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user_profile();

--------------------------------------------------------

