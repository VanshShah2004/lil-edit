-- =============================================================================
-- DEV SEED: dummy data for the admin Activity feed (public.activity_log)
-- =============================================================================
-- Run this in the Supabase SQL editor AFTER the feature migration
-- (lil-edit/supabase/migrations/20260702_activity_log.sql) has been applied.
--
-- What it does:
--   • Inserts rows DIRECTLY into activity_log (it does NOT touch cart_items /
--     orders / etc., so no real carts or orders are created and no triggers fire).
--   • Actors are sampled from REAL profiles(id) so the user_id FK holds and real
--     names/emails render in the feed. (If profiles is empty, rows fall back to
--     anonymous "A guest" — harmless.)
--   • order_placed rows are sampled from REAL orders so they link to a real order
--     detail page. If you have no orders yet, that block simply inserts 0 rows.
--   • Timestamps are spread across the last ~21 days, weighted toward recent, so
--     the feed shows a realistic mix of "just now" / "3h ago" / "5d ago".
--   • Every row is tagged metadata.seed = true for easy cleanup (see bottom).
--
-- Safe to re-run — each run appends another batch. To reset, use the DELETE at
-- the bottom first.
-- =============================================================================

-- ─── Shared constants (arrays) in a temp table, referenced by each INSERT ─────
DROP TABLE IF EXISTS _seed_k;
CREATE TEMP TABLE _seed_k AS
SELECT
  (SELECT array_agg(id) FROM public.profiles)                      AS users,
  ARRAY[
    'floral-romper','denim-overalls','striped-tee','tutu-dress',
    'corduroy-dungarees','knit-cardigan','rainbow-leggings','polka-dot-frock',
    'linen-shorts','hooded-onesie','ruffle-blouse','cargo-joggers',
    'bunny-sleepsuit','gingham-dress','puffer-jacket','sailor-set',
    'unicorn-pajamas','quilted-vest','pinafore-dress','muslin-swaddle'
  ]::text[]                                                        AS products,
  ARRAY['0-3M','3-6M','6-12M','12-18M','1-2Y','2-3Y','3-4Y','4-5Y','5-6Y']::text[] AS sizes,
  ARRAY[
    'floral dress','baby shoes','winter jacket','cotton romper','tutu',
    'overalls','matching set','newborn gift','party frock','socks',
    'rain boots','sun hat','pajamas','leggings','cardigan','swaddle',
    'denim','striped tee','unicorn','organic cotton'
  ]::text[]                                                        AS queries,
  ARRAY[
    'Absolutely adorable and the fabric is so soft!',
    'Runs a little small but lovely quality.',
    'My daughter loves it, washes really well.',
    'Cute design and delivery was quick.',
    'Perfect fit and gorgeous colours.',
    'Great value for the price.',
    'The stitching feels really premium.',
    'Bought it as a gift — was a big hit!',
    'Colour is slightly different from the photo.',
    'Will definitely be ordering again.'
  ]::text[]                                                        AS comments;

-- ─── cart_add (70) ────────────────────────────────────────────────────────────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  k.users[1 + floor(random() * cardinality(k.users))::int],
  'cart_add',
  p.slug,
  upper(replace(p.slug, '-', '')) || '-' || (100 + floor(random() * 900))::int,
  jsonb_build_object(
    'size',     k.sizes[1 + floor(random() * cardinality(k.sizes))::int],
    'quantity', (1 + floor(random() * 3))::int,
    'seed',     true
  ),
  NOW() - (interval '21 days' * random() * random())
FROM generate_series(1, 70) g
CROSS JOIN _seed_k k
CROSS JOIN LATERAL (SELECT k.products[1 + floor(random() * cardinality(k.products))::int] AS slug) p;

-- ─── wishlist_add (50) ────────────────────────────────────────────────────────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  k.users[1 + floor(random() * cardinality(k.users))::int],
  'wishlist_add',
  p.slug,
  upper(replace(p.slug, '-', '')) || '-' || (100 + floor(random() * 900))::int,
  jsonb_build_object('seed', true),
  NOW() - (interval '21 days' * random() * random())
FROM generate_series(1, 50) g
CROSS JOIN _seed_k k
CROSS JOIN LATERAL (SELECT k.products[1 + floor(random() * cardinality(k.products))::int] AS slug) p;

-- ─── search (80) — ~30% anonymous (user_id NULL), like real guest searches ────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  CASE WHEN random() < 0.30 THEN NULL
       ELSE k.users[1 + floor(random() * cardinality(k.users))::int] END,
  'search',
  NULL,
  NULL,
  jsonb_build_object(
    'query',        k.queries[1 + floor(random() * cardinality(k.queries))::int],
    'result_count', floor(random() * 40)::int,
    'seed',         true
  ),
  NOW() - (interval '21 days' * random() * random())
FROM generate_series(1, 80) g
CROSS JOIN _seed_k k;

-- ─── review_submitted (30) — ratings weighted toward 4–5 ──────────────────────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  k.users[1 + floor(random() * cardinality(k.users))::int],
  'review_submitted',
  p.slug,
  upper(replace(p.slug, '-', '')) || '-' || (100 + floor(random() * 900))::int,
  jsonb_build_object(
    'rating',  (CASE WHEN random() < 0.75 THEN 4 + floor(random() * 2)
                     ELSE 1 + floor(random() * 3) END)::int,
    'comment', k.comments[1 + floor(random() * cardinality(k.comments))::int],
    'seed',    true
  ),
  NOW() - (interval '21 days' * random() * random())
FROM generate_series(1, 30) g
CROSS JOIN _seed_k k
CROSS JOIN LATERAL (SELECT k.products[1 + floor(random() * cardinality(k.products))::int] AS slug) p;

-- ─── order_placed — one per real order (clickable), newest 40 ─────────────────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  o.user_id, 'order_placed', NULL, NULL,
  jsonb_build_object(
    'order_id',       o.id,
    'order_number',   o.order_number,
    'total',          o.total,
    'item_count',     o.item_count,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'seed',           true
  ),
  o.created_at
FROM public.orders o
ORDER BY o.created_at DESC
LIMIT 40;

DROP TABLE _seed_k;

-- =============================================================================
-- CLEANUP — remove ONLY the dummy rows this script created:
--   DELETE FROM public.activity_log WHERE (metadata->>'seed') = 'true';
-- =============================================================================
