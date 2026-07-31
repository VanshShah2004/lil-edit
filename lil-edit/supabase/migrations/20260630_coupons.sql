-- =============================================================================
-- Migration: coupons table
-- Created:   2026-06-30
--
-- Stores admin-created discount coupons. RLS is enabled with no public policies
-- so only the service-role backend can read/write. The checkout flow validates
-- coupons via the backend (never client-side).
--
-- ⚠️ MANUAL STEP: run in the Supabase SQL editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.coupons (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text        UNIQUE NOT NULL
                               CHECK (code = upper(btrim(code)) AND code <> ''),
  discount_type    text        NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value   numeric     NOT NULL CHECK (discount_value > 0),
  min_order_amount numeric     CHECK (min_order_amount >= 0),
  max_uses         integer     CHECK (max_uses > 0),
  uses_count       integer     NOT NULL DEFAULT 0,
  expires_at       timestamptz,
  is_active        boolean     NOT NULL DEFAULT true,
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
