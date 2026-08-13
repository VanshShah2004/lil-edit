-- =============================================================================
-- Migration: rename "Browse the Collections" → "Browse Collections"
-- Created:   2026-08-11
--
-- The storefront <h2> is hardcoded in components/collections/BrowseCollections.tsx
-- and ships with the build. This row drives only the name the Spotlight sidebar
-- shows (pages/admin/Spotlight.tsx renders curated_sections.title), so renaming
-- both keeps the console and the page in step.
--
-- section_key stays 'collections_browse' — no tile, image or link is touched, and
-- nothing about how the strip resolves changes. Purely a label.
--
-- Idempotent: a no-op once the title already reads the new value. Apply manually
-- via the Supabase SQL editor (matches this project's workflow).
-- =============================================================================

update public.curated_sections
   set title = 'Browse Collections'
 where section_key = 'collections_browse';

-- Verify after applying:
--   select section_key, title, item_type, max_items from public.curated_sections
--    where section_key = 'collections_browse';
--   -- expect: collections_browse / Browse Collections / editorial / 5
--
--   select count(*) from public.curated_section_items i
--     join public.curated_sections s on s.id = i.section_id
--    where s.section_key = 'collections_browse';
--   -- expect: unchanged from before the rename — no tile is touched
