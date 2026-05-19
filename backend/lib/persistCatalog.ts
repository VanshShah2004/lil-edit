import { supabaseAdmin } from "./supabase.js";
import {
  mapCurationPayloadToCatalog,
  type CurationPayload,
  type ImageRowInsert,
  type VariantRowInsert,
} from "./productMapper.js";

function requireAdmin() {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase service role is not configured. Set SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_SERVICE_KEY) in backend/.env"
    );
  }
  return supabaseAdmin;
}

async function insertImagesForProduct(
  client: NonNullable<typeof supabaseAdmin>,
  table: "draft_product_images" | "product_images",
  productId: string,
  variantIdByColorName: Map<string, string>,
  images: ImageRowInsert[]
) {
  if (images.length === 0) return;

  const rows = images.map((img) => {
    const variantId =
      img.variant_color_name === null
        ? null
        : (variantIdByColorName.get(img.variant_color_name) ?? null);
    if (img.variant_color_name !== null && variantId === null) {
      throw new Error(`Variant image references unknown color: ${img.variant_color_name}`);
    }
    return {
      product_id: productId,
      variant_id: variantId,
      image_url: img.image_url,
      alt_text: img.alt_text,
      is_primary: img.is_primary,
      is_campaign: img.is_campaign,
      sort_order: img.sort_order,
    };
  });

  const { error } = await client.from(table).insert(rows);
  if (error) throw error;
}

async function insertVariantsAndMap(
  client: NonNullable<typeof supabaseAdmin>,
  table: "draft_product_variants" | "product_variants",
  productId: string,
  variants: VariantRowInsert[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (variants.length === 0) return map;

  const rows = variants.map((v) => ({
    product_id: productId,
    color_name: v.color_name,
    color_hex: v.color_hex,
    variant_sku: v.variant_sku,
    stock: v.is_unlimited ? null : v.stock,
    is_unlimited: v.is_unlimited,
    sort_order: v.sort_order,
  }));

  const { data, error } = await client.from(table).insert(rows).select("id, color_name");
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.color_name as string, row.id as string);
  }
  return map;
}

/**
 * Replace draft row for this slug with payload (Curation Studio → draft_* tables).
 */
export async function saveDraftToDatabase(data: CurationPayload): Promise<{ draftProductId: string }> {
  const sb = requireAdmin();
  const { productDraft, variants, images } = mapCurationPayloadToCatalog(data);
  const slug = productDraft.slug;

  const { error: delErr } = await sb.from("draft_products").delete().eq("slug", slug);
  if (delErr) throw delErr;

  const { data: prod, error: insErr } = await sb
    .from("draft_products")
    .insert(productDraft)
    .select("id")
    .single();

  if (insErr) throw insErr;
  const productId = prod.id as string;

  const variantMap = await insertVariantsAndMap(sb, "draft_product_variants", productId, variants);
  await insertImagesForProduct(sb, "draft_product_images", productId, variantMap, images);

  return { draftProductId: productId };
}

/**
 * Remove draft + published rows for slug, then insert published catalog from payload.
 * (Launch / re-launch after edits.)
 */
export async function launchProductToDatabase(data: CurationPayload): Promise<{ publishedProductId: string }> {
  const sb = requireAdmin();
  const { productPublished, variants, images } = mapCurationPayloadToCatalog(data);
  const slug = productPublished.slug;

  const { error: delPub } = await sb.from("products").delete().eq("slug", slug);
  if (delPub) throw delPub;

  const { error: delDraft } = await sb.from("draft_products").delete().eq("slug", slug);
  if (delDraft) throw delDraft;

  const { data: prod, error: insErr } = await sb
    .from("products")
    .insert(productPublished)
    .select("id")
    .single();

  if (insErr) throw insErr;
  const productId = prod.id as string;

  const variantMap = await insertVariantsAndMap(sb, "product_variants", productId, variants);
  await insertImagesForProduct(sb, "product_images", productId, variantMap, images);

  return { publishedProductId: productId };
}

