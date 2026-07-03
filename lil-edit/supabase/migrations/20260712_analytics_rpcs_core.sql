-- =============================================================================
-- Migration: Analytics RPCs — core pages (1 of 2)
-- Created:   2026-07-12
-- Purpose:   One SQL function per analytics page, each returning the page's
--            complete payload as jsonb in a single DB round trip:
--              • analytics_executive   • analytics_revenue   • analytics_orders
--              • analytics_products    • analytics_customers
--            Part 2 (20260713_analytics_rpcs_detail.sql) adds the per-product
--            deep-dive and the remaining module pages.
--
-- ── Metric definitions (consistent across every function) ────────────────────
--   • "active" orders    = status <> 'cancelled'. Revenue/AOV/units count these.
--     There are NO refund/return metrics anywhere — cancellation is the only
--     negative flow this store recognizes.
--   • gross_revenue      = SUM(subtotal)  of active orders (before discounts)
--   • net_revenue        = SUM(total)     of active orders (charged amount)
--   • discounts_given    = SUM(discount)  of active orders
--   • cancelled_value    = SUM(total)     of cancelled orders (visibility only)
--   • customers (period) = DISTINCT buyers with an active order in the window
--   • new customer       = first-ever active order falls inside the window
--   • repeat rate        = share of period buyers with ≥2 lifetime active orders
--   • conversion_rate    = active orders / distinct visitors (product_views);
--                          NULL until view tracking has data
--   • Buckets are day/week/month in the given IANA timezone (default IST)
--
-- ── Access ────────────────────────────────────────────────────────────────────
--   Service-role only (the admin-gated backend). EXECUTE is revoked from
--   PUBLIC/anon/authenticated and granted to service_role explicitly.
--
-- ⚠️ MANUAL STEP: run in the Supabase SQL editor AFTER
--    20260711_analytics_foundation.sql. Idempotent — safe to re-run.
-- =============================================================================

