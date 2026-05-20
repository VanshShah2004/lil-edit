import { performance } from "perf_hooks";
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

/**
 * Manage Products list projection — all fields used by ManageProducts, ProductVersionView,
 * hasPendingUpdates, handleLaunchProduct, and handleDownloadPdf.
 * Excludes: total_stock, created_by, search_vector, and any other internal/audit columns.
 */
const MANAGE_PRODUCT_SELECT = `
  id, title, slug, base_sku, brand, category, category_slug, gender,
  price, original_price, fabric, fit, occasion, care_instructions,
  description_points, sizes, tags, badges,
  is_featured, is_new_arrival, is_bestseller, is_trending, is_unlimited,
  created_at, updated_at,
  product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
  product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
`.trim();

const MANAGE_DRAFT_SELECT = `
  id, title, slug, base_sku, brand, category, category_slug, gender,
  price, original_price, fabric, fit, occasion, care_instructions,
  description_points, sizes, tags, badges,
  is_featured, is_new_arrival, is_bestseller, is_trending, is_unlimited,
  created_at, updated_at,
  draft_product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
  draft_product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
`.trim();

/** Round 1 of fetchThinProductList — scalars only, no image join. Used for both tables. */
const THIN_SCALAR_SELECT = `id, title, base_sku, price, created_at, updated_at`;

/**
 * PDP detail query projection — only fields used by mapDatabaseProductToFrontend.
 * Excludes: id, status, total_stock, created_by, timestamps, and nested alt_text / campaign flags.
 */
const PDP_PRODUCT_SELECT = `
  title,
  slug,
  category_slug,
  brand,
  base_sku,
  category,
  gender,
  price,
  original_price,
  tags,
  badges,
  description_points,
  fabric,
  fit,
  occasion,
  care_instructions,
  sizes,
  is_featured,
  is_new_arrival,
  is_bestseller,
  is_trending,
  is_unlimited,
  product_images(id, image_url, is_primary, sort_order, variant_id),
  product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
`.trim();

/** Row shape returned by fetchProductBySlugAndSku (PDP detail). */
export interface PdpProductRow {
  title: string;
  slug: string;
  category_slug: string;
  brand: string;
  base_sku: string;
  category: string;
  gender: string;
  price: number;
  original_price: number | null;
  tags: string[] | null;
  badges: string[] | null;
  description_points: string[] | null;
  fabric: string | null;
  fit: string | null;
  occasion: string | null;
  care_instructions: string | null;
  sizes: string[] | null;
  is_featured: boolean;
  is_new_arrival: boolean;
  is_bestseller: boolean;
  is_trending: boolean;
  is_unlimited: boolean;
  product_images: Array<{
    id: string;
    image_url: string;
    is_primary: boolean;
    sort_order: number;
    variant_id: string | null;
  }>;
  product_variants: Array<{
    id: string;
    color_name: string;
    color_hex: string | null;
    variant_sku: string;
    stock: number | null;
    is_unlimited: boolean;
    sort_order: number;
  }>;
}

export interface ThinProductRow {
  base_sku: string;
  title: string;
  price: number;
  created_at: string;
  updated_at: string;
  primary_image_url: string | null;
  has_pending_updates: boolean;
  is_published: boolean;
  has_draft: boolean;
}

export interface ThinListResult {
  products: ThinProductRow[];
  totalCount: number;
  hasMore: boolean;
}

