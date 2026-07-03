-- Quantity ceiling for cart lines: 99.
--
-- The API clamps every write path (add, increment, qty PATCH, size/color merges —
-- backend/routes/cart.ts MAX_QTY) and the steppers clamp client-side; this makes the
-- cap a table invariant and closes the one SQL-side writer (move_wishlist_to_cart's
-- +1 upsert), which could otherwise creep past any app-side clamp.

-- Existing rows first, so the constraint can validate.
UPDATE cart_items SET quantity = 99 WHERE quantity > 99;

ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_quantity_max;
ALTER TABLE cart_items ADD CONSTRAINT cart_items_quantity_max CHECK (quantity <= 99);

-- Re-create move_wishlist_to_cart with the increment clamped (LEAST(…, 99)).
-- Body otherwise identical to 20260703_move_wishlist_to_cart.sql.
CREATE OR REPLACE FUNCTION move_wishlist_to_cart(p_user_id UUID, p_wishlist_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      wishlist_items%ROWTYPE;
  v_inserted BOOLEAN;
BEGIN
  DELETE FROM wishlist_items
   WHERE id = p_wishlist_id
     AND user_id = p_user_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  INSERT INTO cart_items (user_id, product_slug, sku, size, quantity)
  VALUES (v_row.user_id, v_row.product_slug, v_row.sku, '', 1)
  ON CONFLICT ON CONSTRAINT cart_items_user_sku_size_key
  DO UPDATE SET quantity   = LEAST(cart_items.quantity + 1, 99),
                updated_at = NOW()
  RETURNING (xmax = 0) INTO v_inserted;  -- xmax = 0 → fresh insert, else updated

  RETURN CASE WHEN v_inserted THEN 'added' ELSE 'incremented' END;
END;
$$;

-- Backend calls this with the service role; nobody else needs it (same as 20260703).
REVOKE ALL ON FUNCTION move_wishlist_to_cart(UUID, UUID) FROM PUBLIC, anon, authenticated;
