-- =============================================================================
-- Migration: Analytics RPCs — detail pages (2 of 2)
-- Created:   2026-07-13
-- Purpose:   The remaining analytics page functions:
--              • analytics_product   (per-product deep-dive incl. funnel,
--                gender, variants, search, rankings)
--              • analytics_wishlist  • analytics_cart      • analytics_search
--              • analytics_reviews   • analytics_coupons   • analytics_inventory
--              • analytics_live
--            Same conventions as part 1 (20260712_analytics_rpcs_core.sql):
--            jsonb payloads, active = non-cancelled orders, NO refund/return
--            metrics, service-role-only EXECUTE.
--
-- ⚠️ MANUAL STEP: run in the Supabase SQL editor AFTER part 1. Idempotent.
-- =============================================================================

-- ─── analytics_product — the per-product deep-dive ────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_product(
  p_slug      TEXT,
  p_from      TIMESTAMPTZ,
  p_to        TIMESTAMPTZ,
  p_prev_from TIMESTAMPTZ,
  p_prev_to   TIMESTAMPTZ,
  p_tz        TEXT DEFAULT 'Asia/Kolkata',
  p_bucket    TEXT DEFAULT 'day'
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

  product_info JSONB;
  overview     JSONB;
  views_s      JSONB;
  views_series JSONB;
  wishlist_s   JSONB;
  cart_s       JSONB;
  purchases_s  JSONB;
  sales_series JSONB;
  funnel       JSONB;
  gender_rows  JSONB;
  by_color     JSONB;
  by_size      JSONB;
  reviews_s    JSONB;
  rating_dist  JSONB;
  rating_trend JSONB;
  search_s     JSONB;
  top_queries  JSONB;
  rankings     JSONB;
BEGIN
  -- Catalog identity (works even if the product was deleted: falls back to
  -- order-item snapshots so historical analytics stay reachable).
  SELECT jsonb_build_object(
           'slug', p_slug,
           'title', COALESCE(
             (SELECT p.title FROM products p WHERE p.slug = p_slug LIMIT 1),
             (SELECT oi.title FROM order_items oi WHERE oi.product_slug = p_slug ORDER BY oi.created_at DESC LIMIT 1),
             p_slug),
           'category', COALESCE(
             (SELECT p.category_slug FROM products p WHERE p.slug = p_slug LIMIT 1),
             (SELECT NULLIF(oi.category_slug, '') FROM order_items oi WHERE oi.product_slug = p_slug ORDER BY oi.created_at DESC LIMIT 1)),
           'price',        (SELECT p.price FROM products p WHERE p.slug = p_slug LIMIT 1),
           'stock',        (SELECT p.total_stock FROM products p WHERE p.slug = p_slug LIMIT 1),
           'is_unlimited', (SELECT p.is_unlimited FROM products p WHERE p.slug = p_slug LIMIT 1),
           'in_catalog',   EXISTS (SELECT 1 FROM products p WHERE p.slug = p_slug)
         )
  INTO product_info;

  -- Overview + purchases (order-side numbers share the same CTE shape).
  WITH po AS (      -- this product's active order lines in window
    SELECT o.id AS order_id, o.user_id, o.created_at, oi.quantity, oi.line_total
    FROM orders o JOIN order_items oi ON oi.order_id = o.id
    WHERE oi.product_slug = p_slug AND o.status <> 'cancelled'
      AND o.created_at >= p_from AND o.created_at < p_to
  ), per_order AS ( -- one row per order (an order can hold several lines of this product)
    SELECT order_id, user_id, MIN(created_at) AS created_at,
           SUM(quantity) AS units, SUM(line_total) AS revenue
    FROM po GROUP BY order_id, user_id
  ), reorders AS (  -- orders whose buyer had bought this product before that order
    SELECT COUNT(*) AS n FROM per_order q
    WHERE EXISTS (
      SELECT 1 FROM orders o2 JOIN order_items oi2 ON oi2.order_id = o2.id
      WHERE o2.user_id = q.user_id AND oi2.product_slug = p_slug
        AND o2.status <> 'cancelled' AND o2.created_at < q.created_at)
  ), repeat_buyers AS (
    SELECT COUNT(*) AS n FROM (
      SELECT user_id FROM per_order GROUP BY user_id HAVING COUNT(*) >= 2) t
  ), cancelled AS (
    SELECT COUNT(DISTINCT o.id) AS n
    FROM orders o JOIN order_items oi ON oi.order_id = o.id
    WHERE oi.product_slug = p_slug AND o.status = 'cancelled'
      AND o.created_at >= p_from AND o.created_at < p_to
  )
  SELECT jsonb_build_object(
    'orders',        (SELECT COUNT(*) FROM per_order),
    'reorders',      (SELECT n FROM reorders),
    'revenue',       COALESCE((SELECT SUM(revenue) FROM per_order), 0),
    'units',         COALESCE((SELECT SUM(units) FROM per_order), 0),
    'buyers',        (SELECT COUNT(DISTINCT user_id) FROM per_order),
    'repeat_buyers', (SELECT n FROM repeat_buyers),
    'cancelled_orders', (SELECT n FROM cancelled),
    'avg_selling_price', ROUND(COALESCE((SELECT SUM(revenue) FROM per_order), 0)
                           / NULLIF((SELECT SUM(units) FROM per_order), 0), 2)
  ) INTO purchases_s;
  overview := purchases_s;

  -- Views.
  WITH v AS (
    SELECT * FROM product_views
    WHERE product_slug = p_slug AND created_at >= p_from AND created_at < p_to
  ), per_visitor AS (
    SELECT visitor_id, COUNT(*) AS n,
           COUNT(DISTINCT date_trunc('day', created_at AT TIME ZONE v_tz)) AS days
    FROM v GROUP BY visitor_id
  )
  SELECT jsonb_build_object(
    'total_views',        (SELECT COUNT(*) FROM v),
    'distinct_visitors',  (SELECT COUNT(*) FROM per_visitor),
    'guest_views',        (SELECT COUNT(*) FROM v WHERE user_id IS NULL),
    'registered_views',   (SELECT COUNT(*) FROM v WHERE user_id IS NOT NULL),
    'returning_visitors', (SELECT COUNT(*) FROM per_visitor WHERE days >= 2),
    'avg_views_per_visitor', ROUND((SELECT COUNT(*) FROM v)::numeric
                               / NULLIF((SELECT COUNT(*) FROM per_visitor), 0), 2)
  ) INTO views_s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bucket', to_char(b.bucket, 'YYYY-MM-DD'),
           'views',    COALESCE(agg.views, 0),
           'visitors', COALESCE(agg.visitors, 0)
         ) ORDER BY b.bucket), '[]'::jsonb)
  INTO views_series
  FROM generate_series(
         date_trunc(v_bucket, p_from AT TIME ZONE v_tz),
         date_trunc(v_bucket, (p_to - interval '1 millisecond') AT TIME ZONE v_tz),
         v_step) AS b(bucket)
  LEFT JOIN (
    SELECT date_trunc(v_bucket, created_at AT TIME ZONE v_tz) AS bucket,
           COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
    FROM product_views
    WHERE product_slug = p_slug AND created_at >= p_from AND created_at < p_to
    GROUP BY 1
  ) agg USING (bucket);

  -- Wishlist.
  WITH wa AS (
    SELECT * FROM activity_log
    WHERE type = 'wishlist_add' AND product_slug = p_slug
      AND created_at >= p_from AND created_at < p_to
  ), wl_users AS (SELECT DISTINCT user_id FROM wa WHERE user_id IS NOT NULL)
  SELECT jsonb_build_object(
    'adds',           (SELECT COUNT(*) FROM wa),
    'distinct_users', (SELECT COUNT(*) FROM wl_users),
    'removes',        (SELECT COUNT(*) FROM activity_log
                       WHERE type = 'wishlist_remove' AND product_slug = p_slug
                         AND created_at >= p_from AND created_at < p_to),
    'active_wishlists', (SELECT COUNT(*) FROM wishlist_items WHERE product_slug = p_slug),
    'wishlist_rate',  ROUND((SELECT COUNT(*) FROM wa)::numeric
                        / NULLIF((views_s->>'total_views')::numeric, 0) * 100, 2),
    'to_cart_pct',    ROUND((SELECT COUNT(*) FROM wl_users u
                             WHERE EXISTS (
                               SELECT 1 FROM activity_log c
                               WHERE c.type = 'cart_add' AND c.product_slug = p_slug
                                 AND c.user_id = u.user_id
                                 AND c.created_at >= p_from AND c.created_at < p_to))::numeric
                        / NULLIF((SELECT COUNT(*) FROM wl_users), 0) * 100, 2),
    'to_purchase_pct', ROUND((SELECT COUNT(*) FROM wl_users u
                              WHERE EXISTS (
                                SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
                                WHERE oi.product_slug = p_slug AND o.user_id = u.user_id
                                  AND o.status <> 'cancelled'
                                  AND o.created_at >= p_from AND o.created_at < p_to))::numeric
                        / NULLIF((SELECT COUNT(*) FROM wl_users), 0) * 100, 2)
  ) INTO wishlist_s;

  -- Cart.
  WITH ca AS (
    SELECT * FROM activity_log
    WHERE type = 'cart_add' AND product_slug = p_slug
      AND created_at >= p_from AND created_at < p_to
  ), cart_users AS (SELECT DISTINCT user_id FROM ca WHERE user_id IS NOT NULL),
  view_to_cart AS (
    -- Time from first view to cart add (same account, ≤24h lookback).
    SELECT AVG(EXTRACT(EPOCH FROM (a.created_at - fv.first_view))) AS secs
    FROM ca a
    JOIN LATERAL (
      SELECT MIN(v.created_at) AS first_view
      FROM product_views v
      WHERE v.user_id = a.user_id AND v.product_slug = p_slug
        AND v.created_at <= a.created_at
        AND v.created_at >= a.created_at - interval '24 hours'
    ) fv ON fv.first_view IS NOT NULL
    WHERE a.user_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'adds',           (SELECT COUNT(*) FROM ca),
    'distinct_users', (SELECT COUNT(*) FROM cart_users),
    'removes',        (SELECT COUNT(*) FROM activity_log
                       WHERE type = 'cart_remove' AND product_slug = p_slug
                         AND created_at >= p_from AND created_at < p_to),
    'active_carts',   (SELECT COUNT(DISTINCT user_id) FROM cart_items WHERE product_slug = p_slug),
    'view_to_cart_pct', ROUND((SELECT COUNT(*) FROM ca)::numeric
                          / NULLIF((views_s->>'total_views')::numeric, 0) * 100, 2),
    'cart_to_purchase_pct', ROUND((SELECT COUNT(*) FROM cart_users u
                                   WHERE EXISTS (
                                     SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
                                     WHERE oi.product_slug = p_slug AND o.user_id = u.user_id
                                       AND o.status <> 'cancelled'
                                       AND o.created_at >= p_from AND o.created_at < p_to))::numeric
                          / NULLIF((SELECT COUNT(*) FROM cart_users), 0) * 100, 2),
    'avg_view_to_cart_seconds', ROUND((SELECT secs FROM view_to_cart)::numeric, 0)
  ) INTO cart_s;

  -- Orders + revenue trend.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bucket', to_char(b.bucket, 'YYYY-MM-DD'),
           'orders',  COALESCE(agg.orders, 0),
           'revenue', COALESCE(agg.revenue, 0)
         ) ORDER BY b.bucket), '[]'::jsonb)
  INTO sales_series
  FROM generate_series(
         date_trunc(v_bucket, p_from AT TIME ZONE v_tz),
         date_trunc(v_bucket, (p_to - interval '1 millisecond') AT TIME ZONE v_tz),
         v_step) AS b(bucket)
  LEFT JOIN (
    SELECT date_trunc(v_bucket, o.created_at AT TIME ZONE v_tz) AS bucket,
           COUNT(DISTINCT o.id) AS orders, SUM(oi.line_total) AS revenue
    FROM orders o JOIN order_items oi ON oi.order_id = o.id
    WHERE oi.product_slug = p_slug AND o.status <> 'cancelled'
      AND o.created_at >= p_from AND o.created_at < p_to
    GROUP BY 1
  ) agg USING (bucket);

  -- Conversion funnel (window-scoped; stages 2+ are account-based since only
  -- logged-in customers can wishlist/cart/buy).
  SELECT jsonb_build_object(
    'views',    (SELECT COUNT(DISTINCT COALESCE(user_id::text, visitor_id)) FROM product_views
                 WHERE product_slug = p_slug AND created_at >= p_from AND created_at < p_to),
    'wishlist', (SELECT COUNT(DISTINCT user_id) FROM activity_log
                 WHERE type = 'wishlist_add' AND product_slug = p_slug AND user_id IS NOT NULL
                   AND created_at >= p_from AND created_at < p_to),
    'cart',     (SELECT COUNT(DISTINCT user_id) FROM activity_log
                 WHERE type = 'cart_add' AND product_slug = p_slug AND user_id IS NOT NULL
                   AND created_at >= p_from AND created_at < p_to),
    'checkout', (SELECT COUNT(DISTINCT user_id) FROM activity_log a
                 WHERE a.type = 'checkout_started' AND a.user_id IS NOT NULL
                   AND a.created_at >= p_from AND a.created_at < p_to
                   AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(a.metadata->'items', '[]'::jsonb)) it
                               WHERE it->>'slug' = p_slug)),
    'purchase', (SELECT COUNT(DISTINCT o.user_id) FROM orders o JOIN order_items oi ON oi.order_id = o.id
                 WHERE oi.product_slug = p_slug AND o.status <> 'cancelled'
                   AND o.created_at >= p_from AND o.created_at < p_to),
    'repeat',   (SELECT COUNT(*) FROM (
                   SELECT o.user_id FROM orders o JOIN order_items oi ON oi.order_id = o.id
                   WHERE oi.product_slug = p_slug AND o.status <> 'cancelled'
                     AND o.created_at >= p_from AND o.created_at < p_to
                   GROUP BY o.user_id HAVING COUNT(DISTINCT o.id) >= 2) t)
  ) INTO funnel;

  -- Gender split (buyer gender from profiles; guests only exist for views).
  WITH seg AS (
    SELECT s.label,
      (SELECT COUNT(*) FROM product_views v LEFT JOIN profiles pr ON pr.id = v.user_id
       WHERE v.product_slug = p_slug AND v.created_at >= p_from AND v.created_at < p_to
         AND CASE s.label
               WHEN 'guest'  THEN v.user_id IS NULL
               WHEN 'male'   THEN pr.gender = 'male'
               WHEN 'female' THEN pr.gender = 'female'
               ELSE v.user_id IS NOT NULL AND (pr.gender IS NULL OR pr.gender = 'other')
             END) AS views,
      (SELECT COUNT(*) FROM activity_log a LEFT JOIN profiles pr ON pr.id = a.user_id
       WHERE a.type = 'wishlist_add' AND a.product_slug = p_slug
         AND a.created_at >= p_from AND a.created_at < p_to
         AND CASE s.label
               WHEN 'guest'  THEN a.user_id IS NULL
               WHEN 'male'   THEN pr.gender = 'male'
               WHEN 'female' THEN pr.gender = 'female'
               ELSE a.user_id IS NOT NULL AND (pr.gender IS NULL OR pr.gender = 'other')
             END) AS wishlists,
      (SELECT COUNT(*) FROM activity_log a LEFT JOIN profiles pr ON pr.id = a.user_id
       WHERE a.type = 'cart_add' AND a.product_slug = p_slug
         AND a.created_at >= p_from AND a.created_at < p_to
         AND CASE s.label
               WHEN 'guest'  THEN a.user_id IS NULL
               WHEN 'male'   THEN pr.gender = 'male'
               WHEN 'female' THEN pr.gender = 'female'
               ELSE a.user_id IS NOT NULL AND (pr.gender IS NULL OR pr.gender = 'other')
             END) AS cart_adds,
      (SELECT COUNT(DISTINCT o.id) FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN profiles pr ON pr.id = o.user_id
       WHERE oi.product_slug = p_slug AND o.status <> 'cancelled'
         AND o.created_at >= p_from AND o.created_at < p_to
         AND CASE s.label
               WHEN 'guest'  THEN FALSE  -- checkout requires an account
               WHEN 'male'   THEN pr.gender = 'male'
               WHEN 'female' THEN pr.gender = 'female'
               ELSE pr.gender IS NULL OR pr.gender = 'other'
             END) AS orders,
      (SELECT COALESCE(SUM(oi.line_total), 0) FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN profiles pr ON pr.id = o.user_id
       WHERE oi.product_slug = p_slug AND o.status <> 'cancelled'
         AND o.created_at >= p_from AND o.created_at < p_to
         AND CASE s.label
               WHEN 'guest'  THEN FALSE
               WHEN 'male'   THEN pr.gender = 'male'
               WHEN 'female' THEN pr.gender = 'female'
               ELSE pr.gender IS NULL OR pr.gender = 'other'
             END) AS revenue
    FROM (VALUES ('male'), ('female'), ('other'), ('guest')) AS s(label)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'segment', label, 'views', views, 'wishlists', wishlists,
           'cart_adds', cart_adds, 'orders', orders, 'revenue', revenue,
           'conversion', ROUND(orders::numeric / NULLIF(views, 0) * 100, 2))), '[]'::jsonb)
  INTO gender_rows FROM seg;

  -- Variants: per colour (sku) and per size.
  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'revenue')::numeric DESC NULLS LAST), '[]'::jsonb)
  INTO by_color
  FROM (
    SELECT jsonb_build_object(
             'sku', s.sku,
             'color', COALESCE(pv.color_name, s.sku),
             'hex', pv.color_hex,
             'views',     COALESCE(v.views, 0),
             'wishlists', COALESCE(e.wl, 0),
             'cart_adds', COALESCE(e.ca, 0),
             'orders',    COALESCE(oa.orders, 0),
             'units',     COALESCE(oa.units, 0),
             'revenue',   COALESCE(oa.revenue, 0),
             'conversion', ROUND(COALESCE(oa.orders, 0)::numeric / NULLIF(v.views, 0) * 100, 2)
           ) AS t
    FROM (
      SELECT DISTINCT sku FROM (
        SELECT sku FROM product_views WHERE product_slug = p_slug AND created_at >= p_from AND created_at < p_to AND sku IS NOT NULL
        UNION SELECT sku FROM activity_log WHERE product_slug = p_slug AND created_at >= p_from AND created_at < p_to AND sku IS NOT NULL
        UNION SELECT oi.sku FROM order_items oi JOIN orders o ON o.id = oi.order_id
              WHERE oi.product_slug = p_slug AND o.created_at >= p_from AND o.created_at < p_to
        UNION SELECT v2.variant_sku FROM product_variants v2 JOIN products p2 ON p2.id = v2.product_id WHERE p2.slug = p_slug
      ) all_skus WHERE sku IS NOT NULL
    ) s
    LEFT JOIN product_variants pv ON pv.variant_sku = s.sku
    LEFT JOIN (
      SELECT sku, COUNT(*) AS views FROM product_views
      WHERE product_slug = p_slug AND created_at >= p_from AND created_at < p_to
      GROUP BY sku) v ON v.sku = s.sku
    LEFT JOIN (
      SELECT sku,
             COUNT(*) FILTER (WHERE type = 'wishlist_add') AS wl,
             COUNT(*) FILTER (WHERE type = 'cart_add')     AS ca
      FROM activity_log
      WHERE product_slug = p_slug AND created_at >= p_from AND created_at < p_to
      GROUP BY sku) e ON e.sku = s.sku
    LEFT JOIN (
      SELECT oi.sku, COUNT(DISTINCT o.id) AS orders, SUM(oi.quantity) AS units, SUM(oi.line_total) AS revenue
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_slug = p_slug AND o.status <> 'cancelled'
        AND o.created_at >= p_from AND o.created_at < p_to
      GROUP BY oi.sku) oa ON oa.sku = s.sku
  ) x;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'revenue')::numeric DESC NULLS LAST), '[]'::jsonb)
  INTO by_size
  FROM (
    SELECT jsonb_build_object(
             'size', s.size,
             'cart_adds', COALESCE(c.n, 0),
             'orders',    COALESCE(oa.orders, 0),
             'units',     COALESCE(oa.units, 0),
             'revenue',   COALESCE(oa.revenue, 0),
             'conversion', ROUND(COALESCE(oa.orders, 0)::numeric / NULLIF(c.n, 0) * 100, 2)
           ) AS t
    FROM (
      SELECT DISTINCT size FROM (
        SELECT NULLIF(oi.size, '') AS size FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_slug = p_slug AND o.created_at >= p_from AND o.created_at < p_to
        UNION SELECT NULLIF(metadata->>'size', '') FROM activity_log
        WHERE type = 'cart_add' AND product_slug = p_slug AND created_at >= p_from AND created_at < p_to
      ) t WHERE size IS NOT NULL
    ) s
    LEFT JOIN (
      SELECT NULLIF(metadata->>'size', '') AS size, COUNT(*) AS n FROM activity_log
      WHERE type = 'cart_add' AND product_slug = p_slug AND created_at >= p_from AND created_at < p_to
      GROUP BY 1) c ON c.size = s.size
    LEFT JOIN (
      SELECT NULLIF(oi.size, '') AS size, COUNT(DISTINCT o.id) AS orders,
             SUM(oi.quantity) AS units, SUM(oi.line_total) AS revenue
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_slug = p_slug AND o.status <> 'cancelled'
        AND o.created_at >= p_from AND o.created_at < p_to
      GROUP BY 1) oa ON oa.size = s.size
  ) x;

  -- Reviews.
  SELECT jsonb_build_object(
    'total',    (SELECT COUNT(*) FROM product_reviews WHERE product_slug = p_slug
                 AND created_at >= p_from AND created_at < p_to),
    'all_time', (SELECT COUNT(*) FROM product_reviews WHERE product_slug = p_slug),
    'avg_rating', (SELECT ROUND(AVG(rating), 2) FROM product_reviews WHERE product_slug = p_slug
                   AND created_at >= p_from AND created_at < p_to),
    'avg_rating_all_time', (SELECT ROUND(AVG(rating), 2) FROM product_reviews WHERE product_slug = p_slug),
    'verified', (SELECT COUNT(*) FROM product_reviews WHERE product_slug = p_slug AND verified
                 AND created_at >= p_from AND created_at < p_to)
  ) INTO reviews_s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('rating', r.r, 'count', COALESCE(d.n, 0)) ORDER BY r.r DESC), '[]'::jsonb)
  INTO rating_dist
  FROM generate_series(1, 5) AS r(r)
  LEFT JOIN (
    SELECT rating, COUNT(*) AS n FROM product_reviews
    WHERE product_slug = p_slug AND created_at >= p_from AND created_at < p_to
    GROUP BY rating) d ON d.rating = r.r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bucket', to_char(b.bucket, 'YYYY-MM-DD'),
           'count', COALESCE(agg.n, 0), 'avg_rating', agg.avg
         ) ORDER BY b.bucket), '[]'::jsonb)
  INTO rating_trend
  FROM generate_series(
         date_trunc(v_bucket, p_from AT TIME ZONE v_tz),
         date_trunc(v_bucket, (p_to - interval '1 millisecond') AT TIME ZONE v_tz),
         v_step) AS b(bucket)
  LEFT JOIN (
    SELECT date_trunc(v_bucket, created_at AT TIME ZONE v_tz) AS bucket,
           COUNT(*) AS n, ROUND(AVG(rating), 2) AS avg
    FROM product_reviews
    WHERE product_slug = p_slug AND created_at >= p_from AND created_at < p_to
    GROUP BY 1) agg USING (bucket);

  -- Search performance for this product.
  WITH appearances AS (
    SELECT a.* FROM activity_log a
    WHERE a.type = 'search' AND a.created_at >= p_from AND a.created_at < p_to
      AND COALESCE(a.metadata->'result_slugs', '[]'::jsonb) ? p_slug
  ), clicks AS (
    SELECT COUNT(*) AS n FROM product_views
    WHERE product_slug = p_slug AND source = 'search'
      AND created_at >= p_from AND created_at < p_to
  )
  SELECT jsonb_build_object(
    'appearances', (SELECT COUNT(*) FROM appearances),
    'clicks',      (SELECT n FROM clicks),
    'ctr',         ROUND((SELECT n FROM clicks)::numeric
                     / NULLIF((SELECT COUNT(*) FROM appearances), 0) * 100, 2),
    'orders_from_search', (
      SELECT COUNT(DISTINCT o.id)
      FROM orders o JOIN order_items oi ON oi.order_id = o.id
      WHERE oi.product_slug = p_slug AND o.status <> 'cancelled'
        AND o.created_at >= p_from AND o.created_at < p_to
        AND EXISTS (
          SELECT 1 FROM product_views v
          WHERE v.user_id = o.user_id AND v.product_slug = p_slug AND v.source = 'search'
            AND v.created_at BETWEEN o.created_at - interval '7 days' AND o.created_at))
  ) INTO search_s;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'count')::numeric DESC), '[]'::jsonb)
  INTO top_queries
  FROM (
    SELECT jsonb_build_object('query', lower(a.metadata->>'query'), 'count', COUNT(*)) AS t
    FROM activity_log a
    WHERE a.type = 'search' AND a.created_at >= p_from AND a.created_at < p_to
      AND COALESCE(a.metadata->'result_slugs', '[]'::jsonb) ? p_slug
      AND COALESCE(a.metadata->>'query', '') <> ''
    GROUP BY lower(a.metadata->>'query')
    ORDER BY COUNT(*) DESC LIMIT 10
  ) x;

  -- Rankings across the whole catalog (period metrics; rating is all-time).
  WITH sold AS (
    SELECT oi.product_slug AS slug, SUM(oi.line_total) AS revenue, COUNT(DISTINCT o.id) AS orders
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status <> 'cancelled' AND o.created_at >= p_from AND o.created_at < p_to
    GROUP BY oi.product_slug
  ), vw AS (
    SELECT product_slug AS slug, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
    FROM product_views WHERE created_at >= p_from AND created_at < p_to
    GROUP BY product_slug
  ), ev AS (
    SELECT product_slug AS slug,
           COUNT(*) FILTER (WHERE type = 'wishlist_add') AS wl,
           COUNT(*) FILTER (WHERE type = 'cart_add')     AS ca
    FROM activity_log
    WHERE created_at >= p_from AND created_at < p_to AND product_slug IS NOT NULL
    GROUP BY product_slug
  ), rv AS (
    SELECT product_slug AS slug, AVG(rating) AS rating FROM product_reviews GROUP BY product_slug
  ), base AS (
    SELECT p.slug,
           COALESCE(s.revenue, 0) AS revenue,
           COALESCE(s.orders, 0)  AS orders,
           COALESCE(v.views, 0)   AS views,
           COALESCE(e.wl, 0)      AS wl,
           COALESCE(e.ca, 0)      AS ca,
           r.rating,
           CASE WHEN COALESCE(v.views, 0) > 0
                THEN COALESCE(s.orders, 0)::numeric / v.views ELSE NULL END AS conv
    FROM products p
    LEFT JOIN sold s ON s.slug = p.slug
    LEFT JOIN vw   v ON v.slug = p.slug
    LEFT JOIN ev   e ON e.slug = p.slug
    LEFT JOIN rv   r ON r.slug = p.slug
    WHERE p.status = 'PUBLISHED'
  ), ranked AS (
    SELECT slug,
           RANK() OVER (ORDER BY revenue DESC)             AS revenue_rank,
           RANK() OVER (ORDER BY orders DESC)              AS orders_rank,
           RANK() OVER (ORDER BY views DESC)               AS views_rank,
           RANK() OVER (ORDER BY wl DESC)                  AS wishlist_rank,
           RANK() OVER (ORDER BY ca DESC)                  AS cart_rank,
           RANK() OVER (ORDER BY conv DESC NULLS LAST)     AS conversion_rank,
           RANK() OVER (ORDER BY rating DESC NULLS LAST)   AS rating_rank
    FROM base
  )
  SELECT jsonb_build_object(
    'revenue_rank',    r.revenue_rank,
    'orders_rank',     r.orders_rank,
    'views_rank',      r.views_rank,
    'wishlist_rank',   r.wishlist_rank,
    'cart_rank',       r.cart_rank,
    'conversion_rank', r.conversion_rank,
    'rating_rank',     r.rating_rank,
    'total_products',  (SELECT COUNT(*) FROM products WHERE status = 'PUBLISHED')
  ) INTO rankings
  FROM ranked r WHERE r.slug = p_slug;

  RETURN jsonb_build_object(
    'product',       product_info,
    'overview',      overview,
    'views',         views_s,
    'views_series',  views_series,
    'wishlist',      wishlist_s,
    'cart',          cart_s,
    'purchases',     purchases_s,
    'sales_series',  sales_series,
    'funnel',        funnel,
    'gender',        gender_rows,
    'by_color',      by_color,
    'by_size',       by_size,
    'reviews',       reviews_s,
    'rating_distribution', rating_dist,
    'rating_trend',  rating_trend,
    'search',        search_s,
    'top_queries',   top_queries,
    'rankings',      COALESCE(rankings, '{}'::jsonb)
  );
