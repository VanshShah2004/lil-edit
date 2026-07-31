-- =============================================================================
-- DEV SEED: dummy data for the Admin Activity audit log (public.admin_action_log)
-- =============================================================================
-- Run this in the Supabase SQL editor AFTER the feature migration
-- (lil-edit/supabase/migrations/20260708_admin_action_log.sql) has been applied.
--
-- What it does:
--   • Inserts rows DIRECTLY into admin_action_log (it does NOT perform any real
--     admin action — no products/coupons/orders are touched).
--   • The acting admin is sampled from REAL profiles WHERE role = 'admin', so the
--     admin_id FK holds and real names/emails render as "by <admin>". (If there are
--     no admins yet, admin_id falls back to NULL → "A removed admin" — harmless.)
--   • order_status_changed / payment_status_changed rows are sampled from REAL
--     orders, so they deep-link to a real admin order-detail page. With no orders
--     yet, those two blocks simply insert 0 rows.
--   • Timestamps are spread across the last ~14 days, weighted toward recent, so
--     the feed shows a realistic mix of "just now" / "3h ago" / "5d ago".
--   • Every row is tagged metadata.seed = true for easy cleanup (see bottom).
--
-- Safe to re-run — each run appends another batch. To reset, use the DELETE at
-- the bottom first.
-- =============================================================================

-- ─── Shared constants (arrays) in a temp table, referenced by each INSERT ─────
DROP TABLE IF EXISTS _seed_admin;
CREATE TEMP TABLE _seed_admin AS
SELECT
  (SELECT array_agg(id) FROM public.profiles WHERE role = 'admin')  AS admins,
  ARRAY[
    'floral-romper','denim-overalls','striped-tee','tutu-dress',
    'corduroy-dungarees','knit-cardigan','rainbow-leggings','polka-dot-frock',
    'linen-shorts','hooded-onesie','ruffle-blouse','cargo-joggers',
    'bunny-sleepsuit','gingham-dress','puffer-jacket','sailor-set'
  ]::text[]                                                          AS products;

-- ─── product_launched (10) ────────────────────────────────────────────────────
INSERT INTO public.admin_action_log (admin_id, action, target_type, target_id, summary, metadata, created_at)
SELECT
  k.admins[1 + floor(random() * cardinality(k.admins))::int],
  'product_launched', 'product', s.sku,
  'Launched product "' || s.name || '" (' || s.sku || ')',
  jsonb_build_object('slug', p.slug, 'seed', true),
  NOW() - (interval '14 days' * random() * random())
FROM generate_series(1, 10) g
CROSS JOIN _seed_admin k
CROSS JOIN LATERAL (SELECT k.products[1 + floor(random() * cardinality(k.products))::int] AS slug) p
CROSS JOIN LATERAL (
  SELECT initcap(replace(p.slug, '-', ' ')) AS name,
         upper(replace(p.slug, '-', '')) || '-' || (100 + floor(random() * 900))::int AS sku
) s;

-- ─── product_draft_saved (8) ──────────────────────────────────────────────────
INSERT INTO public.admin_action_log (admin_id, action, target_type, target_id, summary, metadata, created_at)
SELECT
  k.admins[1 + floor(random() * cardinality(k.admins))::int],
  'product_draft_saved', 'product', s.sku,
  'Saved draft for "' || s.name || '" (' || s.sku || ')',
  jsonb_build_object('slug', p.slug, 'seed', true),
  NOW() - (interval '14 days' * random() * random())
FROM generate_series(1, 8) g
CROSS JOIN _seed_admin k
CROSS JOIN LATERAL (SELECT k.products[1 + floor(random() * cardinality(k.products))::int] AS slug) p
CROSS JOIN LATERAL (
  SELECT initcap(replace(p.slug, '-', ' ')) AS name,
         upper(replace(p.slug, '-', '')) || '-' || (100 + floor(random() * 900))::int AS sku
) s;

-- ─── product_deleted (3) ──────────────────────────────────────────────────────
INSERT INTO public.admin_action_log (admin_id, action, target_type, target_id, summary, metadata, created_at)
SELECT
  k.admins[1 + floor(random() * cardinality(k.admins))::int],
  'product_deleted', 'product', s.sku,
  'Deleted ' || st.status || ' product ' || s.sku,
  jsonb_build_object('status', upper(st.status), 'baseSku', s.sku, 'seed', true),
  NOW() - (interval '14 days' * random() * random())
