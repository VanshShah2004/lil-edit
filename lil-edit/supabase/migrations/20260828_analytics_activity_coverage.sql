-- =============================================================================
-- Migration: Analytics follow-up to the activity_log coverage build-out
-- Created:   2026-08-28
-- Depends:   20260711_analytics_foundation.sql
--            20260712_analytics_rpcs_core.sql
--            20260713_analytics_rpcs_detail.sql
--            20260828_activity_coverage.sql   (the new event kinds)
--
-- 20260828_activity_coverage.sql added twelve new activity_log event kinds
-- (account, address, review-lifecycle) plus coupon_applied and
-- newsletter_subscribed. activity_log is SHARED with the analytics platform, so
-- this file does two things:
--
--   1. FIXES A REGRESSION in analytics_live.
--      Its unified feed selected from activity_log with NO type filter — fine
--      when the table only held shopping events, but 'login' is now the highest
--      volume kind in there. Left alone, the Live dashboard's feed would fill up
--      with logins and address edits and push the actual shopping signal off the
--      list (and render them all as "… did something", since Live.tsx's
--      describe() has no case for them). The feed now selects an explicit
--      whitelist.
--
--   2. ADDS COUPON ATTEMPT ANALYTICS to analytics_coupons.
--      Until coupon_applied existed, only REDEEMED coupons were observable
--      anywhere (via orders.coupon_code) — a code customers kept trying and kept
--      being refused was invisible. The RPC now reports attempts, failures, the
--      success rate, per-code attempt counts, and the top rejection reasons.
--
-- Everything else was checked and needs no change: every other activity_log read
-- in the analytics RPCs either filters on `type = …` explicitly or aggregates
-- with COUNT(*) FILTER (WHERE type = …), so extra rows of new kinds cannot move
-- those numbers.
--
-- Both functions are re-declared in full (CREATE OR REPLACE with an unchanged
-- signature), matching how 20260709_auto_process_audit_log.sql amended
-- 20260704's function. Existing GRANTs survive a replace; they are re-applied at
-- the bottom anyway so this file is safe to run on its own.
--
-- Run in the Supabase SQL editor as the project owner. Idempotent.
-- =============================================================================

-- ─── analytics_live ───────────────────────────────────────────────────────────
-- No date params: fixed windows (5 min for presence/engagement, 60 min for
-- orders). Called by a short-poll endpoint — keep it lean, never cached.
CREATE OR REPLACE FUNCTION public.analytics_live()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  kpis JSONB;
  feed JSONB;
  -- The kinds worth surfacing on a live STORE dashboard. Deliberately excludes
  -- the account-maintenance kinds (login / profile_updated / phone_verified /
  -- address_* / newsletter_subscribed / review_updated / review_removed): they
  -- are real customer activity and they belong on the User Activity feed, but
  -- here they would crowd out the shopping signal this dashboard exists to show.
  -- 'signup' is kept because a new account IS a live storefront event, and
  -- 'coupon_applied' because it sits inside the buying flow.
  live_kinds TEXT[] := ARRAY[
    'cart_add', 'cart_remove',
    'wishlist_add', 'wishlist_remove',
    'search', 'order_placed', 'checkout_started',
    'review_submitted', 'coupon_applied', 'signup'
  ];
