-- =============================================================================
-- Migration: checkout airtightness — two-pass stock check + failed_placements
-- Created:   2026-07-09
-- Depends on: 20260703_order_number_format.sql (the CURRENT place_order: 14-arg
--             signature, NO p_expect_first_order, LE-{seq}{XXXX} order numbers —
--             this file changes ONLY the stock loop vs. 20260703)
--
-- Fixes + hardening:
--   1. place_order() oversold bug: the old body decremented variant stock item by
--      item and, on finding a LATER item oversold, returned 'oversold:<sku>' with a
--      plain RETURN — which COMMITS the earlier decrements even though no order was
--      created (phantom stock loss; a webhook retry decremented them AGAIN). Now the
--      loop is two-pass: pass 1 locks (FOR UPDATE) and validates EVERY item, pass 2
--      decrements only after all passed. An oversold return now touches no stock.
--   2. failed_placements table: a durable record of payments that were captured but
--      could not be placed (oversold after payment, or unrecoverable snapshot), so a
--      pending refund is never tracked only in server logs. Written best-effort by
--      the backend; RLS enabled with no policies (service-role only).
--   3. Explicit privileges on place_order: previously it was only protected by
--      accident (invoker-rights + RLS made direct browser RPC calls error out).
--      Now EXECUTE is revoked from anon/authenticated by design; only the backend's
--      service role may call it.
--
-- ⚠️ MANUAL STEP: run in the Supabase SQL editor. Requires the backend to use the
--    service role key (SUPABASE_SERVICE_ROLE_KEY) — after the REVOKE below, the
--    anon-key fallback can no longer call place_order.
-- =============================================================================

