-- 1. Create the profile table

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email text,
  first_name text,
  last_name text,
  password_hash text,
  role text DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),

  -- ✅ New Columns
  phone_number text,
  is_phone_number_verified boolean DEFAULT false,
  dob date,
  gender text CHECK (gender IN ('male', 'female', 'other')),

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

-- 2. Trigger Function (UPDATED)

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

  -- Assign role
  IF NEW.email = ANY (ARRAY[
    'shahvanshm23.4.2004@gmail.com',
    'meghnashahm@gmail.com'
  ]) THEN
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

--------------------------------------------------------

-- 3. Public helper RPC

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