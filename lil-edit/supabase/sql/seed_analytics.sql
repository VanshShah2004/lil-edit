-- =============================================================================
-- DEV SEED: demo data for the admin ANALYTICS platform
-- =============================================================================
-- Run in the Supabase SQL editor AFTER the analytics migrations:
--   1. lil-edit/supabase/migrations/20260711_analytics_foundation.sql
--   2. lil-edit/supabase/migrations/20260712_analytics_rpcs_core.sql (+ part 2)
--
-- What it does:
--   • RESETS its own previous batch first (unlike seed_activity_log.sql, which
--     appends): analytics KPIs would silently inflate if every run stacked
--     another batch. Only rows tagged as THIS seed are touched —
--       product_views / live_presence : visitor_id LIKE 'seed-%'
--       activity_log                  : metadata->>'seed_batch' = 'analytics'
--     (seed_activity_log.sql rows use metadata.seed=true WITHOUT seed_batch, so
--     that older feed seed is never deleted by this script.)
--   • Seeds ~45 days of product VIEWS for the real PUBLISHED catalog (guests +
--     real profiles, per-variant SKUs, weighted sources, recency-weighted).
--   • Seeds wishlist/cart ADD + REMOVE events against real products.
--   • Backfills funnel coherence for REAL recent orders: pre-order views,
--     a cart_add and a checkout_started before each order's created_at, so
--     view→cart→checkout→purchase funnels line up with actual purchases.
--   • Seeds searches (with visitor ids + result_slugs, some zero-result terms)
--     and a handful of LIVE presence rows so the Live dashboard shows activity.
--   • Inserts DIRECTLY into product_views / activity_log / live_presence — no
--     real carts, wishlists or orders are created and no triggers fire.
--
-- Safe to re-run any time (reset + reseed). To REMOVE all analytics seed data,
-- run just the "RESET" section below.
-- =============================================================================

-- ─── Preflight: EVERY table this seed reads or writes must exist ──────────────
-- Checks all required tables at once and, if any are absent, raises a SINGLE
-- error listing them all (instead of failing one-at-a-time deep in the body).
-- A long missing list means this database doesn't have the app schema — you are
-- either connected to the wrong Supabase project, or the base migrations were
-- never applied. The analytics tables (activity_log / product_views /
-- live_presence) come from 20260702 + 20260711; the rest are core app tables.
DO $$
DECLARE
  missing text[];
BEGIN
  SELECT array_agg(t ORDER BY t) INTO missing
  FROM (VALUES
    ('profiles'), ('products'), ('product_variants'),
    ('cart_items'), ('wishlist_items'), ('orders'), ('order_items'),
    ('product_reviews'), ('activity_log'), ('product_views'), ('live_presence')
  ) AS x(t)
  WHERE to_regclass('public.' || t) IS NULL;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION E'Cannot seed — this database is missing required tables: %.\n\nThe analytics platform sits on top of the app schema, so these must exist first. If the list is long, you are likely connected to the WRONG Supabase project (an empty one) — check the project against SUPABASE_URL in backend/.env. Otherwise apply the base migrations, then 20260702 + 20260711 + 20260712 + 20260713, then re-run this seed.',
      array_to_string(missing, ', ');
  END IF;
END $$;

-- ─── RESET: remove any previous analytics seed batch ──────────────────────────
DELETE FROM public.product_views WHERE visitor_id LIKE 'seed-%';
DELETE FROM public.live_presence WHERE visitor_id LIKE 'seed-%';
DELETE FROM public.activity_log  WHERE metadata->>'seed_batch' = 'analytics';

-- ─── Shared constants ─────────────────────────────────────────────────────────
DROP TABLE IF EXISTS _seed_k;
CREATE TEMP TABLE _seed_k AS
SELECT
  (SELECT array_agg(id) FROM public.profiles)   AS users,
  ARRAY[
    'floral dress','baby shoes','winter jacket','cotton romper','tutu',
    'overalls','matching set','party frock','pajamas','leggings',
    'cardigan','denim','striped tee','organic cotton','kurta',
    'lehenga','sherwani','ethnic wear','birthday dress','frock'
  ]::text[]                                     AS queries,
  ARRAY[
    'dinosaur tuxedo','glitter wellies','cashmere onesie','sequin dungarees',
    'velvet cape','light-up sandals'
  ]::text[]                                     AS zero_queries;

