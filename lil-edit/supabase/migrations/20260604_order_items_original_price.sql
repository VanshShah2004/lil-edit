-- Add the original (pre-discount / MRP) unit price to the order_items snapshot, so
-- the order detail page can show what each item normally costs next to what was paid.
--
-- Snapshotted like every other line field — there is NO runtime FK to products, so
-- editing a product's price later never rewrites order history. The backfill below
-- is a ONE-TIME copy from the current catalog for rows that predate this column.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Backfill existing rows from the live catalog (matched by the snapshot's slug).
UPDATE order_items oi
   SET original_price = COALESCE(p.original_price, p.price, oi.unit_price)
  FROM products p
 WHERE p.slug = oi.product_slug
   AND oi.original_price = 0;

-- Any rows with no matching product (or still 0) fall back to the paid price,
-- i.e. "no discount" rather than a bogus ₹0 strike-through.
UPDATE order_items
   SET original_price = unit_price
 WHERE original_price = 0;
