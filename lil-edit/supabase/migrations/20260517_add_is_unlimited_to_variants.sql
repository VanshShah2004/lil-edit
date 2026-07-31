-- Migration to introduce explicit 'is_unlimited' tracking for both parent products and variants
-- Drops NOT NULL constraint on variant stock and adds the 'is_unlimited' boolean column to all catalog tables.

-- 1. Add is_unlimited column to parent products tables
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.draft_products ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add is_unlimited column to variants tables
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.draft_product_variants ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Allow variant stock to be NULL for unlimited variants
ALTER TABLE public.product_variants ALTER COLUMN stock DROP NOT NULL;
ALTER TABLE public.draft_product_variants ALTER COLUMN stock DROP NOT NULL;

-- 4. Migrate existing variant records where stock >= 99999 to use is_unlimited=TRUE and stock=NULL
UPDATE public.product_variants SET is_unlimited = TRUE, stock = NULL WHERE stock >= 99999;
UPDATE public.draft_product_variants SET is_unlimited = TRUE, stock = NULL WHERE stock >= 99999;

-- 5. Migrate existing parent products based on whether any of their variants are unlimited
UPDATE public.products p
SET is_unlimited = TRUE
WHERE EXISTS (
  SELECT 1 FROM public.product_variants pv
  WHERE pv.product_id = p.id AND pv.is_unlimited = TRUE
);

UPDATE public.draft_products dp
SET is_unlimited = TRUE
WHERE EXISTS (
  SELECT 1 FROM public.draft_product_variants dpv
  WHERE dpv.product_id = dp.id AND dpv.is_unlimited = TRUE
);