export interface ProductDetailResult {
  published: any | null;
  draft: any | null;
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

const IS_DEV = process.env.NODE_ENV !== "production";
const fms = (n: number) => `${n.toFixed(1)}ms`;

export async function fetchAllProducts() {
  const sb = requireAdmin();
  const t0 = performance.now();

  const [
    { data: published, error: pubErr },
    { data: drafts,    error: draftErr },
  ] = await Promise.all([
    sb.from("products")      .select(MANAGE_PRODUCT_SELECT).order("updated_at", { ascending: false }),
    sb.from("draft_products").select(MANAGE_DRAFT_SELECT)  .order("updated_at", { ascending: false }),
  ]);

  if (pubErr)   throw pubErr;
  if (draftErr) throw draftErr;

  if (IS_DEV) {
    const total = performance.now() - t0;
    console.log(`
  [Catalog] fetchAllProducts
    • Round 1 (parallel): products + draft_products   ${fms(total)}
    • Rows returned       published=${published?.length ?? 0}  drafts=${drafts?.length ?? 0}
    • Total               ${fms(total)}
  ────────────────────────────────────────────────`);
  }

  return {
    published: published || [],
    drafts:    drafts    || [],
  };
}

export async function fetchFilteredProducts(status: "ALL" | "PUBLISHED" | "DRAFT", limit?: number) {
  const sb = requireAdmin();
  const t0 = performance.now();
  const mode = limit ? `Top ${limit}` : "See All";

  if (status === "PUBLISHED") {
    let query = sb
      .from("products")
      .select(MANAGE_PRODUCT_SELECT, { count: "exact" })
      .order("updated_at", { ascending: false });

    if (limit) query = query.limit(limit);

    const t1 = performance.now();
    const { data: published, count, error: pubErr } = await query;
    if (pubErr) throw pubErr;
    const t2 = performance.now();

    const totalCount = count ?? 0;

    let drafts: any[] = [];
    let t3 = t2;
    if (published && published.length > 0) {
      const skus = published.map((p) => p.base_sku);
      const { data: draftData, error: draftErr } = await sb
        .from("draft_products")
        .select(MANAGE_DRAFT_SELECT)
        .in("base_sku", skus);
      if (draftErr) throw draftErr;
      drafts = draftData || [];
      t3 = performance.now();
    }

    if (IS_DEV) {
      console.log(`
  [Catalog] PUBLISHED / ${mode}
    • Round 1 (count + data): products               ${fms(t2 - t1)}
    • Round 2 (matching drafts):                     ${drafts.length ? fms(t3 - t2) : "skipped (no published rows)"}
    • Rows returned  published=${published?.length ?? 0}  drafts=${drafts.length}  total=${totalCount}  hasMore=${limit ? totalCount > limit : false}
    • Total                                          ${fms(t3 - t0)}
  ────────────────────────────────────────────────`);
    }

    return {
      published: published || [],
      drafts,
      totalCount,
      hasMore: limit ? totalCount > limit : false,
    };

  } else if (status === "DRAFT") {
    let query = sb
      .from("draft_products")
      .select(MANAGE_DRAFT_SELECT, { count: "exact" })
      .order("updated_at", { ascending: false });

    if (limit) query = query.limit(limit);

    const t1 = performance.now();
    const { data: drafts, count, error: draftErr } = await query;
    if (draftErr) throw draftErr;
    const t2 = performance.now();

    const totalCount = count ?? 0;

    let published: any[] = [];
    let t3 = t2;
    if (drafts && drafts.length > 0) {
      const skus = drafts.map((d) => d.base_sku);
      const { data: pubData, error: pubErr } = await sb
        .from("products")
        .select(MANAGE_PRODUCT_SELECT)
        .in("base_sku", skus);
      if (pubErr) throw pubErr;
      published = pubData || [];
      t3 = performance.now();
    }

    if (IS_DEV) {
      console.log(`
  [Catalog] DRAFT / ${mode}
    • Round 1 (count + data): draft_products         ${fms(t2 - t1)}
    • Round 2 (matching published):                  ${published.length ? fms(t3 - t2) : "skipped (no draft rows)"}
    • Rows returned  drafts=${drafts?.length ?? 0}  published=${published.length}  total=${totalCount}  hasMore=${limit ? totalCount > limit : false}
    • Total                                          ${fms(t3 - t0)}
  ────────────────────────────────────────────────`);
    }

    return {
      published,
      drafts: drafts || [],
      totalCount,
      hasMore: limit ? totalCount > limit : false,
    };

  } else {
    // ALL — Round 1: lightweight SKU+timestamp rows in parallel
    const t1 = performance.now();
    const [
      { data: pubSkus,   error: pubSkuErr   },
      { data: draftSkus, error: draftSkuErr },
    ] = await Promise.all([
      sb.from("products")      .select("base_sku, updated_at"),
      sb.from("draft_products").select("base_sku, updated_at"),
    ]);
    const t2 = performance.now();

    if (pubSkuErr)   throw pubSkuErr;
    if (draftSkuErr) throw draftSkuErr;

    const skuMap = new Map<string, Date>();
    pubSkus?.forEach((p) => skuMap.set(p.base_sku, new Date(p.updated_at)));
    draftSkus?.forEach((d) => {
      const dDate = new Date(d.updated_at);
      const cur = skuMap.get(d.base_sku);
      if (!cur || dDate > cur) skuMap.set(d.base_sku, dDate);
    });

    const sortedSkus = Array.from(skuMap.entries())
      .sort((a, b) => b[1].getTime() - a[1].getTime())
      .map(([sku]) => sku);

    const totalCount = sortedSkus.length;
    const slicedSkus = limit ? sortedSkus.slice(0, limit) : sortedSkus;

    let published: any[] = [];
    let drafts:    any[] = [];
    let t3 = t2;

    if (slicedSkus.length > 0) {
      // Round 2: full rows in parallel
      const [
        { data: pubData,   error: pubErr   },
        { data: draftData, error: draftErr },
      ] = await Promise.all([
        sb.from("products")      .select(MANAGE_PRODUCT_SELECT).in("base_sku", slicedSkus),
        sb.from("draft_products").select(MANAGE_DRAFT_SELECT)  .in("base_sku", slicedSkus),
      ]);
      t3 = performance.now();

      if (pubErr)   throw pubErr;
      if (draftErr) throw draftErr;

      published = pubData   || [];
      drafts    = draftData || [];
    }

    if (IS_DEV) {
      console.log(`
  [Catalog] ALL / ${mode}
    • Round 1 (parallel SKU scan): products + draft_products   ${fms(t2 - t1)}
    • Round 2 (parallel full fetch): ${slicedSkus.length} SKUs              ${slicedSkus.length ? fms(t3 - t2) : "skipped (empty catalog)"}
    • Rows returned  published=${published.length}  drafts=${drafts.length}  total=${totalCount}  hasMore=${limit ? totalCount > limit : false}
    • Total                                                    ${fms(t3 - t0)}
  ────────────────────────────────────────────────`);
    }

    return {
      published,
      drafts,
      totalCount,
      hasMore: limit ? totalCount > limit : false,
    };
  }
}


/** Internal merge row — carries DB IDs needed for Round 2 image lookup. */
interface InternalThinRow {
  base_sku:            string;
  title:               string;
  price:               number;
  created_at:          string;
  updated_at:          string;
  is_published:        boolean;
  has_draft:           boolean;
  has_pending_updates: boolean;
  published_id?:       string; // products.id  — populated when is_published
  draft_id?:           string; // draft_products.id — populated when draft-only
}

/** Picks the primary-flagged image for each product_id; falls back to first image. */
function buildPrimaryImageMap(
  images: Array<{ product_id: string; image_url: string; is_primary: boolean }>
): Map<string, string> {
  const primary  = new Map<string, string>();
  const fallback = new Map<string, string>();
  for (const img of images) {
    if (img.is_primary) {
      primary.set(img.product_id, img.image_url);
    } else if (!fallback.has(img.product_id)) {
      fallback.set(img.product_id, img.image_url);
    }
  }
  const result = new Map<string, string>();
  for (const [id, url] of fallback) result.set(id, url);
  for (const [id, url] of primary)  result.set(id, url); // primary wins
  return result;
}

/**
 * Thin catalog list — no variants, no full image arrays.
 * Returns one row per unique base_sku with has_pending_updates computed from timestamps.
 */
export async function fetchThinProductList(
  status: "ALL" | "PUBLISHED" | "DRAFT" = "ALL",
  limit?: number
): Promise<ThinListResult> {
  const sb = requireAdmin();
  const t0 = performance.now();

  if (IS_DEV) console.log(`[DB] QUERY LIST → PostgreSQL round 1 scalars (status=${status}${limit ? ` limit=${limit}` : ""})`);

  // ── Round 1: scalar fields only for ALL rows — no image join ─────────────
  const [
    { data: published, error: pubErr },
    { data: drafts,    error: draftErr },
  ] = await Promise.all([
    sb.from("products")      .select(THIN_SCALAR_SELECT).order("updated_at", { ascending: false }),
    sb.from("draft_products").select(THIN_SCALAR_SELECT).order("updated_at", { ascending: false }),
  ]);

  if (pubErr)   throw pubErr;
  if (draftErr) throw draftErr;

  const tR1 = performance.now();
  if (IS_DEV) console.log(`[DB] LIST ROUND 1 → ${fms(tR1 - t0)} (${published?.length ?? 0} published, ${drafts?.length ?? 0} drafts)`);

  // ── Merge by base_sku, compute has_pending_updates ───────────────────────
  const map = new Map<string, InternalThinRow>();

  for (const p of published ?? []) {
    map.set(p.base_sku as string, {
      base_sku:            p.base_sku   as string,
      title:               p.title      as string,
      price:               p.price      as number,
      created_at:          p.created_at as string,
      updated_at:          p.updated_at as string,
      is_published:        true,
      has_draft:           false,
      has_pending_updates: false,
      published_id:        p.id         as string,
    });
  }

  for (const d of drafts ?? []) {
    const existing  = map.get(d.base_sku as string);
    const dUpdatedAt = new Date(d.updated_at as string).getTime();

    if (existing) {
      const isPending = dUpdatedAt > new Date(existing.updated_at).getTime();
      existing.has_draft           = true;
      existing.has_pending_updates = isPending;
      if (isPending) existing.updated_at = d.updated_at as string;
    } else {
      map.set(d.base_sku as string, {
        base_sku:            d.base_sku   as string,
        title:               d.title      as string,
        price:               d.price      as number,
        created_at:          d.created_at as string,
        updated_at:          d.updated_at as string,
        is_published:        false,
        has_draft:           true,
        has_pending_updates: false,
        draft_id:            d.id         as string,
      });
    }
  }

  // ── Filter, sort, slice ───────────────────────────────────────────────────
  let rows = Array.from(map.values());

  if (status === "PUBLISHED") rows = rows.filter(r => r.is_published);
  else if (status === "DRAFT") rows = rows.filter(r => r.has_draft);

  rows.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const totalCount = rows.length;
  const hasMore    = limit ? totalCount > limit : false;
  const sliced     = limit ? rows.slice(0, limit) : rows;

  // ── Round 2: images only for the sliced rows ─────────────────────────────
  const publishedIds  = sliced.filter(r => r.published_id).map(r => r.published_id!);
  const draftOnlyIds  = sliced.filter(r => !r.is_published && r.draft_id).map(r => r.draft_id!);

  if (IS_DEV) console.log(`[DB] LIST ROUND 2 → images for ${publishedIds.length} published + ${draftOnlyIds.length} draft-only rows`);

  const [pubImgsRes, draftImgsRes] = await Promise.all([
    publishedIds.length > 0
      ? sb.from("product_images")
          .select("product_id, image_url, is_primary")
          .in("product_id", publishedIds)
      : Promise.resolve({ data: [] as { product_id: string; image_url: string; is_primary: boolean }[], error: null }),
    draftOnlyIds.length > 0
      ? sb.from("draft_product_images")
          .select("product_id, image_url, is_primary")
          .in("product_id", draftOnlyIds)
      : Promise.resolve({ data: [] as { product_id: string; image_url: string; is_primary: boolean }[], error: null }),
  ]);

  if (pubImgsRes.error)   throw pubImgsRes.error;
  if (draftImgsRes.error) throw draftImgsRes.error;

  const tR2 = performance.now();
  if (IS_DEV) console.log(`[DB] LIST ROUND 2 → ${fms(tR2 - tR1)} (${pubImgsRes.data?.length ?? 0} pub images, ${draftImgsRes.data?.length ?? 0} draft images)`);

  const pubImageMap   = buildPrimaryImageMap(pubImgsRes.data   ?? []);
  const draftImageMap = buildPrimaryImageMap(draftImgsRes.data ?? []);

  // ── Assemble final ThinProductRow[] ──────────────────────────────────────
  const finalRows: ThinProductRow[] = sliced.map(r => ({
    base_sku:            r.base_sku,
    title:               r.title,
    price:               r.price,
    created_at:          r.created_at,
    updated_at:          r.updated_at,
    primary_image_url:   r.is_published
      ? (pubImageMap.get(r.published_id!)   ?? null)
      : (draftImageMap.get(r.draft_id!)     ?? null),
    has_pending_updates: r.has_pending_updates,
    is_published:        r.is_published,
    has_draft:           r.has_draft,
  }));

  if (IS_DEV) {
    const total = performance.now() - t0;
    console.log(`[DB] LIST COMPLETE → ${fms(total)} (published=${published?.length ?? 0} drafts=${drafts?.length ?? 0} merged=${totalCount} returned=${finalRows.length})`);
    console.log(`
[Catalog] fetchThinProductList (${status}${limit ? ` / Top ${limit}` : ""})
  • published=${published?.length ?? 0}  drafts=${drafts?.length ?? 0}  merged=${totalCount}  returned=${finalRows.length}
  • Round 1 (scalars): ${fms(tR1 - t0)}
  • Round 2 (images):  ${fms(tR2 - tR1)}
  • Total:             ${fms(total)}
────────────────────────────────────────────────`);
  }

  return { products: finalRows, totalCount, hasMore };
}

/**
 * Full product detail for a single base_sku — both published and draft versions.
 * Used for lazy on-demand hydration when a catalog row is clicked.
 */
export async function fetchProductDetailBySku(baseSku: string): Promise<ProductDetailResult> {
  const sb = requireAdmin();
  const t0 = performance.now();

  if (IS_DEV) console.log(`[DB] QUERY DETAIL → PostgreSQL sku=${baseSku}`);

  const [
    { data: published, error: pubErr },
    { data: draft,     error: draftErr },
  ] = await Promise.all([
    sb.from("products")      .select(MANAGE_PRODUCT_SELECT).eq("base_sku", baseSku).maybeSingle(),
    sb.from("draft_products").select(MANAGE_DRAFT_SELECT)  .eq("base_sku", baseSku).maybeSingle(),
  ]);

  if (pubErr)   throw pubErr;
  if (draftErr) throw draftErr;

  if (IS_DEV) {
    const total = performance.now() - t0;
    console.log(`[DB] DETAIL COMPLETE → ${fms(total)} sku=${baseSku} published=${!!published} draft=${!!draft}`);
    console.log(`[Catalog] fetchProductDetailBySku(${baseSku})  ${fms(total)}`);
  }

  return { published: published ?? null, draft: draft ?? null };
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

/** Minimal lookup for lazy-loaded reviews (title only). */
export async function fetchProductTitleBySlug(slug: string): Promise<string | null> {
  const sb = requireAdmin();
  const { data, error } = await sb
    .from("products")
    .select("title")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data?.title ?? null;
}

export async function fetchProductBySlugAndSku(
  slug: string,
  _sku: string
): Promise<PdpProductRow | null> {
  const sb = requireAdmin();

  const { data: published, error: pubErr } = await sb
    .from("products")
    .select(PDP_PRODUCT_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (pubErr) throw pubErr;
  return published as PdpProductRow | null;
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
  // ⚡ Optimized: Uses indexed category_slug + slug filters, limits early
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
  // ⚡ Optimized: 
  //   - Orders by updated_at DESC to prefer recently updated products (instead of RANDOM())
  //   - Early LIMIT to avoid scanning entire table
  //   - Excludes current product with indexed filter
  //   - Fetches only final-pass size (10) instead of scanning more
  if (list.length < 5) {
    const { data: general, error: genErr } = await sb
      .from("products")
      .select(`
        *,
        product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
        product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
      `)
      .neq("slug", slug)
      .order("updated_at", { ascending: false })
      .limit(5);

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

