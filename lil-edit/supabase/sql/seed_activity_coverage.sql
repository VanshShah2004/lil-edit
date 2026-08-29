-- =============================================================================
-- DEV SEED: the event kinds added by 20260828_activity_coverage.sql
-- =============================================================================
-- Companion to seed_activity_log.sql (which only covers the five ORIGINAL feed
-- kinds: cart_add / wishlist_add / order_placed / review_submitted / search).
-- This one fills the kinds behind the newer pills so you can see the "Account",
-- "Reviews" and "Orders" filters populated without waiting for real traffic:
--
--     coupon_applied, review_updated, review_removed, signup, login,
--     profile_updated, phone_verified, address_added, address_updated,
--     address_default_changed, address_removed, newsletter_subscribed
--
-- Run in the Supabase SQL editor AFTER 20260702_activity_log.sql. The coverage
-- migration itself is NOT required — this writes activity_log rows directly and
-- fires no triggers, exactly like seed_activity_log.sql.
--
-- Actors are sampled from REAL profiles(id) so the user_id FK holds and real
-- names/emails render. Timestamps spread over ~21 days, weighted recent. Every
-- row is tagged metadata.seed = true — the SAME tag seed_activity_log.sql uses,
-- so the one cleanup statement at the bottom clears both.
--
-- Safe to re-run — each run appends another batch.
-- =============================================================================

DROP TABLE IF EXISTS _seed_cov;
CREATE TEMP TABLE _seed_cov AS
SELECT
  (SELECT array_agg(id) FROM public.profiles)                      AS users,
  ARRAY[
    'floral-romper','denim-overalls','striped-tee','tutu-dress',
    'corduroy-dungarees','knit-cardigan','rainbow-leggings','polka-dot-frock',
    'linen-shorts','hooded-onesie','ruffle-blouse','cargo-joggers'
  ]::text[]                                                        AS products,
  ARRAY['FIRST10','WELCOME15','SUMMER20','LILEDIT5','FESTIVE25','NEWBORN10']::text[] AS codes,
  ARRAY[
    'This coupon has expired.',
    'This coupon is for first orders only.',
    'Your order does not meet the minimum spend for this coupon.',
    'Invalid coupon code.',
    'You have already used this coupon.'
  ]::text[]                                                        AS reasons,
  ARRAY['home','work','other']::text[]                             AS addr_types,
  ARRAY['Mumbai','Bengaluru','Pune','Delhi','Hyderabad','Chennai','Kolkata','Jaipur']::text[] AS cities;

-- ─── coupon_applied (45) — ~40% rejected, which is the interesting half ───────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  k.users[1 + floor(random() * cardinality(k.users))::int],
  'coupon_applied',
  NULL,
  NULL,
  CASE WHEN v.ok THEN
    jsonb_build_object(
      'code',     k.codes[1 + floor(random() * cardinality(k.codes))::int],
      'valid',    true,
      'discount', (100 + floor(random() * 900))::int,
      'subtotal', (1000 + floor(random() * 6000))::int,
      'seed',     true
    )
  ELSE
    jsonb_build_object(
      'code',     k.codes[1 + floor(random() * cardinality(k.codes))::int],
      'valid',    false,
      'discount', 0,
      'subtotal', (1000 + floor(random() * 6000))::int,
      'reason',   k.reasons[1 + floor(random() * cardinality(k.reasons))::int],
      'seed',     true
    )
  END,
  NOW() - (interval '21 days' * random() * random())
FROM generate_series(1, 45) g
CROSS JOIN _seed_cov k
CROSS JOIN LATERAL (SELECT random() >= 0.40 AS ok) v;

-- ─── review_updated (18) — from_rating differs, so the "3★ → 5★" tag shows ────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  k.users[1 + floor(random() * cardinality(k.users))::int],
  'review_updated',
  p.slug,
  upper(replace(p.slug, '-', '')) || '-' || (100 + floor(random() * 900))::int,
  jsonb_build_object(
    'rating',      r.new_rating,
    'from_rating', r.old_rating,
    'comment',     'Updating my review after a few more washes — holding up well.',
    'seed',        true
  ),
  NOW() - (interval '21 days' * random() * random())
FROM generate_series(1, 18) g
CROSS JOIN _seed_cov k
CROSS JOIN LATERAL (SELECT k.products[1 + floor(random() * cardinality(k.products))::int] AS slug) p
CROSS JOIN LATERAL (
  SELECT (1 + floor(random() * 5))::int AS old_rating,
         (1 + floor(random() * 5))::int AS new_rating
) r;

-- ─── review_removed (8) ───────────────────────────────────────────────────────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  k.users[1 + floor(random() * cardinality(k.users))::int],
  'review_removed',
  p.slug,
  upper(replace(p.slug, '-', '')) || '-' || (100 + floor(random() * 900))::int,
  jsonb_build_object('rating', (1 + floor(random() * 5))::int, 'seed', true),
  NOW() - (interval '21 days' * random() * random())
