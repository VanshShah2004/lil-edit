-- =============================================================================
-- Migration: admin-configurable store charges (delivery + gift wrapping)
-- Created:   2026-08-27
-- Depends on: 20260702_site_maintenance.sql (creates the single-row, RLS-locked
--             public.site_settings table this extends)
--
-- Until now the delivery rule (₹199 when 0 < subtotal ≤ ₹5000, free above) and
-- the gift-wrapping rate (₹100 per item) were HARDCODED in three places:
-- backend/routes/checkout.ts, lil-edit/src/lib/pricing.ts and Checkout.tsx.
-- Changing a price meant a code change + a deploy. This migration moves all
-- three numbers into the database so an admin can edit them in General Settings.
--
-- SECURITY MODEL (identical to the maintenance kill switch it sits beside):
--   • site_settings has RLS ENABLED with NO policies → anon/authenticated can
--     neither read nor write it. Only the service-role backend can, so the
--     storefront reads the charges THROUGH the backend (GET /api/store-charges).
--     That matters: these numbers are money. If the browser could write them,
--     a customer could set their own delivery fee to zero.
--   • set_store_charges() is SECURITY DEFINER (it must write the locked table),
--     but EXECUTE is REVOKED from PUBLIC/anon/authenticated and GRANTED only to
--     service_role, and the function RE-CHECKS that the actor is a real admin
--     inside its own body — the database is the final arbiter.
--
-- THE DELIVERY RULE (unchanged in shape, only the numbers move):
--     delivery_fee applies when  0 < subtotal <= free_delivery_threshold
--     delivery is free when      subtotal > free_delivery_threshold
--   So free_delivery_threshold is exactly "the level after which delivery is
--   free". Setting it to 0 makes delivery free on every order (no subtotal is
--   ≤ 0); setting delivery_fee to 0 does the same thing more explicitly.
--
-- Audit columns are SEPARATE from maintenance's updated_by/updated_at: the two
-- controls share a row but not a history, and a charge edit must not erase the
-- record of who last took the site offline.
--
-- Idempotent. ⚠️ MANUAL STEP: run this in the Supabase SQL editor.
-- =============================================================================

-- ─── 1. Charge columns on the single settings row ────────────────────────────
-- Defaults deliberately equal the constants they replace, so applying this
-- migration is a no-op for pricing until an admin actually changes something.
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS delivery_fee             NUMERIC(10,2) NOT NULL DEFAULT 199,
  ADD COLUMN IF NOT EXISTS free_delivery_threshold  NUMERIC(10,2) NOT NULL DEFAULT 5000,
  -- Charged PER ITEM (per unit, not per line) when the customer ticks gift
  -- wrapping at checkout. 0 = gift wrapping offered free of charge.
  ADD COLUMN IF NOT EXISTS gift_wrap_fee            NUMERIC(10,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS charges_updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS charges_updated_by_email text,
  ADD COLUMN IF NOT EXISTS charges_updated_at       timestamptz;

-- Money can never be negative. A CHECK here is the last line of defence behind
-- the route's validation — the amounts end up on a customer's card.
ALTER TABLE public.site_settings
  DROP CONSTRAINT IF EXISTS site_settings_charges_non_negative;
ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_charges_non_negative CHECK (
    delivery_fee            >= 0 AND
    free_delivery_threshold >= 0 AND
    gift_wrap_fee           >= 0
  );

-- The row is seeded by 20260702; this is a safety net if that ever didn't run.
INSERT INTO public.site_settings (id, maintenance_active)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Atomic admin write ───────────────────────────────────────────────────
-- Writes all three charges in one statement and records who/when. Returns a
-- jsonb status so the backend can report precisely (ok / forbidden / invalid).
--
-- Every parameter is NULLABLE and NULL means "leave this one as it is", so the
-- backend can patch a single charge without having to echo back the others.
--
-- jsonb return (not RETURNS TABLE) for the same reason as set_maintenance_mode:
-- OUT params named like columns would shadow the columns inside the body.
CREATE OR REPLACE FUNCTION public.set_store_charges(
  p_actor_id                uuid,
  p_delivery_fee            numeric DEFAULT NULL,
  p_free_delivery_threshold numeric DEFAULT NULL,
  p_gift_wrap_fee           numeric DEFAULT NULL
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
  -- Final-arbiter authorization, behind the backend's requireAdmin and the
  -- service_role-only EXECUTE grant. Mirrors set_maintenance_mode().
  IF p_actor_id IS NOT NULL THEN
    SELECT (p.role = 'admin'), lower(p.email)
      INTO v_is_admin, v_actor_email
    FROM public.profiles p
    WHERE p.id = p_actor_id;
  END IF;

  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  -- Reject negatives here rather than letting the CHECK raise: a jsonb status
  -- gives the route a clean 400 instead of an exception it has to parse.
  IF COALESCE(p_delivery_fee, 0) < 0
     OR COALESCE(p_free_delivery_threshold, 0) < 0
     OR COALESCE(p_gift_wrap_fee, 0) < 0 THEN
    RETURN jsonb_build_object('status', 'invalid', 'reason', 'Charges cannot be negative.');
  END IF;

  UPDATE public.site_settings
  SET
    delivery_fee             = COALESCE(p_delivery_fee, delivery_fee),
    free_delivery_threshold  = COALESCE(p_free_delivery_threshold, free_delivery_threshold),
    gift_wrap_fee            = COALESCE(p_gift_wrap_fee, gift_wrap_fee),
    charges_updated_by       = p_actor_id,
    charges_updated_by_email = v_actor_email,
    charges_updated_at       = timezone('utc'::text, now())
  WHERE id = true
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'status',                'ok',
    'deliveryFee',           v_row.delivery_fee,
    'freeDeliveryThreshold', v_row.free_delivery_threshold,
    'giftWrapFee',           v_row.gift_wrap_fee,
    'updatedAt',             v_row.charges_updated_at,
    'updatedByEmail',        v_row.charges_updated_by_email
  );
END;
$$;

-- ─── 3. Lock down RPC execution to the backend only ──────────────────────────
-- LOAD-BEARING. Postgres grants EXECUTE to PUBLIC by default; without the
-- revoke any logged-in customer could call this through PostgREST and set their
-- own delivery charge to zero.
REVOKE ALL ON FUNCTION public.set_store_charges(uuid, numeric, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_store_charges(uuid, numeric, numeric, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_store_charges(uuid, numeric, numeric, numeric) TO service_role;

-- Let PostgREST see the new function/columns immediately.
NOTIFY pgrst, 'reload schema';

-- Verify after applying:
--   select delivery_fee, free_delivery_threshold, gift_wrap_fee
--     from public.site_settings;                                                 -- 199 | 5000 | 100
--   -- anon/authenticated must NOT have execute on the RPC; service_role must:
--   select has_function_privilege('authenticated',
--     'public.set_store_charges(uuid,numeric,numeric,numeric)', 'execute');      -- f
--   select has_function_privilege('service_role',
--     'public.set_store_charges(uuid,numeric,numeric,numeric)', 'execute');      -- t
