-- =============================================================================
-- Migration: Analytics Foundation (event capture for the admin analytics platform)
-- Created:   2026-07-11
-- Purpose:   The write-side of the analytics platform:
--              • product_views    — every PDP view (guests included), per variant
--              • live_presence    — heartbeat upserts powering "Live Visitors"
--              • analytics indexes on existing tables (orders, order_items,
--                activity_log, product_reviews) so aggregation queries stay fast
--
-- ── Event capture design ──────────────────────────────────────────────────────
-- Views and heartbeats are written by the backend's public POST /api/track/*
-- endpoints via the service-role client (both tables are RLS-locked with no
-- policies, so browsers can neither read nor forge rows — the same posture as
-- activity_log).
--
-- The NEW activity_log event kinds introduced with this migration are written
-- from application code, NOT triggers (no schema change needed — type is TEXT):
--   • cart_remove       — DELETE /api/cart/:id and quantity-decrease PATCHes
--   • wishlist_remove   — DELETE /api/wishlist/:id (a move-to-cart is a
--                         conversion, not a remove, so the move RPC's delete is
--                         deliberately NOT logged as a remove)
--   • checkout_started  — POST /api/checkout/initiate after the Razorpay order
--                         is created (funnel's Checkout stage)
--   • cart_add          — (existing kind) ALSO logged from app code for
--                         quantity-increment re-adds, which the INSERT trigger
--                         cannot see (metadata.via = 'increment')
--
-- Why app code instead of UPDATE/DELETE triggers, when the add-side uses INSERT
-- triggers? Because row changes don't map 1:1 to customer intent on these paths:
--   • a size/color change merges lines (UPDATE qty + DELETE row) — lateral move,
--     neither an add nor a remove;
--   • the cart's self-heal rewrites product_slug on renamed products — no event;
--   • post-checkout cart clearing — a purchase, not an abandonment.
-- All cart/wishlist mutations flow through the backend routes (the frontend
-- never writes these tables directly), so app-code logging loses nothing.
--
-- ── Visitor identity ──────────────────────────────────────────────────────────
-- visitor_id is a random, non-PII device id minted client-side (localStorage)
-- and sent with views/heartbeats/searches. Logged-in events also carry user_id,
-- which lets funnel queries join views → cart/wishlist/orders per user while
-- guests still count in view/visitor metrics.
--
-- ⚠️ MANUAL STEP: run in the Supabase SQL editor. Idempotent — safe to re-run.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── product_views ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_views (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Anonymous device id (always present; length-checked so junk can't bloat rows).
  visitor_id   TEXT        NOT NULL CHECK (char_length(visitor_id) BETWEEN 8 AND 72),
  -- The viewer when logged in. SET NULL keeps history when an account is removed.
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- No FK: products are deleted + re-inserted on every edit/republish (same
  -- reasoning as product_reviews.product_slug).
  product_slug  TEXT       NOT NULL,
  -- The variant on the PDP URL (…/product/slug$SKU) — enables per-color views.
  sku           TEXT,
  -- Denormalized so category filters never need a products join.
  category_slug TEXT,
  -- Where the visit came from. Constrained to a known set so junk values can't
  -- explode cardinality; the backend maps anything unknown to 'other'.
  source        TEXT       NOT NULL DEFAULT 'direct'
                 CHECK (source IN ('direct','search','collection','home','wishlist',
                                   'cart','spotlight','share','recommendation','other')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Time-window scans (dashboards are date-range first).
CREATE INDEX IF NOT EXISTS idx_product_views_created
  ON public.product_views (created_at DESC);
-- Per-product pages: one product's views over a range.
CREATE INDEX IF NOT EXISTS idx_product_views_slug_created
  ON public.product_views (product_slug, created_at DESC);
-- Funnel joins (view → cart/order by the same account).
CREATE INDEX IF NOT EXISTS idx_product_views_user_created
  ON public.product_views (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
-- Search CTR: clicks are views with source='search'.
CREATE INDEX IF NOT EXISTS idx_product_views_search_created
  ON public.product_views (created_at DESC)
  WHERE source = 'search';

-- No policies → no anon/authenticated access; service-role only (backend writes,
-- analytics RPCs read).
ALTER TABLE public.product_views ENABLE ROW LEVEL SECURITY;

-- ─── live_presence ────────────────────────────────────────────────────────────
-- One row per visitor, upserted by the heartbeat beacon (~30s while the tab is
-- visible). "Live Visitors" = rows with last_seen inside the live window. Rows
-- are ephemeral; the heartbeat endpoint opportunistically prunes stale ones.
CREATE TABLE IF NOT EXISTS public.live_presence (
  visitor_id TEXT        PRIMARY KEY CHECK (char_length(visitor_id) BETWEEN 8 AND 72),
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Current location in the store (path only, no query strings) for the live feed.
  path       TEXT,
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_presence_last_seen
  ON public.live_presence (last_seen DESC);

ALTER TABLE public.live_presence ENABLE ROW LEVEL SECURITY;

-- ─── Analytics indexes on existing tables ─────────────────────────────────────
-- Aggregations are date-range-scoped and often product- or type-scoped; these
-- keep them index-driven without touching any hot write path.

-- Per-product event counts (wishlist adds/removes, cart adds/removes for one slug).
CREATE INDEX IF NOT EXISTS idx_activity_log_slug_type_created
  ON public.activity_log (product_slug, type, created_at DESC)
  WHERE product_slug IS NOT NULL;
-- Per-user funnel lookups (a user's events in a window).
CREATE INDEX IF NOT EXISTS idx_activity_log_user_created
  ON public.activity_log (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Status-split order counts over a range (orders KPIs, cancellation rate).
CREATE INDEX IF NOT EXISTS orders_status_created_idx
  ON public.orders (status, created_at DESC);
-- Coupon analytics: orders grouped per coupon code.
CREATE INDEX IF NOT EXISTS orders_coupon_code_idx
  ON public.orders (coupon_code)
  WHERE coupon_code IS NOT NULL;

-- Product/variant sales rollups join order_items by slug or sku.
CREATE INDEX IF NOT EXISTS order_items_product_slug_idx
  ON public.order_items (product_slug);
CREATE INDEX IF NOT EXISTS order_items_sku_idx
  ON public.order_items (sku);

-- Reviews trend buckets scan by date across all products.
CREATE INDEX IF NOT EXISTS idx_product_reviews_created
  ON public.product_reviews (created_at DESC);
