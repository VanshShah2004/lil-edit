-- Order placement: the cart → order transaction that checkout has been missing.
--
-- Everything that "creates" an order lives here, in ONE transaction, so a placement
-- either fully happens or not at all:
--   • snapshot the priced line items into order_items (NO FK to products — see
--     20260604_orders.sql; product_id is the soft link added in 20260608),
--   • decrement variant stock under a row lock, with an oversell guard,
--   • seed the opening order_status_history + payment_status_history rows (actor
--     'System', exactly like the backfills in 20260609/20260612),
--   • clear the purchased lines from the cart.
--
-- The backend calls this through the service-role client (which bypasses RLS), so the
-- function is plain LANGUAGE plpgsql — NOT SECURITY DEFINER — matching the existing
-- admin_set_*_status convention. Placement is verify-then-create: the backend only
-- calls this AFTER a Razorpay payment is verified, so a failed/abandoned payment never
-- writes an order.

-- ─── order_number sequence ──────────────────────────────────────────────────────
-- Human-facing order numbers like LE000123. Distinct from the seed's LE-SEED-NNNN.
-- nextval is pulled INSIDE the function, AFTER the idempotency short-circuit, so a
-- retried verify+webhook for one payment never burns a number.
CREATE SEQUENCE IF NOT EXISTS order_number_seq;

-- ─── idempotency guard ──────────────────────────────────────────────────────────
-- One Razorpay payment id can map to at most one order. The /verify call and the
-- webhook can race to place the same payment; this partial unique index (plus the
-- 'exists' short-circuit in the function) guarantees they can't create two orders.
-- Partial so the many seed/COD rows with a NULL transaction_id are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS orders_transaction_id_unique
  ON orders (transaction_id)
  WHERE transaction_id IS NOT NULL;

-- ─── place_order() — atomic cart → order placement ───────────────────────────────
-- result ∈ ('created','exists','discount_invalid') or 'oversold:<sku>'.
--   created          — a new order was written; order_id/order_number are set.
--   exists           — p_transaction_id already placed an order; returns the prior one.
--   discount_invalid — caller claimed first-order pricing but the user already has an
--                      order; caller must re-price without the discount and retry.
--   oversold:<sku>   — the named line lacks stock; nothing was written.
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
  p_clear_cart         BOOLEAN
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
BEGIN
  -- Serialize one user's concurrent placements (auto-released at transaction end).
  -- Tightens both the first-order check and the stock decrement without locking the
  -- whole table. hashtext() yields the int the advisory lock keys on.
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
      -- Unlimited variants store stock = NULL (20260517) — skip the check entirely.
      IF v_unlimited OR v_stock IS NULL THEN
        NULL;
      ELSIF v_stock < v_qty THEN
        result := 'oversold:' || v_sku;
        RETURN NEXT; RETURN;
      ELSE
        -- CHECK (stock >= 0) on the column is a backstop; the guard above is primary.
        UPDATE product_variants pv SET stock = pv.stock - v_qty
        WHERE pv.variant_sku = v_sku;
      END IF;
    ELSE
      -- No variant row → the line is on the product's base_sku. There is no per-product
      -- stock column (total_stock was dropped in 20260517), so a base-sku line is only
      -- sellable when the product itself is unlimited.
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
    subtotal, discount, shipping_fee, total, item_count, shipping_address, transaction_id
  )
  VALUES (
    p_user_id, v_order_number, p_status, p_payment_method, p_payment_status,
    p_subtotal, p_discount, p_shipping_fee, p_total, p_item_count, p_shipping_address, p_transaction_id
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
  -- Matched on (sku, size) so an item added to the cart after /initiate isn't wiped.
  -- Direct-buy passes p_clear_cart = FALSE, so the cart is untouched.
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