FROM generate_series(1, 3) g
CROSS JOIN _seed_admin k
CROSS JOIN LATERAL (SELECT k.products[1 + floor(random() * cardinality(k.products))::int] AS slug) p
CROSS JOIN LATERAL (
  SELECT upper(replace(p.slug, '-', '')) || '-' || (100 + floor(random() * 900))::int AS sku
) s
CROSS JOIN LATERAL (SELECT (ARRAY['draft','published'])[1 + floor(random() * 2)::int] AS status) st;

-- ─── coupons (created / updated / deleted) ────────────────────────────────────
INSERT INTO public.admin_action_log (admin_id, action, target_type, target_id, summary, metadata, created_at)
SELECT
  k.admins[1 + floor(random() * cardinality(k.admins))::int],
  v.action, 'coupon', v.code, v.summary, v.metadata::jsonb, NOW() - v.age
FROM (VALUES
  ('coupon_created', 'WELCOME15', 'Created coupon WELCOME15 (15% off)',
     '{"code":"WELCOME15","discount_type":"percentage","discount_value":15,"seed":true}', interval '11 days 6 hours'),
  ('coupon_created', 'FREESHIP',  'Created coupon FREESHIP (₹99 off)',
     '{"code":"FREESHIP","discount_type":"fixed","discount_value":99,"seed":true}', interval '8 days 2 hours'),
  ('coupon_created', 'MONSOON25', 'Created coupon MONSOON25 (25% off)',
     '{"code":"MONSOON25","discount_type":"percentage","discount_value":25,"seed":true}', interval '5 days 9 hours'),
  ('coupon_updated', 'FIRST10',   'Updated coupon FIRST10 (is_active, expires_at)',
     '{"code":"FIRST10","fields":["is_active","expires_at"],"seed":true}', interval '4 days 1 hour'),
  ('coupon_updated', 'MONSOON25', 'Updated coupon MONSOON25 (max_uses)',
     '{"code":"MONSOON25","fields":["max_uses"],"seed":true}', interval '2 days 5 hours'),
  ('coupon_deleted', 'SUMMER20',  'Deleted coupon SUMMER20',
     '{"code":"SUMMER20","seed":true}', interval '18 hours')
) AS v(action, code, summary, metadata, age)
CROSS JOIN _seed_admin k;

-- ─── spotlight / curation (items replace + heading edit) ──────────────────────
INSERT INTO public.admin_action_log (admin_id, action, target_type, target_id, summary, metadata, created_at)
SELECT
  k.admins[1 + floor(random() * cardinality(k.admins))::int],
  v.action, 'curation_section', v.key, v.summary, v.metadata::jsonb, NOW() - v.age
FROM (VALUES
  ('curation_updated', 'home_trending', 'Updated Spotlight section "home_trending" (8 items)',
     '{"key":"home_trending","itemCount":8,"seed":true}', interval '9 days 3 hours'),
  ('curation_updated', 'home_shop_the_look', 'Updated Spotlight section "home_shop_the_look" (4 items)',
     '{"key":"home_shop_the_look","itemCount":4,"seed":true}', interval '6 days 7 hours'),
  ('curation_section_updated', 'home_recommended', 'Edited Spotlight section "home_recommended" (is_enabled, title)',
     '{"key":"home_recommended","fields":["is_enabled","title"],"seed":true}', interval '3 days 4 hours'),
  ('curation_updated', 'collections_featured', 'Updated Spotlight section "collections_featured" (6 items)',
     '{"key":"collections_featured","itemCount":6,"seed":true}', interval '1 day 2 hours'),
  ('curation_section_updated', 'search_popular', 'Edited Spotlight section "search_popular" (subtitle)',
     '{"key":"search_popular","fields":["subtitle"],"seed":true}', interval '5 hours')
) AS v(action, key, summary, metadata, age)
CROSS JOIN _seed_admin k;

-- ─── admins (grant / revoke) ──────────────────────────────────────────────────
INSERT INTO public.admin_action_log (admin_id, action, target_type, target_id, summary, metadata, created_at)
SELECT
  k.admins[1 + floor(random() * cardinality(k.admins))::int],
  v.action, 'admin_account', v.email, v.summary, v.metadata::jsonb, NOW() - v.age
