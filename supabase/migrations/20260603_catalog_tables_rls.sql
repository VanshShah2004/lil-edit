-- =============================================================================
-- Migration: enable RLS (default-deny) on the product catalog tables
-- Created:   2026-06-03
--
-- Why this exists
-- ───────────────
-- The Supabase anon key ships in the frontend bundle and is therefore PUBLIC.
-- Any table WITHOUT row-level security is directly readable (and, depending on
-- grants, writable) by anyone via PostgREST using that anon key — the frontend
-- is not a security boundary. The backend reads/writes these tables exclusively
-- through the service-role client, which BYPASSES RLS, so locking the tables
-- down does not affect any legitimate server-side path.
--
-- Without RLS here, unpublished drafts were directly enumerable:
--     GET /rest/v1/draft_products?select=*           (anon key) -> every draft
-- The admin-only backend routes (GET /, /catalog-list, /catalog-detail) gate the
-- API, but they are pointless if the underlying tables are open via PostgREST.
--
-- The fix is default-deny: enable RLS and add NO anon/authenticated policies.
-- All product data the storefront needs is served through the backend (service
-- role), so clients never read these tables directly. With RLS on and no SELECT
-- policy, an anon/authenticated PostgREST read returns [] instead of rows.
--
-- This was previously enabled by hand in the live project but lived in no
-- migration, so a fresh `supabase db reset` / new environment would come up with
-- RLS OFF and silently expose every draft. This file makes the protection
-- reproducible. It pairs with the table definitions in
-- lil-edit/supabase/migrations/lil_edit_product_catalog.sql.
--
-- Idempotent: ENABLE ROW LEVEL SECURITY is a no-op if already enabled, and
-- ALTER TABLE IF EXISTS skips tables that don't exist yet.
-- =============================================================================

ALTER TABLE IF EXISTS public.products               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_variants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_images         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.draft_products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.draft_product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.draft_product_images   ENABLE ROW LEVEL SECURITY;

-- No policies are defined on purpose: default-deny is the intended posture.
-- The service-role backend bypasses RLS, so published-product reads (PDP, search,
-- recommendations) keep working; direct anon/authenticated PostgREST access to
-- these tables now returns no rows.
--
-- Verify after applying:
--   select relname, relrowsecurity from pg_class
--   where relname in ('products','draft_products','draft_product_variants',
--     'draft_product_images','product_variants','product_images');
--   -- all rows must show relrowsecurity = true