-- Real catalog snapshot: one row per PUBLISHED product with its variant SKUs.
DROP TABLE IF EXISTS _seed_products;
CREATE TEMP TABLE _seed_products AS
SELECT
  p.slug,
  p.category_slug,
  p.title,
  COALESCE(p.sizes, '{}'::text[])                       AS sizes,
  (p.is_bestseller OR p.is_trending OR p.is_featured)   AS hot,
  COALESCE(
    array_agg(v.variant_sku) FILTER (WHERE v.variant_sku IS NOT NULL),
    ARRAY[p.base_sku]
  )                                                     AS skus
FROM public.products p
LEFT JOIN public.product_variants v ON v.product_id = p.id
WHERE p.status = 'PUBLISHED'
GROUP BY p.id, p.slug, p.category_slug, p.title, p.sizes,
         p.is_bestseller, p.is_trending, p.is_featured, p.base_sku;

-- ─── 1. Product views (~45 days, recency-weighted, hot products get more) ─────
-- Guests use a pool of ~220 seed visitors; ~30% of views carry a real user_id.
INSERT INTO public.product_views (visitor_id, user_id, product_slug, sku, category_slug, source, created_at)
SELECT
  'seed-v' || lpad((1 + floor(random() * 220))::int::text, 3, '0'),
  CASE WHEN random() < 0.30 AND k.users IS NOT NULL
       THEN k.users[1 + floor(random() * cardinality(k.users))::int] END,
  sp.slug,
  sp.skus[1 + floor(random() * cardinality(sp.skus))::int],
  sp.category_slug,
  (ARRAY['direct','direct','direct','search','search','collection','collection','collection',
         'home','home','wishlist','cart','share','recommendation'])[1 + floor(random() * 14)::int],
  now() - (random() ^ 1.7 * 45 * 24 * 60 || ' minutes')::interval
FROM _seed_products sp
CROSS JOIN _seed_k k
CROSS JOIN LATERAL generate_series(1, CASE WHEN sp.hot THEN 90 + floor(random() * 120)::int
                                           ELSE 25 + floor(random() * 60)::int END) g;

-- ─── 2. Wishlist adds + removes ───────────────────────────────────────────────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  CASE WHEN k.users IS NOT NULL
       THEN k.users[1 + floor(random() * cardinality(k.users))::int] END,
  'wishlist_add',
  sp.slug,
  sp.skus[1 + floor(random() * cardinality(sp.skus))::int],
  jsonb_build_object('seed', true, 'seed_batch', 'analytics'),
  now() - (random() ^ 1.5 * 45 * 24 * 60 || ' minutes')::interval
FROM _seed_products sp
CROSS JOIN _seed_k k
CROSS JOIN LATERAL generate_series(1, CASE WHEN sp.hot THEN 6 + floor(random() * 14)::int
                                           ELSE 1 + floor(random() * 7)::int END) g
WHERE k.users IS NOT NULL;

INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  CASE WHEN k.users IS NOT NULL
       THEN k.users[1 + floor(random() * cardinality(k.users))::int] END,
  'wishlist_remove',
  sp.slug,
  sp.skus[1 + floor(random() * cardinality(sp.skus))::int],
  jsonb_build_object('seed', true, 'seed_batch', 'analytics', 'via', 'remove'),
  now() - (random() ^ 1.5 * 40 * 24 * 60 || ' minutes')::interval
FROM _seed_products sp
CROSS JOIN _seed_k k
CROSS JOIN LATERAL generate_series(1, 1 + floor(random() * 3)::int) g
WHERE k.users IS NOT NULL AND random() < 0.6;

-- ─── 3. Cart adds + removes (sized lines like the real trigger writes) ────────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  CASE WHEN k.users IS NOT NULL
       THEN k.users[1 + floor(random() * cardinality(k.users))::int] END,
  'cart_add',
  sp.slug,
  sp.skus[1 + floor(random() * cardinality(sp.skus))::int],
  jsonb_build_object(
    'seed', true, 'seed_batch', 'analytics',
    'size', CASE WHEN cardinality(sp.sizes) > 0
                 THEN sp.sizes[1 + floor(random() * cardinality(sp.sizes))::int] ELSE '' END,
    'quantity', 1 + floor(random() * 2)::int
  ),
  now() - (random() ^ 1.5 * 45 * 24 * 60 || ' minutes')::interval
FROM _seed_products sp
CROSS JOIN _seed_k k
CROSS JOIN LATERAL generate_series(1, CASE WHEN sp.hot THEN 5 + floor(random() * 10)::int
                                           ELSE 1 + floor(random() * 5)::int END) g
WHERE k.users IS NOT NULL;

INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  CASE WHEN k.users IS NOT NULL
       THEN k.users[1 + floor(random() * cardinality(k.users))::int] END,
  'cart_remove',
  sp.slug,
  sp.skus[1 + floor(random() * cardinality(sp.skus))::int],
  jsonb_build_object(
    'seed', true, 'seed_batch', 'analytics',
    'size', CASE WHEN cardinality(sp.sizes) > 0
                 THEN sp.sizes[1 + floor(random() * cardinality(sp.sizes))::int] ELSE '' END,
    'quantity', 1, 'via', 'remove'
  ),
  now() - (random() ^ 1.5 * 40 * 24 * 60 || ' minutes')::interval
FROM _seed_products sp
CROSS JOIN _seed_k k
CROSS JOIN LATERAL generate_series(1, 1 + floor(random() * 2)::int) g
WHERE k.users IS NOT NULL AND random() < 0.5;

-- ─── 4. Funnel coherence for REAL orders (last 45 days) ───────────────────────
-- Each real order gets: 1–2 pre-order views per line item (attributed to the
-- buyer, stable per-buyer seed visitor id), one cart_add per line, and one
-- checkout_started shortly before placement — so per-product funnels and
-- view→cart→checkout→purchase conversion read coherently.
INSERT INTO public.product_views (visitor_id, user_id, product_slug, sku, category_slug, source, created_at)
SELECT
  'seed-u-' || substr(md5(o.user_id::text), 1, 12),
  o.user_id,
  oi.product_slug,
  oi.sku,
  NULLIF(oi.category_slug, ''),
  (ARRAY['direct','search','collection','home'])[1 + floor(random() * 4)::int],
  o.created_at - ((20 + random() * 2880) || ' minutes')::interval
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
CROSS JOIN LATERAL generate_series(1, 1 + floor(random() * 2)::int) g
WHERE o.created_at >= now() - interval '45 days';

INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  o.user_id,
  'cart_add',
  oi.product_slug,
  oi.sku,
  jsonb_build_object('seed', true, 'seed_batch', 'analytics',
                     'size', oi.size, 'quantity', oi.quantity),
  o.created_at - ((10 + random() * 720) || ' minutes')::interval
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
WHERE o.created_at >= now() - interval '45 days';

INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  o.user_id,
  'checkout_started',
  NULL, NULL,
  jsonb_build_object(
    'seed', true, 'seed_batch', 'analytics',
    'razorpay_order_id', 'seed_' || substr(md5(o.id::text), 1, 10),
    'mode', 'cart',
    'subtotal', o.subtotal, 'discount', o.discount,
    'shipping_fee', o.shipping_fee, 'total', o.total,
    'item_count', o.item_count, 'coupon_code', o.coupon_code,
    'items', (SELECT jsonb_agg(jsonb_build_object('slug', oi.product_slug, 'sku', oi.sku, 'qty', oi.quantity))
              FROM public.order_items oi WHERE oi.order_id = o.id)
  ),
  o.created_at - ((2 + random() * 15) || ' minutes')::interval
FROM public.orders o
WHERE o.created_at >= now() - interval '45 days';

-- Abandoned checkouts (~30% extra): checkout_started with no matching order.
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  CASE WHEN k.users IS NOT NULL
       THEN k.users[1 + floor(random() * cardinality(k.users))::int] END,
  'checkout_started',
  NULL, NULL,
  jsonb_build_object(
    'seed', true, 'seed_batch', 'analytics',
    'razorpay_order_id', 'seed_abandon_' || g,
    'mode', 'cart',
    'subtotal', 800 + floor(random() * 3200), 'discount', 0,
    'shipping_fee', 49, 'total', 849 + floor(random() * 3200),
    'item_count', 1 + floor(random() * 3)::int, 'coupon_code', NULL,
    'items', (SELECT jsonb_agg(jsonb_build_object('slug', slug, 'sku', skus[1], 'qty', 1))
              FROM (SELECT slug, skus FROM _seed_products ORDER BY random() LIMIT 2) sp2)
  ),
  now() - (random() ^ 1.4 * 45 * 24 * 60 || ' minutes')::interval
FROM _seed_k k
CROSS JOIN LATERAL generate_series(1, GREATEST(3, (SELECT (COUNT(*) * 0.3)::int FROM public.orders
                                                   WHERE created_at >= now() - interval '45 days'))) g
WHERE k.users IS NOT NULL;

-- ─── 5. Searches (with visitor ids, result slugs, zero-result terms) ──────────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  CASE WHEN random() < 0.35 AND k.users IS NOT NULL
       THEN k.users[1 + floor(random() * cardinality(k.users))::int] END,
  'search',
  NULL, NULL,
  jsonb_build_object(
    'seed', true, 'seed_batch', 'analytics',
    'query', q.query,
    'result_count', q.result_count,
    'visitor_id', 'seed-v' || lpad((1 + floor(random() * 220))::int::text, 3, '0'),
    'result_slugs', q.result_slugs
  ),
  now() - (random() ^ 1.5 * 45 * 24 * 60 || ' minutes')::interval