FROM (VALUES
  ('admin_access_granted', 'priya.menon@thelilledit.com', 'Granted admin access to priya.menon@thelilledit.com',
     '{"email":"priya.menon@thelilledit.com","accountExists":true,"seed":true}', interval '12 days 5 hours'),
  ('admin_access_granted', 'ops.intern@thelilledit.com', 'Granted admin access to ops.intern@thelilledit.com',
     '{"email":"ops.intern@thelilledit.com","accountExists":false,"seed":true}', interval '7 days 8 hours'),
  ('admin_access_revoked', 'ops.intern@thelilledit.com', 'Revoked admin access from ops.intern@thelilledit.com',
     '{"email":"ops.intern@thelilledit.com","accountExists":true,"seed":true}', interval '1 day 6 hours')
) AS v(action, email, summary, metadata, age)
CROSS JOIN _seed_admin k;

-- ─── site (maintenance ON / OFF) ──────────────────────────────────────────────
INSERT INTO public.admin_action_log (admin_id, action, target_type, target_id, summary, metadata, created_at)
SELECT
  k.admins[1 + floor(random() * cardinality(k.admins))::int],
  v.action, 'site', 'maintenance', v.summary, v.metadata::jsonb, NOW() - v.age
FROM (VALUES
  ('maintenance_enabled',  'Turned maintenance mode ON (storefront locked)',
     '{"active":true,"message":"Back shortly — restocking!","seed":true}', interval '10 days 1 hour'),
  ('maintenance_disabled', 'Turned maintenance mode OFF (storefront live)',
     '{"active":false,"seed":true}', interval '9 days 22 hours'),
  ('maintenance_enabled',  'Turned maintenance mode ON (storefront locked)',
     '{"active":true,"seed":true}', interval '3 days 12 hours'),
  ('maintenance_disabled', 'Turned maintenance mode OFF (storefront live)',
     '{"active":false,"seed":true}', interval '3 days 11 hours')
) AS v(action, summary, metadata, age)
CROSS JOIN _seed_admin k;

-- ─── order_status_changed — sampled from REAL orders (clickable), newest 18 ────
INSERT INTO public.admin_action_log (admin_id, action, target_type, target_id, summary, metadata, created_at)
SELECT
  k.admins[1 + floor(random() * cardinality(k.admins))::int],
  'order_status_changed', 'order', o.id::text,
  'Changed order status ' || t.frm || ' → ' || t.to_,
  jsonb_build_object('orderId', o.id, 'fromStatus', t.frm, 'toStatus', t.to_,
                     'override', false, 'emailed', (random() < 0.6), 'seed', true),
  LEAST(NOW(), o.created_at + interval '3 hours')
FROM (SELECT id, created_at FROM public.orders ORDER BY created_at DESC LIMIT 18) o
CROSS JOIN _seed_admin k
CROSS JOIN LATERAL (
  SELECT frm, to_
  FROM (VALUES ('confirmed','processing'), ('processing','shipped'), ('shipped','delivered')) AS tr(frm, to_)
  ORDER BY random() LIMIT 1
) t;

-- ─── payment_status_changed — sampled from REAL orders (clickable), newest 10 ──
INSERT INTO public.admin_action_log (admin_id, action, target_type, target_id, summary, metadata, created_at)
SELECT
  k.admins[1 + floor(random() * cardinality(k.admins))::int],
  'payment_status_changed', 'order', o.id::text,
  'Changed payment status ' || t.frm || ' → ' || t.to_,
  jsonb_build_object('orderId', o.id, 'fromStatus', t.frm, 'toStatus', t.to_,
                     'override', (random() < 0.2), 'seed', true),
  LEAST(NOW(), o.created_at + interval '5 hours')
FROM (SELECT id, created_at FROM public.orders ORDER BY created_at DESC LIMIT 10) o
CROSS JOIN _seed_admin k
CROSS JOIN LATERAL (
  SELECT frm, to_
  FROM (VALUES ('pending','paid'), ('paid','refunded')) AS tr(frm, to_)
  ORDER BY random() LIMIT 1
) t;

DROP TABLE _seed_admin;

-- =============================================================================
-- CLEANUP — remove ONLY the dummy rows this script created:
--   DELETE FROM public.admin_action_log WHERE (metadata->>'seed') = 'true';
-- =============================================================================