-- ─── analytics_executive ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_executive(
  p_from      TIMESTAMPTZ,
  p_to        TIMESTAMPTZ,
  p_prev_from TIMESTAMPTZ,
  p_prev_to   TIMESTAMPTZ,
  p_tz        TEXT  DEFAULT 'Asia/Kolkata',
  p_bucket    TEXT  DEFAULT 'day',
  p_filters   JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tz       TEXT := COALESCE(NULLIF(p_tz, ''), 'Asia/Kolkata');
  v_bucket   TEXT := CASE WHEN p_bucket IN ('day','week','month') THEN p_bucket ELSE 'day' END;
  v_step     INTERVAL := CASE p_bucket WHEN 'month' THEN interval '1 month'
                                       WHEN 'week'  THEN interval '1 week'
                                       ELSE interval '1 day' END;
  v_category TEXT := NULLIF(p_filters->>'category', '');
  v_payment  TEXT := CASE WHEN p_filters->>'payment_method' IN ('cod','online') THEN p_filters->>'payment_method' END;
  v_coupon   TEXT := NULLIF(upper(btrim(COALESCE(p_filters->>'coupon_code',''))), '');

  kpis            JSONB;
  prev            JSONB;
  series          JSONB;
  top_products    JSONB;
  by_category     JSONB;
  best_sellers    JSONB;
BEGIN
  -- Current-period KPIs over orders + events + views.
  WITH fo AS (           -- filtered orders in window
    SELECT o.*
    FROM orders o
    WHERE o.created_at >= p_from AND o.created_at < p_to
      AND (v_payment  IS NULL OR o.payment_method = v_payment)
      AND (v_coupon   IS NULL OR o.coupon_code = v_coupon)
      AND (v_category IS NULL OR EXISTS (
            SELECT 1 FROM order_items oi
            WHERE oi.order_id = o.id AND oi.category_slug = v_category))
  ), act AS (            -- active (non-cancelled) subset
    SELECT * FROM fo WHERE status <> 'cancelled'
  ), buyers AS (
    SELECT DISTINCT user_id FROM act
  ), firsts AS (         -- each period buyer's first-ever active order date
    SELECT o.user_id, MIN(o.created_at) AS first_order
    FROM orders o
    WHERE o.status <> 'cancelled' AND o.user_id IN (SELECT user_id FROM buyers)
    GROUP BY o.user_id
  ), lifetime AS (       -- lifetime active order counts for period buyers
    SELECT o.user_id, COUNT(*) AS n
    FROM orders o
    WHERE o.status <> 'cancelled' AND o.user_id IN (SELECT user_id FROM buyers)
    GROUP BY o.user_id
  ), units AS (
    SELECT COALESCE(SUM(oi.quantity), 0) AS n
    FROM order_items oi JOIN act ON act.id = oi.order_id
    WHERE (v_category IS NULL OR oi.category_slug = v_category)
  ), ev AS (             -- event counts from the activity stream
    SELECT
      COUNT(*) FILTER (WHERE type = 'cart_add')     AS cart_adds,
      COUNT(*) FILTER (WHERE type = 'wishlist_add') AS wishlist_adds
    FROM activity_log
    WHERE created_at >= p_from AND created_at < p_to
      AND (v_category IS NULL OR product_slug IN (SELECT slug FROM products WHERE category_slug = v_category))
  ), vw AS (
    SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
    FROM product_views
    WHERE created_at >= p_from AND created_at < p_to
      AND (v_category IS NULL OR category_slug = v_category)
  )
  SELECT jsonb_build_object(
    'gross_revenue',      COALESCE((SELECT SUM(subtotal) FROM act), 0),
    'net_revenue',        COALESCE((SELECT SUM(total)    FROM act), 0),
    'discounts_given',    COALESCE((SELECT SUM(discount) FROM act), 0),
    'orders',             (SELECT COUNT(*) FROM act),
    'orders_placed',      (SELECT COUNT(*) FROM fo),
    'orders_cancelled',   (SELECT COUNT(*) FROM fo WHERE status = 'cancelled'),
    'cancellation_rate',  ROUND((SELECT COUNT(*) FROM fo WHERE status = 'cancelled')::numeric
                            / NULLIF((SELECT COUNT(*) FROM fo), 0) * 100, 2),
    'customers',          (SELECT COUNT(*) FROM buyers),
    'new_customers',      (SELECT COUNT(*) FROM firsts WHERE first_order >= p_from AND first_order < p_to),
    'aov',                ROUND(COALESCE((SELECT SUM(total) FROM act), 0)
                            / NULLIF((SELECT COUNT(*) FROM act), 0), 2),
    'units_sold',         (SELECT n FROM units),
    'repeat_purchase_rate', ROUND((SELECT COUNT(*) FROM lifetime WHERE n >= 2)::numeric
                            / NULLIF((SELECT COUNT(*) FROM lifetime), 0) * 100, 2),
    'product_views',      (SELECT views FROM vw),
    'active_users',       (SELECT visitors FROM vw),
    'conversion_rate',    ROUND((SELECT COUNT(*) FROM act)::numeric
                            / NULLIF((SELECT visitors FROM vw), 0) * 100, 2),
    'wishlist_adds',      (SELECT wishlist_adds FROM ev),
    'cart_adds',          (SELECT cart_adds FROM ev)
  ) INTO kpis;

  -- Previous-period comparison (same shape, previous window).
  WITH fo AS (
    SELECT o.*
    FROM orders o
    WHERE o.created_at >= p_prev_from AND o.created_at < p_prev_to
      AND (v_payment  IS NULL OR o.payment_method = v_payment)
      AND (v_coupon   IS NULL OR o.coupon_code = v_coupon)
      AND (v_category IS NULL OR EXISTS (
            SELECT 1 FROM order_items oi
            WHERE oi.order_id = o.id AND oi.category_slug = v_category))
  ), act AS (
    SELECT * FROM fo WHERE status <> 'cancelled'
  ), buyers AS (
    SELECT DISTINCT user_id FROM act
  ), firsts AS (
    SELECT o.user_id, MIN(o.created_at) AS first_order
    FROM orders o
    WHERE o.status <> 'cancelled' AND o.user_id IN (SELECT user_id FROM buyers)
    GROUP BY o.user_id
  ), units AS (
    SELECT COALESCE(SUM(oi.quantity), 0) AS n
    FROM order_items oi JOIN act ON act.id = oi.order_id
    WHERE (v_category IS NULL OR oi.category_slug = v_category)
  ), ev AS (
    SELECT
      COUNT(*) FILTER (WHERE type = 'cart_add')     AS cart_adds,
      COUNT(*) FILTER (WHERE type = 'wishlist_add') AS wishlist_adds
    FROM activity_log
    WHERE created_at >= p_prev_from AND created_at < p_prev_to
      AND (v_category IS NULL OR product_slug IN (SELECT slug FROM products WHERE category_slug = v_category))
  ), vw AS (
    SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
    FROM product_views
    WHERE created_at >= p_prev_from AND created_at < p_prev_to
      AND (v_category IS NULL OR category_slug = v_category)
  )
  SELECT jsonb_build_object(
    'gross_revenue',      COALESCE((SELECT SUM(subtotal) FROM act), 0),
    'net_revenue',        COALESCE((SELECT SUM(total)    FROM act), 0),
    'discounts_given',    COALESCE((SELECT SUM(discount) FROM act), 0),
    'orders',             (SELECT COUNT(*) FROM act),
    'orders_placed',      (SELECT COUNT(*) FROM fo),
    'orders_cancelled',   (SELECT COUNT(*) FROM fo WHERE status = 'cancelled'),
    'cancellation_rate',  ROUND((SELECT COUNT(*) FROM fo WHERE status = 'cancelled')::numeric
                            / NULLIF((SELECT COUNT(*) FROM fo), 0) * 100, 2),
    'customers',          (SELECT COUNT(*) FROM buyers),
    'new_customers',      (SELECT COUNT(*) FROM firsts WHERE first_order >= p_prev_from AND first_order < p_prev_to),
    'aov',                ROUND(COALESCE((SELECT SUM(total) FROM act), 0)
                            / NULLIF((SELECT COUNT(*) FROM act), 0), 2),
    'units_sold',         (SELECT n FROM units),
    'product_views',      (SELECT views FROM vw),
    'active_users',       (SELECT visitors FROM vw),
    'conversion_rate',    ROUND((SELECT COUNT(*) FROM act)::numeric
                            / NULLIF((SELECT visitors FROM vw), 0) * 100, 2),
    'wishlist_adds',      (SELECT wishlist_adds FROM ev),
    'cart_adds',          (SELECT cart_adds FROM ev)
  ) INTO prev;

  -- Revenue vs Orders over time (zero-filled buckets so the line never gaps).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bucket', to_char(b.bucket, 'YYYY-MM-DD'),
           'revenue', COALESCE(agg.revenue, 0),
           'orders',  COALESCE(agg.orders, 0)
         ) ORDER BY b.bucket), '[]'::jsonb)
  INTO series
  FROM generate_series(
         date_trunc(v_bucket, p_from AT TIME ZONE v_tz),
         date_trunc(v_bucket, (p_to - interval '1 millisecond') AT TIME ZONE v_tz),
         v_step
       ) AS b(bucket)
  LEFT JOIN (
    SELECT date_trunc(v_bucket, o.created_at AT TIME ZONE v_tz) AS bucket,
           SUM(o.total) AS revenue, COUNT(*) AS orders
    FROM orders o
    WHERE o.created_at >= p_from AND o.created_at < p_to AND o.status <> 'cancelled'
      AND (v_payment  IS NULL OR o.payment_method = v_payment)
      AND (v_coupon   IS NULL OR o.coupon_code = v_coupon)
      AND (v_category IS NULL OR EXISTS (
            SELECT 1 FROM order_items oi
            WHERE oi.order_id = o.id AND oi.category_slug = v_category))
    GROUP BY 1
  ) agg USING (bucket);

  -- Top 10 products by revenue (line-item snapshots, so deleted products still count).
  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'revenue')::numeric DESC), '[]'::jsonb)
  INTO top_products
  FROM (
    SELECT jsonb_build_object(
             'slug', oi.product_slug,
             'title', MAX(oi.title),
             'image', MAX(oi.image_url),
             'revenue', SUM(oi.line_total),
             'units', SUM(oi.quantity)
           ) AS t
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= p_from AND o.created_at < p_to AND o.status <> 'cancelled'
      AND (v_payment  IS NULL OR o.payment_method = v_payment)
      AND (v_coupon   IS NULL OR o.coupon_code = v_coupon)
      AND (v_category IS NULL OR oi.category_slug = v_category)
    GROUP BY oi.product_slug
    ORDER BY SUM(oi.line_total) DESC
    LIMIT 10
  ) x;

  -- Revenue by category.
  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'revenue')::numeric DESC), '[]'::jsonb)
  INTO by_category
  FROM (
    SELECT jsonb_build_object(
             'category', COALESCE(NULLIF(oi.category_slug, ''), 'uncategorised'),
             'revenue', SUM(oi.line_total),
             'units', SUM(oi.quantity)
           ) AS t
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= p_from AND o.created_at < p_to AND o.status <> 'cancelled'
      AND (v_payment IS NULL OR o.payment_method = v_payment)
      AND (v_coupon  IS NULL OR o.coupon_code = v_coupon)
    GROUP BY oi.category_slug
  ) x;

  -- Best sellers by units.
  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'units')::numeric DESC), '[]'::jsonb)
  INTO best_sellers
  FROM (
    SELECT jsonb_build_object(
             'slug', oi.product_slug,
             'title', MAX(oi.title),
             'image', MAX(oi.image_url),
             'units', SUM(oi.quantity),
             'revenue', SUM(oi.line_total)
           ) AS t
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= p_from AND o.created_at < p_to AND o.status <> 'cancelled'
      AND (v_payment  IS NULL OR o.payment_method = v_payment)
      AND (v_coupon   IS NULL OR o.coupon_code = v_coupon)
      AND (v_category IS NULL OR oi.category_slug = v_category)
    GROUP BY oi.product_slug
    ORDER BY SUM(oi.quantity) DESC
    LIMIT 10
  ) x;

  RETURN jsonb_build_object(
    'kpis', kpis,
    'previous', prev,
    'revenue_orders_series', series,
    'top_products_by_revenue', top_products,
    'revenue_by_category', by_category,
    'best_sellers', best_sellers
  );
