-- =============================================================================
-- Migration: new order number format  LE-{seq}{4 random uppercase letters}
-- Created:   2026-07-03
-- Depends on: 20260701_coupon_rules.sql   (the CURRENT place_order definition)
--
-- Changes:
--   • order_number_seq floor is 100001 (next order's numeric part starts there).
--   • ALL place_order() overloads are dropped and ONE canonical version is created.
--   • place_order() generates  LE-100001ARSD  style numbers instead of LE000001.
--
-- IMPORTANT: the function signature here MUST match 20260701_coupon_rules.sql —
-- i.e. it has NO p_expect_first_order param (that was removed in 20260701, and the
-- backend's RPC call sends 14 args without it). Re-introducing that param makes the
-- backend call unresolvable and breaks checkout ("couldn't confirm your payment").
-- This migration changes ONLY the order-number line vs. 20260701; nothing else.
--
-- ⚠️ MANUAL STEP: run in the Supabase SQL editor after the dependency above.
-- =============================================================================

-- ─── Sequence floor: 100001, never moved backward (safe to re-run) ──────────────
DO $$
BEGIN
  IF (SELECT last_value FROM order_number_seq) < 100001 THEN
    PERFORM setval('order_number_seq', 100001, false);  -- next nextval() returns 100001
  END IF;
END $$;
ALTER SEQUENCE order_number_seq MINVALUE 100001 START WITH 100001;

-- ─── Drop EVERY place_order overload so only the canonical one below survives ────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'place_order'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig::text;
  END LOOP;
END $$;

-- Create the one canonical place_order — signature identical to 20260701.
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

  -- ── Stock check + decrement, NULL-safe, one locked variant row at a time ──────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sku := v_item->>'sku';
    v_qty := COALESCE((v_item->>'quantity')::int, 0);

    SELECT pv.stock, pv.is_unlimited INTO v_stock, v_unlimited
    FROM product_variants pv
    WHERE pv.variant_sku = v_sku
    FOR UPDATE;

    IF FOUND THEN
      IF v_unlimited OR v_stock IS NULL THEN
        NULL;
      ELSIF v_stock < v_qty THEN
        result := 'oversold:' || v_sku;
        RETURN NEXT; RETURN;
      ELSE
        UPDATE product_variants pv SET stock = pv.stock - v_qty
        WHERE pv.variant_sku = v_sku;
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

  -- ── Order number (only now, past every early-return, so retries don't burn one) ─
  -- Format: LE-{seq}{4 random uppercase letters}  e.g. LE-100001ARSD
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

-- Tell PostgREST to reload its schema cache so the new signature is callable at once.
NOTIFY pgrst, 'reload schema';
