-- =============================================================================
-- Migration: link products to a sizing chart
-- Created:   2026-07-09
--
-- Adds a nullable size_chart_id FK on BOTH products and draft_products so an
-- admin can associate a sizing chart (from the "Sizing Chart Setup" tool) with
-- each product in the Add / Edit Product forms. ON DELETE SET NULL so removing a
-- chart never blocks a product delete — the product simply loses its chart.
-- Existing rows are backfilled to the default chart so no product is chart-less.
--
-- Admin-wiring only for now: the association is stored and round-tripped in the
-- admin forms; there is no storefront/PDP rendering yet. The forms default the
-- selector to the "Default Sizing" chart, so new products get one automatically.
--
-- Also re-defines launch_product_atomic to persist size_chart_id on publish
-- (drafts flow through saveDraftToDatabase, which spreads the row, so no code
-- path there needs the column listed explicitly). Only the product INSERT gains
-- one column vs 20260620_launch_replace_by_base_sku.sql — variant/image logic is
-- unchanged.
--
-- ⚠️ MANUAL STEP: run in the Supabase SQL editor. Requires size_charts to exist
-- (lil-edit/supabase/migrations/20260709_size_charts.sql).
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS size_chart_id uuid
  REFERENCES public.size_charts(id) ON DELETE SET NULL;

ALTER TABLE public.draft_products
  ADD COLUMN IF NOT EXISTS size_chart_id uuid
  REFERENCES public.size_charts(id) ON DELETE SET NULL;

-- Backfill: existing products predate the selector, so point every chart-less
-- row (published AND draft) at the default chart ("Default Sizing") — the same
-- chart the Add Product form now pre-selects. Idempotent: only touches NULLs.
UPDATE public.products
SET size_chart_id = (SELECT id FROM public.size_charts WHERE is_default LIMIT 1)
WHERE size_chart_id IS NULL;

UPDATE public.draft_products
SET size_chart_id = (SELECT id FROM public.size_charts WHERE is_default LIMIT 1)
WHERE size_chart_id IS NULL;

CREATE OR REPLACE FUNCTION launch_product_atomic(
  p_product  JSONB,
  p_variants JSONB,
  p_images   JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_slug        TEXT  := p_product->>'slug';
  v_base_sku    TEXT  := p_product->>'base_sku';
  v_product_id  UUID;
  v_variant     JSONB;
  v_image       JSONB;
  v_variant_id  UUID;
  v_color_name  TEXT;
  v_variant_map JSONB := '{}'::jsonb;
BEGIN
  -- Remove stale published + draft rows for THIS product (identity = base_sku, which is
  -- unique). Keying on slug would delete other products that share the slug.
  DELETE FROM products       WHERE base_sku = v_base_sku;
  DELETE FROM draft_products WHERE base_sku = v_base_sku;

  -- Insert the published product row
  INSERT INTO products (
    title, brand, base_sku, slug, category, category_slug, gender,
    price, original_price, fabric, fit, occasion, care_instructions,
    description_points, sizes, tags, badges,
    is_featured, is_new_arrival, is_bestseller, is_trending, is_unlimited,
    size_chart_id,
    updated_at
  ) VALUES (
    p_product->>'title',
    p_product->>'brand',
    v_base_sku,
    v_slug,
    p_product->>'category',
    p_product->>'category_slug',
    p_product->>'gender',
    (p_product->>'price')::numeric,
    (p_product->>'original_price')::numeric,
    NULLIF(p_product->>'fabric',             ''),
    NULLIF(p_product->>'fit',               ''),
    NULLIF(p_product->>'occasion',          ''),
    NULLIF(p_product->>'care_instructions', ''),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_product->'description_points', '[]'::jsonb))),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_product->'sizes',              '[]'::jsonb))),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_product->'tags',               '[]'::jsonb))),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_product->'badges',             '[]'::jsonb))),
    (p_product->>'is_featured')::boolean,
    (p_product->>'is_new_arrival')::boolean,
    (p_product->>'is_bestseller')::boolean,
    (p_product->>'is_trending')::boolean,
    (p_product->>'is_unlimited')::boolean,
    NULLIF(p_product->>'size_chart_id', '')::uuid,
    COALESCE((p_product->>'updated_at')::timestamptz, NOW())
  )
  RETURNING id INTO v_product_id;

  -- Insert variants and build a color-name → UUID map for image linking
  FOR v_variant IN SELECT value FROM jsonb_array_elements(COALESCE(p_variants, '[]'::jsonb))
  LOOP
    INSERT INTO product_variants (
      product_id, color_name, color_hex, variant_sku,
      stock, is_unlimited, sort_order
    ) VALUES (
      v_product_id,
      v_variant->>'color_name',
      NULLIF(v_variant->>'color_hex', ''),
      v_variant->>'variant_sku',
      (v_variant->>'stock')::integer,
      (v_variant->>'is_unlimited')::boolean,
      (v_variant->>'sort_order')::integer
    )
    RETURNING id, color_name INTO v_variant_id, v_color_name;

    v_variant_map := v_variant_map || jsonb_build_object(v_color_name, v_variant_id::text);
  END LOOP;

  -- Insert images, resolving variant_color_name → variant UUID via the map
  FOR v_image IN SELECT value FROM jsonb_array_elements(COALESCE(p_images, '[]'::jsonb))
  LOOP
    INSERT INTO product_images (
      product_id, variant_id, image_url, alt_text,
      is_primary, is_campaign, sort_order
    ) VALUES (
      v_product_id,
      CASE
        WHEN v_image->>'variant_color_name' IS NULL THEN NULL
        ELSE (v_variant_map->>(v_image->>'variant_color_name'))::uuid
      END,
      v_image->>'image_url',
      NULLIF(v_image->>'alt_text', ''),
      (v_image->>'is_primary')::boolean,
      (v_image->>'is_campaign')::boolean,
      (v_image->>'sort_order')::integer
    );
  END LOOP;

  RETURN v_product_id;
END;
$$;
