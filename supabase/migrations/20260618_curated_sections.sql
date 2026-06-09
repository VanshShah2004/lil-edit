-- =============================================================================
-- Migration: curated merchandising sections (admin-controlled storefront strips)
-- Created:   2026-06-18
--
-- What this is
-- ────────────
-- Every storefront "section" (Trending Now, Recommended For You, Shop the Look,
-- Featured Categories, Home Collage, the Collections featured grid, and the search
-- panel's Popular Choices / Discover More) was hardcoded in the frontend. This
-- migration introduces a generic curation engine so admins can decide WHICH items
-- appear in each section and in what order.
--
-- Model
-- ─────
--   curated_sections        one row per known storefront strip (stable section_key)
--   curated_section_items   the ordered items inside a section. Each item is EITHER
--                           a product reference (product_base_sku → products.base_sku,
--                           resolved live at read time) OR an editorial tile (custom
--                           image/title/link). `meta` jsonb carries section-specific
--                           extras (card size, mobile image, object-position, …).
--
-- Read path / security
-- ────────────────────
-- Mirrors the product catalog posture (see 20260603_catalog_tables_rls.sql): RLS is
-- enabled default-deny and the storefront reads exclusively through the backend's
-- service-role client, which bypasses RLS. The anon key (public in the bundle) can
-- therefore neither read nor write these tables directly; all writes are admin-gated
-- API routes using the service role.
--
-- Idempotent: guarded with IF NOT EXISTS / ON CONFLICT DO NOTHING so re-applying is
-- safe. Apply manually via the Supabase SQL editor (matches this project's workflow).
-- =============================================================================

create extension if not exists "pgcrypto";

-- ─── Sections ────────────────────────────────────────────────────────────────
create table if not exists public.curated_sections (
  id          uuid primary key default gen_random_uuid(),
  section_key text not null,
  title       text,
  subtitle    text,
  -- 'product'  → slots reference catalog products
  -- 'editorial'→ slots are hand-built image/title/link tiles
  -- 'mixed'    → either kind allowed
  item_type   text not null default 'product'
              check (item_type in ('product', 'editorial', 'mixed')),
  is_enabled  boolean not null default true,
  -- Soft cap surfaced in the admin picker (not DB-enforced).
  max_items   integer not null default 12 check (max_items > 0),
  updated_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint curated_sections_key_unique unique (section_key)
);

-- ─── Section items ───────────────────────────────────────────────────────────
create table if not exists public.curated_section_items (
  id                uuid primary key default gen_random_uuid(),
  section_id        uuid not null references public.curated_sections (id) on delete cascade,
  sort_order        integer not null default 0,
  kind              text not null default 'product'
                    check (kind in ('product', 'editorial')),
  -- Loose reference (NOT a FK): a product that is unpublished/deleted is simply
  -- skipped at read time rather than hard-breaking the section.
  product_base_sku  text,
  -- Editorial tile fields (all nullable; used when kind = 'editorial').
  custom_title      text,
  custom_subtitle   text,
  custom_image_url  text,
  link_url          text,
  badge             text,
  -- Section-specific extras: { "size": "large", "mobile_image_url": "...",
  -- "object_position": "center 15%", "desktop_image_url": "..." }, etc.
  meta              jsonb not null default '{}'::jsonb,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- A product item must carry a base_sku; an editorial item must carry an image.
  constraint curated_items_shape_check check (
    (kind = 'product'   and product_base_sku is not null) or
    (kind = 'editorial' and custom_image_url is not null)
  )
);

create index if not exists curated_section_items_section_order_idx
  on public.curated_section_items (section_id, sort_order);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists curated_sections_touch on public.curated_sections;
create trigger curated_sections_touch
  before update on public.curated_sections
  for each row execute function public.touch_updated_at();

drop trigger if exists curated_section_items_touch on public.curated_section_items;
create trigger curated_section_items_touch
  before update on public.curated_section_items
  for each row execute function public.touch_updated_at();

-- ─── Atomic "replace the whole ordered list" RPC ─────────────────────────────
-- The admin editor sends the full ordered item array for a section; this deletes
-- the old items and inserts the new ones in one transaction, so a section is never
-- observed half-updated. sort_order is assigned from array position.
create or replace function public.curation_set_section_items(
  p_section_key text,
  p_items       jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section_id uuid;
  v_item       jsonb;
  v_idx        integer := 0;
begin
  select id into v_section_id
    from public.curated_sections
   where section_key = p_section_key;

  if v_section_id is null then
    raise exception 'Unknown section_key: %', p_section_key;
  end if;

  delete from public.curated_section_items where section_id = v_section_id;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as t(value)
  loop
    insert into public.curated_section_items (
      section_id, sort_order, kind, product_base_sku,
      custom_title, custom_subtitle, custom_image_url, link_url, badge, meta, is_active
    ) values (
      v_section_id,
      v_idx,
      coalesce(nullif(v_item->>'kind', ''), 'product'),
      nullif(v_item->>'product_base_sku', ''),
      nullif(v_item->>'custom_title', ''),
      nullif(v_item->>'custom_subtitle', ''),
      nullif(v_item->>'custom_image_url', ''),
      nullif(v_item->>'link_url', ''),
      nullif(v_item->>'badge', ''),
      coalesce(v_item->'meta', '{}'::jsonb),
      coalesce((v_item->>'is_active')::boolean, true)
    );
    v_idx := v_idx + 1;
  end loop;

  update public.curated_sections set updated_at = now() where id = v_section_id;
end;
$$;

-- ─── Seed the known sections ─────────────────────────────────────────────────
-- One row per storefront strip. Re-applying is a no-op (ON CONFLICT DO NOTHING).
insert into public.curated_sections (section_key, title, subtitle, item_type, max_items) values
  ('home_trending',            'Trending Now',          'Elevated Styles',        'product',   10),
  ('home_recommended',         'Recommended For You',   'Curated For You',        'product',   10),
  ('search_popular',           'Popular Choices',        null,                    'product',    6),
  ('search_discover',          'Discover More',          null,                    'mixed',      9),
  ('home_shop_the_look',       'Shop the Look',         'One Click - Full Outfit', 'editorial',  4),
  ('home_featured_categories', 'Featured Categories',    null,                    'editorial',  2),
  ('home_collage',             'Home Collage',           null,                    'editorial',  6),
  ('collections_featured',     'Featured Collections',   null,                    'editorial',  6)
on conflict (section_key) do nothing;

-- ─── RLS: default-deny (served via service-role backend only) ────────────────
alter table public.curated_sections      enable row level security;
alter table public.curated_section_items enable row level security;

-- No anon/authenticated policies on purpose. The backend reads + writes via the
-- service-role client (bypasses RLS). Direct PostgREST access with the public anon
-- key returns no rows and cannot mutate.

-- Verify after applying:
--   select section_key, title, item_type, is_enabled from public.curated_sections order by section_key;
--   select relname, relrowsecurity from pg_class
--     where relname in ('curated_sections','curated_section_items');  -- both true