FROM generate_series(1, 8) g
CROSS JOIN _seed_cov k
CROSS JOIN LATERAL (SELECT k.products[1 + floor(random() * cardinality(k.products))::int] AS slug) p;

-- ─── signup (12) — real profile emails so the row reads correctly ─────────────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  pr.id,
  'signup',
  NULL,
  NULL,
  jsonb_build_object(
    'email',    pr.email,
    'provider', CASE WHEN random() < 0.45 THEN 'google' ELSE 'email' END,
    'seed',     true
  ),
  NOW() - (interval '21 days' * random() * random())
FROM (SELECT id, email FROM public.profiles ORDER BY random() LIMIT 12) pr;

-- ─── login (60) — the highest-volume account event, as in real life ───────────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  k.users[1 + floor(random() * cardinality(k.users))::int],
  'login',
  NULL,
  NULL,
  jsonb_build_object(
    'session_id', gen_random_uuid(),
    'ip',         '49.36.' || floor(random() * 256)::int || '.' || floor(random() * 256)::int,
    'user_agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
    'seed',       true
  ),
  NOW() - (interval '21 days' * random() * random())
FROM generate_series(1, 60) g
CROSS JOIN _seed_cov k;

-- ─── profile_updated (16) — 1–3 changed fields per row ────────────────────────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  k.users[1 + floor(random() * cardinality(k.users))::int],
  'profile_updated',
  NULL,
  NULL,
  jsonb_build_object(
    'fields', to_jsonb(f.picked),
    'seed',   true
  ),
  NOW() - (interval '21 days' * random() * random())
FROM generate_series(1, 16) g
CROSS JOIN _seed_cov k
CROSS JOIN LATERAL (
  SELECT array_agg(x) AS picked FROM (
    SELECT x FROM unnest(ARRAY['first_name','last_name','phone_number','dob','gender']) AS x
    ORDER BY random() LIMIT (1 + floor(random() * 3))::int
  ) s
) f;

-- ─── phone_verified (10) ──────────────────────────────────────────────────────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  k.users[1 + floor(random() * cardinality(k.users))::int],
  'phone_verified',
  NULL,
  NULL,
  jsonb_build_object(
    'phone_number', '+9198' || lpad(floor(random() * 100000000)::int::text, 8, '0'),
    'seed',         true
  ),
  NOW() - (interval '21 days' * random() * random())
FROM generate_series(1, 10) g
CROSS JOIN _seed_cov k;

-- ─── address_added / _updated / _default_changed / _removed (34 total) ────────
-- One statement, with the event kind chosen per row, so the mix looks organic.
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  k.users[1 + floor(random() * cardinality(k.users))::int],
  e.kind,
  NULL,
  NULL,
  jsonb_build_object(
    'address_id', gen_random_uuid(),
    'type',       a.atype,
    'label',      CASE WHEN a.atype = 'other' THEN 'Grandma' ELSE NULL END,
    'city',       k.cities[1 + floor(random() * cardinality(k.cities))::int],
    'is_default', e.kind = 'address_default_changed',
    'fields',     CASE WHEN e.kind = 'address_updated'
                       THEN to_jsonb(ARRAY['line1','pincode']::text[])
                       ELSE to_jsonb(ARRAY[]::text[]) END,
    'seed',       true
  ),
  NOW() - (interval '21 days' * random() * random())
FROM generate_series(1, 34) g
CROSS JOIN _seed_cov k
CROSS JOIN LATERAL (SELECT k.addr_types[1 + floor(random() * cardinality(k.addr_types))::int] AS atype) a
CROSS JOIN LATERAL (
  SELECT (ARRAY['address_added','address_updated','address_default_changed','address_removed'])
         [1 + floor(random() * 4)::int] AS kind
) e;

-- ─── newsletter_subscribed (14) — ~35% guest (user_id NULL) ───────────────────
INSERT INTO public.activity_log (user_id, type, product_slug, sku, metadata, created_at)
SELECT
  CASE WHEN v.guest THEN NULL
       ELSE k.users[1 + floor(random() * cardinality(k.users))::int] END,
  'newsletter_subscribed',
  NULL,
  NULL,
  jsonb_build_object(
    'email',  'shopper' || floor(random() * 9000 + 1000)::int || '@example.com',
    'source', CASE WHEN v.guest THEN 'guest' ELSE 'account' END,
    'seed',   true
  ),
  NOW() - (interval '21 days' * random() * random())
FROM generate_series(1, 14) g
CROSS JOIN _seed_cov k
CROSS JOIN LATERAL (SELECT random() < 0.35 AS guest) v;

DROP TABLE _seed_cov;

-- =============================================================================
-- CLEANUP — clears the rows from THIS script and from seed_activity_log.sql
-- (both tag metadata.seed = true):
--   DELETE FROM public.activity_log WHERE (metadata->>'seed') = 'true';
-- =============================================================================