END;
$$;

-- ─── analytics_revenue ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_revenue(
  p_from      TIMESTAMPTZ,
  p_to        TIMESTAMPTZ,
  p_prev_from TIMESTAMPTZ,
  p_prev_to   TIMESTAMPTZ,
  p_tz        TEXT  DEFAULT 'Asia/Kolkata',
  p_bucket    TEXT  DEFAULT 'day',
  p_filters   JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tz       TEXT := COALESCE(NULLIF(p_tz, ''), 'Asia/Kolkata');
  v_bucket   TEXT := CASE WHEN p_bucket IN ('day','week','month') THEN p_bucket ELSE 'day' END;
  v_step     INTERVAL := CASE p_bucket WHEN 'month' THEN interval '1 month'
                                       WHEN 'week'  THEN interval '1 week'
                                       ELSE interval '1 day' END;
  v_category TEXT := NULLIF(p_filters->>'category', '');
  v_payment  TEXT := CASE WHEN p_filters->>'payment_method' IN ('cod','online') THEN p_filters->>'payment_method' END;

  kpis        JSONB;
  prev        JSONB;
  series      JSONB;
  by_category JSONB;
  by_payment  JSONB;
BEGIN
  WITH fo AS (
    SELECT o.* FROM orders o
    WHERE o.created_at >= p_from AND o.created_at < p_to
      AND (v_payment  IS NULL OR o.payment_method = v_payment)
      AND (v_category IS NULL OR EXISTS (
            SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.category_slug = v_category))
  ), act AS (SELECT * FROM fo WHERE status <> 'cancelled')
  SELECT jsonb_build_object(
    'gross_revenue',       COALESCE((SELECT SUM(subtotal) FROM act), 0),
    'net_revenue',         COALESCE((SELECT SUM(total) FROM act), 0),
    'discounts_given',     COALESCE((SELECT SUM(discount) FROM act), 0),
    'shipping_collected',  COALESCE((SELECT SUM(shipping_fee) FROM act), 0),
    'aov',                 ROUND(COALESCE((SELECT SUM(total) FROM act), 0)
                             / NULLIF((SELECT COUNT(*) FROM act), 0), 2),
    'revenue_per_customer', ROUND(COALESCE((SELECT SUM(total) FROM act), 0)
                             / NULLIF((SELECT COUNT(DISTINCT user_id) FROM act), 0), 2),
    'cancelled_value',     COALESCE((SELECT SUM(total) FROM fo WHERE status = 'cancelled'), 0)
  ) INTO kpis;

  WITH fo AS (
    SELECT o.* FROM orders o
    WHERE o.created_at >= p_prev_from AND o.created_at < p_prev_to
      AND (v_payment  IS NULL OR o.payment_method = v_payment)
      AND (v_category IS NULL OR EXISTS (
            SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.category_slug = v_category))
  ), act AS (SELECT * FROM fo WHERE status <> 'cancelled')
  SELECT jsonb_build_object(
    'gross_revenue',       COALESCE((SELECT SUM(subtotal) FROM act), 0),
    'net_revenue',         COALESCE((SELECT SUM(total) FROM act), 0),
    'discounts_given',     COALESCE((SELECT SUM(discount) FROM act), 0),
    'shipping_collected',  COALESCE((SELECT SUM(shipping_fee) FROM act), 0),
    'aov',                 ROUND(COALESCE((SELECT SUM(total) FROM act), 0)
                             / NULLIF((SELECT COUNT(*) FROM act), 0), 2),
    'revenue_per_customer', ROUND(COALESCE((SELECT SUM(total) FROM act), 0)
                             / NULLIF((SELECT COUNT(DISTINCT user_id) FROM act), 0), 2),
    'cancelled_value',     COALESCE((SELECT SUM(total) FROM fo WHERE status = 'cancelled'), 0)
  ) INTO prev;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bucket', to_char(b.bucket, 'YYYY-MM-DD'),
           'gross',    COALESCE(agg.gross, 0),
           'net',      COALESCE(agg.net, 0),
           'discount', COALESCE(agg.discount, 0)
         ) ORDER BY b.bucket), '[]'::jsonb)
  INTO series
  FROM generate_series(
         date_trunc(v_bucket, p_from AT TIME ZONE v_tz),
         date_trunc(v_bucket, (p_to - interval '1 millisecond') AT TIME ZONE v_tz),
         v_step
       ) AS b(bucket)
  LEFT JOIN (
    SELECT date_trunc(v_bucket, o.created_at AT TIME ZONE v_tz) AS bucket,
           SUM(o.subtotal) AS gross, SUM(o.total) AS net, SUM(o.discount) AS discount
    FROM orders o
    WHERE o.created_at >= p_from AND o.created_at < p_to AND o.status <> 'cancelled'
      AND (v_payment  IS NULL OR o.payment_method = v_payment)
      AND (v_category IS NULL OR EXISTS (
            SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.category_slug = v_category))
    GROUP BY 1
  ) agg USING (bucket);

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'revenue')::numeric DESC), '[]'::jsonb)
  INTO by_category
  FROM (
    SELECT jsonb_build_object(
             'category', COALESCE(NULLIF(oi.category_slug, ''), 'uncategorised'),
             'revenue', SUM(oi.line_total),
             'units', SUM(oi.quantity),
             'orders', COUNT(DISTINCT o.id)
           ) AS t
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= p_from AND o.created_at < p_to AND o.status <> 'cancelled'
      AND (v_payment IS NULL OR o.payment_method = v_payment)
    GROUP BY oi.category_slug
  ) x;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
  INTO by_payment
  FROM (
    SELECT jsonb_build_object(
             'method', o.payment_method,
             'revenue', SUM(o.total),
             'orders', COUNT(*)
           ) AS t
    FROM orders o
    WHERE o.created_at >= p_from AND o.created_at < p_to AND o.status <> 'cancelled'
      AND (v_category IS NULL OR EXISTS (
            SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.category_slug = v_category))
    GROUP BY o.payment_method
  ) x;

  RETURN jsonb_build_object(
    'kpis', kpis,
    'previous', prev,
    'revenue_series', series,
    'revenue_by_category', by_category,
    'revenue_by_payment', by_payment
  );
