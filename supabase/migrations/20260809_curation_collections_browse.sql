-- =============================================================================
-- Migration: retire "Featured Collections", curate "Browse the Collections" placards
-- Created:   2026-08-09
--
-- What changes
-- ────────────
-- The Collections page no longer renders the Featured Collections mosaic — the
-- component (components/collections/FeaturedCollectionsGrid.tsx) is deleted, so
-- the collections_featured section and its tiles are dead rows.
--
-- In its place, the "Browse the Collections" strip that was already on that page
-- becomes admin-curatable — but for its PLACARD IMAGE and PLACARD LINK only.
-- Labels, blurbs, icons, gradients and the fallback route stay fixed in
-- SUB_COLLECTIONS (components/collections/BrowseCollections.tsx); the admin sets
-- the picture and, optionally, re-points the placard at a specific product.
--
-- Hence item_type = 'editorial': each row is a tile carrying custom_image_url +
-- link_url. The Spotlight editor renders a cut-down form for this section —
-- image upload plus a PRODUCT DROPDOWN for the link (no free-text URL, no
-- title/subtitle/badge fields), so a placard can only ever point at a real
-- published product or at its own collection.
--
-- Slot model
-- ──────────
-- Up to five tiles, matched to the five collections BY POSITION — sort_order
-- 0..4 maps to SUB_COLLECTIONS order: New Arrivals, Girls, Boys, Trending, By
-- Occasion. Reordering or removing a tile therefore re-points the placards; the
-- Spotlight editor labels each row with the placard it feeds, and the storefront
-- matches on the row's sort_order (sent as `slot`) rather than array position so
-- a deactivated row leaves a gap instead of shifting its neighbours.
--
-- Nothing is seeded: an unfilled slot falls back client-side to that collection's
-- own newest product and its own /collections/… route, exactly as the strip
-- behaved before curation existed. Applying this migration alone therefore
-- changes nothing visible until an admin fills a slot.
--
-- Both tile fields are optional (collections_browse is in IMAGE_OPTIONAL_SECTIONS,
-- backend/routes/curation.ts), so an image-only tile, a link-only tile, or a tile
-- carrying both are all valid; each empty field independently falls back.
--
-- PREREQUISITE: 20260708_curation_desktop_only_tiles.sql must already be applied.
-- It relaxed curated_items_shape_check so editorial rows no longer need an image
-- at the DB level; without it a link-only tile is rejected by the CHECK constraint
-- even though the backend allows it.
--
-- Idempotent: ON CONFLICT DO NOTHING, and the item_type update is a no-op on a
-- section already in the right shape. Safe to re-run over an earlier draft that
-- created this section as 'product'. Apply manually via the Supabase SQL editor
-- (matches this project's workflow).
-- =============================================================================

-- ─── 1. The new section ──────────────────────────────────────────────────────
-- max_items = 5 because SUB_COLLECTIONS has five entries. Adding a sixth
-- collection to the strip means bumping this, or the read-time slice in
-- routes/curation.ts will silently drop the last slot.
insert into public.curated_sections (section_key, title, subtitle, item_type, max_items) values
  ('collections_browse', 'Browse the Collections', null, 'editorial', 5)
on conflict (section_key) do nothing;

-- Re-assert the shape in case an earlier draft of this migration created the
-- section as 'product' (a product section would offer the product picker and the
-- random top-up instead of the image + product-link tile form). Any product rows
-- left behind are dropped: they carry no custom_image_url or link_url and would
-- resolve to an empty tile anyway.
update public.curated_sections
   set item_type = 'editorial', max_items = 5
 where section_key = 'collections_browse';

delete from public.curated_section_items i
 using public.curated_sections s
 where i.section_id = s.id
   and s.section_key = 'collections_browse'
   and i.kind = 'product';

-- ─── 2. Drop the retired section ─────────────────────────────────────────────
-- curated_section_items.section_id is ON DELETE CASCADE, so its tiles go with it.
delete from public.curated_sections where section_key = 'collections_featured';

-- Verify after applying:
--   select section_key, item_type, max_items from public.curated_sections
--    where section_key in ('collections_browse', 'collections_featured');
--   -- expect exactly one row: collections_browse / editorial / 5
--
--   select i.sort_order, i.kind, i.custom_image_url, i.link_url
--     from public.curated_section_items i
--     join public.curated_sections s on s.id = i.section_id
--    where s.section_key = 'collections_browse'
--    order by i.sort_order;
--   -- expect 0 rows on a fresh apply; every row 'editorial' after curating