FROM _seed_k k
CROSS JOIN LATERAL generate_series(1, 320) g
CROSS JOIN LATERAL (
  -- 15% zero-result queries; the rest match real catalog titles/categories.
  SELECT
    CASE WHEN random() < 0.15
         THEN k.zero_queries[1 + floor(random() * cardinality(k.zero_queries))::int]
         ELSE k.queries[1 + floor(random() * cardinality(k.queries))::int] END AS picked
) pick
CROSS JOIN LATERAL (
  SELECT
    pick.picked AS query,
    COALESCE((SELECT COUNT(*) FROM public.products p
              WHERE p.status = 'PUBLISHED'
                AND (p.title ILIKE '%' || pick.picked || '%' OR p.category ILIKE '%' || pick.picked || '%')), 0)::int AS result_count,
    COALESCE((SELECT jsonb_agg(slug) FROM (
                SELECT slug FROM public.products p
                WHERE p.status = 'PUBLISHED'
                  AND (p.title ILIKE '%' || pick.picked || '%' OR p.category ILIKE '%' || pick.picked || '%')
                LIMIT 8) s), '[]'::jsonb) AS result_slugs
) q;

-- Search clicks: views with source='search' by the SAME seed visitors shortly
-- after a matching search, so search CTR isn't zero. (~40% of searches convert
-- to a click on one of their result slugs.)
INSERT INTO public.product_views (visitor_id, user_id, product_slug, sku, category_slug, source, created_at)
SELECT
  a.metadata->>'visitor_id',
  a.user_id,
  s.slug,
  sp.skus[1 + floor(random() * cardinality(sp.skus))::int],
  sp.category_slug,
  'search',
  a.created_at + ((1 + random() * 8) || ' minutes')::interval
FROM public.activity_log a
CROSS JOIN LATERAL (
  SELECT value #>> '{}' AS slug
  FROM jsonb_array_elements(a.metadata->'result_slugs') WITH ORDINALITY t(value, ord)
  ORDER BY random() LIMIT 1
) s
JOIN _seed_products sp ON sp.slug = s.slug
WHERE a.type = 'search'
  AND a.metadata->>'seed_batch' = 'analytics'
  AND jsonb_array_length(COALESCE(a.metadata->'result_slugs', '[]'::jsonb)) > 0
  AND random() < 0.4;

-- ─── 6. Live presence (so the Live dashboard shows visitors right now) ────────
INSERT INTO public.live_presence (visitor_id, user_id, path, last_seen)
SELECT
  'seed-live-' || g,
  CASE WHEN random() < 0.3 AND k.users IS NOT NULL
       THEN k.users[1 + floor(random() * cardinality(k.users))::int] END,
  (ARRAY['/', '/collections', '/search', '/cart', '/wishlist'])[1 + floor(random() * 5)::int],
  now() - (random() * 4 || ' minutes')::interval
FROM _seed_k k
CROSS JOIN LATERAL generate_series(1, 9) g
ON CONFLICT (visitor_id) DO UPDATE SET last_seen = EXCLUDED.last_seen, path = EXCLUDED.path;

-- A few live views in the last 5 minutes to animate the live feed.
INSERT INTO public.product_views (visitor_id, user_id, product_slug, sku, category_slug, source, created_at)
SELECT
  'seed-live-' || (1 + floor(random() * 9))::int,
  NULL,
  sp.slug,
  sp.skus[1 + floor(random() * cardinality(sp.skus))::int],
  sp.category_slug,
  (ARRAY['direct','search','collection','home'])[1 + floor(random() * 4)::int],
  now() - (random() * 5 || ' minutes')::interval
FROM (SELECT * FROM _seed_products ORDER BY random() LIMIT 6) sp;

DROP TABLE IF EXISTS _seed_k;
DROP TABLE IF EXISTS _seed_products;

-- Done. Sanity counts:
SELECT
  (SELECT COUNT(*) FROM public.product_views WHERE visitor_id LIKE 'seed-%')          AS seeded_views,
  (SELECT COUNT(*) FROM public.activity_log  WHERE metadata->>'seed_batch' = 'analytics') AS seeded_events,
  (SELECT COUNT(*) FROM public.live_presence WHERE visitor_id LIKE 'seed-%')          AS seeded_presence;
