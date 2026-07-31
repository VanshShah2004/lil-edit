-- =============================================================================
-- Migration: Admin Action Log (admin audit trail)
-- Created:   2026-07-08
-- Purpose:   An append-only audit trail of actions taken BY ADMINS — product
--            launches/edits/deletes, coupon CRUD, order & payment status changes,
--            Spotlight (curation) edits, admin grant/revoke, and maintenance-mode
--            toggles. This is the admin-facing counterpart to activity_log (which
--            records what CUSTOMERS do).
--
-- ── Capture design ───────────────────────────────────────────────────────────
--   Unlike activity_log (DB triggers on cart_items/orders/…), every row here is
--   written from APPLICATION CODE in the admin mutation route that performs the
--   action (see backend/lib/adminAudit.ts → logAdminAction). Two reasons:
--     • the acting admin's identity lives on the request (req.userId), not in the
--       row being mutated, so a trigger couldn't attribute the action;
--     • the actions span many unrelated tables (products, coupons, curated_*,
--       site_settings, profiles) and several are RPCs — there is no single source
--       table to hang triggers on.
--   Writes are best-effort and never block the real mutation (the route has
--   already succeeded by the time it logs; a logging failure is swallowed).
--
-- ── Security ─────────────────────────────────────────────────────────────────
--   RLS enabled with NO policies → no anon/authenticated access. The backend
--   reads and writes exclusively via the service-role client (which bypasses RLS).
--   Admins can neither read the trail nor forge entries from the browser; the
--   read path is the requireAuth+requireAdmin-gated GET /api/admin/audit-log.
--
-- Run in the Supabase SQL editor as the project owner. Idempotent — safe to re-run.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The acting admin. ON DELETE SET NULL keeps the historical trail intact if the
  -- admin account is later removed (the snapshot summary still reads correctly).
  admin_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Action kind, e.g. 'product_launched' | 'coupon_created' | 'order_status_changed'
  -- | 'admin_access_revoked' | 'maintenance_enabled' … (see AdminActionType).
  action      TEXT        NOT NULL,
  -- What was acted on: 'product' | 'coupon' | 'order' | 'curation_section'
  --                  | 'admin_account' | 'site'.
  target_type TEXT,
  -- Natural id of the target: sku / coupon code / order id / section key / email.
  target_id   TEXT,
  -- Human-readable one-liner captured at write time (durable even if metadata drifts).
  summary     TEXT        NOT NULL DEFAULT '',
  -- Action-specific extras: changed fields, from/to status, discount, item counts …
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The feed reads newest-first, optionally filtered to a set of action kinds
-- (the frontend's category pills expand to an action list → WHERE action IN (…)).
CREATE INDEX IF NOT EXISTS idx_admin_action_log_created
  ON public.admin_action_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_action_created
  ON public.admin_action_log (action, created_at DESC);

-- ─── Row-level security ───────────────────────────────────────────────────────
-- No policies → service-role-only (the backend). Customers/admins can't read or
-- forge entries from the browser; all access is via the gated backend route.
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;
