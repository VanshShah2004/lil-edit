-- =============================================================================
-- Migration: checkout airtightness — paid orders are ALWAYS honored
-- Created:   2026-07-09
-- Depends on: 20260703_order_number_format.sql (the CURRENT place_order: 14-arg
--             signature, NO p_expect_first_order, LE-{seq}{XXXX} order numbers)
--
-- Design: checkout is verify-then-create, so place_order only ever runs for a
-- payment Razorpay has ALREADY CAPTURED — and this store issues no refunds. A
-- captured payment therefore must always produce an order. Changes vs 20260703:
--
--   1. place_order() no longer returns 'oversold:<sku>' — the old body could
--      reject a PAID order when stock dropped between /initiate's pre-check and
--      /verify (worse: its item-by-item decrement + plain RETURN committed the
--      earlier lines' stock decrements with no order — phantom stock loss,
--      repeated by the webhook retry). Now every line is honored: stock is
--      decremented with a floor of 0 (GREATEST) under the same FOR UPDATE lock.
--      A sku that no longer resolves simply has nothing to decrement — the
--      order line snapshot is still written. Oversell prevention stays where it
--      belongs: BEFORE payment (/initiate's pre-check + oversold-line exclusion).
--   2. Explicit privileges: previously place_order was only protected by
--      accident (invoker-rights + RLS made direct browser RPC calls error out).
--      Now EXECUTE is revoked from anon/authenticated by design; only the
--      backend's service role may call it.
--
-- ⚠️ MANUAL STEP: run in the Supabase SQL editor. Requires the backend to use the
--    service role key (SUPABASE_SERVICE_ROLE_KEY) — after the REVOKE below, the
--    anon-key fallback can no longer call place_order.
-- =============================================================================

-- Same 14-arg signature as 20260703; safe to re-run (plain CREATE OR REPLACE).
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

  -- ── Stock decrement — NEVER rejects (the payment is already captured) ─────────
  -- Quantities are summed per sku (one variant can appear on several size lines),
  -- the row is locked, and stock is decremented with a floor of 0. Unlimited
  -- variants (is_unlimited or NULL stock) are untouched by the GREATEST clamp
  -- math because they're excluded in the WHERE. A sku with no variant row (base-
  -- sku product, or a since-removed variant) has nothing to decrement — the paid
  -- order line is still written below regardless.
  FOR v_item IN
    SELECT jsonb_build_object('sku', it->>'sku',
                              'quantity', SUM(COALESCE((it->>'quantity')::int, 0)))
    FROM jsonb_array_elements(p_items) AS it
    GROUP BY it->>'sku'
  LOOP
    v_sku := v_item->>'sku';
    v_qty := COALESCE((v_item->>'quantity')::int, 0);

    -- Lock, then clamp-decrement in one statement; the FOR UPDATE inside the
    -- UPDATE's row fetch serializes with any concurrent placement of this sku.
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

-- ── Lock the RPC down by design, not by accident ─────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.place_order(
  uuid, jsonb, jsonb, numeric, numeric, numeric, numeric, integer, text, text, text, text, boolean, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(
  uuid, jsonb, jsonb, numeric, numeric, numeric, numeric, integer, text, text, text, text, boolean, text
) TO service_role;

-- Refresh PostgREST's schema cache (same convention as 20260703).
NOTIFY pgrst, 'reload schema';
