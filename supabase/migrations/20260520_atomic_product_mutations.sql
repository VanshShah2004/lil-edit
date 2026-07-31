-- Atomic product launch: deletes stale rows then inserts published product +
-- variants + images all within one implicit PL/pgSQL transaction.
-- If the INSERT or any child insert fails, Postgres rolls back the preceding
-- DELETEs automatically — the product is never permanently lost.
CREATE OR REPLACE FUNCTION launch_product_atomic(
  p_product  JSONB,
  p_variants JSONB,
  p_images   JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_slug        TEXT  := p_product->>'slug';
  v_product_id  UUID;
  v_variant     JSONB;
  v_image       JSONB;
  v_variant_id  UUID;
  v_color_name  TEXT;
  v_variant_map JSONB := '{}'::jsonb;
BEGIN
  -- Remove stale published + draft rows for this slug
  DELETE FROM products       WHERE slug = v_slug;
  DELETE FROM draft_products WHERE slug = v_slug;

  -- Insert the published product row
  INSERT INTO products (
    title, brand, base_sku, slug, category, category_slug, gender,
    price, original_price, fabric, fit, occasion, care_instructions,
    description_points, sizes, tags, badges,
    is_featured, is_new_arrival, is_bestseller, is_trending, is_unlimited,
    updated_at
  ) VALUES (
    p_product->>'title',
    p_product->>'brand',
    p_product->>'base_sku',
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


-- Atomic product delete: removes children then parent in one transaction.
-- Prevents orphaned image/variant rows if the parent delete fails.
CREATE OR REPLACE FUNCTION delete_product_atomic(
  p_id     UUID,
  p_status TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_status = 'DRAFT' THEN
    DELETE FROM draft_product_images   WHERE product_id = p_id;
    DELETE FROM draft_product_variants WHERE product_id = p_id;
    DELETE FROM draft_products         WHERE id         = p_id;
  ELSE
    DELETE FROM product_images   WHERE product_id = p_id;
    DELETE FROM product_variants WHERE product_id = p_id;
    DELETE FROM products         WHERE id         = p_id;
  END IF;
END;
$$;
