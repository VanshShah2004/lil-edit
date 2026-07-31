-- Denormalized pending-state flags
-- Eliminates cross-table joins in PUBLISHED and DRAFT catalog list queries.
--
-- products.has_pending_updates  → TRUE when a newer draft is awaiting sync
-- draft_products.is_published   → TRUE when a live published counterpart exists
--
-- Maintained by:
--   saveDraftToDatabase   — sets both flags on save
--   delete_product_atomic — clears the sibling flag on delete (updated below)
--   launch_product_atomic — no change needed; new products row gets DEFAULT FALSE
--                           and the draft row is deleted before insert

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS has_pending_updates BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE draft_products
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill existing rows
--
-- has_pending_updates: mirror the original JS logic — TRUE only when the draft
-- was last updated MORE RECENTLY than the published version, meaning unsynchronised
-- changes exist.  A draft that is older than (or the same age as) the published
-- version is not a pending update.
UPDATE products p
SET has_pending_updates = TRUE
FROM draft_products d
WHERE d.base_sku    = p.base_sku
  AND d.updated_at  > p.updated_at;

-- is_published: TRUE for every draft that has a live published counterpart,
-- regardless of which version is newer.
UPDATE draft_products d
SET is_published = TRUE
FROM products p
WHERE p.base_sku = d.base_sku;

-- Update delete_product_atomic to maintain sibling flags atomically.
-- DRAFT delete  → clear has_pending_updates on the published counterpart (if any)
-- PUBLISHED delete → clear is_published on any surviving draft (if any)
CREATE OR REPLACE FUNCTION delete_product_atomic(
  p_id     UUID,
  p_status TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_base_sku TEXT;
BEGIN
  IF p_status = 'DRAFT' THEN
    SELECT base_sku INTO v_base_sku FROM draft_products WHERE id = p_id;
    DELETE FROM draft_product_images   WHERE product_id = p_id;
    DELETE FROM draft_product_variants WHERE product_id = p_id;
    DELETE FROM draft_products         WHERE id         = p_id;
    UPDATE products SET has_pending_updates = FALSE WHERE base_sku = v_base_sku;
  ELSE
    SELECT base_sku INTO v_base_sku FROM products WHERE id = p_id;
    DELETE FROM product_images   WHERE product_id = p_id;
    DELETE FROM product_variants WHERE product_id = p_id;
    DELETE FROM products         WHERE id         = p_id;
    UPDATE draft_products SET is_published = FALSE WHERE base_sku = v_base_sku;
  END IF;
END;
$$;
