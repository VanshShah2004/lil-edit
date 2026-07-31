-- Migration to drop the total_stock column from products and draft_products tables.
-- Also drops the associated triggers and trigger functions to clean up total_stock calculations since stock is now variant-only.

-- 1. Drop the total_stock refresh triggers
DROP TRIGGER IF EXISTS product_variants_after_change_refresh_total ON public.product_variants;
DROP TRIGGER IF EXISTS draft_product_variants_after_change_refresh_total ON public.draft_product_variants;

-- 2. Drop the trigger functions
DROP FUNCTION IF EXISTS public.trg_variants_refresh_total_stock();
DROP FUNCTION IF EXISTS public.trg_draft_variants_refresh_total_stock();
DROP FUNCTION IF EXISTS public.refresh_product_total_stock(uuid);
DROP FUNCTION IF EXISTS public.refresh_draft_product_total_stock(uuid);

-- 3. Drop the total_stock column from products and draft_products tables
ALTER TABLE public.products DROP COLUMN IF EXISTS total_stock;
ALTER TABLE public.draft_products DROP COLUMN IF EXISTS total_stock;