END;
$$;

-- ─── analytics_wishlist ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_wishlist(
  p_from      TIMESTAMPTZ,
  p_to        TIMESTAMPTZ,
  p_prev_from TIMESTAMPTZ,
  p_prev_to   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  kpis  JSONB;
  prev  JSONB;
  rows_ JSONB;
BEGIN
  WITH wa AS (
    SELECT * FROM activity_log
    WHERE type = 'wishlist_add' AND created_at >= p_from AND created_at < p_to
  ), conv AS (
    SELECT COUNT(DISTINCT wa.user_id) AS n
    FROM wa
    WHERE wa.user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
      WHERE o.user_id = wa.user_id AND oi.product_slug = wa.product_slug
        AND o.status <> 'cancelled' AND o.created_at >= wa.created_at)
  ), top AS (
    SELECT product_slug, COUNT(*) AS n FROM wa WHERE product_slug IS NOT NULL
    GROUP BY product_slug ORDER BY COUNT(*) DESC LIMIT 1
  ), growth AS (
    SELECT cur.product_slug, cur.n - COALESCE(prv.n, 0) AS delta
    FROM (SELECT product_slug, COUNT(*) AS n FROM wa WHERE product_slug IS NOT NULL GROUP BY product_slug) cur
    LEFT JOIN (
      SELECT product_slug, COUNT(*) AS n FROM activity_log
      WHERE type = 'wishlist_add' AND created_at >= p_prev_from AND created_at < p_prev_to
      GROUP BY product_slug) prv USING (product_slug)
    ORDER BY (cur.n - COALESCE(prv.n, 0)) DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'adds',            (SELECT COUNT(*) FROM wa),
    'distinct_users',  (SELECT COUNT(DISTINCT user_id) FROM wa WHERE user_id IS NOT NULL),
    'removes',         (SELECT COUNT(*) FROM activity_log
                        WHERE type = 'wishlist_remove' AND created_at >= p_from AND created_at < p_to),
    'conversion_pct',  ROUND((SELECT n FROM conv)::numeric
                         / NULLIF((SELECT COUNT(DISTINCT user_id) FROM wa WHERE user_id IS NOT NULL), 0) * 100, 2),
    'most_wishlisted', (SELECT jsonb_build_object(
                          'slug', t.product_slug,
                          'title', COALESCE((SELECT title FROM products WHERE slug = t.product_slug LIMIT 1), t.product_slug),
                          'adds', t.n) FROM top t),
    'fastest_growing', (SELECT jsonb_build_object(
                          'slug', g.product_slug,
                          'title', COALESCE((SELECT title FROM products WHERE slug = g.product_slug LIMIT 1), g.product_slug),
                          'delta', g.delta) FROM growth g)
  ) INTO kpis;

  SELECT jsonb_build_object(
    'adds', COUNT(*),
    'distinct_users', COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL),
    'removes', (SELECT COUNT(*) FROM activity_log
                WHERE type = 'wishlist_remove' AND created_at >= p_prev_from AND created_at < p_prev_to)
  ) INTO prev
  FROM activity_log
  WHERE type = 'wishlist_add' AND created_at >= p_prev_from AND created_at < p_prev_to;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'adds')::numeric DESC), '[]'::jsonb)
  INTO rows_
  FROM (
    SELECT jsonb_build_object(
             'slug', w.product_slug,
             'title', COALESCE(MAX(p.title), w.product_slug),
             'adds', COUNT(*) FILTER (WHERE w.type = 'wishlist_add'),
             'removes', COUNT(*) FILTER (WHERE w.type = 'wishlist_remove'),
             'active', (SELECT COUNT(*) FROM wishlist_items wi WHERE wi.product_slug = w.product_slug),
             'moved_to_cart', COUNT(DISTINCT w.user_id) FILTER (
               WHERE w.type = 'wishlist_add' AND w.user_id IS NOT NULL AND EXISTS (
                 SELECT 1 FROM activity_log c
                 WHERE c.type = 'cart_add' AND c.product_slug = w.product_slug
                   AND c.user_id = w.user_id AND c.created_at >= w.created_at)),
             'purchased', COUNT(DISTINCT w.user_id) FILTER (
               WHERE w.type = 'wishlist_add' AND w.user_id IS NOT NULL AND EXISTS (
                 SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
                 WHERE o.user_id = w.user_id AND oi.product_slug = w.product_slug
                   AND o.status <> 'cancelled' AND o.created_at >= w.created_at))
           ) AS t
    FROM activity_log w
    LEFT JOIN products p ON p.slug = w.product_slug
    WHERE w.type IN ('wishlist_add', 'wishlist_remove')
      AND w.created_at >= p_from AND w.created_at < p_to
      AND w.product_slug IS NOT NULL
    GROUP BY w.product_slug
    LIMIT 300
  ) x;

  RETURN jsonb_build_object('kpis', kpis, 'previous', prev, 'table', rows_);
