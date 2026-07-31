-- The Lil Edit: separate draft vs published catalog tables.
-- Apply via Supabase Dashboard (SQL) or `supabase db push`.

create extension if not exists "pgcrypto";

do $$ begin
  create type public.product_status as enum ('DRAFT', 'PUBLISHED');
exception
  when duplicate_object then null;
end $$;

-- ─── Published catalog ─────────────────────────────────────────────────────

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text not null,
  base_sku text not null,
  slug text not null,
  category text not null,
  category_slug text not null,
  gender text not null,
  price numeric(12,2) not null check (price >= 0),
  original_price numeric(12,2) check (original_price is null or original_price >= 0),
  total_stock integer not null default 0 check (total_stock >= 0),
  fabric text,
  fit text,
  occasion text,
  care_instructions text,
  description_points text[] not null default '{}'::text[],
  sizes text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  badges text[] not null default '{}'::text[],
  is_featured boolean not null default false,
  is_new_arrival boolean not null default false,
  is_bestseller boolean not null default false,
  is_trending boolean not null default false,
  status public.product_status not null default 'PUBLISHED',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_slug_unique unique (slug),
  constraint products_base_sku_unique unique (base_sku)
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  color_name text not null,
  color_hex text,
  variant_sku text not null,
  stock integer not null default 0 check (stock >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_variant_sku_unique unique (variant_sku)
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete cascade,
  image_url text not null,
  alt_text text,
  is_primary boolean not null default false,
  is_campaign boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_images_campaign_requires_global_variant
    check (not is_campaign or variant_id is null)
);

create unique index if not exists product_images_one_primary_global
  on public.product_images (product_id)
  where is_primary and variant_id is null;

create unique index if not exists product_images_one_primary_per_variant
  on public.product_images (variant_id)
  where is_primary and variant_id is not null;

create index if not exists products_status_idx on public.products (status);
create index if not exists products_category_slug_idx on public.products (category_slug);
create index if not exists product_variants_product_id_idx on public.product_variants (product_id);
create index if not exists product_images_product_id_idx on public.product_images (product_id);

-- ─── Draft catalog (same shape, no lifecycle column) ───────────────────────

create table if not exists public.draft_products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text not null,
  base_sku text not null,
  slug text not null,
  category text not null,
  category_slug text not null,
  gender text not null,
  price numeric(12,2) not null check (price >= 0),
  original_price numeric(12,2) check (original_price is null or original_price >= 0),
  total_stock integer not null default 0 check (total_stock >= 0),
  fabric text,
  fit text,
  occasion text,
  care_instructions text,
  description_points text[] not null default '{}'::text[],
  sizes text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  badges text[] not null default '{}'::text[],
  is_featured boolean not null default false,
  is_new_arrival boolean not null default false,
  is_bestseller boolean not null default false,
  is_trending boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint draft_products_slug_unique unique (slug),
  constraint draft_products_base_sku_unique unique (base_sku)
);

create table if not exists public.draft_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.draft_products (id) on delete cascade,
  color_name text not null,
  color_hex text,
  variant_sku text not null,
  stock integer not null default 0 check (stock >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint draft_product_variants_variant_sku_unique unique (variant_sku)
);

create table if not exists public.draft_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.draft_products (id) on delete cascade,
  variant_id uuid references public.draft_product_variants (id) on delete cascade,
  image_url text not null,
  alt_text text,
  is_primary boolean not null default false,
  is_campaign boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint draft_product_images_campaign_requires_global_variant
    check (not is_campaign or variant_id is null)
);

create unique index if not exists draft_product_images_one_primary_global
  on public.draft_product_images (product_id)
  where is_primary and variant_id is null;

create unique index if not exists draft_product_images_one_primary_per_variant
  on public.draft_product_images (variant_id)
  where is_primary and variant_id is not null;

create index if not exists draft_products_slug_idx on public.draft_products (slug);
create index if not exists draft_product_variants_product_id_idx on public.draft_product_variants (product_id);

-- updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products for each row execute function public.set_updated_at();

drop trigger if exists product_variants_set_updated_at on public.product_variants;
create trigger product_variants_set_updated_at
before update on public.product_variants for each row execute function public.set_updated_at();

drop trigger if exists product_images_set_updated_at on public.product_images;
create trigger product_images_set_updated_at
before update on public.product_images for each row execute function public.set_updated_at();

drop trigger if exists draft_products_set_updated_at on public.draft_products;
create trigger draft_products_set_updated_at
before update on public.draft_products for each row execute function public.set_updated_at();

drop trigger if exists draft_product_variants_set_updated_at on public.draft_product_variants;
create trigger draft_product_variants_set_updated_at
before update on public.draft_product_variants for each row execute function public.set_updated_at();

drop trigger if exists draft_product_images_set_updated_at on public.draft_product_images;
create trigger draft_product_images_set_updated_at
before update on public.draft_product_images for each row execute function public.set_updated_at();

-- total_stock from variants (published)
create or replace function public.refresh_product_total_stock(p_product_id uuid)
returns void language plpgsql as $$
begin
  update public.products p
  set total_stock = coalesce((
    select sum(v.stock)::int from public.product_variants v where v.product_id = p_product_id
  ), 0)
  where p.id = p_product_id;
end;
$$;

create or replace function public.trg_variants_refresh_total_stock()
returns trigger language plpgsql as $$
declare pid uuid;
begin
  pid := coalesce(new.product_id, old.product_id);
  perform public.refresh_product_total_stock(pid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists product_variants_after_change_refresh_total on public.product_variants;
create trigger product_variants_after_change_refresh_total
after insert or update or delete on public.product_variants
for each row execute function public.trg_variants_refresh_total_stock();

-- total_stock from variants (drafts)
create or replace function public.refresh_draft_product_total_stock(p_product_id uuid)
returns void language plpgsql as $$
begin
  update public.draft_products p
  set total_stock = coalesce((
    select sum(v.stock)::int from public.draft_product_variants v where v.product_id = p_product_id
  ), 0)
  where p.id = p_product_id;
end;
$$;

create or replace function public.trg_draft_variants_refresh_total_stock()
returns trigger language plpgsql as $$
declare pid uuid;
begin
  pid := coalesce(new.product_id, old.product_id);
  perform public.refresh_draft_product_total_stock(pid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists draft_product_variants_after_change_refresh_total on public.draft_product_variants;
create trigger draft_product_variants_after_change_refresh_total
after insert or update or delete on public.draft_product_variants
for each row execute function public.trg_draft_variants_refresh_total_stock();