END;
$$;

-- ─── analytics_orders ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_orders(
  p_from      TIMESTAMPTZ,
  p_to        TIMESTAMPTZ,
  p_prev_from TIMESTAMPTZ,
  p_prev_to   TIMESTAMPTZ,
  p_tz        TEXT  DEFAULT 'Asia/Kolkata',
  p_bucket    TEXT  DEFAULT 'day',
  p_filters   JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tz      TEXT := COALESCE(NULLIF(p_tz, ''), 'Asia/Kolkata');
  v_bucket  TEXT := CASE WHEN p_bucket IN ('day','week','month') THEN p_bucket ELSE 'day' END;
  v_step    INTERVAL := CASE p_bucket WHEN 'month' THEN interval '1 month'
                                      WHEN 'week'  THEN interval '1 week'
                                      ELSE interval '1 day' END;
  v_payment TEXT := CASE WHEN p_filters->>'payment_method' IN ('cod','online') THEN p_filters->>'payment_method' END;

  kpis   JSONB;
  prev   JSONB;
  series JSONB;
BEGIN
  -- Fulfilment speed comes from the audit trail (order_status_history):
  --   processing time = confirmed→shipped, shipping time = shipped→delivered.
  WITH fo AS (
    SELECT o.* FROM orders o
    WHERE o.created_at >= p_from AND o.created_at < p_to
      AND (v_payment IS NULL OR o.payment_method = v_payment)
  ), ship AS (          -- first shipped timestamp per order in-window
    SELECT h.order_id, MIN(h.created_at) AS shipped_at
    FROM order_status_history h
    JOIN fo ON fo.id = h.order_id
    WHERE h.to_status = 'shipped'
    GROUP BY h.order_id
  ), deliver AS (
    SELECT h.order_id, MIN(h.created_at) AS delivered_at
    FROM order_status_history h
    JOIN fo ON fo.id = h.order_id
    WHERE h.to_status = 'delivered'
    GROUP BY h.order_id
  )
  SELECT jsonb_build_object(
    'total_orders',      (SELECT COUNT(*) FROM fo),
    'confirmed',         (SELECT COUNT(*) FROM fo WHERE status = 'confirmed'),
    'processing',        (SELECT COUNT(*) FROM fo WHERE status = 'processing'),
    'shipped',           (SELECT COUNT(*) FROM fo WHERE status = 'shipped'),
    'delivered',         (SELECT COUNT(*) FROM fo WHERE status = 'delivered'),
    'cancelled',         (SELECT COUNT(*) FROM fo WHERE status = 'cancelled'),
    'cancellation_rate', ROUND((SELECT COUNT(*) FROM fo WHERE status = 'cancelled')::numeric
                           / NULLIF((SELECT COUNT(*) FROM fo), 0) * 100, 2),
    'cod_orders',        (SELECT COUNT(*) FROM fo WHERE payment_method = 'cod'),
    'online_orders',     (SELECT COUNT(*) FROM fo WHERE payment_method = 'online'),
    'avg_items_per_order', ROUND((SELECT AVG(item_count) FROM fo WHERE status <> 'cancelled'), 1),
    'avg_processing_hours', ROUND((SELECT AVG(EXTRACT(EPOCH FROM (s.shipped_at - fo.created_at)) / 3600)
                                   FROM fo JOIN ship s ON s.order_id = fo.id)::numeric, 1),
    'avg_shipping_hours',   ROUND((SELECT AVG(EXTRACT(EPOCH FROM (d.delivered_at - s.shipped_at)) / 3600)
                                   FROM ship s JOIN deliver d ON d.order_id = s.order_id)::numeric, 1)
  ) INTO kpis;

  WITH fo AS (
    SELECT o.* FROM orders o
    WHERE o.created_at >= p_prev_from AND o.created_at < p_prev_to
      AND (v_payment IS NULL OR o.payment_method = v_payment)
  )
  SELECT jsonb_build_object(
    'total_orders',      (SELECT COUNT(*) FROM fo),
    'delivered',         (SELECT COUNT(*) FROM fo WHERE status = 'delivered'),
    'cancelled',         (SELECT COUNT(*) FROM fo WHERE status = 'cancelled'),
    'cancellation_rate', ROUND((SELECT COUNT(*) FROM fo WHERE status = 'cancelled')::numeric
                           / NULLIF((SELECT COUNT(*) FROM fo), 0) * 100, 2)
  ) INTO prev;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bucket', to_char(b.bucket, 'YYYY-MM-DD'),
           'placed',    COALESCE(agg.placed, 0),
           'delivered', COALESCE(agg.delivered, 0),
           'cancelled', COALESCE(agg.cancelled, 0)
         ) ORDER BY b.bucket), '[]'::jsonb)
  INTO series
  FROM generate_series(
         date_trunc(v_bucket, p_from AT TIME ZONE v_tz),
         date_trunc(v_bucket, (p_to - interval '1 millisecond') AT TIME ZONE v_tz),
         v_step
       ) AS b(bucket)
  LEFT JOIN (
    SELECT date_trunc(v_bucket, o.created_at AT TIME ZONE v_tz) AS bucket,
           COUNT(*) AS placed,
           COUNT(*) FILTER (WHERE o.status = 'delivered') AS delivered,
           COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled
    FROM orders o
    WHERE o.created_at >= p_from AND o.created_at < p_to
      AND (v_payment IS NULL OR o.payment_method = v_payment)
    GROUP BY 1
  ) agg USING (bucket);

  RETURN jsonb_build_object('kpis', kpis, 'previous', prev, 'orders_series', series);