END;
$$;

-- ─── analytics_cart ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_cart(
  p_from      TIMESTAMPTZ,
  p_to        TIMESTAMPTZ,
  p_prev_from TIMESTAMPTZ,
  p_prev_to   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  kpis  JSONB;
  prev  JSONB;
  rows_ JSONB;
BEGIN
  WITH ca AS (
    SELECT * FROM activity_log
    WHERE type = 'cart_add' AND created_at >= p_from AND created_at < p_to
  ), conv AS (
    SELECT COUNT(DISTINCT ca.user_id) AS n
    FROM ca
    WHERE ca.user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
      WHERE o.user_id = ca.user_id AND oi.product_slug = ca.product_slug
        AND o.status <> 'cancelled' AND o.created_at >= ca.created_at)
  ), per_product AS (
    SELECT product_slug, COUNT(*) AS adds,
           COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS users,
           COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
             WHERE o.user_id = ca.user_id AND oi.product_slug = ca.product_slug
               AND o.status <> 'cancelled' AND o.created_at >= ca.created_at)) AS purchased
    FROM ca WHERE product_slug IS NOT NULL
    GROUP BY product_slug
  )
  SELECT jsonb_build_object(
    'adds',           (SELECT COUNT(*) FROM ca),
    'distinct_users', (SELECT COUNT(DISTINCT user_id) FROM ca WHERE user_id IS NOT NULL),
    'removes',        (SELECT COUNT(*) FROM activity_log
                       WHERE type = 'cart_remove' AND created_at >= p_from AND created_at < p_to),
    'conversion_pct', ROUND((SELECT n FROM conv)::numeric
                        / NULLIF((SELECT COUNT(DISTINCT user_id) FROM ca WHERE user_id IS NOT NULL), 0) * 100, 2),
    'highest_carted', (SELECT jsonb_build_object(
                         'slug', pp.product_slug,
                         'title', COALESCE((SELECT title FROM products WHERE slug = pp.product_slug LIMIT 1), pp.product_slug),
                         'adds', pp.adds)
                       FROM per_product pp ORDER BY pp.adds DESC LIMIT 1),
    'highest_abandonment', (SELECT jsonb_build_object(
                              'slug', pp.product_slug,
                              'title', COALESCE((SELECT title FROM products WHERE slug = pp.product_slug LIMIT 1), pp.product_slug),
                              'abandonment_pct', ROUND((1 - pp.purchased::numeric / NULLIF(pp.users, 0)) * 100, 1))
                            FROM per_product pp WHERE pp.users >= 3
                            ORDER BY (1 - pp.purchased::numeric / NULLIF(pp.users, 0)) DESC NULLS LAST LIMIT 1)
  ) INTO kpis;

  SELECT jsonb_build_object(
    'adds', COUNT(*),
    'distinct_users', COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL),
    'removes', (SELECT COUNT(*) FROM activity_log
                WHERE type = 'cart_remove' AND created_at >= p_prev_from AND created_at < p_prev_to)
  ) INTO prev
  FROM activity_log
  WHERE type = 'cart_add' AND created_at >= p_prev_from AND created_at < p_prev_to;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'adds')::numeric DESC), '[]'::jsonb)
  INTO rows_
  FROM (
    SELECT jsonb_build_object(
             'slug', c.product_slug,
             'title', COALESCE(MAX(p.title), c.product_slug),
             'adds', COUNT(*) FILTER (WHERE c.type = 'cart_add'),
             'removes', COUNT(*) FILTER (WHERE c.type = 'cart_remove'),
             'active', (SELECT COUNT(DISTINCT user_id) FROM cart_items ci WHERE ci.product_slug = c.product_slug),
             'users', COUNT(DISTINCT c.user_id) FILTER (WHERE c.type = 'cart_add' AND c.user_id IS NOT NULL),
             'purchased', COUNT(DISTINCT c.user_id) FILTER (
               WHERE c.type = 'cart_add' AND c.user_id IS NOT NULL AND EXISTS (
                 SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
                 WHERE o.user_id = c.user_id AND oi.product_slug = c.product_slug
                   AND o.status <> 'cancelled' AND o.created_at >= c.created_at))
           ) AS t
    FROM activity_log c
    LEFT JOIN products p ON p.slug = c.product_slug
    WHERE c.type IN ('cart_add', 'cart_remove')
      AND c.created_at >= p_from AND c.created_at < p_to
      AND c.product_slug IS NOT NULL
    GROUP BY c.product_slug
    LIMIT 300
  ) x;

  RETURN jsonb_build_object('kpis', kpis, 'previous', prev, 'table', rows_);
