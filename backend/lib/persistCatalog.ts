import { performance } from "perf_hooks";
import { supabaseAdmin } from "./supabase.js";
import {
  mapCurationPayloadToCatalog,
  type CurationPayload,
  type ImageRowInsert,
  type VariantRowInsert,
} from "./productMapper.js";
import { createLog, fms, type OpLogger } from "./logger.js";
import { matchLexicon } from "./searchLexicon.js";

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

/** Round 1 scalars for products — includes the denormalized flag. */
const THIN_PUBLISHED_SELECT = `id, title, base_sku, price, created_at, updated_at, has_pending_updates`;

/** Round 1 scalars for draft_products — includes the denormalized flag. */
const THIN_DRAFT_SELECT = `id, title, base_sku, price, created_at, updated_at, is_published`;

/**
 * PDP detail query projection — only fields used by mapDatabaseProductToFrontend.
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

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function insertImagesForProduct(
  client: NonNullable<typeof supabaseAdmin>,
  table: "draft_product_images" | "product_images",
  productId: string,
  variantIdByColorName: Map<string, string>,
  images: ImageRowInsert[],
  log: OpLogger,
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
  if (error) throw new Error(error.message);
  log.step(`DB insert - ${rows.length} images → ${table}`);
}

async function insertVariantsAndMap(
  client: NonNullable<typeof supabaseAdmin>,
  table: "draft_product_variants" | "product_variants",
  productId: string,
  variants: VariantRowInsert[],
  log: OpLogger,
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
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    map.set(row.color_name as string, row.id as string);
  }
  log.step(`DB insert - ${rows.length} variants → ${table}`);
  return map;
}

/** Picks the primary-flagged image for each product_id; falls back to first image. */
function buildPrimaryImageMap(
  images: Array<{ product_id: string; image_url: string; is_primary: boolean }>,
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

// ─── Internal row type for ALL-mode merge ─────────────────────────────────────

interface InternalThinRow {
  base_sku:            string;
  title:               string;
  price:               number;
  created_at:          string;
  updated_at:          string;
  is_published:        boolean;
  has_draft:           boolean;
  has_pending_updates: boolean;
  published_id?:       string;
  draft_id?:           string;
}

// ─── Exported functions ───────────────────────────────────────────────────────

export async function fetchAllProducts(log: OpLogger) {
  const sb = requireAdmin();
  const t0 = performance.now();

  log.step("DB fetch - products + draft_products (parallel)");

  const [
    { data: published, error: pubErr },
    { data: drafts,    error: draftErr },
  ] = await Promise.all([
    sb.from("products")      .select(MANAGE_PRODUCT_SELECT).order("updated_at", { ascending: false }),
    sb.from("draft_products").select(MANAGE_DRAFT_SELECT)  .order("updated_at", { ascending: false }),
  ]);

  if (pubErr)   throw pubErr;
  if (draftErr) throw draftErr;

  log.step(`DB fetch - complete  ${fms(performance.now() - t0)}  published=${published?.length ?? 0}  drafts=${drafts?.length ?? 0}`);

  return {
    published: published || [],
    drafts:    drafts    || [],
  };
}

export async function fetchFilteredProducts(
  status: "ALL" | "PUBLISHED" | "DRAFT",
  limit: number | undefined,
  log: OpLogger,
) {
  const sb = requireAdmin();
  const t0 = performance.now();
  const mode = limit ? `Top ${limit}` : "See All";

  if (status === "PUBLISHED") {
    let query = sb
      .from("products")
      .select(MANAGE_PRODUCT_SELECT, { count: "exact" })
      .order("updated_at", { ascending: false });

    if (limit) query = query.limit(limit);

    log.step(`DB fetch - PUBLISHED / ${mode} (count + data)`);
    const t1 = performance.now();
    const { data: published, count, error: pubErr } = await query;
    if (pubErr) throw pubErr;
    const t2 = performance.now();
    log.step(`DB fetch - round 1 complete  ${fms(t2 - t1)}  rows=${published?.length ?? 0}  total=${count ?? 0}`);

    const totalCount = count ?? 0;
    let drafts: any[] = [];

    if (published && published.length > 0) {
      const skus = published.map((p) => p.base_sku);
      log.step(`DB fetch - matching drafts for ${skus.length} SKUs`);
      const { data: draftData, error: draftErr } = await sb
        .from("draft_products")
        .select(MANAGE_DRAFT_SELECT)
        .in("base_sku", skus);
      if (draftErr) throw draftErr;
      drafts = draftData || [];
      log.step(`DB fetch - round 2 complete  ${fms(performance.now() - t2)}  drafts=${drafts.length}`);
    }

    log.step(`DB fetch - PUBLISHED done  ${fms(performance.now() - t0)}`);
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

    log.step(`DB fetch - DRAFT / ${mode} (count + data)`);
    const t1 = performance.now();
    const { data: drafts, count, error: draftErr } = await query;
    if (draftErr) throw draftErr;
    const t2 = performance.now();
    log.step(`DB fetch - round 1 complete  ${fms(t2 - t1)}  rows=${drafts?.length ?? 0}  total=${count ?? 0}`);

    const totalCount = count ?? 0;
    let published: any[] = [];

    if (drafts && drafts.length > 0) {
      const skus = drafts.map((d) => d.base_sku);
      log.step(`DB fetch - matching published for ${skus.length} SKUs`);
      const { data: pubData, error: pubErr } = await sb
        .from("products")
        .select(MANAGE_PRODUCT_SELECT)
        .in("base_sku", skus);
      if (pubErr) throw pubErr;
      published = pubData || [];
      log.step(`DB fetch - round 2 complete  ${fms(performance.now() - t2)}  published=${published.length}`);
    }

    log.step(`DB fetch - DRAFT done  ${fms(performance.now() - t0)}`);
    return {
      published,
      drafts: drafts || [],
      totalCount,
      hasMore: limit ? totalCount > limit : false,
    };

  } else {
    // ALL — Round 1: lightweight SKU+timestamp rows in parallel
    log.step("DB fetch - ALL / round 1 (SKU scan, parallel)");
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

    log.step(`DB fetch - round 1 complete  ${fms(t2 - t1)}  pub=${pubSkus?.length ?? 0}  drafts=${draftSkus?.length ?? 0}`);

    const skuMap = new Map<string, Date>();
    pubSkus?.forEach((p) => skuMap.set(p.base_sku, new Date(p.updated_at)));
    draftSkus?.forEach((d) => {
      const dDate = new Date(d.updated_at);
      const cur   = skuMap.get(d.base_sku);
      if (!cur || dDate > cur) skuMap.set(d.base_sku, dDate);
    });

    const sortedSkus  = Array.from(skuMap.entries())
      .sort((a, b) => b[1].getTime() - a[1].getTime())
      .map(([sku]) => sku);
    const totalCount  = sortedSkus.length;
    const slicedSkus  = limit ? sortedSkus.slice(0, limit) : sortedSkus;

    let published: any[] = [];
    let drafts:    any[] = [];

    if (slicedSkus.length > 0) {
      log.step(`DB fetch - ALL / round 2 (full rows for ${slicedSkus.length} SKUs, parallel)`);
      const [
        { data: pubData,   error: pubErr   },
        { data: draftData, error: draftErr },
      ] = await Promise.all([
        sb.from("products")      .select(MANAGE_PRODUCT_SELECT).in("base_sku", slicedSkus),
        sb.from("draft_products").select(MANAGE_DRAFT_SELECT)  .in("base_sku", slicedSkus),
      ]);

      if (pubErr)   throw pubErr;
      if (draftErr) throw draftErr;

      published = pubData   || [];
      drafts    = draftData || [];
      log.step(`DB fetch - round 2 complete  ${fms(performance.now() - t2)}  published=${published.length}  drafts=${drafts.length}`);
    }

    log.step(`DB fetch - ALL done  ${fms(performance.now() - t0)}`);
    return {
      published,
      drafts,
      totalCount,
      hasMore: limit ? totalCount > limit : false,
    };
  }
}

/**
 * Thin catalog list — no variants, no full image arrays.
 *
 * PUBLISHED and DRAFT modes use a single-table path: flags are read directly
 * from the denormalized columns (has_pending_updates / is_published).
 * ALL mode still queries both tables and merges.
 */
export async function fetchThinProductList(
  status: "ALL" | "PUBLISHED" | "DRAFT" = "ALL",
  limit: number | undefined,
  log: OpLogger,
): Promise<ThinListResult> {
  const sb = requireAdmin();

  // ── PUBLISHED: single-table path ─────────────────────────────────────────
  if (status === "PUBLISHED") {
    log.step("Loading products table");
    const t1 = performance.now();
    const baseQ = sb.from("products").select(THIN_PUBLISHED_SELECT).order("updated_at", { ascending: false });
    const { data: rows, error } = await (limit != null ? baseQ.limit(limit + 1) : baseQ);
    if (error) throw error;

    const tR1 = performance.now();
    log.step(`products table loaded  ${fms(tR1 - t1)}  db_limit=${limit != null ? limit + 1 : "NONE"}  db_rows=${rows?.length ?? 0}`);

    const hasMore    = limit != null ? (rows?.length ?? 0) > limit : false;
    const sliced     = limit != null ? (rows ?? []).slice(0, limit) : (rows ?? []);
    const totalCount = sliced.length;
    log.step(`LIMIT check  requested=${limit ?? "ALL"}  db_returned=${rows?.length ?? 0}  serving=${sliced.length}  hasMore=${hasMore}`);

    const ids = sliced.map((r) => r.id as string);
    log.step(`Loading product_images table  ids=${ids.length}`);
    const { data: imgs, error: imgErr } = ids.length > 0
      ? await sb.from("product_images")
          .select("product_id, image_url, is_primary")
          .in("product_id", ids)
      : { data: [] as { product_id: string; image_url: string; is_primary: boolean }[], error: null };
    if (imgErr) throw imgErr;

    const tR2 = performance.now();
    log.step(`product_images table loaded  ${fms(tR2 - tR1)}  images=${imgs?.length ?? 0}`);

    const imageMap = buildPrimaryImageMap(imgs ?? []);
    const finalRows: ThinProductRow[] = sliced.map((r) => {
      const hasPending = !!(r as any).has_pending_updates;
      return {
        base_sku:            r.base_sku   as string,
        title:               r.title      as string,
        price:               r.price      as number,
        created_at:          r.created_at as string,
        updated_at:          r.updated_at as string,
        primary_image_url:   imageMap.get(r.id as string) ?? null,
        has_pending_updates: hasPending,
        is_published:        true,
        has_draft:           hasPending,
      };
    });

    log.step(`has_pending_updates=${finalRows.filter(r => r.has_pending_updates).length} / ${finalRows.length} products`);
    log.success(`catalog list ready  status=PUBLISHED  returned=${finalRows.length}  total=${totalCount}  hasMore=${hasMore}`);
    return { products: finalRows, totalCount, hasMore };
  }

  // ── DRAFT: single-table path ──────────────────────────────────────────────
  if (status === "DRAFT") {
    log.step("Loading draft_products table");
    const t1 = performance.now();
    const baseQ = sb.from("draft_products").select(THIN_DRAFT_SELECT).order("updated_at", { ascending: false });
    const { data: rows, error } = await (limit != null ? baseQ.limit(limit + 1) : baseQ);
    if (error) throw error;

    const tR1 = performance.now();
    log.step(`draft_products table loaded  ${fms(tR1 - t1)}  db_limit=${limit != null ? limit + 1 : "NONE"}  db_rows=${rows?.length ?? 0}`);

    const hasMore    = limit != null ? (rows?.length ?? 0) > limit : false;
    const sliced     = limit != null ? (rows ?? []).slice(0, limit) : (rows ?? []);
    const totalCount = sliced.length;
    log.step(`LIMIT check  requested=${limit ?? "ALL"}  db_returned=${rows?.length ?? 0}  serving=${sliced.length}  hasMore=${hasMore}`);

    const ids = sliced.map((r) => r.id as string);
    log.step(`Loading draft_product_images table  ids=${ids.length}`);
    const { data: imgs, error: imgErr } = ids.length > 0
      ? await sb.from("draft_product_images")
          .select("product_id, image_url, is_primary")
          .in("product_id", ids)
      : { data: [] as { product_id: string; image_url: string; is_primary: boolean }[], error: null };
    if (imgErr) throw imgErr;

    const tR2 = performance.now();
    log.step(`draft_product_images table loaded  ${fms(tR2 - tR1)}  images=${imgs?.length ?? 0}`);

    const imageMap = buildPrimaryImageMap(imgs ?? []);
    const finalRows: ThinProductRow[] = sliced.map((r) => {
      const isPublished = !!(r as any).is_published;
      return {
        base_sku:            r.base_sku   as string,
        title:               r.title      as string,
        price:               r.price      as number,
        created_at:          r.created_at as string,
        updated_at:          r.updated_at as string,
        primary_image_url:   imageMap.get(r.id as string) ?? null,
        has_pending_updates: isPublished,
        is_published:        isPublished,
        has_draft:           true,
      };
    });

    log.step(`is_published=${finalRows.filter(r => r.is_published).length} / ${finalRows.length} drafts`);
    log.success(`catalog list ready  status=DRAFT  returned=${finalRows.length}  total=${totalCount}  hasMore=${hasMore}`);
    return { products: finalRows, totalCount, hasMore };
  }

  // ── ALL: single RPC round-trip (UNION query, sorted + limited in DB) ─────────
  log.step(`source=RPC  fn=catalog_thin_list_all  p_limit=${limit != null ? limit + 1 : "NULL (no limit)"}`);
  const t1 = performance.now();

  const { data: rpcRows, error: rpcErr } = await sb
    .rpc("catalog_thin_list_all", { p_limit: limit != null ? limit + 1 : null });
  if (rpcErr) throw rpcErr;

  const tR1 = performance.now();
  log.step(`RPC OK  ${fms(tR1 - t1)}  db_rows=${rpcRows?.length ?? 0}  (old path fetched ALL rows from 2 tables separately)`);

  const hasMore    = limit != null ? (rpcRows?.length ?? 0) > limit : false;
  const sliced: InternalThinRow[] = (limit != null ? (rpcRows ?? []).slice(0, limit) : (rpcRows ?? [])).map((r: any) => ({
    base_sku:            r.base_sku,
    title:               r.title,
    price:               r.price,
    created_at:          r.created_at,
    updated_at:          r.updated_at,
    is_published:        r.is_published,
    has_draft:           r.has_draft,
    has_pending_updates: r.has_pending_updates,
    published_id:        r.published_id ?? undefined,
    draft_id:            r.draft_id     ?? undefined,
  }));
  const totalCount = sliced.length;
  log.step(`LIMIT check  requested=${limit ?? "ALL"}  db_returned=${rpcRows?.length ?? 0}  serving=${sliced.length}  hasMore=${hasMore}`);

  const publishedIds = sliced.filter((r) => r.published_id).map((r) => r.published_id!);
  const draftOnlyIds = sliced.filter((r) => !r.is_published && r.draft_id).map((r) => r.draft_id!);

  log.step(`Loading product_images + draft_product_images (parallel)  published_ids=${publishedIds.length}  draft_only_ids=${draftOnlyIds.length}`);

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
  log.step(`image tables loaded  ${fms(tR2 - tR1)}  pub_images=${pubImgsRes.data?.length ?? 0}  draft_images=${draftImgsRes.data?.length ?? 0}`);

  const pubImageMap   = buildPrimaryImageMap(pubImgsRes.data   ?? []);
  const draftImageMap = buildPrimaryImageMap(draftImgsRes.data ?? []);

  const finalRows: ThinProductRow[] = sliced.map((r) => ({
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

  log.step(`has_pending_updates=${finalRows.filter(r => r.has_pending_updates).length} / ${finalRows.length} products`);
  log.success(`catalog list ready  status=ALL  returned=${finalRows.length}  total=${totalCount}  hasMore=${hasMore}`);
  return { products: finalRows, totalCount, hasMore };
}

/**
 * Full product detail for a single base_sku — both published and draft versions.
 */
export async function fetchProductDetailBySku(
  baseSku: string,
  log: OpLogger,
): Promise<ProductDetailResult> {
  const sb = requireAdmin();
  const t0 = performance.now();

  log.step(`DB fetch - detail for sku=${baseSku} (parallel)`);

  const [
    { data: published, error: pubErr },
    { data: draft,     error: draftErr },
  ] = await Promise.all([
    sb.from("products")      .select(MANAGE_PRODUCT_SELECT).eq("base_sku", baseSku).maybeSingle(),
    sb.from("draft_products").select(MANAGE_DRAFT_SELECT)  .eq("base_sku", baseSku).maybeSingle(),
  ]);

  if (pubErr)   throw pubErr;
  if (draftErr) throw draftErr;

  log.step(`DB fetch - detail complete  ${fms(performance.now() - t0)}  published=${!!published}  draft=${!!draft}`);
  return { published: published ?? null, draft: draft ?? null };
}

export function isSupabaseCatalogConfigured(): boolean {
  return supabaseAdmin !== null;
}

/**
 * Delete a product and all its children atomically via RPC.
 */
export async function deleteProductFromDatabase(
  id: string,
  status: "DRAFT" | "PUBLISHED",
  log: OpLogger,
): Promise<void> {
  const sb = requireAdmin();
  log.step(`DB RPC - delete_product_atomic  id=${id}  status=${status}`);
  const { error } = await sb.rpc("delete_product_atomic", { p_id: id, p_status: status });
  if (error) throw new Error(error.message);
  log.step(`DB RPC - delete complete  id=${id}`);
}

/**
 * Replace draft row for this slug with payload.
 * Sets is_published on the new draft row and has_pending_updates on the
 * published counterpart so catalog list queries never need to cross-join.
 */
export async function saveDraftToDatabase(
  data: CurationPayload,
  log: OpLogger,
): Promise<{ draftProductId: string }> {
  const sb = requireAdmin();
  const { productDraft, variants, images } = mapCurationPayloadToCatalog(data);
  const { slug, base_sku } = productDraft;

  log.step(`DB check - published version exists for sku=${base_sku}`);
  const { data: pubRow } = await sb
    .from("products")
    .select("id")
    .eq("base_sku", base_sku)
    .maybeSingle();
  const hasPublished = !!pubRow;
  log.step(`DB check - is_published=${hasPublished}`);

  log.step(`DB delete - existing draft  slug=${slug}`);
  const { error: delErr } = await sb.from("draft_products").delete().eq("slug", slug);
  if (delErr) throw delErr;

  log.step("DB insert - draft product row");
  const { data: prod, error: insErr } = await sb
    .from("draft_products")
    .insert({ ...productDraft, is_published: hasPublished })
    .select("id")
    .single();
  if (insErr) throw insErr;
  const productId = prod.id as string;

  const variantMap = await insertVariantsAndMap(sb, "draft_product_variants", productId, variants, log);
  await insertImagesForProduct(sb, "draft_product_images", productId, variantMap, images, log);

  if (hasPublished) {
    log.step(`DB update - has_pending_updates=true  sku=${base_sku}`);
    await sb.from("products").update({ has_pending_updates: true }).eq("base_sku", base_sku);
  }

  return { draftProductId: productId };
}

/**
 * Remove draft + published rows for slug, then insert published catalog from payload.
 * Runs inside a single Postgres transaction via RPC.
 */
export async function launchProductToDatabase(
  data: CurationPayload,
  log: OpLogger,
): Promise<{ publishedProductId: string }> {
  const sb = requireAdmin();
  const { productPublished, variants, images } = mapCurationPayloadToCatalog(data);

  log.step("DB RPC - launch_product_atomic (delete draft + insert published, atomic)");
  const { data: publishedProductId, error } = await sb.rpc("launch_product_atomic", {
    p_product:  productPublished,
    p_variants: variants,
    p_images:   images,
  });

  if (error) throw new Error(error.message);
  log.step(`DB RPC - launch complete  publishedId=${publishedProductId}`);
  return { publishedProductId: publishedProductId as string };
}

// ─── Search suggestions ───────────────────────────────────────────────────────

export type SuggestionType = "product" | "category" | "occasion" | "tag" | "badge" | "fabric" | "fit" | "color" | "trend" | "keyword";

export interface SuggestionRow {
  type:         SuggestionType;
  id:           string;
  label:        string;
  sublabel:     string;
  image:        string;
  slug:         string;
  categorySlug: string;
  sku:          string;
}

// ─── In-memory search catalog (rebuilt from DB, 10 min TTL) ──────────────────

interface SearchCatalogEntry {
  id:           string;
  title:        string;
  slug:         string;
  base_sku:     string;
  category:     string;
  category_slug: string;
  tags:         string[];
  badges:       string[];
  occasion:     string;
  fabric:       string;
  fit:          string;
  gender:       string;
  image:        string;
}

let _searchCatalog:    SearchCatalogEntry[] | null = null;
let _searchCatalogExp: number = 0;
const SEARCH_CATALOG_TTL_MS = 10 * 60 * 1000;

/** Drop the in-memory catalog so the next search request rebuilds it from DB. */
export function invalidateSearchCatalog(): void {
  _searchCatalog    = null;
  _searchCatalogExp = 0;
}

const SEARCH_CATALOG_SELECT = `
  id, title, slug, base_sku, category, category_slug,
  tags, badges, occasion, fabric, fit, gender,
  product_images(image_url, is_primary)
`.trim();

async function loadSearchCatalog(log: OpLogger): Promise<SearchCatalogEntry[]> {
  if (_searchCatalog && Date.now() < _searchCatalogExp) {
    log.step(`Search catalog - L1 HIT (${_searchCatalog.length} products in memory)`);
    return _searchCatalog;
  }

  const sb = requireAdmin();
  log.step("Search catalog - MISS, fetching from DB");
  const t0 = performance.now();

  const { data, error } = await sb
    .from("products")
    .select(SEARCH_CATALOG_SELECT);

  if (error) throw new Error(error.message);

  _searchCatalog = (data ?? []).map((p) => {
    const imgs: Array<{ image_url: string; is_primary: boolean }> = p.product_images ?? [];
    const image = imgs.find((i) => i.is_primary)?.image_url || imgs[0]?.image_url || "";
    return {
      id:            p.id            as string,
      title:         p.title         as string,
      slug:          p.slug          as string,
      base_sku:      p.base_sku      as string,
      category:      p.category      as string,
      category_slug: p.category_slug as string,
      tags:          (p.tags    ?? []) as string[],
      badges:        (p.badges  ?? []) as string[],
      occasion:      (p.occasion ?? "") as string,
      fabric:        (p.fabric   ?? "") as string,
      fit:           (p.fit      ?? "") as string,
      gender:        (p.gender   ?? "") as string,
      image,
    };
  });

  _searchCatalogExp = Date.now() + SEARCH_CATALOG_TTL_MS;
  log.step(`Search catalog - loaded ${_searchCatalog.length} products  ${fms(performance.now() - t0)}`);
  return _searchCatalog;
}

// ─── Fuzzy helpers ────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = Array.from({ length: n + 1 }, (_, i) => i);
  const curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    for (let k = 0; k <= n; k++) prev[k] = curr[k];
  }
  return curr[n];
}

function fuzzyMatchesTitle(title: string, query: string): boolean {
  const maxDist = query.length <= 6 ? 1 : 2;
  const words   = title.toLowerCase().split(/\s+/);
  return words.some(word => {
    if (Math.abs(word.length - query.length) > maxDist + 1) return false;
    return levenshtein(word, query) <= maxDist;
  });
}

// ─── Weighted field scoring ───────────────────────────────────────────────────

const FIELD_SCORES: Record<string, number> = {
  "title:exact":        100,
  "title:starts":        90,
  "title:word-starts":   85,
  "title:contains":      80,
  "category:starts":     78,
  "category":            75,
  "tag:starts":          72,
  "tag":                 65,
  "occasion:starts":     63,
  "occasion":            60,
  "badge:starts":        58,
  "badge":               55,
  "fabric:starts":       53,
  "fabric":              50,
  "fit:starts":          50,
  "fit":                 48,
  "gender":              45,
  "fuzzy":               30,
};

function scoreEntry(
  entry: SearchCatalogEntry,
  lower: string,
): { score: number; field: string } {
  const t = entry.title.toLowerCase();

  if (t === lower)         return { score: FIELD_SCORES["title:exact"],      field: "title" };
  if (t.startsWith(lower)) return { score: FIELD_SCORES["title:starts"],     field: "title" };
  if (t.split(/\s+/).some(w => w !== lower && w.startsWith(lower)))
                           return { score: FIELD_SCORES["title:word-starts"], field: "title" };
  if (t.includes(lower))  return { score: FIELD_SCORES["title:contains"],    field: "title" };

  const cat = entry.category.toLowerCase();
  if (cat.startsWith(lower)) return { score: FIELD_SCORES["category:starts"], field: "category" };
  if (cat.includes(lower))   return { score: FIELD_SCORES["category"],        field: "category" };

  for (const tag of entry.tags) {
    const tl = tag.toLowerCase();
    if (tl.startsWith(lower)) return { score: FIELD_SCORES["tag:starts"], field: "tag" };
    if (tl.includes(lower))   return { score: FIELD_SCORES["tag"],        field: "tag" };
  }

  const occ = entry.occasion.toLowerCase();
  if (occ.startsWith(lower)) return { score: FIELD_SCORES["occasion:starts"], field: "occasion" };
  if (occ.includes(lower))   return { score: FIELD_SCORES["occasion"],        field: "occasion" };

  for (const badge of entry.badges) {
    const bl = badge.toLowerCase();
    if (bl.startsWith(lower)) return { score: FIELD_SCORES["badge:starts"], field: "badge" };
    if (bl.includes(lower))   return { score: FIELD_SCORES["badge"],        field: "badge" };
  }

  const fab = entry.fabric.toLowerCase();
  if (fab.startsWith(lower)) return { score: FIELD_SCORES["fabric:starts"], field: "fabric" };
  if (fab.includes(lower))   return { score: FIELD_SCORES["fabric"],        field: "fabric" };

  const fit = entry.fit.toLowerCase();
  if (fit.startsWith(lower)) return { score: FIELD_SCORES["fit:starts"], field: "fit" };
  if (fit.includes(lower))   return { score: FIELD_SCORES["fit"],        field: "fit" };

  if (entry.gender.toLowerCase().includes(lower))
    return { score: FIELD_SCORES["gender"], field: "gender" };

  if (lower.length >= 3 && fuzzyMatchesTitle(entry.title, lower))
    return { score: FIELD_SCORES["fuzzy"], field: "fuzzy" };

  return { score: 0, field: "" };
}

// ─── fetchSuggestions ─────────────────────────────────────────────────────────

/**
 * Returns up to 8 suggestions (metadata + products) for a search query.
 * Metadata covers categories, occasions, tags, badges, fabrics, and fits.
 * Uses an in-memory catalog so no DB round-trip is needed on cache-warm requests.
 */
export async function fetchSuggestions(q: string, log: OpLogger): Promise<SuggestionRow[]> {
  const lower   = q.toLowerCase();
  const catalog = await loadSearchCatalog(log);

  // Score every product in the catalog.
  const scored: Array<{ entry: SearchCatalogEntry; score: number; field: string }> = [];
  for (const entry of catalog) {
    const { score, field } = scoreEntry(entry, lower);
    if (score > 0) scored.push({ entry, score, field });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
  log.step(`Scoring - ${scored.length}/${catalog.length} products matched`);

  // ─── Collect unique metadata suggestions from all matched products ──────────
  const metaRows   = new Map<string, SuggestionRow>();
  const metaScores = new Map<string, number>();

  function upsertMeta(key: string, row: SuggestionRow, score: number) {
    const prev = metaScores.get(key);
    if (prev === undefined || prev < score) { metaRows.set(key, row); metaScores.set(key, score); }
  }

  for (const { entry } of scored) {
    const cat = entry.category.toLowerCase();
    if (cat.includes(lower)) {
      const s = cat.startsWith(lower) ? FIELD_SCORES["category:starts"] : FIELD_SCORES["category"];
      upsertMeta(`category:${entry.category_slug}`, { type: "category", id: `category:${entry.category_slug}`, label: entry.category, sublabel: "Category", image: "", slug: "", categorySlug: entry.category_slug, sku: "" }, s);
    }

    if (entry.occasion) {
      const occ = entry.occasion.toLowerCase();
      if (occ.includes(lower)) {
        const s = occ.startsWith(lower) ? FIELD_SCORES["occasion:starts"] : FIELD_SCORES["occasion"];
        upsertMeta(`occasion:${occ}`, { type: "occasion", id: `occasion:${occ}`, label: entry.occasion, sublabel: "Occasion", image: "", slug: "", categorySlug: "", sku: "" }, s);
      }
    }

    for (const tag of entry.tags) {
      const tl = tag.toLowerCase();
      if (tl.includes(lower)) {
        const s = tl.startsWith(lower) ? FIELD_SCORES["tag:starts"] : FIELD_SCORES["tag"];
        upsertMeta(`tag:${tl}`, { type: "tag", id: `tag:${tl}`, label: tag, sublabel: "Tag", image: "", slug: "", categorySlug: "", sku: "" }, s);
      }
    }

    for (const badge of entry.badges) {
      const bl = badge.toLowerCase();
      if (bl.includes(lower)) {
        const s = bl.startsWith(lower) ? FIELD_SCORES["badge:starts"] : FIELD_SCORES["badge"];
        upsertMeta(`badge:${bl}`, { type: "badge", id: `badge:${bl}`, label: badge, sublabel: "Badge", image: "", slug: "", categorySlug: "", sku: "" }, s);
      }
    }

    if (entry.fabric) {
      const fab = entry.fabric.toLowerCase();
      if (fab.includes(lower)) {
        const s = fab.startsWith(lower) ? FIELD_SCORES["fabric:starts"] : FIELD_SCORES["fabric"];
        upsertMeta(`fabric:${fab}`, { type: "fabric", id: `fabric:${fab}`, label: entry.fabric, sublabel: "Material", image: "", slug: "", categorySlug: "", sku: "" }, s);
      }
    }

    if (entry.fit) {
      const fitl = entry.fit.toLowerCase();
      if (fitl.includes(lower)) {
        const s = fitl.startsWith(lower) ? FIELD_SCORES["fit:starts"] : FIELD_SCORES["fit"];
        upsertMeta(`fit:${fitl}`, { type: "fit", id: `fit:${fitl}`, label: entry.fit, sublabel: "Fit", image: "", slug: "", categorySlug: "", sku: "" }, s);
      }
    }
  }

  // ─── Curated lexicon suggestions — independent of the live catalog ──────────
  // These let the search box suggest terms ("Kurti", "Diwali", "Cotton", "Red")
  // even when no matching products are currently in stock.
  const lexiconMatches = matchLexicon(lower, 10);
  log.step(`Lexicon - ${lexiconMatches.length} curated matches`);

  // Merge product-derived metadata with the curated lexicon, deduped by label.
  // On a label collision the higher-scoring source wins, so an in-stock match
  // (real product metadata) outranks the generic curated term where relevant.
  const merged = new Map<string, { row: SuggestionRow; score: number }>();
  function mergeMeta(row: SuggestionRow, score: number) {
    const key = row.label.toLowerCase();
    const prev = merged.get(key);
    if (!prev || prev.score < score) merged.set(key, { row, score });
  }
  for (const [key, row] of metaRows) mergeMeta(row, metaScores.get(key) ?? 0);
  for (const m of lexiconMatches) {
    mergeMeta(
      {
        type:         m.entry.type,
        id:           `lex:${m.entry.type}:${m.entry.term.toLowerCase()}`,
        label:        m.entry.term,
        sublabel:     m.entry.sublabel,
        image:        "",
        slug:         "",
        categorySlug: "",
        sku:          "",
      },
      m.score
    );
  }

  // Sort merged suggestions by score, cap at 8.
  const metaSuggestions: SuggestionRow[] = [...merged.values()]
    .sort((a, b) => b.score - a.score || a.row.label.localeCompare(b.row.label))
    .slice(0, 8)
    .map((m) => m.row);

  // Products tab is inventory-bound (these navigate to real PDPs); cap at 8.
  const productSuggestions: SuggestionRow[] = scored.slice(0, 8).map(({ entry }) => ({
    type:         "product" as const,
    id:           entry.id,
    label:        entry.title,
    sublabel:     entry.category,
    image:        entry.image,
    slug:         entry.slug,
    categorySlug: entry.category_slug,
    sku:          entry.base_sku,
  }));

  log.step(`Suggestions - ${metaSuggestions.length} metadata + ${productSuggestions.length} products`);
  return [...metaSuggestions, ...productSuggestions];
}

/** Minimal lookup for lazy-loaded reviews (title only). */
export async function fetchProductTitleBySlug(
  slug: string,
  log: OpLogger,
): Promise<string | null> {
  const sb = requireAdmin();
  log.step(`DB fetch - product title  slug=${slug}`);
  const { data, error } = await sb
    .from("products")
    .select("title")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  log.step(`DB fetch - title="${data?.title ?? "not found"}"`);
  return data?.title ?? null;
}

export async function fetchProductBySlug(
  slug: string,
  log: OpLogger,
): Promise<PdpProductRow | null> {
  const sb = requireAdmin();
  const t0 = performance.now();
  log.step(`DB fetch - product by slug=${slug}`);
  const { data: published, error: pubErr } = await sb
    .from("products")
    .select(PDP_PRODUCT_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (pubErr) throw pubErr;
  log.step(`DB fetch - complete  ${fms(performance.now() - t0)}  found=${!!published}`);
  return published as PdpProductRow | null;
}

export async function fetchRecommendedProducts(
  slug: string,
  categorySlug: string,
  log: OpLogger,
  anchorHint?: { gender?: string | undefined; price?: number | undefined },
) {
  const sb = requireAdmin();

  const REC_SELECT = `
    title, slug, category_slug, price, original_price, base_sku, tags, gender,
    product_images(image_url, is_primary)
  `;

  // Anchor product's gender + price drive ranking for BOTH the same-category
  // results and the cross-category padding, so recommendations stay gender- and
  // price-consistent with the product being viewed.
  //
  // The PDP passes these in (it already has the product loaded), letting us skip
  // the lookup. We only hit the DB when the hint is absent (e.g. a direct API call).
  let anchorGender = anchorHint?.gender ?? null;
  let anchorPrice  = typeof anchorHint?.price === "number" ? anchorHint.price : null;
  if (anchorGender === null || anchorPrice === null) {
    log.step(`DB fetch - anchor gender/price  slug=${slug}  (no hint supplied)`);
    const { data: anchor } = await sb
      .from("products")
      .select("gender, price")
      .eq("slug", slug)
      .maybeSingle();
    if (anchorGender === null) anchorGender = anchor?.gender ?? null;
    if (anchorPrice === null)  anchorPrice  = Number(anchor?.price) || 0;
  }

  const anchorPriceNum = anchorPrice ?? 0;

  // Soft preference: same gender as the anchor first, then closest price band.
  // Applied to an already recency-ordered pool, so recency is the stable tiebreaker.
  const rankByGenderThenPrice = (a: { gender?: string; price?: number }, b: { gender?: string; price?: number }) => {
    const aGenderRank = anchorGender && a.gender === anchorGender ? 0 : 1;
    const bGenderRank = anchorGender && b.gender === anchorGender ? 0 : 1;
    if (aGenderRank !== bGenderRank) return aGenderRank - bGenderRank;
    return Math.abs((Number(a.price) || 0) - anchorPriceNum) - Math.abs((Number(b.price) || 0) - anchorPriceNum);
  };

  // Primary: same category, ranked same-gender-first then nearest price. Pull a
  // wider pool (was a flat LIMIT 5) so the ranking has candidates to choose from;
  // opposite-gender same-category items still fill any gap before padding fires.
  log.step(`DB fetch - recommendations  category=${categorySlug}  excluding=${slug}  anchorGender=${anchorGender ?? "?"}  anchorPrice=${anchorPrice}`);
  const t1 = performance.now();
  const { data: recommended, error: recErr } = await sb
    .from("products")
    .select(REC_SELECT)
    .eq("category_slug", categorySlug)
    .neq("slug", slug)
    .order("updated_at", { ascending: false })
    .limit(30);

  if (recErr) throw recErr;
  const t2 = performance.now();
  log.step(`DB fetch - category query complete  ${fms(t2 - t1)}  pool=${recommended?.length ?? 0}`);

  let list = (recommended || []).slice().sort(rankByGenderThenPrice).slice(0, 5);

  if (list.length < 5) {
    log.step(`DB fetch - padding query (only ${list.length} category results, need 5)`);
    const t3 = performance.now();

    // Cross-category filler, ranked by the same soft preference so padding still
    // feels relevant (same gender, similar price) rather than just "newest".
    const { data: general, error: genErr } = await sb
      .from("products")
      .select(REC_SELECT)
      .neq("slug", slug)
      .order("updated_at", { ascending: false })
      .limit(30);

    if (!genErr && general) {
      const existingSlugs = new Set(list.map((p) => p.slug));
      const candidates = general.filter((p) => !existingSlugs.has(p.slug)).sort(rankByGenderThenPrice);

      for (const item of candidates) {
        if (list.length >= 5) break;
        list.push(item);
        existingSlugs.add(item.slug);
      }
    }
    log.step(`DB fetch - padding complete  ${fms(performance.now() - t3)}  total=${list.length}`);
  }

  return list;
}

// ─── Reviews / ratings ───────────────────────────────────────────────────────

export interface ReviewItem {
  id: string;
  user: string;
  rating: number;
  date: string;
  title: string;
  comment: string;
  verified: boolean;
  images?: string[];
}

export interface ReviewsData {
  averageRating: number;
  totalReviews: number;
  distribution: { stars: number; count: number }[];
  reviews: ReviewItem[];
}

const REVIEWS_SELECT = `
  id, user_name, rating, title, comment, verified, images, created_at
`;

// "2026-06-02T..." → "2 Jun 2026" (matches the date style the PDP renders).
const REVIEW_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${REVIEW_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Fetch all reviews for a product slug and aggregate them into the ReviewsData
 * shape the PDP consumes. Aggregation (average, 5→1 distribution) is computed in
 * JS — the per-product review count is small, mirroring how recommendations are
 * mapped in-process rather than via SQL aggregates.
 *
 * A product with no reviews returns a valid empty payload (totalReviews: 0),
 * NOT an error — the PDP renders a "no reviews yet" state for that case.
 */
export async function fetchReviewsDataBySlug(
  slug: string,
  log: OpLogger,
): Promise<ReviewsData> {
  const sb = requireAdmin();

  log.step(`DB fetch - reviews  slug=${slug}`);
  const t1 = performance.now();
  const { data, error } = await sb
    .from("product_reviews")
    .select(REVIEWS_SELECT)
    .eq("product_slug", slug)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data || [];
  log.step(`DB fetch - reviews complete  ${fms(performance.now() - t1)}  count=${rows.length}`);

  const totalReviews = rows.length;
  const ratingSum = rows.reduce((acc: number, r: any) => acc + (Number(r.rating) || 0), 0);
  const averageRating = totalReviews > 0 ? Math.round((ratingSum / totalReviews) * 10) / 10 : 0;

  // 5★ → 1★, always present even when count is 0 (the PDP renders a bar per row).
  const counts = new Map<number, number>([[5, 0], [4, 0], [3, 0], [2, 0], [1, 0]]);
  for (const r of rows) {
    const stars = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 0)));
    counts.set(stars, (counts.get(stars) ?? 0) + 1);
  }
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: counts.get(stars) ?? 0 }));

  const reviews: ReviewItem[] = rows.map((r: any) => ({
    id: String(r.id),
    user: r.user_name,
    rating: Number(r.rating) || 0,
    date: formatReviewDate(r.created_at),
    title: r.title || "",
    comment: r.comment || "",
    verified: !!r.verified,
    images: Array.isArray(r.images) && r.images.length > 0 ? r.images : undefined,
  }));

  return { averageRating, totalReviews, distribution, reviews };
}
