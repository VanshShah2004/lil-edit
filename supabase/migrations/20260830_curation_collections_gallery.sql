-- =============================================================================
-- Migration: curate "Styled by Our Community" (Collections page bento mosaic)
-- Created:   2026-08-30
--
-- What changes
-- ────────────
-- The mosaic that closes the Collections page was eight hardcoded images with
-- hand-typed captions and prices (pages/Collections.tsx). It moves into its own
-- component (components/collections/CommunityGallery.tsx), loses that mock data
-- entirely, and becomes an admin-curatable Spotlight section fed by real data.
--
-- item_type = 'mixed', which is doing two distinct jobs here:
--
--   1. DEFAULT CONTENT. An uncurated 'mixed' section is filled server-side with
--      random published products (see resolveItems in backend/routes/curation.ts
--      — the empty-section fallback runs for anything that is not 'editorial').
--      So out of the box the mosaic shows eight REAL products, live image, title
--      and price, each opening its PDP, reshuffled once per cache window.
--
--   2. ADMIN OVERRIDE. On top of that an admin can add photo tiles — a community
--      shot with its own caption, sub-caption and link — which take the front of
--      the strip. 'mixed' is what lets those editorial rows be saved at all.
--
-- Note the editor does NOT offer the catalog product picker for this section
-- (TILES_ONLY in pages/admin/Spotlight.tsx): products are what this strip falls
-- back to, not something to hand-pick into a community gallery. So "Add tile" is
-- the only add button, even though the section's type would technically allow
-- both. That constraint is deliberate and lives in the editor, not the schema.
--
-- Heading
-- ───────
-- title/subtitle seed the copy the page already shipped, and stay editable via
-- the Spotlight's "Edit heading". CommunityGallery falls back to the same two
-- strings in code, so a null heading is never rendered blank.
--
-- Fallback behaviour
-- ──────────────────
--   • Uncurated          → eight random published products (job 1 above).
--   • Partly curated     → the admin's photo tiles ONLY. A 'mixed' section is not
--                          topped up when partly curated, so two tiles means two
--                          tiles; the mosaic is shorter rather than padded.
--   • Curation offline   → request failed, section disabled, or this migration
--                          not applied. There is no local mock content any more,
--                          so CommunityGallery renders NOTHING and the page closes
--                          on the newsletter block instead of showing filler.
--
-- max_items = 8 matches BENTO_SPANS in CommunityGallery — the mosaic's row spans
-- are hand-tuned for eight tiles, and the cycle repeats beyond that.
--
-- Idempotent: ON CONFLICT DO NOTHING plus a re-assert of the shape, so it is safe
-- to re-run over an earlier draft of this section (including one applied while it
-- was briefly seeded 'editorial'). Curated rows are never touched. Apply manually
-- via the Supabase SQL editor — nothing runs migrations automatically here.
-- =============================================================================

insert into public.curated_sections (section_key, title, subtitle, item_type, max_items) values
  ('collections_gallery', 'Styled by Our Community', 'Real looks, worn by real little people.', 'mixed', 8)
on conflict (section_key) do nothing;

-- Re-assert shape and size. An earlier draft of this migration seeded the section
-- as 'editorial', which switches OFF the random-product fallback and would leave
-- the strip empty until an admin curated it — the opposite of the intent above.
update public.curated_sections
   set item_type = 'mixed', max_items = 8
 where section_key = 'collections_gallery';

-- Verify after applying:
--   select section_key, title, subtitle, item_type, max_items, is_enabled
--     from public.curated_sections
--    where section_key = 'collections_gallery';
--   -- expect one row: mixed / 8 / is_enabled = true
--
--   select i.sort_order, i.kind, i.custom_title, i.custom_image_url
--     from public.curated_section_items i
--     join public.curated_sections s on s.id = i.section_id
--    where s.section_key = 'collections_gallery'
--    order by i.sort_order;
--   -- expect 0 rows on a fresh apply; the storefront still shows 8 real products