END;
$$;

-- ─── analytics_search ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_search(
  p_from      TIMESTAMPTZ,
  p_to        TIMESTAMPTZ,
  p_prev_from TIMESTAMPTZ,
  p_prev_to   TIMESTAMPTZ,
  p_tz        TEXT DEFAULT 'Asia/Kolkata',
  p_bucket    TEXT DEFAULT 'day'
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
  kpis       JSONB;
  prev       JSONB;
  series     JSONB;
  top_terms  JSONB;
  zero_terms JSONB;
BEGIN
  -- A "clicked" search = a search whose visitor opened a result PDP (a view with
  -- source='search') within 15 minutes. Joined per visitor id, so guests count.
  WITH s AS (
    SELECT a.id, a.user_id, a.created_at,
           lower(COALESCE(a.metadata->>'query', ''))        AS query,
           COALESCE((a.metadata->>'result_count')::int, 0)  AS result_count,
           a.metadata->>'visitor_id'                        AS visitor_id
    FROM activity_log a
    WHERE a.type = 'search' AND a.created_at >= p_from AND a.created_at < p_to
  ), clicked AS (
    SELECT s.id FROM s
    WHERE s.visitor_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM product_views v
      WHERE v.visitor_id = s.visitor_id AND v.source = 'search'
        AND v.created_at BETWEEN s.created_at AND s.created_at + interval '15 minutes')
  ), converted AS (
    SELECT s.id FROM s
    WHERE s.user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.user_id = s.user_id AND o.status <> 'cancelled'
        AND o.created_at BETWEEN s.created_at AND s.created_at + interval '24 hours')
  )
  SELECT jsonb_build_object(
    'searches',        (SELECT COUNT(*) FROM s),
    'unique_queries',  (SELECT COUNT(DISTINCT query) FROM s WHERE query <> ''),
    'zero_results',    (SELECT COUNT(*) FROM s WHERE result_count = 0),
    'ctr',             ROUND((SELECT COUNT(*) FROM clicked)::numeric
                         / NULLIF((SELECT COUNT(*) FROM s), 0) * 100, 2),
    'conversion_pct',  ROUND((SELECT COUNT(*) FROM converted)::numeric
                         / NULLIF((SELECT COUNT(*) FROM s WHERE user_id IS NOT NULL), 0) * 100, 2)
  ) INTO kpis;

  SELECT jsonb_build_object(
    'searches',     COUNT(*),
    'zero_results', COUNT(*) FILTER (WHERE COALESCE((metadata->>'result_count')::int, 0) = 0)
  ) INTO prev
  FROM activity_log
  WHERE type = 'search' AND created_at >= p_prev_from AND created_at < p_prev_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bucket', to_char(b.bucket, 'YYYY-MM-DD'),
           'searches', COALESCE(agg.n, 0),
           'zero_results', COALESCE(agg.zero, 0)
         ) ORDER BY b.bucket), '[]'::jsonb)
  INTO series
  FROM generate_series(
         date_trunc(v_bucket, p_from AT TIME ZONE v_tz),
         date_trunc(v_bucket, (p_to - interval '1 millisecond') AT TIME ZONE v_tz),
         v_step) AS b(bucket)
  LEFT JOIN (
    SELECT date_trunc(v_bucket, created_at AT TIME ZONE v_tz) AS bucket,
           COUNT(*) AS n,
           COUNT(*) FILTER (WHERE COALESCE((metadata->>'result_count')::int, 0) = 0) AS zero
    FROM activity_log
    WHERE type = 'search' AND created_at >= p_from AND created_at < p_to
    GROUP BY 1) agg USING (bucket);

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'count')::numeric DESC), '[]'::jsonb)
  INTO top_terms
  FROM (
    SELECT jsonb_build_object(
             'query', q.query,
             'count', COUNT(*),
             'avg_results', ROUND(AVG(q.result_count), 1),
             'clicks', COUNT(*) FILTER (WHERE q.clicked),
             'ctr', ROUND(COUNT(*) FILTER (WHERE q.clicked)::numeric / COUNT(*) * 100, 1)
           ) AS t
    FROM (
      SELECT lower(COALESCE(a.metadata->>'query', '')) AS query,
             COALESCE((a.metadata->>'result_count')::int, 0) AS result_count,
             (a.metadata->>'visitor_id' IS NOT NULL AND EXISTS (
                SELECT 1 FROM product_views v
                WHERE v.visitor_id = a.metadata->>'visitor_id' AND v.source = 'search'
                  AND v.created_at BETWEEN a.created_at AND a.created_at + interval '15 minutes')) AS clicked
      FROM activity_log a
      WHERE a.type = 'search' AND a.created_at >= p_from AND a.created_at < p_to
        AND COALESCE(a.metadata->>'query', '') <> ''
    ) q
    GROUP BY q.query
    ORDER BY COUNT(*) DESC LIMIT 25
  ) x;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'count')::numeric DESC), '[]'::jsonb)
  INTO zero_terms
  FROM (
    SELECT jsonb_build_object('query', lower(metadata->>'query'), 'count', COUNT(*)) AS t
    FROM activity_log
    WHERE type = 'search' AND created_at >= p_from AND created_at < p_to
      AND COALESCE((metadata->>'result_count')::int, 0) = 0
      AND COALESCE(metadata->>'query', '') <> ''
    GROUP BY lower(metadata->>'query')
    ORDER BY COUNT(*) DESC LIMIT 25
  ) x;

  RETURN jsonb_build_object(
    'kpis', kpis, 'previous', prev, 'search_series', series,
    'top_terms', top_terms, 'zero_terms', zero_terms
  );