BEGIN
  SELECT jsonb_build_object(
    'live_visitors',  (SELECT COUNT(*) FROM live_presence WHERE last_seen > now() - interval '5 minutes'),
    'views_5m',       (SELECT COUNT(*) FROM product_views WHERE created_at > now() - interval '5 minutes'),
    'cart_adds_5m',   (SELECT COUNT(*) FROM activity_log WHERE type = 'cart_add' AND created_at > now() - interval '5 minutes'),
    'wishlist_adds_5m', (SELECT COUNT(*) FROM activity_log WHERE type = 'wishlist_add' AND created_at > now() - interval '5 minutes'),
    'searches_5m',    (SELECT COUNT(*) FROM activity_log WHERE type = 'search' AND created_at > now() - interval '5 minutes'),
    'orders_60m',     (SELECT COUNT(*) FROM orders WHERE created_at > now() - interval '60 minutes' AND status <> 'cancelled'),
    'revenue_60m',    COALESCE((SELECT SUM(total) FROM orders WHERE created_at > now() - interval '60 minutes' AND status <> 'cancelled'), 0)
  ) INTO kpis;

  -- Unified live feed: latest views + activity events, newest first.
  WITH merged AS (
    (SELECT 'product_view'::text AS type, v.created_at, v.product_slug, v.sku, v.user_id,
            jsonb_build_object('source', v.source) AS metadata
     FROM product_views v ORDER BY v.created_at DESC LIMIT 25)
    UNION ALL
    (SELECT a.type, a.created_at, a.product_slug, a.sku, a.user_id,
            -- 'email' is stripped alongside the bulky keys: signup metadata carries
            -- the address, and this feed already names the person.
            a.metadata - 'result_slugs' - 'items' - 'seed' - 'seed_batch' - 'email' AS metadata
     FROM activity_log a
     WHERE a.type = ANY(live_kinds)
     ORDER BY a.created_at DESC LIMIT 25)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'type', m.type,
           'at', m.created_at,
           'slug', m.product_slug,
           'sku', m.sku,
           'title', CASE WHEN m.product_slug IS NOT NULL
                         THEN COALESCE((SELECT title FROM products WHERE slug = m.product_slug LIMIT 1), m.product_slug) END,
           'user_name', CASE WHEN m.user_id IS NOT NULL
                             THEN COALESCE((SELECT NULLIF(btrim(concat(pr.first_name, ' ', pr.last_name)), '')
                                            FROM profiles pr WHERE pr.id = m.user_id), 'Customer') END,
           'metadata', m.metadata
         ) ORDER BY m.created_at DESC), '[]'::jsonb)
  INTO feed
  FROM (SELECT * FROM merged ORDER BY created_at DESC LIMIT 30) m;

  RETURN jsonb_build_object('kpis', kpis, 'feed', feed, 'as_of', now());
END;
$fn$;