export async function fetchAllProducts() {
  const sb = requireAdmin();
  
  // Fetch published products
  const { data: published, error: pubErr } = await sb
    .from("products")
    .select(`
      *,
      product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
      product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
    `)
    .order('updated_at', { ascending: false });
    
  if (pubErr) throw pubErr;

  // Fetch draft products
  const { data: drafts, error: draftErr } = await sb
    .from("draft_products")
    .select(`
      *,
      draft_product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
      draft_product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
    `)
    .order('updated_at', { ascending: false });

  if (draftErr) throw draftErr;

  return {
    published: published || [],
    drafts: drafts || []
  };
}

export async function fetchFilteredProducts(status: "ALL" | "PUBLISHED" | "DRAFT", limit?: number) {
  const sb = requireAdmin();

  if (status === "PUBLISHED") {
    // 1. Get total count of published products
    const { count, error: countErr } = await sb
      .from("products")
      .select("id", { count: "exact", head: true });
    if (countErr) throw countErr;
    const totalCount = count || 0;

    // 2. Fetch limited published products
    let query = sb
      .from("products")
      .select(`
        *,
        product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
        product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
      `)
      .order('updated_at', { ascending: false });
    
    if (limit) {
      query = query.limit(limit);
    }
    const { data: published, error: pubErr } = await query;
    if (pubErr) throw pubErr;

    // 3. Fetch matching drafts for the returned products to support status badges and side-by-side comparison
    let drafts: any[] = [];
    if (published && published.length > 0) {
      const skus = published.map(p => p.base_sku);
      const { data: draftData, error: draftErr } = await sb
        .from("draft_products")
        .select(`
          *,
          draft_product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
          draft_product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
        `)
        .in("base_sku", skus);
      if (draftErr) throw draftErr;
      drafts = draftData || [];
    }

    return {
      published: published || [],
      drafts: drafts,
      totalCount,
      hasMore: limit ? totalCount > limit : false
    };
  } else if (status === "DRAFT") {
    // 1. Get total count of draft products
    const { count, error: countErr } = await sb
      .from("draft_products")
      .select("id", { count: "exact", head: true });
    if (countErr) throw countErr;
    const totalCount = count || 0;

    // 2. Fetch limited draft products
    let query = sb
      .from("draft_products")
      .select(`
        *,
        draft_product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
        draft_product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
      `)
      .order('updated_at', { ascending: false });
    
    if (limit) {
      query = query.limit(limit);
    }
    const { data: drafts, error: draftErr } = await query;
    if (draftErr) throw draftErr;

    // 3. Fetch matching published for the returned drafts to support status badges and side-by-side comparison
    let published: any[] = [];
    if (drafts && drafts.length > 0) {
      const skus = drafts.map(d => d.base_sku);
      const { data: pubData, error: pubErr } = await sb
        .from("products")
        .select(`
          *,
          product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
          product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
        `)
        .in("base_sku", skus);
      if (pubErr) throw pubErr;
      published = pubData || [];
    }

    return {
      published: published,
      drafts: drafts || [],
      totalCount,
      hasMore: limit ? totalCount > limit : false
    };
  } else {
    // status === "ALL"
    // Fetch all lightweight base_skus and updated_at to group and sort them progressively
    const { data: pubSkus, error: pubSkuErr } = await sb
      .from("products")
      .select("base_sku, updated_at");
    if (pubSkuErr) throw pubSkuErr;

    const { data: draftSkus, error: draftSkuErr } = await sb
      .from("draft_products")
      .select("base_sku, updated_at");
    if (draftSkuErr) throw draftSkuErr;

    const skuMap = new Map<string, Date>();
    pubSkus?.forEach(p => {
      skuMap.set(p.base_sku, new Date(p.updated_at));
    });
    draftSkus?.forEach(d => {
      const current = skuMap.get(d.base_sku);
      const dDate = new Date(d.updated_at);
      if (!current || dDate > current) {
        skuMap.set(d.base_sku, dDate);
      }
    });

    const sortedSkus = Array.from(skuMap.entries())
      .sort((a, b) => b[1].getTime() - a[1].getTime())
      .map(entry => entry[0]);

    const totalCount = sortedSkus.length;
    const slicedSkus = limit ? sortedSkus.slice(0, limit) : sortedSkus;
    const hasMore = limit ? totalCount > limit : false;

    let published: any[] = [];
    let drafts: any[] = [];

    if (slicedSkus.length > 0) {
      const { data: pubData, error: pubErr } = await sb
        .from("products")
        .select(`
          *,
          product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
          product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
        `)
        .in("base_sku", slicedSkus);
      if (pubErr) throw pubErr;
      published = pubData || [];

      const { data: draftData, error: draftErr } = await sb
        .from("draft_products")
        .select(`
          *,
          draft_product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
          draft_product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
        `)
        .in("base_sku", slicedSkus);
      if (draftErr) throw draftErr;
      drafts = draftData || [];
    }

    return {
      published,
      drafts,
      totalCount,
      hasMore
    };
  }
}