END;
$$;

-- ─── analytics_reviews ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_reviews(
  p_from      TIMESTAMPTZ,
  p_to        TIMESTAMPTZ,
  p_prev_from TIMESTAMPTZ,
  p_prev_to   TIMESTAMPTZ,
  p_tz        TEXT DEFAULT 'Asia/Kolkata',
  p_bucket    TEXT DEFAULT 'day'
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
  kpis       JSONB;
  prev       JSONB;
  trend      JSONB;
  dist       JSONB;
  by_product JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total',      COUNT(*),
    'avg_rating', ROUND(AVG(rating), 2),
    'verified',   COUNT(*) FILTER (WHERE verified),
    'with_images', COUNT(*) FILTER (WHERE cardinality(images) > 0)
  ) INTO kpis
  FROM product_reviews WHERE created_at >= p_from AND created_at < p_to;

  SELECT jsonb_build_object(
    'total',      COUNT(*),
    'avg_rating', ROUND(AVG(rating), 2),
    'verified',   COUNT(*) FILTER (WHERE verified)
  ) INTO prev
  FROM product_reviews WHERE created_at >= p_prev_from AND created_at < p_prev_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bucket', to_char(b.bucket, 'YYYY-MM-DD'),
           'count', COALESCE(agg.n, 0), 'avg_rating', agg.avg
         ) ORDER BY b.bucket), '[]'::jsonb)
  INTO trend
  FROM generate_series(
         date_trunc(v_bucket, p_from AT TIME ZONE v_tz),
         date_trunc(v_bucket, (p_to - interval '1 millisecond') AT TIME ZONE v_tz),
         v_step) AS b(bucket)
  LEFT JOIN (
    SELECT date_trunc(v_bucket, created_at AT TIME ZONE v_tz) AS bucket,
           COUNT(*) AS n, ROUND(AVG(rating), 2) AS avg
    FROM product_reviews WHERE created_at >= p_from AND created_at < p_to
    GROUP BY 1) agg USING (bucket);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('rating', r.r, 'count', COALESCE(d.n, 0)) ORDER BY r.r DESC), '[]'::jsonb)
  INTO dist
  FROM generate_series(1, 5) AS r(r)
  LEFT JOIN (
    SELECT rating, COUNT(*) AS n FROM product_reviews
    WHERE created_at >= p_from AND created_at < p_to GROUP BY rating) d ON d.rating = r.r;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'count')::numeric DESC), '[]'::jsonb)
  INTO by_product
  FROM (
    SELECT jsonb_build_object(
             'slug', r.product_slug,
             'title', COALESCE(MAX(p.title), r.product_slug),
             'count', COUNT(*),
             'avg_rating', ROUND(AVG(r.rating), 2),
             'verified', COUNT(*) FILTER (WHERE r.verified),
             'low_ratings', COUNT(*) FILTER (WHERE r.rating <= 2)
           ) AS t
    FROM product_reviews r LEFT JOIN products p ON p.slug = r.product_slug
    WHERE r.created_at >= p_from AND r.created_at < p_to
    GROUP BY r.product_slug
    ORDER BY COUNT(*) DESC LIMIT 100
  ) x;

  RETURN jsonb_build_object(
    'kpis', kpis, 'previous', prev, 'reviews_trend', trend,
    'rating_distribution', dist, 'by_product', by_product
  );