-- ─── analytics_coupons ────────────────────────────────────────────────────────
-- Redemption performance (from orders) PLUS attempt performance (from the
-- coupon_applied activity events written by backend/routes/checkout.ts).
CREATE OR REPLACE FUNCTION public.analytics_coupons(
  p_from      TIMESTAMPTZ,
  p_to        TIMESTAMPTZ,
  p_prev_from TIMESTAMPTZ,
  p_prev_to   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  kpis      JSONB;
  prev      JSONB;
  rows_     JSONB;
  failures  JSONB;
BEGIN
  WITH co AS (          -- couponed orders in window
    SELECT o.*, f.first_order
    FROM orders o
    JOIN LATERAL (
      SELECT MIN(o2.created_at) AS first_order
      FROM orders o2 WHERE o2.user_id = o.user_id AND o2.status <> 'cancelled'
    ) f ON TRUE
    WHERE o.coupon_code IS NOT NULL
      AND o.created_at >= p_from AND o.created_at < p_to
  ), act AS (SELECT * FROM co WHERE status <> 'cancelled'),
  -- Every "Apply" the customer pressed, successful or not. A coupon_applied row
  -- is written on each check, so a shopper retrying the same code counts twice —
  -- which is the point: repeated refusals are the signal.
  att AS (
    -- IS NOT DISTINCT FROM (not '=') so a row missing the key yields false, not NULL:
    -- otherwise it would count toward attempts but toward neither ok nor failed.
    SELECT (metadata->>'valid') IS NOT DISTINCT FROM 'true' AS ok
    FROM activity_log
    WHERE type = 'coupon_applied'
      AND created_at >= p_from AND created_at < p_to
  )
  SELECT jsonb_build_object(
    'coupon_orders',    (SELECT COUNT(*) FROM act),
    'active_coupons',   (SELECT COUNT(*) FROM coupons c
                         WHERE c.is_active
                           AND (c.expires_at IS NULL OR c.expires_at > now())
                           AND (c.max_uses IS NULL OR c.uses_count < c.max_uses)),
    'revenue',          COALESCE((SELECT SUM(total) FROM act), 0),
    'discount_given',   COALESCE((SELECT SUM(discount) FROM act), 0),
    'avg_discount',     ROUND(COALESCE((SELECT AVG(discount) FROM act), 0), 2),
    'roi',              ROUND(COALESCE((SELECT SUM(total) FROM act), 0)
                          / NULLIF(COALESCE((SELECT SUM(discount) FROM act), 0), 0), 2),
    'new_customers',    (SELECT COUNT(DISTINCT user_id) FROM act WHERE first_order >= p_from),
    'returning_customers', (SELECT COUNT(DISTINCT user_id) FROM act WHERE first_order < p_from),
    'aov',              ROUND(COALESCE((SELECT SUM(total) FROM act), 0)
                          / NULLIF((SELECT COUNT(*) FROM act), 0), 2),
    'cancellation_rate', ROUND((SELECT COUNT(*) FROM co WHERE status = 'cancelled')::numeric
                          / NULLIF((SELECT COUNT(*) FROM co), 0) * 100, 2),
    -- Attempt funnel. Zero across the board until 20260828_activity_coverage.sql
    -- is in place and the backend has logged its first coupon check.
    'attempts',         (SELECT COUNT(*) FROM att),
    'failed_attempts',  (SELECT COUNT(*) FROM att WHERE NOT ok),
    'attempt_success_rate', ROUND((SELECT COUNT(*) FROM att WHERE ok)::numeric
                             / NULLIF((SELECT COUNT(*) FROM att), 0) * 100, 2)
  ) INTO kpis;

  WITH co AS (
    SELECT o.* FROM orders o
    WHERE o.coupon_code IS NOT NULL
      AND o.created_at >= p_prev_from AND o.created_at < p_prev_to
  ), act AS (SELECT * FROM co WHERE status <> 'cancelled'),
  att AS (
    -- IS NOT DISTINCT FROM (not '=') so a row missing the key yields false, not NULL:
    -- otherwise it would count toward attempts but toward neither ok nor failed.
    SELECT (metadata->>'valid') IS NOT DISTINCT FROM 'true' AS ok
    FROM activity_log
    WHERE type = 'coupon_applied'
      AND created_at >= p_prev_from AND created_at < p_prev_to
  )
  SELECT jsonb_build_object(
    'coupon_orders',  (SELECT COUNT(*) FROM act),
    'revenue',        COALESCE((SELECT SUM(total) FROM act), 0),
    'discount_given', COALESCE((SELECT SUM(discount) FROM act), 0),
    'attempts',        (SELECT COUNT(*) FROM att),
    'failed_attempts', (SELECT COUNT(*) FROM att WHERE NOT ok),
    'attempt_success_rate', ROUND((SELECT COUNT(*) FROM att WHERE ok)::numeric
                             / NULLIF((SELECT COUNT(*) FROM att), 0) * 100, 2)
  ) INTO prev;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'orders')::numeric DESC), '[]'::jsonb)
  INTO rows_
  FROM (
    SELECT jsonb_build_object(
             'code', c.code,
             'discount_type', c.discount_type,
             'discount_value', c.discount_value,
             'status', CASE
                         WHEN NOT c.is_active THEN 'disabled'
                         WHEN c.expires_at IS NOT NULL AND c.expires_at <= now() THEN 'expired'
                         WHEN c.max_uses IS NOT NULL AND c.uses_count >= c.max_uses THEN 'exhausted'
                         ELSE 'active'
                       END,
             'lifetime_uses', c.uses_count,
             'expires_at', c.expires_at,
             'orders',   COALESCE(w.orders, 0),
             'revenue',  COALESCE(w.revenue, 0),
             'discount', COALESCE(w.discount, 0),
             'aov',      ROUND(COALESCE(w.revenue, 0) / NULLIF(w.orders, 0), 2),
             'roi',      ROUND(COALESCE(w.revenue, 0) / NULLIF(w.discount, 0), 2),
             'new_customers', COALESCE(w.new_customers, 0),
             'cancelled', COALESCE(w.cancelled, 0),
             'attempts', COALESCE(ta.attempts, 0),
             'failed',   COALESCE(ta.failed, 0)
           ) AS t
    FROM coupons c
    LEFT JOIN (
      SELECT o.coupon_code,
             COUNT(*) FILTER (WHERE o.status <> 'cancelled')       AS orders,
             SUM(o.total)    FILTER (WHERE o.status <> 'cancelled') AS revenue,
             SUM(o.discount) FILTER (WHERE o.status <> 'cancelled') AS discount,
             COUNT(*) FILTER (WHERE o.status = 'cancelled')         AS cancelled,
             COUNT(DISTINCT o.user_id) FILTER (
               WHERE o.status <> 'cancelled' AND NOT EXISTS (
                 SELECT 1 FROM orders o2
                 WHERE o2.user_id = o.user_id AND o2.status <> 'cancelled'
                   AND o2.created_at < o.created_at)) AS new_customers
      FROM orders o
      WHERE o.coupon_code IS NOT NULL
        AND o.created_at >= p_from AND o.created_at < p_to
      GROUP BY o.coupon_code
    ) w ON w.coupon_code = c.code
    -- checkout.ts upper-cases the code before validating, so this matches coupons.code
    -- directly; upper() here too in case an older row was written differently.
    LEFT JOIN (
      SELECT upper(btrim(metadata->>'code')) AS code,
             COUNT(*)                                                        AS attempts,
             COUNT(*) FILTER (WHERE (metadata->>'valid') IS DISTINCT FROM 'true') AS failed
      FROM activity_log
      WHERE type = 'coupon_applied'
        AND created_at >= p_from AND created_at < p_to
        AND COALESCE(btrim(metadata->>'code'), '') <> ''
      GROUP BY 1
    ) ta ON ta.code = c.code
  ) x;

  -- Why codes are being refused. Rejections against codes that do NOT exist in the
  -- coupons table land here too (they have no row in the table above), which is
  -- exactly where a typo'd or expired-and-deleted code shows itself.
  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'count')::numeric DESC), '[]'::jsonb)
  INTO failures
  FROM (
    SELECT jsonb_build_object(
             'reason', a.metadata->>'reason',
             'count',  COUNT(*),
             'codes',  (SELECT COALESCE(jsonb_agg(DISTINCT upper(btrim(a2.metadata->>'code'))), '[]'::jsonb)
                        FROM activity_log a2
                        WHERE a2.type = 'coupon_applied'
                          AND a2.created_at >= p_from AND a2.created_at < p_to
                          AND (a2.metadata->>'valid') IS DISTINCT FROM 'true'
                          AND a2.metadata->>'reason' = a.metadata->>'reason'
                          AND COALESCE(btrim(a2.metadata->>'code'), '') <> '')
           ) AS t
    FROM activity_log a
    WHERE a.type = 'coupon_applied'
      AND a.created_at >= p_from AND a.created_at < p_to
      AND (a.metadata->>'valid') IS DISTINCT FROM 'true'
      AND COALESCE(a.metadata->>'reason', '') <> ''
    GROUP BY a.metadata->>'reason'
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) x;

  RETURN jsonb_build_object(
    'kpis', kpis, 'previous', prev, 'table', rows_, 'failures', failures
  );
END;
$fn$;

-- ─── Access: service-role only (re-applied so this file stands alone) ────────
DO $do$
BEGIN
  REVOKE ALL ON FUNCTION public.analytics_live() FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.analytics_live() TO service_role;

  REVOKE ALL ON FUNCTION public.analytics_coupons(timestamptz,timestamptz,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.analytics_coupons(timestamptz,timestamptz,timestamptz,timestamptz) TO service_role;
END
$do$;
