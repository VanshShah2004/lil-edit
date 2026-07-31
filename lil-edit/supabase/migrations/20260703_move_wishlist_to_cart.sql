-- Atomic "move wishlist item to cart".
--
-- Replaces the app-side select → update-or-insert → delete sequence, which had
-- two holes:
--   1. Lost-increment race: two concurrent moves of the same SKU could both read
--      quantity N and both write N+1.
--   2. Non-transactional move: cart insert could succeed while the wishlist
--      delete failed, so a client retry incremented the cart a second time.
--
-- This function does everything in one transaction. The wishlist DELETE runs
-- first (RETURNING the row): a concurrent duplicate call finds no row and
-- returns 'not_found' instead of double-adding, and if the cart upsert fails
-- the delete rolls back with it.

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
  DO UPDATE SET quantity   = cart_items.quantity + 1,
                updated_at = NOW()
  RETURNING (xmax = 0) INTO v_inserted;  -- xmax = 0 → fresh insert, else updated

  RETURN CASE WHEN v_inserted THEN 'added' ELSE 'incremented' END;
END;
$$;

-- Backend calls this with the service role; nobody else needs it.
REVOKE ALL ON FUNCTION move_wishlist_to_cart(UUID, UUID) FROM PUBLIC, anon, authenticated;