END;
$$;

-- ─── analytics_coupons ────────────────────────────────────────────────────────
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
AS $$
DECLARE
  kpis  JSONB;
  prev  JSONB;
  rows_ JSONB;
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
  ), act AS (SELECT * FROM co WHERE status <> 'cancelled')
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
                          / NULLIF((SELECT COUNT(*) FROM co), 0) * 100, 2)
  ) INTO kpis;

  WITH co AS (
    SELECT o.* FROM orders o
    WHERE o.coupon_code IS NOT NULL
      AND o.created_at >= p_prev_from AND o.created_at < p_prev_to
  ), act AS (SELECT * FROM co WHERE status <> 'cancelled')
  SELECT jsonb_build_object(
    'coupon_orders',  (SELECT COUNT(*) FROM act),
    'revenue',        COALESCE((SELECT SUM(total) FROM act), 0),
    'discount_given', COALESCE((SELECT SUM(discount) FROM act), 0)
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
             'cancelled', COALESCE(w.cancelled, 0)
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
  ) x;

  RETURN jsonb_build_object('kpis', kpis, 'previous', prev, 'table', rows_);
END;
$$;

-- ─── analytics_inventory ──────────────────────────────────────────────────────
-- Stock is CURRENT state (no history exists); sales velocity uses the window.
CREATE OR REPLACE FUNCTION public.analytics_inventory(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days  NUMERIC := GREATEST(EXTRACT(EPOCH FROM (p_to - p_from)) / 86400, 1);
  kpis    JSONB;
  fastest JSONB;
  slowest JSONB;
  low_rows JSONB;
BEGIN
  WITH stock AS (
    SELECT p.slug, p.title, p.price, v.variant_sku, v.color_name, v.stock, v.is_unlimited OR p.is_unlimited AS unlimited
    FROM products p JOIN product_variants v ON v.product_id = p.id
    WHERE p.status = 'PUBLISHED'
  ), sold AS (
    SELECT oi.product_slug, SUM(oi.quantity) AS units
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status <> 'cancelled' AND o.created_at >= p_from AND o.created_at < p_to
    GROUP BY oi.product_slug
  )
  SELECT jsonb_build_object(
    'stock_value',    COALESCE((SELECT SUM(stock * price) FROM stock WHERE NOT unlimited), 0),
    'units_in_stock', COALESCE((SELECT SUM(stock) FROM stock WHERE NOT unlimited), 0),
    'skus_tracked',   (SELECT COUNT(*) FROM stock),
    'low_stock',      (SELECT COUNT(*) FROM stock WHERE NOT unlimited AND stock > 0 AND stock <= 5),
    'out_of_stock',   (SELECT COUNT(*) FROM stock WHERE NOT unlimited AND stock = 0),
    'unlimited_skus', (SELECT COUNT(*) FROM stock WHERE unlimited),
    'units_sold',     COALESCE((SELECT SUM(units) FROM sold), 0),
    -- Sell-through: sold ÷ (sold + still in stock). The standard proxy when
    -- there is no opening-stock history.
    'sell_through_pct', ROUND(COALESCE((SELECT SUM(units) FROM sold), 0)::numeric
                          / NULLIF(COALESCE((SELECT SUM(units) FROM sold), 0)
                                 + COALESCE((SELECT SUM(stock) FROM stock WHERE NOT unlimited), 0), 0) * 100, 2)
  ) INTO kpis;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'units')::numeric DESC), '[]'::jsonb)
  INTO fastest
  FROM (
    SELECT jsonb_build_object(
             'slug', s.product_slug,
             'title', COALESCE(MAX(p.title), s.product_slug),
             'units', s.units,
             'stock', MAX(p.total_stock),
             'per_day', ROUND(s.units / v_days, 2),
             'days_of_cover', CASE WHEN MAX(p.total_stock) IS NULL OR s.units = 0 THEN NULL
                                   ELSE ROUND(MAX(p.total_stock) / (s.units / v_days), 1) END
           ) AS t
    FROM (
      SELECT oi.product_slug, SUM(oi.quantity) AS units
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status <> 'cancelled' AND o.created_at >= p_from AND o.created_at < p_to
      GROUP BY oi.product_slug
    ) s LEFT JOIN products p ON p.slug = s.product_slug
    GROUP BY s.product_slug, s.units
    ORDER BY s.units DESC LIMIT 10
  ) x;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'units')::numeric ASC, (t->>'stock')::numeric DESC), '[]'::jsonb)
  INTO slowest
  FROM (
    SELECT jsonb_build_object(
             'slug', p.slug,
             'title', p.title,
             'units', COALESCE(s.units, 0),
             'stock', p.total_stock,
             'views', COALESCE(v.views, 0)
           ) AS t
    FROM products p
    LEFT JOIN (
      SELECT oi.product_slug, SUM(oi.quantity) AS units
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status <> 'cancelled' AND o.created_at >= p_from AND o.created_at < p_to
      GROUP BY oi.product_slug) s ON s.product_slug = p.slug
    LEFT JOIN (
      SELECT product_slug, COUNT(*) AS views FROM product_views
      WHERE created_at >= p_from AND created_at < p_to
      GROUP BY product_slug) v ON v.product_slug = p.slug
    WHERE p.status = 'PUBLISHED' AND NOT p.is_unlimited
    ORDER BY COALESCE(s.units, 0) ASC, p.total_stock DESC
    LIMIT 10
  ) x;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'stock')::numeric ASC), '[]'::jsonb)
  INTO low_rows
  FROM (
    SELECT jsonb_build_object(
             'slug', p.slug, 'title', p.title,
             'sku', v.variant_sku, 'color', v.color_name, 'stock', v.stock
           ) AS t
    FROM products p JOIN product_variants v ON v.product_id = p.id
    WHERE p.status = 'PUBLISHED'
      AND NOT (v.is_unlimited OR p.is_unlimited)
      AND v.stock <= 5
    ORDER BY v.stock ASC
    LIMIT 50
  ) x;

  RETURN jsonb_build_object(
    'kpis', kpis, 'fastest_selling', fastest,
    'slowest_selling', slowest, 'low_stock_rows', low_rows
  );
