-- =============================================================================
-- Migration: make curated editorial tile images optional (Home Collage overrides)
-- Created:   2026-07-08
--
-- Why
-- ───
-- Home Collage tiles are pure per-breakpoint overrides on top of the storefront's
-- built-in per-slot artwork: mobile uses custom_image_url, desktop uses
-- meta.desktop_image_url, and whichever a tile leaves empty (mobile, desktop, or
-- BOTH) falls back to the bundled default image in HomeCollage.tsx. Admins want to
-- upload just one of the two — or leave a slot on the defaults entirely — without
-- the save being rejected.
--
-- The original curated_items_shape_check (20260618) required every editorial item to
-- carry a custom_image_url. A CHECK constraint can't be section-aware (it can't read
-- curated_sections.section_key), so we relax the editorial branch entirely: editorial
-- items no longer need an image at the DB level. The backend (routes/curation.ts) is
-- the real gatekeeper and still requires an image for every editorial section EXCEPT
-- home_collage, so non-collage sections (which have no per-slot defaults) can't be
-- saved imageless through the API.
--
-- Idempotent: drops + recreates the named constraint. Apply manually via the Supabase
-- SQL editor (matches this project's workflow).
-- =============================================================================

alter table public.curated_section_items
  drop constraint if exists curated_items_shape_check;

alter table public.curated_section_items
  add constraint curated_items_shape_check check (
    -- Product items must still reference a base SKU. Editorial items are unconstrained
    -- here — image requirements are enforced per-section in the backend.
    kind <> 'product' or product_base_sku is not null
  );

-- Verify after applying:
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint where conname = 'curated_items_shape_check';