-- ── 2) failed_placements — captured payments awaiting manual refund ─────────────
CREATE TABLE IF NOT EXISTS public.failed_placements (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_order_id  TEXT        NOT NULL,
  payment_id         TEXT        NOT NULL,
  user_id            UUID,
  amount_paise       BIGINT      NOT NULL DEFAULT 0,
  reason             TEXT        NOT NULL,          -- 'oversold:<sku>' | 'snapshot_unrecoverable'
  source             TEXT        NOT NULL,          -- 'verify' | 'webhook'
  resolved           BOOLEAN     NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per captured payment: /verify and the webhook can both hit the same
-- failure — the second insert becomes a no-op instead of a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS failed_placements_payment_id_unique
  ON public.failed_placements (payment_id);

ALTER TABLE public.failed_placements ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role (which bypasses RLS) reads/writes.

-- ── 1) place_order() — two-pass stock check (same signature; safe to re-run) ────
CREATE OR REPLACE FUNCTION public.place_order(
  p_user_id            UUID,
  p_shipping_address   JSONB,
  p_items              JSONB,
  p_subtotal           NUMERIC,
  p_discount           NUMERIC,
  p_shipping_fee       NUMERIC,
  p_total              NUMERIC,
  p_item_count         INTEGER,
  p_payment_method     TEXT,
  p_payment_status     TEXT,
  p_status             TEXT,
  p_transaction_id     TEXT,
  p_clear_cart         BOOLEAN,
  p_coupon_code        TEXT DEFAULT NULL
)
RETURNS TABLE (order_id UUID, order_number TEXT, result TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id      UUID;
  v_order_number  TEXT;
  v_existing_id   UUID;
  v_existing_num  TEXT;
  v_item          JSONB;
  v_sku           TEXT;
  v_qty           INTEGER;
  v_stock         INTEGER;
  v_unlimited     BOOLEAN;
  v_prod_unltd    BOOLEAN;
  v_coupon        TEXT := NULLIF(upper(btrim(COALESCE(p_coupon_code, ''))), '');
  -- Decrements deferred to pass 2, applied only once EVERY item has passed pass 1.
  v_deduct_skus   TEXT[]    := '{}';
  v_deduct_qtys   INTEGER[] := '{}';
  v_i             INTEGER;
BEGIN
  -- Serialize one user's concurrent placements (auto-released at transaction end).
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- ── Idempotency: one payment → one order ──────────────────────────────────────
  IF p_transaction_id IS NOT NULL THEN
    SELECT o.id, o.order_number INTO v_existing_id, v_existing_num
    FROM orders o
    WHERE o.transaction_id = p_transaction_id
    LIMIT 1;

    IF FOUND THEN
      order_id := v_existing_id; order_number := v_existing_num; result := 'exists';
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  -- ── Stock pass 1: lock + validate EVERY line before touching any stock ────────
  -- FOR UPDATE row locks are held to transaction end, so between pass 1 and pass 2
  -- no concurrent placement can change these rows. An oversold early-return here
  -- has decremented NOTHING — the commit is a pure no-op on stock.
  -- Quantities are SUMMED per sku first: one variant can appear on several lines
  -- (same sku, different sizes), and each line checked against the original stock
  -- independently would pass while the combined demand oversells.
  FOR v_item IN
    SELECT jsonb_build_object('sku', it->>'sku',
                              'quantity', SUM(COALESCE((it->>'quantity')::int, 0))) AS agg
    FROM jsonb_array_elements(p_items) AS it
    GROUP BY it->>'sku'
  LOOP
    v_sku := v_item->>'sku';
    v_qty := COALESCE((v_item->>'quantity')::int, 0);

    SELECT pv.stock, pv.is_unlimited INTO v_stock, v_unlimited
    FROM product_variants pv
    WHERE pv.variant_sku = v_sku
    FOR UPDATE;

    IF FOUND THEN
      IF v_unlimited OR v_stock IS NULL THEN
        NULL; -- unlimited variant: nothing to deduct
      ELSIF v_stock < v_qty THEN
        result := 'oversold:' || v_sku;
        RETURN NEXT; RETURN;
      ELSE
        v_deduct_skus := array_append(v_deduct_skus, v_sku);
        v_deduct_qtys := array_append(v_deduct_qtys, v_qty);
      END IF;
    ELSE
      SELECT p.is_unlimited INTO v_prod_unltd
      FROM products p
      WHERE p.base_sku = v_sku
      LIMIT 1;

      IF NOT COALESCE(v_prod_unltd, FALSE) THEN
        result := 'oversold:' || v_sku;
        RETURN NEXT; RETURN;
      END IF;
    END IF;
  END LOOP;

  -- ── Stock pass 2: all lines passed — apply the decrements ─────────────────────
  IF array_length(v_deduct_skus, 1) IS NOT NULL THEN
    FOR v_i IN 1..array_length(v_deduct_skus, 1)
    LOOP
      UPDATE product_variants pv SET stock = pv.stock - v_deduct_qtys[v_i]
      WHERE pv.variant_sku = v_deduct_skus[v_i];
    END LOOP;
  END IF;

  -- ── Order number (only now, past every early-return, so retries don't burn one) ─
  -- Format: LE-{seq}{4 random uppercase letters}  e.g. LE-100001ARSD  (per 20260703)
  v_order_number := 'LE-' || nextval('order_number_seq')::text
    || chr(65 + floor(random() * 26)::int)
    || chr(65 + floor(random() * 26)::int)
    || chr(65 + floor(random() * 26)::int)
    || chr(65 + floor(random() * 26)::int);

  -- ── Insert the order ──────────────────────────────────────────────────────────
  INSERT INTO orders (
    user_id, order_number, status, payment_method, payment_status,
    subtotal, discount, shipping_fee, total, item_count, shipping_address, transaction_id, coupon_code
  )
  VALUES (
    p_user_id, v_order_number, p_status, p_payment_method, p_payment_status,
    p_subtotal, p_discount, p_shipping_fee, p_total, p_item_count, p_shipping_address, p_transaction_id, v_coupon
  )
  RETURNING id INTO v_order_id;

  -- ── Snapshot the line items (product_id soft-link + original_price included) ───
  INSERT INTO order_items (
    order_id, product_id, product_slug, category_slug, sku, title, image_url,
    size, color_name, color_hex, unit_price, original_price, quantity, line_total
  )
  SELECT
    v_order_id,
    NULLIF(it->>'product_id', '')::uuid,
    it->>'product_slug',
    COALESCE(it->>'category_slug', ''),
    it->>'sku',
    it->>'title',
    COALESCE(it->>'image_url', ''),
    COALESCE(it->>'size', ''),
    COALESCE(it->>'color_name', ''),
    COALESCE(it->>'color_hex', ''),
    COALESCE((it->>'unit_price')::numeric, 0),
    COALESCE((it->>'original_price')::numeric, 0),
    COALESCE((it->>'quantity')::int, 1),
    COALESCE((it->>'line_total')::numeric, 0)
  FROM jsonb_array_elements(p_items) AS it;

  -- ── Coupon redemption (exactly-once on the created path; FIRST10 is now a row) ──
  IF v_coupon IS NOT NULL THEN
    BEGIN
      UPDATE coupons SET uses_count = uses_count + 1 WHERE code = v_coupon;
    EXCEPTION
      WHEN undefined_table THEN
        NULL; -- coupons table not present yet; skip silently
    END;
  END IF;

  -- ── Seed the opening audit rows (mirrors the 20260609 / 20260612 backfills) ────
  INSERT INTO order_status_history
    (order_id, from_status, to_status, changed_by, changed_by_name, changed_by_email)
  VALUES
    (v_order_id, NULL, p_status, NULL, 'System', '');

  INSERT INTO payment_status_history
    (order_id, from_status, to_status, changed_by, changed_by_name, changed_by_email)
  VALUES
    (v_order_id, NULL, p_payment_status, NULL, 'System', '');

  -- ── Clear only the purchased lines (cart mode) ────────────────────────────────
  IF p_clear_cart THEN
    DELETE FROM cart_items ci
    WHERE ci.user_id = p_user_id
      AND (ci.sku, ci.size) IN (
        SELECT it->>'sku', COALESCE(it->>'size', '')
        FROM jsonb_array_elements(p_items) AS it
      );
  END IF;

  order_id := v_order_id; order_number := v_order_number; result := 'created';
  RETURN NEXT;
END;
$$;

-- ── 3) Lock the RPC down by design, not by accident ─────────────────────────────
REVOKE EXECUTE ON FUNCTION public.place_order(
  uuid, jsonb, jsonb, numeric, numeric, numeric, numeric, integer, text, text, text, text, boolean, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(
  uuid, jsonb, jsonb, numeric, numeric, numeric, numeric, integer, text, text, text, text, boolean, text
) TO service_role;

-- Refresh PostgREST's schema cache so the new failed_placements table is visible
-- to the backend immediately (same convention as 20260703).
NOTIFY pgrst, 'reload schema';
