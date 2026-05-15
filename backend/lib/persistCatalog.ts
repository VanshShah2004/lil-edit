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
    stock: v.stock,
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
      product_variants(id, color_name, color_hex, variant_sku, stock, sort_order)
    `)
    .order('created_at', { ascending: false });
    
  if (pubErr) throw pubErr;

  // Fetch draft products
  const { data: drafts, error: draftErr } = await sb
    .from("draft_products")
    .select(`
      *,
      draft_product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
      draft_product_variants(id, color_name, color_hex, variant_sku, stock, sort_order)
    `)
    .order('created_at', { ascending: false });

  if (draftErr) throw draftErr;

  return {
    published: published || [],
    drafts: drafts || []
  };
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
