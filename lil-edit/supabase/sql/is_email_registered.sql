-- Run this once in Supabase SQL Editor (Dashboard → SQL → New query).
-- Lets the app block signup when an email is already registered in auth.users.

create or replace function public.is_email_registered(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(trim(p_email))
  );
$$;

-- Allow anon (signup page) to call this for duplicate checks only.
grant execute on function public.is_email_registered(text) to anon;
grant execute on function public.is_email_registered(text) to authenticated;
