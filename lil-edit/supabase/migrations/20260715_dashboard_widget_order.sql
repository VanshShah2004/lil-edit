-- =============================================================================
-- Migration: dashboard widget ORDER — global, admin-curated card arrangement
-- Created:   2026-07-15
--
-- Companion to 20260714_dashboard_widget_layout.sql (hide/show). That migration
-- records which cards are HIDDEN; this one records the ORDER cards are arranged in
-- WITHIN a section, so an admin can drag-to-rearrange the metrics in the "iPhone
-- jiggle" edit mode. Like visibility, the arrangement is GLOBAL — shared by every
-- admin, not per-account and not per-browser — so it lives in the database.
--
-- MODEL: one row per (page, section-group) holding the ordered list of widget ids
-- for that group. A card id absent from the list simply falls back to its natural
-- (source) position AFTER the listed ones, so newly-added cards append cleanly and
-- an empty table = every section in its default author order (the default).
--
-- SECURITY (mirrors dashboard_hidden_widgets / site_settings):
--   • RLS is ENABLED with NO policies → the public PostgREST roles (anon /
--     authenticated — the anon key ships in the frontend) can neither read nor
--     write it. The service-role backend bypasses RLS, so the ONLY way to read or
--     change the order is THROUGH the backend, which gates every write behind
--     requireAuth + requireAdmin + the admin rate limiter and audit-logs it.
--   • No SECURITY DEFINER RPC: this is a cosmetic layout preference, so the RLS
--     lock + admin-guarded API is airtight without an extra in-DB admin re-check.
--
-- Everything is idempotent.
--
-- ⚠️ MANUAL STEP: run this in the Supabase SQL editor. It is NOT auto-applied.
-- After applying, PostgREST normally reloads automatically; if the table 404s,
-- run `NOTIFY pgrst, 'reload schema';` or toggle the schema in the dashboard.
-- =============================================================================

-- ─── Per-section widget order ────────────────────────────────────────────────
-- page_key   — the analytics page id ('executive', 'revenue', …). Matches the
--              `page` the backend router serves and the frontend's customizeKey.
-- group_key  — the section/grid id within that page ('exec-money', 'exec-trends',
--              …), set by the <ReorderGroup groupKey> the cards live in.
-- ordered_ids — JSON array of card slugs in the admin's chosen order, e.g.
--              ["net-revenue","gross-revenue","orders"]. Ids not present fall back
--              to their natural position after the listed ones.
-- The composite PK pins one row per section per page and its leading column indexes
-- the hot query (`WHERE page_key = :page`), so no extra index is needed.
CREATE TABLE IF NOT EXISTS public.dashboard_widget_order (
  page_key         text        NOT NULL,
  group_key        text        NOT NULL,
  ordered_ids      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_email text,
  updated_at       timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (page_key, group_key)
);

-- Default-deny: RLS on, no policies. Service role bypasses it; the public
-- PostgREST roles get nothing (can't even read the arrangement).
ALTER TABLE public.dashboard_widget_order ENABLE ROW LEVEL SECURITY;

-- Verify after applying (RLS-with-no-policies is the whole guarantee: even if the
-- anon/authenticated roles hold a table-level grant, RLS returns ZERO rows and
-- refuses every write for them — only the service-role backend bypasses it):
--   select relrowsecurity from pg_class where relname = 'dashboard_widget_order';   -- t
--   select count(*) from pg_policies where tablename = 'dashboard_widget_order';    -- 0
