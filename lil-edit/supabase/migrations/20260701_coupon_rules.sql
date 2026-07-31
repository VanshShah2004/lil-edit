-- =============================================================================
-- Migration: coupon per-user rules + de-hardcode FIRST10
-- Created:   2026-07-01
-- Depends on: 20260630_coupons.sql, 20260630_place_order_coupons.sql
--
-- Adds rule fields to coupons and folds the previously-hardcoded FIRST10 coupon
-- into the table:
--   • first_order_only    — valid only on a customer's first-ever order.
--   • once_per_user       — a customer may redeem the code at most once.
--   • max_discount_amount — caps the rupee discount (mainly for % coupons). NULL = no cap.
-- Both are enforced server-side by the backend (validateCoupon) against the orders
-- table — preventively at /coupon + /initiate, with a per-user Redis hold to stop a
-- concurrent double-mint. Since checkout is verify-then-create (the customer has
-- already paid), placement always honors a paid order, so place_order no longer needs
-- the old p_expect_first_order assertion (it always retried-and-honored anyway) — that
-- param is removed here.
--
-- ⚠️ MANUAL STEP: run in the Supabase SQL editor after the two dependencies above.
-- =============================================================================

ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS first_order_only    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS once_per_user       BOOLEAN NOT NULL DEFAULT false;
-- Caps the discount a percentage coupon can deduct (e.g. "20% off, up to ₹500"). NULL = no cap.
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS max_discount_amount NUMERIC CHECK (max_discount_amount > 0);

-- Drop every prior place_order signature so the new one isn't an ambiguous overload:
--   • 20260618 original (…, p_expect_first_order boolean, p_clear_cart boolean)
--   • 20260630 coupons   (… two booleans …, p_coupon_code text)
DROP FUNCTION IF EXISTS public.place_order(
  uuid, jsonb, jsonb, numeric, numeric, numeric, numeric, integer, text, text, text, text, boolean, boolean
);
DROP FUNCTION IF EXISTS public.place_order(
  uuid, jsonb, jsonb, numeric, numeric, numeric, numeric, integer, text, text, text, text, boolean, boolean, text
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

-- ── Fold the formerly-hardcoded FIRST10 into the table (idempotent) ─────────────
-- 10% off, first order only, once per customer. Kept active so it works exactly as
-- before — now visible + manageable in the admin Coupons panel.
INSERT INTO public.coupons (code, discount_type, discount_value, first_order_only, once_per_user, is_active)
VALUES ('FIRST10', 'percentage', 10, true, true, true)
ON CONFLICT (code) DO NOTHING;
