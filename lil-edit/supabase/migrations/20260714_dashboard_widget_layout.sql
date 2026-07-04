-- =============================================================================
-- Migration: dashboard widget layout — global, admin-curated card visibility
-- Created:   2026-07-14
--
-- Backs the "iPhone jiggle-mode" hide/show for analytics cards. An admin can
-- long-press (mobile) / right-click (desktop) any metric, chart or table on an
-- analytics page and hide it; hidden cards drop into a tray with a "+" to bring
-- them back. The choice is GLOBAL — shared by every admin, not per-account and
-- not per-browser — so it lives in the database, exactly like the maintenance
-- kill switch (20260702_site_maintenance.sql).
--
-- MODEL: one row per (page, widget) that is currently HIDDEN. The mere presence
-- of a row means "this card is hidden on this page"; restoring a card DELETES its
-- row. So an empty table = every card visible everywhere (the default).
--
-- SECURITY (mirrors site_settings):
--   • RLS is ENABLED with NO policies → the public PostgREST roles (anon /
--     authenticated — the anon key ships in the frontend) can neither read nor
--     write it. The service-role backend bypasses RLS, so the ONLY way to read or
--     change the layout is THROUGH the backend, which gates every write behind
--     requireAuth + requireAdmin + the admin rate limiter and audit-logs it.
--   • No SECURITY DEFINER RPC here (unlike the whole-site kill switch): this is a
--     cosmetic layout preference, so the RLS lock + admin-guarded API is airtight
--     without an extra in-DB admin re-check.
--
-- Everything is idempotent.
--
-- ⚠️ MANUAL STEP: run this in the Supabase SQL editor. It is NOT auto-applied.
-- After applying, PostgREST normally reloads automatically; if the table 404s,
-- run `NOTIFY pgrst, 'reload schema';` or toggle the schema in the dashboard.
-- =============================================================================

-- ─── Hidden-widget registry ──────────────────────────────────────────────────
-- page_key  — the analytics page id ('executive', 'revenue', …). Matches the
--             `page` the backend router serves and the frontend's customizeKey.
-- widget_id — the card's stable slug ('units-sold', 'revenue-by-category', …),
--             derived on the frontend from the card's label/title.
-- The composite PK pins one row per card per page and its leading column indexes
-- the hot query (`WHERE page_key = :page`), so no extra index is needed.
CREATE TABLE IF NOT EXISTS public.dashboard_hidden_widgets (
  page_key         text        NOT NULL,
  widget_id        text        NOT NULL,
  hidden_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  hidden_by_email  text,
  hidden_at        timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (page_key, widget_id)
);

-- Default-deny: RLS on, no policies. Service role bypasses it; the public
-- PostgREST roles get nothing (can't even read which cards are hidden).
ALTER TABLE public.dashboard_hidden_widgets ENABLE ROW LEVEL SECURITY;

-- Verify after applying (RLS-with-no-policies is the whole guarantee: even if the
-- anon/authenticated roles hold a table-level grant, RLS returns ZERO rows and
-- refuses every write for them — only the service-role backend bypasses it):
--   select relrowsecurity from pg_class where relname = 'dashboard_hidden_widgets';   -- t
--   select count(*) from pg_policies where tablename = 'dashboard_hidden_widgets';    -- 0
