-- =============================================================================
-- Migration: gift wrapping becomes a real, charged line on the order
-- Created:   2026-08-27
-- Depends on: 20260709_checkout_airtight.sql (the CURRENT place_order — 14-arg
--             signature, clamp-decrement stock, never rejects a paid order)
--
-- WHY: gift wrapping existed only in the checkout UI. Checkout.tsx added
-- ₹100 × items to the "Pay ₹X" button, but the amount actually sent to Razorpay
-- came from the backend, which knew nothing about it — so the customer was
-- shown one number and charged another (the lower one), and no order ever
-- recorded that wrapping was requested. Nothing downstream could act on it:
-- the receipt didn't mention it and the packing team never saw it.
--
-- This makes it real end to end. The fee is priced server-side in /initiate,
-- included in the Razorpay amount, and stored on the order as its own column so
-- receipts, order detail and the admin order view can break it out.
--
-- CHANGES vs 20260709:
--   1. orders.gift_wrap_fee — the amount actually charged for wrapping, in the
--      same shape as shipping_fee. > 0 means "this order is gift wrapped", so
--      no separate boolean is needed. Historical orders default to 0, which is
--      accurate: none of them were wrapped.
--   2. place_order() gains p_gift_wrap_fee and writes it. The body is otherwise
--      IDENTICAL to 20260709 — same idempotency, same clamp-decrement, same
--      "a captured payment always yields an order" guarantee.
--
-- The old 14-arg function is DROPPED rather than left alongside the new one: a
-- 15th parameter with a DEFAULT would make every existing 14-argument call
-- ambiguous, and PostgREST would fail to resolve the RPC at all.
--
-- ⚠️ MANUAL STEP: run in the Supabase SQL editor, AFTER 20260827_store_charges.sql.
--    Between the DROP and the CREATE below (same transaction if you run the file
--    as one statement batch) place_order does not exist — apply it at a quiet
--    moment, or wrap the file in BEGIN/COMMIT.
-- =============================================================================

-- ─── 1. The column ───────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gift_wrap_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

-- ─── 2. Replace place_order with the gift-wrap-aware version ─────────────────
DROP FUNCTION IF EXISTS public.place_order(
  uuid, jsonb, jsonb, numeric, numeric, numeric, numeric, integer, text, text, text, text, boolean, text
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
  p_coupon_code        TEXT    DEFAULT NULL,
  p_gift_wrap_fee      NUMERIC DEFAULT 0
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
  v_coupon        TEXT := NULLIF(upper(btrim(COALESCE(p_coupon_code, ''))), '');
  -- Never let a stray negative reach the order row; the money is already captured.
  v_gift_wrap     NUMERIC := GREATEST(COALESCE(p_gift_wrap_fee, 0), 0);
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

  -- ── Stock decrement — NEVER rejects (the payment is already captured) ─────────
  -- Quantities are summed per sku (one variant can appear on several size lines),
  -- the row is locked, and stock is decremented with a floor of 0. Unlimited
  -- variants (is_unlimited or NULL stock) are excluded in the WHERE. A sku with no
  -- variant row (base-sku product, or a since-removed variant) has nothing to
  -- decrement — the paid order line is still written below regardless.
  FOR v_item IN
    SELECT jsonb_build_object('sku', it->>'sku',
                              'quantity', SUM(COALESCE((it->>'quantity')::int, 0)))
    FROM jsonb_array_elements(p_items) AS it
    GROUP BY it->>'sku'
  LOOP
    v_sku := v_item->>'sku';
    v_qty := COALESCE((v_item->>'quantity')::int, 0);

    UPDATE product_variants pv
    SET stock = GREATEST(pv.stock - v_qty, 0)
    WHERE pv.variant_sku = v_sku
      AND pv.is_unlimited = FALSE
      AND pv.stock IS NOT NULL;
  END LOOP;

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
    subtotal, discount, shipping_fee, gift_wrap_fee, total, item_count,
    shipping_address, transaction_id, coupon_code
  )
  VALUES (
    p_user_id, v_order_number, p_status, p_payment_method, p_payment_status,
    p_subtotal, p_discount, p_shipping_fee, v_gift_wrap, p_total, p_item_count,
    p_shipping_address, p_transaction_id, v_coupon
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

  -- ── Coupon redemption (exactly-once on the created path) ──────────────────────
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

-- ── Lock the RPC down by design, not by accident (as 20260709) ───────────────────
REVOKE EXECUTE ON FUNCTION public.place_order(
  uuid, jsonb, jsonb, numeric, numeric, numeric, numeric, integer, text, text, text, text, boolean, text, numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(
  uuid, jsonb, jsonb, numeric, numeric, numeric, numeric, integer, text, text, text, text, boolean, text, numeric
) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Verify after applying:
--   -- exactly ONE place_order overload must exist (15 args):
--   select pronargs from pg_proc where proname = 'place_order';                  -- 15
--   select column_name from information_schema.columns
--     where table_name = 'orders' and column_name = 'gift_wrap_fee';             -- 1 row