export function isSupabaseCatalogConfigured(): boolean {
  return supabaseAdmin !== null;
}

export async function deleteProductFromDatabase(id: string, status: "DRAFT" | "PUBLISHED"): Promise<void> {
  const sb = requireAdmin();
  
  const isDraft = status === "DRAFT";
  const table = isDraft ? "draft_products" : "products";
  const imageTable = isDraft ? "draft_product_images" : "product_images";
  const variantTable = isDraft ? "draft_product_variants" : "product_variants";

  // Manually delete children first in case ON DELETE CASCADE is not configured
  await sb.from(imageTable).delete().eq("product_id", id);
  await sb.from(variantTable).delete().eq("product_id", id);
  
  // Delete the parent record
  const { error } = await sb.from(table).delete().eq("id", id);
  if (error) throw error;
}

export async function fetchProductBySlugAndSku(slug: string, sku: string) {
  const sb = requireAdmin();
  
  // Fetch published product where slug matches
  const { data: published, error: pubErr } = await sb
    .from("products")
    .select(`
      *,
      product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
      product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
    `)
    .eq("slug", slug)
    .maybeSingle();

  if (pubErr) throw pubErr;
  return published;
}

export interface RecommendedTimingCallbacks {
  /** Called immediately after the category-filtered query completes. */
  onCategoryQueryDone?: () => void;
  /** Called immediately after the padding query completes (only fires when category had <5 results). */
  onPadQueryDone?: () => void;
}

export async function fetchRecommendedProducts(
  slug: string,
  categorySlug: string,
  timingCallbacks?: RecommendedTimingCallbacks
) {
  const sb = requireAdmin();

  // Query 1: same-category products (excluding current product)
  const { data: recommended, error: recErr } = await sb
    .from("products")
    .select(`
      *,
      product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
      product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
    `)
    .eq("category_slug", categorySlug)
    .neq("slug", slug)
    .limit(5);

  timingCallbacks?.onCategoryQueryDone?.();
  if (recErr) throw recErr;

  let list = recommended || [];

  // Query 2 (conditional): pad with general published products when category has < 5
  if (list.length < 5) {
    const { data: general, error: genErr } = await sb
      .from("products")
      .select(`
        *,
        product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
        product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
      `)
      .neq("slug", slug)
      .limit(10);

    timingCallbacks?.onPadQueryDone?.();

    if (!genErr && general) {
      const existingSlugs = new Set(list.map(p => p.slug));
      for (const item of general) {
        if (!existingSlugs.has(item.slug) && list.length < 5) {
          list.push(item);
          existingSlugs.add(item.slug);
        }
      }
    }
  }

  return list;
}

