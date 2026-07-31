-- Remove review title column from product_reviews table
-- Reviews now contain only rating, comment, and images

ALTER TABLE product_reviews
DROP COLUMN IF EXISTS title;

-- Add comment to document the change
COMMENT ON TABLE product_reviews IS 'User reviews for products, keyed per (product_slug, sku). Contains rating, comment, and photos. Title field removed 2026-06-23.';
