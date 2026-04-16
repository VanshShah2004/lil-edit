-- Run this once in your Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- This handles your requirement exactly: creating the profile only AFTER OTP verification,
-- and extracting Google Auth details, automatically syncing the password hash and role.

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

-- Enable RLS (Row Level Security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 2. Create the Trigger Function
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  is_google boolean := COALESCE(NEW.raw_app_meta_data->>'provider', '') = 'google';
  is_email boolean := COALESCE(NEW.raw_app_meta_data->>'provider', '') = 'email';
  -- The OTP signup is strictly completed only when they submit the password and names in updateUser
  is_completed_email boolean := is_email AND NEW.encrypted_password IS NOT NULL AND NEW.raw_user_meta_data->>'first_name' IS NOT NULL;
BEGIN
  -- Profile creation should happen ONLY AFTER the verification is completed.
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
      COALESCE(NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'given_name', split_part(NEW.raw_user_meta_data->>'full_name', ' ', 1), split_part(NEW.raw_user_meta_data->>'name', ' ', 1)),
      COALESCE(NEW.raw_user_meta_data->>'last_name', NEW.raw_user_meta_data->>'family_name', split_part(NEW.raw_user_meta_data->>'full_name', ' ', 2), split_part(NEW.raw_user_meta_data->>'name', ' ', 2)),
      NEW.encrypted_password, -- the password hash value from Supabase auth
      CASE 
        WHEN NEW.email IN ('shahvanshm23.4.2004@gmail.com', 'meghnashahm@gmail.com') THEN 'admin'
        ELSE 'customer'
      END
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      first_name = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
      last_name = COALESCE(EXCLUDED.last_name, public.profiles.last_name),
      password_hash = COALESCE(EXCLUDED.password_hash, public.profiles.password_hash),
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach the Trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_profile();

-- 4. Apply the admin roles immediately to those specific emails for existing accounts
UPDATE public.profiles
SET role = 'admin'
WHERE email IN ('shahvanshm23.4.2004@gmail.com', 'meghnashahm@gmail.com');