END;
$$;

-- ─── analytics_products ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_products(
  p_from      TIMESTAMPTZ,
  p_to        TIMESTAMPTZ,
  p_prev_from TIMESTAMPTZ,
  p_prev_to   TIMESTAMPTZ,
  p_tz        TEXT  DEFAULT 'Asia/Kolkata',
  p_bucket    TEXT  DEFAULT 'day',
  p_filters   JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tz       TEXT := COALESCE(NULLIF(p_tz, ''), 'Asia/Kolkata');
  v_bucket   TEXT := CASE WHEN p_bucket IN ('day','week','month') THEN p_bucket ELSE 'day' END;
  v_step     INTERVAL := CASE p_bucket WHEN 'month' THEN interval '1 month'
                                       WHEN 'week'  THEN interval '1 week'
                                       ELSE interval '1 day' END;
  v_category TEXT := NULLIF(p_filters->>'category', '');

  kpis        JSONB;
  prev        JSONB;
  top_selling JSONB;
  most_viewed JSONB;
  series      JSONB;
  table_rows  JSONB;
BEGIN
  WITH sold AS (
    SELECT oi.product_slug, SUM(oi.quantity) AS units, SUM(oi.line_total) AS revenue
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= p_from AND o.created_at < p_to AND o.status <> 'cancelled'
      AND (v_category IS NULL OR oi.category_slug = v_category)
    GROUP BY oi.product_slug
  ), vw AS (
    SELECT COUNT(*) AS views FROM product_views
    WHERE created_at >= p_from AND created_at < p_to
      AND (v_category IS NULL OR category_slug = v_category)
  ), ev AS (
    SELECT
      COUNT(*) FILTER (WHERE type = 'cart_add')     AS cart_adds,
      COUNT(*) FILTER (WHERE type = 'wishlist_add') AS wishlist_adds
    FROM activity_log
    WHERE created_at >= p_from AND created_at < p_to
      AND (v_category IS NULL OR product_slug IN (SELECT slug FROM products WHERE category_slug = v_category))
  ), rv AS (
    SELECT ROUND(AVG(rating), 2) AS avg_rating, COUNT(*) AS review_count
    FROM product_reviews
    WHERE created_at >= p_from AND created_at < p_to
      AND (v_category IS NULL OR product_slug IN (SELECT slug FROM products WHERE category_slug = v_category))
  )
  SELECT jsonb_build_object(
    'products_sold', (SELECT COUNT(*) FROM sold),
    'units_sold',    COALESCE((SELECT SUM(units) FROM sold), 0),
    'revenue',       COALESCE((SELECT SUM(revenue) FROM sold), 0),
    'product_views', (SELECT views FROM vw),
    'wishlist_adds', (SELECT wishlist_adds FROM ev),
    'cart_adds',     (SELECT cart_adds FROM ev),
    'avg_rating',    (SELECT avg_rating FROM rv),
    'reviews',       (SELECT review_count FROM rv)
  ) INTO kpis;

  WITH sold AS (
    SELECT oi.product_slug, SUM(oi.quantity) AS units, SUM(oi.line_total) AS revenue
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= p_prev_from AND o.created_at < p_prev_to AND o.status <> 'cancelled'
      AND (v_category IS NULL OR oi.category_slug = v_category)
    GROUP BY oi.product_slug
  ), vw AS (
    SELECT COUNT(*) AS views FROM product_views
    WHERE created_at >= p_prev_from AND created_at < p_prev_to
      AND (v_category IS NULL OR category_slug = v_category)
  )
  SELECT jsonb_build_object(
    'products_sold', (SELECT COUNT(*) FROM sold),
    'units_sold',    COALESCE((SELECT SUM(units) FROM sold), 0),
    'revenue',       COALESCE((SELECT SUM(revenue) FROM sold), 0),
    'product_views', (SELECT views FROM vw)
  ) INTO prev;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'units')::numeric DESC), '[]'::jsonb)
  INTO top_selling
  FROM (
    SELECT jsonb_build_object(
             'slug', oi.product_slug, 'title', MAX(oi.title), 'image', MAX(oi.image_url),
             'units', SUM(oi.quantity), 'revenue', SUM(oi.line_total)
           ) AS t
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= p_from AND o.created_at < p_to AND o.status <> 'cancelled'
      AND (v_category IS NULL OR oi.category_slug = v_category)
    GROUP BY oi.product_slug
    ORDER BY SUM(oi.quantity) DESC LIMIT 10
  ) x;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'views')::numeric DESC), '[]'::jsonb)
  INTO most_viewed
  FROM (
    SELECT jsonb_build_object(
             'slug', v.product_slug,
             'title', COALESCE(MAX(p.title), v.product_slug),
             'views', COUNT(*),
             'visitors', COUNT(DISTINCT v.visitor_id)
           ) AS t
    FROM product_views v LEFT JOIN products p ON p.slug = v.product_slug
    WHERE v.created_at >= p_from AND v.created_at < p_to
      AND (v_category IS NULL OR v.category_slug = v_category)
    GROUP BY v.product_slug
    ORDER BY COUNT(*) DESC LIMIT 10
  ) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bucket', to_char(b.bucket, 'YYYY-MM-DD'),
           'units',   COALESCE(agg.units, 0),
           'revenue', COALESCE(agg.revenue, 0)
         ) ORDER BY b.bucket), '[]'::jsonb)
  INTO series
  FROM generate_series(
         date_trunc(v_bucket, p_from AT TIME ZONE v_tz),
         date_trunc(v_bucket, (p_to - interval '1 millisecond') AT TIME ZONE v_tz),
         v_step
       ) AS b(bucket)
  LEFT JOIN (
    SELECT date_trunc(v_bucket, o.created_at AT TIME ZONE v_tz) AS bucket,
           SUM(oi.quantity) AS units, SUM(oi.line_total) AS revenue
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= p_from AND o.created_at < p_to AND o.status <> 'cancelled'
      AND (v_category IS NULL OR oi.category_slug = v_category)
    GROUP BY 1
  ) agg USING (bucket);

  -- The interactive per-product table: every PUBLISHED product with its
  -- period metrics (drill-down target = per-product analytics page).
  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'revenue')::numeric DESC), '[]'::jsonb)
  INTO table_rows
  FROM (
    SELECT jsonb_build_object(
             'slug', p.slug,
             'title', p.title,
             'category', p.category_slug,
             'price', p.price,
             'stock', p.total_stock,
             'is_unlimited', p.is_unlimited,
             'units', COALESCE(s.units, 0),
             'revenue', COALESCE(s.revenue, 0),
             'views', COALESCE(v.views, 0),
             'wishlist_adds', COALESCE(e.wishlist_adds, 0),
             'cart_adds', COALESCE(e.cart_adds, 0),
             'conversion', ROUND(COALESCE(s.orders, 0)::numeric / NULLIF(v.visitors, 0) * 100, 2),
             'rating', r.avg_rating,
             'reviews', COALESCE(r.n, 0)
           ) AS t
    FROM products p
    LEFT JOIN (
      SELECT oi.product_slug, SUM(oi.quantity) AS units, SUM(oi.line_total) AS revenue,
             COUNT(DISTINCT oi.order_id) AS orders
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at >= p_from AND o.created_at < p_to AND o.status <> 'cancelled'
      GROUP BY oi.product_slug
    ) s ON s.product_slug = p.slug
    LEFT JOIN (
      SELECT product_slug, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
      FROM product_views
      WHERE created_at >= p_from AND created_at < p_to
      GROUP BY product_slug
    ) v ON v.product_slug = p.slug
    LEFT JOIN (
      SELECT product_slug,
             COUNT(*) FILTER (WHERE type = 'cart_add')     AS cart_adds,
             COUNT(*) FILTER (WHERE type = 'wishlist_add') AS wishlist_adds
      FROM activity_log
      WHERE created_at >= p_from AND created_at < p_to AND product_slug IS NOT NULL
      GROUP BY product_slug
    ) e ON e.product_slug = p.slug
    LEFT JOIN (
      SELECT product_slug, ROUND(AVG(rating), 2) AS avg_rating, COUNT(*) AS n
      FROM product_reviews
      GROUP BY product_slug
    ) r ON r.product_slug = p.slug
    WHERE p.status = 'PUBLISHED'
      AND (v_category IS NULL OR p.category_slug = v_category)
    LIMIT 500
  ) x;

  RETURN jsonb_build_object(
    'kpis', kpis,
    'previous', prev,
    'top_selling', top_selling,
    'most_viewed', most_viewed,
    'sales_series', series,
    'products_table', table_rows
  );
