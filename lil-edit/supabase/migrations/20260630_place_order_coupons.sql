-- =============================================================================
-- Migration: wire admin coupons into order placement
-- Created:   2026-06-30
-- Depends on: 20260618_place_order.sql, 20260630_coupons.sql
--
-- Adds coupon redemption to the atomic placement transaction:
--   • orders.coupon_code  — records the code applied to the order (NULL when none).
--   • place_order() gains p_coupon_code and, on the 'created' path ONLY, atomically
--     increments coupons.uses_count for that code — in the SAME transaction as the
--     order insert, PAST the idempotency short-circuit, so a retried /verify + webhook
--     for one payment can never double-count. A code not in the table (e.g. the built-in
--     FIRST10) simply matches zero rows, and a not-yet-applied coupons migration is
--     tolerated via the undefined_table guard.
--
-- Concurrency note: the per-order increment is exactly-once and atomic. The global
-- max_uses cap is enforced up front at /coupon + /initiate; because placement is
-- verify-then-create (the customer has already paid the discounted amount), an order is
-- always honored, so under heavy concurrency uses_count may end a hair above max_uses
-- (bounded by the number of simultaneously in-flight checkouts). The counter always
-- reflects true redemptions, and once it reaches the cap all new checkouts are blocked.
--
-- ⚠️ MANUAL STEP: run in the Supabase SQL editor after the two dependencies above.
-- =============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;

-- Drop the previous 14-arg signature so the new optional p_coupon_code arg doesn't
-- create an ambiguous overload; CREATE OR REPLACE then keeps this migration re-runnable.
DROP FUNCTION IF EXISTS public.place_order(
  uuid, jsonb, jsonb, numeric, numeric, numeric, numeric, integer, text, text, text, text, boolean, boolean
);

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
  p_expect_first_order BOOLEAN,
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
  v_count         INTEGER;
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

  -- ── First-order re-check (the discount is never trusted from the browser) ─────
  IF p_expect_first_order THEN
    SELECT count(*) INTO v_count FROM orders o WHERE o.user_id = p_user_id;
    IF v_count <> 0 THEN
      result := 'discount_invalid';
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
  v_order_number := 'LE' || lpad(nextval('order_number_seq')::text, 6, '0');

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

  -- ── Coupon redemption (admin-managed coupons only) ────────────────────────────
  -- Exactly-once: we're on the 'created' path, past the idempotency short-circuit, in
  -- this transaction — a retried verify/webhook returns 'exists' above and never reaches
  -- here. A non-table code (FIRST10) matches 0 rows. The guard tolerates the coupons
  -- migration not being applied yet so placement can never break on it.
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
