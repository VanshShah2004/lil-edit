-- Make product slugs NON-unique.
--
-- Two different products may now share a slug — this happens naturally when they
-- share a title, since slug = slugify(title) (see src/utils/slug.ts, AddProduct.tsx).
-- The unique identifier of a buyable item becomes the SKU, which is ALREADY globally
-- unique (products.base_sku + product_variants.variant_sku are each unique). The slug
-- is now just a human-readable URL label; the PDP URL already carries the sku
-- (/collections/{cat}/product/{slug}${sku}), so product resolution moves to the sku.
--
-- Scope: ONLY slug-uniqueness changes here. base_sku and variant_sku stay unique, so
-- place_order's stock logic (20260618) is untouched. Application code that resolved a
-- product by slug is being switched to resolve by sku in the same change set
-- (backend/routes/products.ts /detail, persistCatalog.fetchProductBySku, and the
-- enrichment maps in checkout/cart/wishlist).

-- ─── Published catalog ─────────────────────────────────────────────────────────
-- Dropping the unique constraint also drops the index that backed it. Slug is still
-- used as a (now non-unique) filter — enrichment .in("slug", …), the reviews/title
-- helper, and the recommendation anchor lookup — so keep a plain index for those.
ALTER TABLE public.products       DROP CONSTRAINT IF EXISTS products_slug_unique;
CREATE INDEX IF NOT EXISTS products_slug_idx ON public.products (slug);

-- ─── Draft catalog ───────────────────────────────────────────────────────────────
-- Same rule for drafts. A non-unique slug index already exists (draft_products_slug_idx
-- from lil_edit_product_catalog.sql), so no replacement index is needed here.
ALTER TABLE public.draft_products DROP CONSTRAINT IF EXISTS draft_products_slug_unique;