END;
$$;

-- ─── analytics_customers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_customers(
  p_from      TIMESTAMPTZ,
  p_to        TIMESTAMPTZ,
  p_prev_from TIMESTAMPTZ,
  p_prev_to   TIMESTAMPTZ,
  p_tz        TEXT  DEFAULT 'Asia/Kolkata',
  p_bucket    TEXT  DEFAULT 'day',
  p_filters   JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tz     TEXT := COALESCE(NULLIF(p_tz, ''), 'Asia/Kolkata');
  v_bucket TEXT := CASE WHEN p_bucket IN ('day','week','month') THEN p_bucket ELSE 'day' END;
  v_step   INTERVAL := CASE p_bucket WHEN 'month' THEN interval '1 month'
                                     WHEN 'week'  THEN interval '1 week'
                                     ELSE interval '1 day' END;

  kpis          JSONB;
  prev          JSONB;
  growth        JSONB;
  new_vs_ret    JSONB;
  top_customers JSONB;
  by_gender     JSONB;
BEGIN
  WITH act AS (
    SELECT * FROM orders WHERE created_at >= p_from AND created_at < p_to AND status <> 'cancelled'
  ), buyers AS (SELECT DISTINCT user_id FROM act
  ), firsts AS (
    SELECT o.user_id, MIN(o.created_at) AS first_order
    FROM orders o WHERE o.status <> 'cancelled' AND o.user_id IN (SELECT user_id FROM buyers)
    GROUP BY o.user_id
  ), lifetime AS (
    SELECT o.user_id, COUNT(*) AS n
    FROM orders o WHERE o.status <> 'cancelled' AND o.user_id IN (SELECT user_id FROM buyers)
    GROUP BY o.user_id
  ), alltime AS (   -- store-lifetime figures for CLV
    SELECT COUNT(DISTINCT user_id) AS buyers, COALESCE(SUM(total), 0) AS revenue
    FROM orders WHERE status <> 'cancelled'
  )
  SELECT jsonb_build_object(
    'total_customers',     (SELECT COUNT(*) FROM profiles),
    'signups',             (SELECT COUNT(*) FROM profiles WHERE created_at >= p_from AND created_at < p_to),
    'buyers',              (SELECT COUNT(*) FROM buyers),
    'new_customers',       (SELECT COUNT(*) FROM firsts WHERE first_order >= p_from AND first_order < p_to),
    'returning_customers', (SELECT COUNT(*) FROM buyers)
                             - (SELECT COUNT(*) FROM firsts WHERE first_order >= p_from AND first_order < p_to),
    'repeat_purchase_rate', ROUND((SELECT COUNT(*) FROM lifetime WHERE n >= 2)::numeric
                             / NULLIF((SELECT COUNT(*) FROM lifetime), 0) * 100, 2),
    'clv',                 ROUND((SELECT revenue FROM alltime) / NULLIF((SELECT buyers FROM alltime), 0), 2),
    'avg_spend',           ROUND(COALESCE((SELECT SUM(total) FROM act), 0)
                             / NULLIF((SELECT COUNT(*) FROM buyers), 0), 2)
  ) INTO kpis;

  WITH act AS (
    SELECT * FROM orders WHERE created_at >= p_prev_from AND created_at < p_prev_to AND status <> 'cancelled'
  ), buyers AS (SELECT DISTINCT user_id FROM act
  ), firsts AS (
    SELECT o.user_id, MIN(o.created_at) AS first_order
    FROM orders o WHERE o.status <> 'cancelled' AND o.user_id IN (SELECT user_id FROM buyers)
    GROUP BY o.user_id
  )
  SELECT jsonb_build_object(
    'signups',       (SELECT COUNT(*) FROM profiles WHERE created_at >= p_prev_from AND created_at < p_prev_to),
    'buyers',        (SELECT COUNT(*) FROM buyers),
    'new_customers', (SELECT COUNT(*) FROM firsts WHERE first_order >= p_prev_from AND first_order < p_prev_to),
    'avg_spend',     ROUND(COALESCE((SELECT SUM(total) FROM act), 0)
                       / NULLIF((SELECT COUNT(*) FROM buyers), 0), 2)
  ) INTO prev;

  -- Customer growth: signups per bucket (profiles.created_at).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bucket', to_char(b.bucket, 'YYYY-MM-DD'),
           'signups', COALESCE(agg.n, 0)
         ) ORDER BY b.bucket), '[]'::jsonb)
  INTO growth
  FROM generate_series(
         date_trunc(v_bucket, p_from AT TIME ZONE v_tz),
         date_trunc(v_bucket, (p_to - interval '1 millisecond') AT TIME ZONE v_tz),
         v_step
       ) AS b(bucket)
  LEFT JOIN (
    SELECT date_trunc(v_bucket, created_at AT TIME ZONE v_tz) AS bucket, COUNT(*) AS n
    FROM profiles WHERE created_at >= p_from AND created_at < p_to
    GROUP BY 1
  ) agg USING (bucket);

  -- New vs returning (order-level split for the pie).
  WITH act AS (
    SELECT o.*, MIN(o2.created_at) AS first_order
    FROM orders o
    JOIN orders o2 ON o2.user_id = o.user_id AND o2.status <> 'cancelled'
    WHERE o.created_at >= p_from AND o.created_at < p_to AND o.status <> 'cancelled'
    GROUP BY o.id, o.user_id, o.order_number, o.status, o.payment_method, o.payment_status,
             o.subtotal, o.discount, o.shipping_fee, o.total, o.item_count, o.shipping_address,
             o.created_at, o.updated_at
  )
  SELECT jsonb_build_object(
    'new_orders',       COUNT(*) FILTER (WHERE first_order >= p_from),
    'returning_orders', COUNT(*) FILTER (WHERE first_order < p_from)
  ) INTO new_vs_ret
  FROM act;

  -- Top customers by period spend (admin-only payload — names/emails are fine here).
  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'spend')::numeric DESC), '[]'::jsonb)
  INTO top_customers
  FROM (
    SELECT jsonb_build_object(
             'user_id', o.user_id,
             'name', COALESCE(NULLIF(btrim(concat(pr.first_name, ' ', pr.last_name)), ''), pr.email, 'Customer'),
             'email', COALESCE(pr.email, ''),
             'orders', COUNT(*),
             'spend', SUM(o.total),
             'last_order', MAX(o.created_at)
           ) AS t
    FROM orders o LEFT JOIN profiles pr ON pr.id = o.user_id
    WHERE o.created_at >= p_from AND o.created_at < p_to AND o.status <> 'cancelled'
    GROUP BY o.user_id, pr.first_name, pr.last_name, pr.email
    ORDER BY SUM(o.total) DESC
    LIMIT 10
  ) x;

  -- Buyer gender mix (profile gender; NULL → 'unknown').
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
  INTO by_gender
  FROM (
    SELECT jsonb_build_object(
             'gender', COALESCE(pr.gender, 'unknown'),
             'buyers', COUNT(DISTINCT o.user_id),
             'orders', COUNT(*),
             'revenue', SUM(o.total)
           ) AS t
    FROM orders o LEFT JOIN profiles pr ON pr.id = o.user_id
    WHERE o.created_at >= p_from AND o.created_at < p_to AND o.status <> 'cancelled'
    GROUP BY pr.gender
  ) x;

  RETURN jsonb_build_object(
    'kpis', kpis,
    'previous', prev,
    'growth_series', growth,
    'new_vs_returning', new_vs_ret,
    'top_customers', top_customers,
    'by_gender', by_gender
  );
END;
$$;

-- ─── Access: service-role only ────────────────────────────────────────────────
DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'analytics_executive', 'analytics_revenue', 'analytics_orders',
    'analytics_products', 'analytics_customers'
  ] LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(timestamptz,timestamptz,timestamptz,timestamptz,text,text,jsonb) FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(timestamptz,timestamptz,timestamptz,timestamptz,text,text,jsonb) TO service_role', fn);
  END LOOP;
END $$;
