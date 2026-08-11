-- =============================================================================
-- Migration: retire "Featured Collections", curate "Browse the Collections" images
-- Created:   2026-08-09
--
-- What changes
-- ────────────
-- The Collections page no longer renders the Featured Collections mosaic — the
-- component (components/collections/FeaturedCollectionsGrid.tsx) is deleted, so
-- the collections_featured section and its tiles are dead rows.
--
-- In its place, the "Browse the Collections" strip that was already on that page
-- becomes admin-curatable — but for its IMAGES ONLY, and only by PICKING A
-- CATALOG PRODUCT. Labels, blurbs, icons, gradients and routes stay fixed in
-- SUB_COLLECTIONS (components/collections/BrowseCollections.tsx); the admin just
-- chooses which product's photo fronts each placard. Hence item_type = 'product':
-- the Spotlight editor then offers only the product picker, with no title /
-- subtitle / image-URL / link / badge form.
--
-- Slot model
-- ──────────
-- Up to five product picks, matched to the five collections BY POSITION —
-- sort_order 0..4 maps to SUB_COLLECTIONS order: New Arrivals, Girls, Boys,
-- Trending, By Occasion. Reordering or removing a pick therefore re-points the
-- images; the Spotlight editor labels each row with the placard it feeds.
--
-- Nothing is seeded, because a product item must carry a product_base_sku (see
-- curated_items_shape_check) — there is no such thing as an empty product slot.
-- An unfilled slot falls back client-side to that collection's own newest
-- product, exactly as the strip behaved before curation, so applying this
-- migration alone changes nothing visible until an admin picks something.
--
-- NOTE this section is deliberately exempt from the random top-up every other
-- product section gets (NO_FALLBACK_SECTIONS in backend/routes/curation.ts): a
-- random catalog product behind "Girls" would be worse than no pick at all.
--
-- Idempotent: ON CONFLICT DO NOTHING, and the item_type update is a no-op on a
-- section already in the right shape. Apply manually via the Supabase SQL editor
-- (matches this project's workflow).
-- =============================================================================

-- ─── 1. The new section ──────────────────────────────────────────────────────
-- max_items = 5 because SUB_COLLECTIONS has five entries. Adding a sixth
-- collection to the strip means bumping this, or the read-time slice in
-- routes/curation.ts will silently drop the last slot.
insert into public.curated_sections (section_key, title, subtitle, item_type, max_items) values
  ('collections_browse', 'Browse the Collections', null, 'product', 5)
on conflict (section_key) do nothing;

-- Re-assert the shape in case an earlier draft of this migration created the
-- section as 'editorial' (an editorial section would offer the tile form instead
-- of the product picker). Any editorial rows left behind are dropped: they carry
-- no product_base_sku and would resolve to nothing anyway.
update public.curated_sections
   set item_type = 'product', max_items = 5
 where section_key = 'collections_browse';

delete from public.curated_section_items i
 using public.curated_sections s
 where i.section_id = s.id
   and s.section_key = 'collections_browse'
   and i.kind = 'editorial';

-- ─── 2. Drop the retired section ─────────────────────────────────────────────
-- curated_section_items.section_id is ON DELETE CASCADE, so its tiles go with it.
delete from public.curated_sections where section_key = 'collections_featured';

-- Verify after applying:
--   select section_key, item_type, max_items from public.curated_sections
--    where section_key in ('collections_browse', 'collections_featured');
--   -- expect exactly one row: collections_browse / product / 5
--
--   select i.sort_order, i.kind, i.product_base_sku
--     from public.curated_section_items i
--     join public.curated_sections s on s.id = i.section_id
--    where s.section_key = 'collections_browse'
--    order by i.sort_order;
--   -- expect 0 rows on a fresh apply; every row 'product' with a base SKU after curating