END;
$$;

-- ─── analytics_live ───────────────────────────────────────────────────────────
-- No date params: fixed windows (5 min for presence/engagement, 60 min for
-- orders). Called by a short-poll endpoint — keep it lean, never cached.
CREATE OR REPLACE FUNCTION public.analytics_live()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  kpis JSONB;
  feed JSONB;
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
            a.metadata - 'result_slugs' - 'items' - 'seed' - 'seed_batch' AS metadata
     FROM activity_log a ORDER BY a.created_at DESC LIMIT 25)
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
$$;

-- ─── Access: service-role only ────────────────────────────────────────────────
DO $$
BEGIN
  -- Signatures differ per function, so each pair is explicit.
  REVOKE ALL ON FUNCTION public.analytics_product(text,timestamptz,timestamptz,timestamptz,timestamptz,text,text) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.analytics_product(text,timestamptz,timestamptz,timestamptz,timestamptz,text,text) TO service_role;

  REVOKE ALL ON FUNCTION public.analytics_wishlist(timestamptz,timestamptz,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.analytics_wishlist(timestamptz,timestamptz,timestamptz,timestamptz) TO service_role;

  REVOKE ALL ON FUNCTION public.analytics_cart(timestamptz,timestamptz,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.analytics_cart(timestamptz,timestamptz,timestamptz,timestamptz) TO service_role;

  REVOKE ALL ON FUNCTION public.analytics_search(timestamptz,timestamptz,timestamptz,timestamptz,text,text) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.analytics_search(timestamptz,timestamptz,timestamptz,timestamptz,text,text) TO service_role;

  REVOKE ALL ON FUNCTION public.analytics_reviews(timestamptz,timestamptz,timestamptz,timestamptz,text,text) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.analytics_reviews(timestamptz,timestamptz,timestamptz,timestamptz,text,text) TO service_role;

  REVOKE ALL ON FUNCTION public.analytics_coupons(timestamptz,timestamptz,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.analytics_coupons(timestamptz,timestamptz,timestamptz,timestamptz) TO service_role;

  REVOKE ALL ON FUNCTION public.analytics_inventory(timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.analytics_inventory(timestamptz,timestamptz) TO service_role;

  REVOKE ALL ON FUNCTION public.analytics_live() FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.analytics_live() TO service_role;
END $$;
