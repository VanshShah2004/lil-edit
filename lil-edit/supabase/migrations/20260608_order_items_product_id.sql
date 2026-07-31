-- Add a soft link from an order line back to its live product.
--
-- order_items stays an immutable snapshot (title/price/image/variant are still
-- copied at purchase time, see 20260604_orders.sql). This adds an OPTIONAL
-- reference so "View product / Reorder / Buy Again" can jump to the live catalog
-- entry when it still exists — WITHOUT making the snapshot depend on it.
--
-- ON DELETE SET NULL is deliberate: deleting a product nulls the link but leaves
-- the snapshot fully intact, so the order still renders exactly as purchased.
-- (Contrast with product_variants/product_images, which cascade-delete.)

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- Backfill existing rows from the live catalog, matched by the snapshot's slug.
-- Rows whose product no longer exists simply stay NULL.
UPDATE order_items oi
   SET product_id = p.id
  FROM products p
 WHERE p.slug = oi.product_slug
   AND oi.product_id IS NULL;

CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON order_items (product_id);
