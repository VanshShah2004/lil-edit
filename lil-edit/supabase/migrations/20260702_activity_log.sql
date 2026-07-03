-- =============================================================================
-- Migration: Activity Log (admin activity notification feed)
-- Created:   2026-07-02
-- Purpose:   A single append-only feed of customer activity for the admin
--            notification panel: cart adds, wishlist adds, orders placed,
--            reviews submitted, and product searches.
--
-- ── Capture design ───────────────────────────────────────────────────────────
--   • cart_add / wishlist_add / order_placed / review_submitted are captured by
--     AFTER INSERT triggers on their source tables, so:
--       – every real event is logged no matter which code path created the row;
--       – the order trigger fires exactly once per order row, so an idempotent
--         place_order replay (which returns the existing order WITHOUT a second
--         INSERT) never double-logs;
--       – reviews — inserted directly from the browser as `authenticated` — are
--         captured even though no backend route sees that write.
--   • search has no source row, so it is logged from application code
--     (backend GET /api/products/search) via the service-role client.
--
-- ── Why SECURITY DEFINER + inner exception block ─────────────────────────────
--   activity_log is RLS-locked to service-role only (see below). The triggering
--   INSERT may run as `authenticated`/`anon` (a review) or `service_role` (cart/
--   order via the backend). SECURITY DEFINER lets the trigger write activity_log
--   regardless. Each trigger swallows its own errors so a logging failure can
--   NEVER roll back the user's real action (add to cart, place order, post review).
--
-- Run in the Supabase SQL editor as the project owner (so the functions are owned
-- by a role that bypasses RLS). Idempotent — safe to re-run.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Actor. NULLable: anonymous searches have no user, and ON DELETE SET NULL keeps
  -- the historical feed intact when an account is removed.
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Event kind: 'cart_add' | 'wishlist_add' | 'order_placed'
  --            | 'review_submitted' | 'search'
  type         TEXT        NOT NULL,
  -- The product involved (NULL for order_placed / search).
  product_slug TEXT,
  sku          TEXT,
  -- Type-specific extras: size/quantity, order_number/total, rating, query/result_count …
  metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feed reads are "newest first", optionally filtered by type.
CREATE INDEX IF NOT EXISTS idx_activity_log_created
  ON public.activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_type_created
  ON public.activity_log (type, created_at DESC);

-- ─── Row-level security ───────────────────────────────────────────────────────
-- No policies → no anon/authenticated access at all. The backend reads/writes via
-- the service-role client (bypasses RLS); the triggers below write via SECURITY
-- DEFINER. Customers can neither read the feed nor forge entries.
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- ─── Trigger functions (one per source table) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_cart_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata)
    VALUES (
      NEW.user_id, 'cart_add', NEW.product_slug, NEW.sku,
      jsonb_build_object('size', NEW.size, 'quantity', NEW.quantity)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'activity_log(cart_add) insert failed: %', SQLERRM;
  END;
  RETURN NULL; -- AFTER trigger: return value ignored.
END;
$$;

CREATE OR REPLACE FUNCTION public.log_wishlist_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata)
    VALUES (NEW.user_id, 'wishlist_add', NEW.product_slug, NEW.sku, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'activity_log(wishlist_add) insert failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_order_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata)
    VALUES (
      NEW.user_id, 'order_placed', NULL, NULL,
      jsonb_build_object(
        'order_id',       NEW.id,
        'order_number',   NEW.order_number,
        'total',          NEW.total,
        'item_count',     NEW.item_count,
        'payment_method', NEW.payment_method,
        'payment_status', NEW.payment_status
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'activity_log(order_placed) insert failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_review_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only log real customer reviews, not seeded/anonymous rows (user_id IS NULL).
  IF NEW.user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata)
      VALUES (
        NEW.user_id, 'review_submitted', NEW.product_slug, NEW.sku,
        jsonb_build_object(
          'rating',  NEW.rating,
          -- Snippet only — keep the feed row small; the full review lives on the PDP.
          'comment', left(coalesce(NEW.comment, ''), 140)
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'activity_log(review_submitted) insert failed: %', SQLERRM;
    END;
  END IF;
  RETURN NULL;
END;
$$;

-- ─── Triggers (guarded: attach only to source tables that exist) ─────────────
-- Each trigger is created only if its source table is present, so this migration
-- applies on a partially-migrated database instead of aborting on the first
-- missing table. On a COMPLETE schema every trigger is created exactly as before
-- (backward-compatible). A missing source table is reported as a NOTICE — that
-- means the underlying FEATURE itself isn't installed on this database and needs
-- its own base migration (named in the notice), which is a bigger problem than
-- activity logging: the app feature is absent too.
DO $$
BEGIN
  IF to_regclass('public.cart_items') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_log_cart_activity ON public.cart_items;
    CREATE TRIGGER trg_log_cart_activity
      AFTER INSERT ON public.cart_items
      FOR EACH ROW EXECUTE FUNCTION public.log_cart_activity();
  ELSE
    RAISE NOTICE 'cart_items missing — cart logging not attached. Run 20260525_cart_items.sql.';
  END IF;

  IF to_regclass('public.wishlist_items') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_log_wishlist_activity ON public.wishlist_items;
    CREATE TRIGGER trg_log_wishlist_activity
      AFTER INSERT ON public.wishlist_items
      FOR EACH ROW EXECUTE FUNCTION public.log_wishlist_activity();
  ELSE
    RAISE NOTICE 'wishlist_items missing — wishlist logging not attached. Run 20260525_wishlist_items.sql.';
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_log_order_activity ON public.orders;
    CREATE TRIGGER trg_log_order_activity
      AFTER INSERT ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.log_order_activity();
  ELSE
    RAISE NOTICE 'orders missing — order logging not attached. Run 20260604_orders.sql.';
  END IF;

  IF to_regclass('public.product_reviews') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_log_review_activity ON public.product_reviews;
    CREATE TRIGGER trg_log_review_activity
      AFTER INSERT ON public.product_reviews
      FOR EACH ROW EXECUTE FUNCTION public.log_review_activity();
  ELSE
    RAISE NOTICE 'product_reviews missing — review logging not attached. Run 20260602_product_reviews.sql.';
  END IF;
END $$;
