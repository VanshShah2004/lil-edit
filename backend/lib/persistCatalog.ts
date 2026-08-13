import { performance } from "perf_hooks";
import { supabaseAdmin } from "./supabase.js";
import {
  mapCurationPayloadToCatalog,
  type CurationPayload,
  type ImageRowInsert,
  type VariantRowInsert,
} from "./productMapper.js";
import { fms, type OpLogger } from "./logger.js";
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
  price, original_price, fabric, fit, occasion, care_instructions, size_chart_id,
  description_points, sizes, tags, badges,
  is_featured, is_new_arrival, is_bestseller, is_trending, is_unlimited,
  created_at, updated_at,
  product_images(id, image_url, alt_text, is_primary, sort_order, variant_id),
  product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
`.trim();

const MANAGE_DRAFT_SELECT = `
  id, title, slug, base_sku, brand, category, category_slug, gender,
  price, original_price, fabric, fit, occasion, care_instructions, size_chart_id,
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
  size_charts(id, name, rows),
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
  /** Embedded sizing chart via the size_chart_id FK (null when unset). */
  size_charts?: { id: string; name: string; rows: unknown[] } | null;
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
  published: Record<string, unknown> | null;
  draft: Record<string, unknown> | null;
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
  const primary = new Map<string, string>();
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
  for (const [id, url] of primary) result.set(id, url); // primary wins
  return result;
}

// ─── Internal row type for ALL-mode merge ─────────────────────────────────────

interface InternalThinRow {
  base_sku: string;
  title: string;
  price: number;
  created_at: string;
  updated_at: string;
  is_published: boolean;
  has_draft: boolean;
  has_pending_updates: boolean;
  published_id?: string;
  draft_id?: string;
}

// Raw row shape returned by the catalog-list RPC (nullable id columns the mapper
// normalizes to `undefined`).
interface RpcThinRow {
  base_sku: string;
  title: string;
  price: number;
  created_at: string;
  updated_at: string;
  is_published: boolean;
  has_draft: boolean;
  has_pending_updates: boolean;
  published_id?: string | null;
  draft_id?: string | null;
}

// ─── Exported functions ───────────────────────────────────────────────────────

export async function fetchAllProducts(log: OpLogger) {
  const sb = requireAdmin();
  const t0 = performance.now();

  log.step("DB fetch - products + draft_products (parallel)");

  const [
    { data: published, error: pubErr },
    { data: drafts, error: draftErr },
  ] = await Promise.all([
    sb.from("products").select(MANAGE_PRODUCT_SELECT).order("updated_at", { ascending: false }),
    sb.from("draft_products").select(MANAGE_DRAFT_SELECT).order("updated_at", { ascending: false }),
  ]);

  if (pubErr) throw pubErr;
  if (draftErr) throw draftErr;

  log.step(`DB fetch - complete  ${fms(performance.now() - t0)}  published=${published?.length ?? 0}  drafts=${drafts?.length ?? 0}`);

  return {
    published: published || [],
    drafts: drafts || [],
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
    let drafts: unknown[] = [];

    if (published && published.length > 0) {
      const skus = (published as unknown as Array<{ base_sku: string }>).map((p) => p.base_sku);
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
    let published: unknown[] = [];

    if (drafts && drafts.length > 0) {
      const skus = (drafts as unknown as Array<{ base_sku: string }>).map((d) => d.base_sku);
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
      { data: pubSkus, error: pubSkuErr },
      { data: draftSkus, error: draftSkuErr },
    ] = await Promise.all([
      sb.from("products").select("base_sku, updated_at"),
      sb.from("draft_products").select("base_sku, updated_at"),
    ]);
    const t2 = performance.now();

    if (pubSkuErr) throw pubSkuErr;
    if (draftSkuErr) throw draftSkuErr;

    log.step(`DB fetch - round 1 complete  ${fms(t2 - t1)}  pub=${pubSkus?.length ?? 0}  drafts=${draftSkus?.length ?? 0}`);

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

    let published: unknown[] = [];
    let drafts: unknown[] = [];

    if (slicedSkus.length > 0) {
      log.step(`DB fetch - ALL / round 2 (full rows for ${slicedSkus.length} SKUs, parallel)`);
      const [
        { data: pubData, error: pubErr },
        { data: draftData, error: draftErr },
      ] = await Promise.all([
        sb.from("products").select(MANAGE_PRODUCT_SELECT).in("base_sku", slicedSkus),
        sb.from("draft_products").select(MANAGE_DRAFT_SELECT).in("base_sku", slicedSkus),
      ]);

      if (pubErr) throw pubErr;
      if (draftErr) throw draftErr;

      published = pubData || [];
      drafts = draftData || [];
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

    const hasMore = limit != null ? (rows?.length ?? 0) > limit : false;
    const sliced = limit != null ? (rows ?? []).slice(0, limit) : (rows ?? []);
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
      const hasPending = !!(r as { has_pending_updates?: boolean }).has_pending_updates;
      return {
        base_sku: r.base_sku as string,
        title: r.title as string,
        price: r.price as number,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
        primary_image_url: imageMap.get(r.id as string) ?? null,
        has_pending_updates: hasPending,
        is_published: true,
        has_draft: hasPending,
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

    const hasMore = limit != null ? (rows?.length ?? 0) > limit : false;
    const sliced = limit != null ? (rows ?? []).slice(0, limit) : (rows ?? []);
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
      const isPublished = !!(r as { is_published?: boolean }).is_published;
      return {
        base_sku: r.base_sku as string,
        title: r.title as string,
        price: r.price as number,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
        primary_image_url: imageMap.get(r.id as string) ?? null,
        has_pending_updates: isPublished,
        is_published: isPublished,
        has_draft: true,
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

  const hasMore = limit != null ? (rpcRows?.length ?? 0) > limit : false;
  const sliced: InternalThinRow[] = (limit != null ? (rpcRows ?? []).slice(0, limit) : (rpcRows ?? [])).map((r: RpcThinRow) => ({
    base_sku: r.base_sku,
    title: r.title,
    price: r.price,
    created_at: r.created_at,
    updated_at: r.updated_at,
    is_published: r.is_published,
    has_draft: r.has_draft,
    has_pending_updates: r.has_pending_updates,
    published_id: r.published_id ?? undefined,
    draft_id: r.draft_id ?? undefined,
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

  if (pubImgsRes.error) throw pubImgsRes.error;
  if (draftImgsRes.error) throw draftImgsRes.error;

  const tR2 = performance.now();
  log.step(`image tables loaded  ${fms(tR2 - tR1)}  pub_images=${pubImgsRes.data?.length ?? 0}  draft_images=${draftImgsRes.data?.length ?? 0}`);

  const pubImageMap = buildPrimaryImageMap(pubImgsRes.data ?? []);
  const draftImageMap = buildPrimaryImageMap(draftImgsRes.data ?? []);

  const finalRows: ThinProductRow[] = sliced.map((r) => ({
    base_sku: r.base_sku,
    title: r.title,
    price: r.price,
    created_at: r.created_at,
    updated_at: r.updated_at,
    primary_image_url: r.is_published
      ? (pubImageMap.get(r.published_id!) ?? null)
      : (draftImageMap.get(r.draft_id!) ?? null),
    has_pending_updates: r.has_pending_updates,
    is_published: r.is_published,
    has_draft: r.has_draft,
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
    { data: draft, error: draftErr },
  ] = await Promise.all([
    sb.from("products").select(MANAGE_PRODUCT_SELECT).eq("base_sku", baseSku).maybeSingle(),
    sb.from("draft_products").select(MANAGE_DRAFT_SELECT).eq("base_sku", baseSku).maybeSingle(),
  ]);

  if (pubErr) throw pubErr;
  if (draftErr) throw draftErr;

  log.step(`DB fetch - detail complete  ${fms(performance.now() - t0)}  published=${!!published}  draft=${!!draft}`);
  return {
    published: (published ?? null) as Record<string, unknown> | null,
    draft: (draft ?? null) as Record<string, unknown> | null,
  };
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

  // Replace by base_sku (unique), NOT slug: slugs are non-unique now, so deleting by
  // slug would wipe a different product's draft that happens to share the slug.
  log.step(`DB delete - existing draft  base_sku=${base_sku}  (slug=${slug})`);
  const { error: delErr } = await sb.from("draft_products").delete().eq("base_sku", base_sku);
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
    p_product: productPublished,
    p_variants: variants,
    p_images: images,
  });

  if (error) throw new Error(error.message);
  log.step(`DB RPC - launch complete  publishedId=${publishedProductId}`);
  return { publishedProductId: publishedProductId as string };
}

// ─── Search suggestions ───────────────────────────────────────────────────────

export type SuggestionType = "product" | "category" | "occasion" | "tag" | "badge" | "fabric" | "fit" | "color" | "trend" | "keyword";

export interface SuggestionRow {
  type: SuggestionType;
  id: string;
  label: string;
  sublabel: string;
  image: string;
  slug: string;
  categorySlug: string;
  sku: string;
}

// ─── In-memory search catalog (rebuilt from DB, 10 min TTL) ──────────────────

export interface SearchCatalogVariant {
  sku: string;
  colorName: string;
  colorHex: string;
  image: string;
  inStock: boolean;
}

export interface SearchCatalogEntry {
  id: string;
  title: string;
  slug: string;
  base_sku: string;
  category: string;
  category_slug: string;
  tags: string[];
  badges: string[];
  occasion: string;
  fabric: string;
  fit: string;
  gender: string;
  is_trending?: boolean;
  details: string;
  image: string;
  price: number;
  original_price: number;
  created_at: string;
  variants: SearchCatalogVariant[];
}

let _searchCatalog: SearchCatalogEntry[] | null = null;
let _searchCatalogExp: number = 0;
const SEARCH_CATALOG_TTL_MS = 10 * 60 * 1000;

/** Drop the in-memory catalog so the next search request rebuilds it from DB. */
export function invalidateSearchCatalog(): void {
  _searchCatalog = null;
  _searchCatalogExp = 0;
}

interface SearchCatalogDbRow {
  id: string;
  title: string;
  slug: string;
  base_sku: string;
  category: string;
  category_slug: string;
  tags: string[] | null;
  badges: string[] | null;
  occasion: string | null;
  fabric: string | null;
  fit: string | null;
  gender: string | null;
  is_trending: boolean | null;
  description_points: string[] | null;
  price: number | null;
  original_price: number | null;
  created_at: string;
  product_images: Array<{ image_url: string; is_primary: boolean; variant_id: string | null; sort_order: number | null }> | null;
  product_variants: Array<{
    id: string;
    color_name: string | null;
    color_hex: string | null;
    variant_sku: string;
    stock: number | null;
    is_unlimited: boolean | null;
    sort_order: number | null;
  }> | null;
}

const SEARCH_CATALOG_SELECT = `
  id, title, slug, base_sku, category, category_slug,
  tags, badges, occasion, fabric, fit, gender, is_trending, description_points, price, original_price, created_at,
  product_images(image_url, is_primary, variant_id, sort_order),
  product_variants(id, color_name, color_hex, variant_sku, stock, is_unlimited, sort_order)
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

  const rows = (data ?? []) as unknown as SearchCatalogDbRow[];
  _searchCatalog = rows.map((p) => {
    const imgs = [...(p.product_images ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    const productImage = imgs.find((i) => i.is_primary)?.image_url || imgs[0]?.image_url || "";

    const variants: SearchCatalogVariant[] = [...(p.product_variants ?? [])]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((v) => {
        const variantImgs = imgs.filter((i) => i.variant_id === v.id);
        const variantImage =
          variantImgs.find((i) => i.is_primary)?.image_url ||
          variantImgs[0]?.image_url ||
          productImage;
        const inStock = v.is_unlimited ? true : (v.stock ?? 0) > 0;
        return {
          sku: v.variant_sku,
          colorName: v.color_name ?? "",
          colorHex: v.color_hex ?? "#cccccc",
          image: variantImage,
          inStock,
        };
      });

    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      base_sku: p.base_sku,
      category: p.category,
      category_slug: p.category_slug,
      tags: p.tags ?? [],
      badges: p.badges ?? [],
      occasion: p.occasion ?? "",
      fabric: p.fabric ?? "",
      fit: p.fit ?? "",
      gender: p.gender ?? "",
      is_trending: p.is_trending ?? false,
      details: (p.description_points ?? []).join(" "),
      image: productImage,
      price: p.price ?? 0,
      original_price: p.original_price ?? p.price ?? 0,
      created_at: p.created_at,
      variants,
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
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! : 1 + Math.min(prev[j]!, curr[j - 1]!, prev[j - 1]!);
    }
    for (let k = 0; k <= n; k++) prev[k] = curr[k]!;
  }
  return curr[n]!;
}

function fuzzyMatchesTitle(title: string, query: string): boolean {
  const maxDist = query.length <= 6 ? 1 : 2;
  const words = title.toLowerCase().split(/\s+/);
  return words.some(word => {
    if (Math.abs(word.length - query.length) > maxDist + 1) return false;
    return levenshtein(word, query) <= maxDist;
  });
}

// ─── Weighted field scoring ───────────────────────────────────────────────────

const FIELD_SCORES = {
  "title:exact": 100,
  "title:starts": 90,
  "title:word-starts": 85,
  "title:contains": 80,
  "category:starts": 78,
  "category": 75,
  "tag:starts": 72,
  "tag": 65,
  "occasion:starts": 63,
  "occasion": 60,
  "badge:starts": 58,
  "badge": 55,
  "fabric:starts": 53,
  "fabric": 50,
  "color:starts": 53,
  "color": 50,
  "fit:starts": 50,
  "fit": 48,
  "gender": 45,
  "fuzzy": 30,
  "details": 10,
};

// Fractional match-quality bonus in [0, 1.9] — strictly smaller than the
// smallest gap between adjacent FIELD_SCORES tiers (2), so it refines the
// ordering WITHIN a tier without ever flipping one field tier over another.
// Rewards coverage (the query spanning more of the matched text = tighter
// match) and position (matching nearer the front of the text). This is what
// keeps same-tier results ranked by how well they match the query instead of
// collapsing into the alphabetical localeCompare tiebreak.
function matchQuality(text: string, lower: string): number {
  const idx = text.indexOf(lower);
  if (idx < 0 || text.length === 0) return 0;
  const coverage = lower.length / text.length; // 1 = query covers the whole text
  const position = 1 - idx / text.length;      // 1 = match starts at the front
  return coverage * 1.4 + position * 0.5;
}

// ─── Multi-word query planning ────────────────────────────────────────────────

// Match-strength ladder for multi-word queries, progressively relaxed: the full
// phrase is strongest; then "every meaningful word matched somewhere"; then a
// contiguous chunk of the words; weakest is a single-word fallback. Strength
// sorts BELOW the title bucket but ABOVE the numeric score, so at equal title
// rank a stronger attempt always outranks a weaker fallback.
export const MATCH_STRENGTH = {
  phrase: 0,
  allWords: 1,
  chunk: 2,
  word: 3,
} as const;

// Tiny glue words carry no signal on their own — they only count as part of the
// full phrase (or inside a chunk), never as standalone word attempts.
const STOPWORDS = new Set([
  "a", "an", "and", "the", "of", "to", "in", "for", "on", "at", "by", "or", "with",
]);

// Degenerate-input guards: a 100-char query of dozens of words must not explode
// the attempt matrix. 8 tokens yield at most 27 chunk windows; we keep the
// largest windows (most specific) up to the cap.
const MAX_QUERY_TOKENS = 8;
const MAX_QUERY_CHUNKS = 12;

export interface QueryPlan {
  phrase: string;   // the whole lowercased query — always attempted first
  tokens: string[]; // meaningful words (deduped, stopwords/1-char dropped); empty for single-word queries
  chunks: string[]; // contiguous multi-word windows, largest first; only for 3+ tokens
}

/** Decompose a lowercased query into its progressive-relaxation attempts. */
export function planQuery(lower: string): QueryPlan {
  const tokens: string[] = [];
  for (const tok of lower.split(/\s+/)) {
    if (tok.length < 2 || STOPWORDS.has(tok) || tokens.includes(tok)) continue;
    tokens.push(tok);
    if (tokens.length >= MAX_QUERY_TOKENS) break;
  }
  // A single-word query has nothing to relax — the phrase attempt IS the query.
  if (tokens.length === 1 && tokens[0] === lower) tokens.length = 0;

  const chunks: string[] = [];
  for (let size = tokens.length - 1; size >= 2 && chunks.length < MAX_QUERY_CHUNKS; size--) {
    for (let i = 0; i + size <= tokens.length && chunks.length < MAX_QUERY_CHUNKS; i++) {
      chunks.push(tokens.slice(i, i + size).join(" "));
    }
  }
  return { phrase: lower, tokens, chunks };
}

// Title matches rank in a bucket ABOVE the entire point ladder: titleRank 0–3
// (exact / starts / word-starts / contains) always sorts before NO_TITLE_MATCH,
// regardless of numeric score. Fuzzy title matches stay in the non-title bucket —
// they're a typo-tolerance fallback, not a real title hit.
export const NO_TITLE_MATCH = 4;

// Inclusion floor for the result set. Every non-title field match scores above
// this (the lowest tier, product-details, is 10), so nothing that matches is
// suppressed — including when an exact title match exists.
export const MIN_RESULT_SCORE = 5;

// Core field scorer. Product-level fields (title, category, tags, …) come from
// the entry; the colour signal is the single colour name passed in, so the same
// engine scores one variant (its own colour) or a variant-less product ("").
// fuzzyMinLen keeps typo-tolerance conservative per attempt type: 3 for the
// full phrase (historic behaviour), 2 for word attempts (user-tuned), Infinity
// to skip fuzzy entirely for multi-word chunks.
function scoreFields(
  entry: SearchCatalogEntry,
  colorName: string,
  lower: string,
  sku = "",
  fuzzyMinLen = 3,
): { score: number; field: string; titleRank: number } {
  const t = entry.title.toLowerCase();
  // SKU is as strong an identifier as the title — a shopper pasting/typing a
  // SKU (variant SKU when scoring one colourway, else the base SKU) should
  // surface that exact product at the top, tied into the title's titleRank
  // bucket so it isn't outranked by an unrelated tag/category hit. Contains
  // is scored the same as starts-with (90) since a partial SKU is still a
  // near-exact, low-noise signal — unlike a partial title/tag substring.
  const skuLower = (sku || entry.base_sku || "").toLowerCase();
  let best: { score: number; field: string; titleRank: number } | null = null;
  const consider = (cand: { score: number; field: string; titleRank: number }) => {
    if (!best || cand.titleRank < best.titleRank || (cand.titleRank === best.titleRank && cand.score > best.score)) best = cand;
  };

  if (t === lower) consider({ score: FIELD_SCORES["title:exact"], field: "title", titleRank: 0 });
  else if (t.startsWith(lower)) consider({ score: FIELD_SCORES["title:starts"] + matchQuality(t, lower), field: "title", titleRank: 1 });
  else if (t.split(/\s+/).some(w => w !== lower && w.startsWith(lower)))
    consider({ score: FIELD_SCORES["title:word-starts"] + matchQuality(t, lower), field: "title", titleRank: 2 });
  else if (t.includes(lower)) consider({ score: FIELD_SCORES["title:contains"] + matchQuality(t, lower), field: "title", titleRank: 3 });

  if (skuLower) {
    if (skuLower === lower) consider({ score: FIELD_SCORES["title:exact"], field: "sku", titleRank: 0 });
    else if (skuLower.startsWith(lower)) consider({ score: FIELD_SCORES["title:starts"] + matchQuality(skuLower, lower), field: "sku", titleRank: 1 });
    else if (skuLower.includes(lower)) consider({ score: FIELD_SCORES["title:starts"] + matchQuality(skuLower, lower), field: "sku", titleRank: 3 });
  }

  if (best) return best;

  const cat = entry.category.toLowerCase();
  if (cat.startsWith(lower)) return { score: FIELD_SCORES["category:starts"] + matchQuality(cat, lower), field: "category", titleRank: NO_TITLE_MATCH };
  if (cat.includes(lower)) return { score: FIELD_SCORES["category"] + matchQuality(cat, lower), field: "category", titleRank: NO_TITLE_MATCH };

  // Tags/badges: scan ALL entries for the best-scoring match (an early
  // weak "contains" must not shadow a later, stronger "starts-with").
  let bestTag = 0;
  for (const tag of entry.tags) {
    const tl = tag.toLowerCase();
    if (tl.startsWith(lower)) bestTag = Math.max(bestTag, FIELD_SCORES["tag:starts"] + matchQuality(tl, lower));
    else if (tl.includes(lower)) bestTag = Math.max(bestTag, FIELD_SCORES["tag"] + matchQuality(tl, lower));
  }
  if (bestTag > 0) return { score: bestTag, field: "tag", titleRank: NO_TITLE_MATCH };

  const occ = entry.occasion.toLowerCase();
  if (occ.startsWith(lower)) return { score: FIELD_SCORES["occasion:starts"] + matchQuality(occ, lower), field: "occasion", titleRank: NO_TITLE_MATCH };
  if (occ.includes(lower)) return { score: FIELD_SCORES["occasion"] + matchQuality(occ, lower), field: "occasion", titleRank: NO_TITLE_MATCH };

  let bestBadge = 0;
  for (const badge of entry.badges) {
    const bl = badge.toLowerCase();
    if (bl.startsWith(lower)) bestBadge = Math.max(bestBadge, FIELD_SCORES["badge:starts"] + matchQuality(bl, lower));
    else if (bl.includes(lower)) bestBadge = Math.max(bestBadge, FIELD_SCORES["badge"] + matchQuality(bl, lower));
  }
  if (bestBadge > 0) return { score: bestBadge, field: "badge", titleRank: NO_TITLE_MATCH };

  const fab = entry.fabric.toLowerCase();
  if (fab.startsWith(lower)) return { score: FIELD_SCORES["fabric:starts"] + matchQuality(fab, lower), field: "fabric", titleRank: NO_TITLE_MATCH };
  if (fab.includes(lower)) return { score: FIELD_SCORES["fabric"] + matchQuality(fab, lower), field: "fabric", titleRank: NO_TITLE_MATCH };

  // Colour — same tier as fabric, scored against THIS variant's colour only.
  const cl = colorName.toLowerCase();
  if (cl) {
    if (cl.startsWith(lower)) return { score: FIELD_SCORES["color:starts"] + matchQuality(cl, lower), field: "color", titleRank: NO_TITLE_MATCH };
    if (cl.includes(lower)) return { score: FIELD_SCORES["color"] + matchQuality(cl, lower), field: "color", titleRank: NO_TITLE_MATCH };
  }

  const fit = entry.fit.toLowerCase();
  if (fit.startsWith(lower)) return { score: FIELD_SCORES["fit:starts"] + matchQuality(fit, lower), field: "fit", titleRank: NO_TITLE_MATCH };
  if (fit.includes(lower)) return { score: FIELD_SCORES["fit"] + matchQuality(fit, lower), field: "fit", titleRank: NO_TITLE_MATCH };

  if (entry.gender.toLowerCase().includes(lower))
    return { score: FIELD_SCORES["gender"] + matchQuality(entry.gender.toLowerCase(), lower), field: "gender", titleRank: NO_TITLE_MATCH };

  if (lower.length >= fuzzyMinLen && fuzzyMatchesTitle(entry.title, lower))
    return { score: FIELD_SCORES["fuzzy"], field: "fuzzy", titleRank: NO_TITLE_MATCH };

  // Weakest signal: a flat 10 points if the query only shows up in the
  // product's description bullet points, nowhere else.
  if (entry.details.toLowerCase().includes(lower))
    return { score: FIELD_SCORES["details"], field: "details", titleRank: NO_TITLE_MATCH };

  return { score: 0, field: "", titleRank: NO_TITLE_MATCH };
}

/** A candidate's best composite match across every attempted phrase/word. */
export interface RankedMatch {
  score: number;      // best score across cleared attempts
  field: string;      // field of the best-scoring attempt
  titleRank: number;  // best (lowest) title rank across cleared attempts
  strength: number;   // strongest (lowest) MATCH_STRENGTH across cleared attempts
  colorHit: string;   // the attempted string that matched a colour, "" if none
}

// Composite precedence shared by every consumer: title bucket, then match
// strength, then the point ladder.
function compareMatch(
  a: { titleRank: number; strength: number; score: number },
  b: { titleRank: number; strength: number; score: number },
): number {
  return a.titleRank - b.titleRank || a.strength - b.strength || b.score - a.score;
}

/**
 * Progressive relaxation: try the full phrase, then all-words AND, then
 * contiguous chunks, then individual words. The candidate keeps a composite of
 * the best facts it earned across every attempt that cleared the inclusion
 * floor — strongest bucket, best title rank, best score — so a product that
 * matches all words never ranks below one matching a single word at the same
 * title rank, and a query like "vansh product" still returns the per-word
 * matches instead of an empty result set.
 */
function scoreCandidate(
  entry: SearchCatalogEntry,
  colorName: string,
  plan: QueryPlan,
  sku = "",
): RankedMatch {
  const phrase = scoreFields(entry, colorName, plan.phrase, sku);
  const phraseMatch: RankedMatch = {
    ...phrase,
    strength: MATCH_STRENGTH.phrase,
    colorHit: phrase.field === "color" ? plan.phrase : "",
  };
  if (plan.tokens.length === 0) return phraseMatch; // single-word query: nothing to relax

  const cleared: RankedMatch[] = [];
  if (phraseMatch.score > MIN_RESULT_SCORE) cleared.push(phraseMatch);

  // Per-word results power both the all-words AND attempt and the word fallback.
  const wordResults = plan.tokens.map((tok) => ({ tok, ...scoreFields(entry, colorName, tok, sku, 2) }));
  const clearedWords = wordResults.filter((r) => r.score > MIN_RESULT_SCORE);

  if (clearedWords.length === plan.tokens.length) {
    let top = clearedWords[0]!;
    let total = 0;
    let worstRank = 0;
    for (const r of clearedWords) {
      total += r.score;
      worstRank = Math.max(worstRank, r.titleRank);
      if (r.score > top.score) top = r;
    }
    cleared.push({
      score: total / clearedWords.length,
      field: top.field,
      titleRank: worstRank, // title bucket only when EVERY word hits the title
      strength: MATCH_STRENGTH.allWords,
      colorHit: clearedWords.find((r) => r.field === "color")?.tok ?? "",
    });
  }

  for (const chunk of plan.chunks) {
    const r = scoreFields(entry, colorName, chunk, sku, Number.POSITIVE_INFINITY);
    if (r.score > MIN_RESULT_SCORE)
      cleared.push({ ...r, strength: MATCH_STRENGTH.chunk, colorHit: r.field === "color" ? chunk : "" });
  }

  // With exactly one meaningful word, matching it means matching ALL words —
  // the AND bucket above already holds it; no weaker fallback exists.
  if (plan.tokens.length > 1) {
    for (const r of clearedWords)
      cleared.push({
        score: r.score,
        field: r.field,
        titleRank: r.titleRank,
        strength: MATCH_STRENGTH.word,
        colorHit: r.field === "color" ? r.tok : "",
      });
  }

  if (cleared.length === 0) return phraseMatch; // no attempt matched — callers filter on the floor

  // Fold: strongest bucket + best title rank + best score, wherever each was
  // earned. colorHit keeps the first (strongest-attempt) colour association.
  const out = { ...cleared[0]! };
  for (let i = 1; i < cleared.length; i++) {
    const c = cleared[i]!;
    if (c.score > out.score) { out.score = c.score; out.field = c.field; }
    if (c.titleRank < out.titleRank) out.titleRank = c.titleRank;
    if (c.strength < out.strength) out.strength = c.strength;
    if (!out.colorHit && c.colorHit) out.colorHit = c.colorHit;
  }
  return out;
}

/** Score ONE colour variant: product-level fields + its own colour name. */
export function scoreVariant(
  entry: SearchCatalogEntry,
  v: SearchCatalogVariant,
  lower: string,
  plan: QueryPlan = planQuery(lower),
): RankedMatch {
  return scoreCandidate(entry, v.colorName, plan, v.sku);
}

/**
 * Product-level score = the best of its variants by title bucket → match
 * strength → score (colour is the only per-variant signal). Used where results
 * are one-per-product (the suggestions dropdown); the full results page ranks
 * each variant individually via scoreVariant.
 */
export function scoreEntry(
  entry: SearchCatalogEntry,
  lower: string,
  plan: QueryPlan = planQuery(lower),
): RankedMatch {
  if (entry.variants.length === 0) return scoreCandidate(entry, "", plan);
  let best = scoreCandidate(entry, entry.variants[0]!.colorName, plan, entry.variants[0]!.sku);
  for (let i = 1; i < entry.variants.length; i++) {
    const s = scoreCandidate(entry, entry.variants[i]!.colorName, plan, entry.variants[i]!.sku);
    if (s.score <= MIN_RESULT_SCORE) continue;
    if (best.score <= MIN_RESULT_SCORE || compareMatch(s, best) < 0) best = s;
  }
  return best;
}

// A colour match surfaces only the colourway(s) that actually matched — a
// "maroon" search must not render the blue and green cards of the same
// product. Every other match type keeps flattening to all colour variants.
// `matched` is the attempted string that hit the colour (the full phrase for
// single-word queries, an individual word for multi-word fallbacks).
export function matchingVariants(
  entry: SearchCatalogEntry,
  field: string,
  matched: string,
): SearchCatalogVariant[] {
  if (field !== "color") return entry.variants;
  return entry.variants.filter((v) => v.colorName.toLowerCase().includes(matched));
}

// In-stock variant count; a variant-less product renders one always-in-stock card.
function stockBreadth(entry: SearchCatalogEntry): number {
  if (entry.variants.length === 0) return 1;
  return entry.variants.filter((v) => v.inStock).length;
}

/**
 * Shared ranking comparator for suggestions and full search results:
 *   1. title-match bucket + subtype (titleRank 0–3 before NO_TITLE_MATCH)
 *   2. match-strength bucket (phrase → all-words → chunk → single-word)
 *   3. point-ladder score (descending) within the bucket
 *   4. broader stock availability first
 *   5. alphabetical title
 */
export function compareRanked(
  a: { entry: SearchCatalogEntry; score: number; titleRank: number; strength: number },
  b: { entry: SearchCatalogEntry; score: number; titleRank: number; strength: number },
): number {
  return (
    a.titleRank - b.titleRank ||
    a.strength - b.strength ||
    b.score - a.score ||
    stockBreadth(b.entry) - stockBreadth(a.entry) ||
    a.entry.title.localeCompare(b.entry.title)
  );
}

// ─── fetchSuggestions ─────────────────────────────────────────────────────────

/**
 * Returns up to 8 suggestions (metadata + products) for a search query.
 * Metadata covers categories, occasions, tags, badges, fabrics, and fits.
 * Uses an in-memory catalog so no DB round-trip is needed on cache-warm requests.
 */
export async function fetchSuggestions(q: string, log: OpLogger): Promise<SuggestionRow[]> {
  const lower = q.toLowerCase();
  const plan = planQuery(lower);
  const catalog = await loadSearchCatalog(log);

  // "all" / "everything" etc. — suggest the whole catalog (dropdown caps at 8;
  // pressing Enter routes to the results page, which returns every product).
  if (isShowAllQuery(lower)) {
    const rows: SuggestionRow[] = [...catalog]
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 8)
      .map((entry) => ({
        type: "product" as const,
        id: entry.id,
        label: entry.title,
        sublabel: entry.category,
        image: entry.image,
        slug: entry.slug,
        categorySlug: entry.category_slug,
        sku: entry.base_sku,
      }));
    log.step(`Suggestions - "${q}" is a show-all query, returning ${rows.length} products`);
    return rows;
  }

  // Score every product in the catalog.
  const scored: Array<{ entry: SearchCatalogEntry } & RankedMatch> = [];
  for (const entry of catalog) {
    const m = scoreEntry(entry, lower, plan);
    if (m.score > MIN_RESULT_SCORE) scored.push({ entry, ...m });
  }
  scored.sort(compareRanked);
  log.step(`Scoring - ${scored.length}/${catalog.length} products matched`);

  // ─── Collect unique metadata suggestions from all matched products ──────────
  const metaRows = new Map<string, SuggestionRow>();
  const metaScores = new Map<string, number>();

  function upsertMeta(key: string, row: SuggestionRow, score: number) {
    const prev = metaScores.get(key);
    if (prev === undefined || prev < score) { metaRows.set(key, row); metaScores.set(key, score); }
  }

  // Chips match the full phrase first, then each meaningful word, so a
  // multi-word query like "maroon kurta" still surfaces the Maroon colour chip
  // AND the Kurta category chip. upsertMeta keeps the best score per chip;
  // phrase-derived scores win ties because they're attempted first.
  const chipQueries = [lower, ...plan.tokens];
  function chipScore(text: string, startsScore: number, containsScore: number): number {
    let best = 0;
    for (const cq of chipQueries) {
      if (!text.includes(cq)) continue;
      best = Math.max(best, (text.startsWith(cq) ? startsScore : containsScore) + matchQuality(text, cq));
    }
    return best;
  }

  for (const { entry } of scored) {
    const cat = entry.category.toLowerCase();
    const catScore = chipScore(cat, FIELD_SCORES["category:starts"], FIELD_SCORES["category"]);
    if (catScore > 0) {
      upsertMeta(`category:${entry.category_slug}`, { type: "category", id: `category:${entry.category_slug}`, label: entry.category, sublabel: "Category", image: "", slug: "", categorySlug: entry.category_slug, sku: "" }, catScore);
    }

    if (entry.occasion) {
      const occ = entry.occasion.toLowerCase();
      const s = chipScore(occ, FIELD_SCORES["occasion:starts"], FIELD_SCORES["occasion"]);
      if (s > 0) {
        upsertMeta(`occasion:${occ}`, { type: "occasion", id: `occasion:${occ}`, label: entry.occasion, sublabel: "Occasion", image: "", slug: "", categorySlug: "", sku: "" }, s);
      }
    }

    for (const tag of entry.tags) {
      const tl = tag.toLowerCase();
      const s = chipScore(tl, FIELD_SCORES["tag:starts"], FIELD_SCORES["tag"]);
      if (s > 0) {
        upsertMeta(`tag:${tl}`, { type: "tag", id: `tag:${tl}`, label: tag, sublabel: "Tag", image: "", slug: "", categorySlug: "", sku: "" }, s);
      }
    }

    for (const badge of entry.badges) {
      const bl = badge.toLowerCase();
      const s = chipScore(bl, FIELD_SCORES["badge:starts"], FIELD_SCORES["badge"]);
      if (s > 0) {
        upsertMeta(`badge:${bl}`, { type: "badge", id: `badge:${bl}`, label: badge, sublabel: "Badge", image: "", slug: "", categorySlug: "", sku: "" }, s);
      }
    }

    if (entry.fabric) {
      const fab = entry.fabric.toLowerCase();
      const s = chipScore(fab, FIELD_SCORES["fabric:starts"], FIELD_SCORES["fabric"]);
      if (s > 0) {
        upsertMeta(`fabric:${fab}`, { type: "fabric", id: `fabric:${fab}`, label: entry.fabric, sublabel: "Material", image: "", slug: "", categorySlug: "", sku: "" }, s);
      }
    }

    for (const v of entry.variants) {
      if (!v.colorName) continue;
      const cl = v.colorName.toLowerCase();
      const s = chipScore(cl, FIELD_SCORES["color:starts"], FIELD_SCORES["color"]);
      if (s > 0) {
        upsertMeta(`color:${cl}`, { type: "color", id: `color:${cl}`, label: v.colorName, sublabel: "Colour", image: "", slug: "", categorySlug: "", sku: "" }, s);
      }
    }

    if (entry.fit) {
      const fitl = entry.fit.toLowerCase();
      const s = chipScore(fitl, FIELD_SCORES["fit:starts"], FIELD_SCORES["fit"]);
      if (s > 0) {
        upsertMeta(`fit:${fitl}`, { type: "fit", id: `fit:${fitl}`, label: entry.fit, sublabel: "Fit", image: "", slug: "", categorySlug: "", sku: "" }, s);
      }
    }
  }

  // ─── Curated lexicon suggestions — independent of the live catalog ──────────
  // These let the search box suggest terms ("Kurti", "Diwali", "Cotton", "Red")
  // even when no matching products are currently in stock. Phrase first, then
  // each meaningful word; mergeMeta below dedupes by label, higher score wins.
  const lexiconMatches = chipQueries.flatMap((cq) => matchLexicon(cq, 10));
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
        type: m.entry.type,
        id: `lex:${m.entry.type}:${m.entry.term.toLowerCase()}`,
        label: m.entry.term,
        sublabel: m.entry.sublabel,
        image: "",
        slug: "",
        categorySlug: "",
        sku: "",
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
  // A colour match points at the matched colourway (variant image + sku, which
  // the PDP resolves) instead of the base product's primary colour — colorHit
  // carries the string that hit the colour even when a multi-word query's best
  // field was something else (e.g. "maroon kurta" matching title via "kurta").
  const productSuggestions: SuggestionRow[] = scored.slice(0, 8).map(({ entry, colorHit }) => {
    const matched = colorHit ? matchingVariants(entry, "color", colorHit)[0] : undefined;
    return {
      type: "product" as const,
      id: entry.id,
      label: entry.title,
      sublabel: entry.category,
      image: matched?.image || entry.image,
      slug: entry.slug,
      categorySlug: entry.category_slug,
      sku: matched?.sku || entry.base_sku,
    };
  });

  log.step(`Suggestions - ${metaSuggestions.length} metadata + ${productSuggestions.length} products`);
  return [...metaSuggestions, ...productSuggestions];
}

// ─── searchProducts (full results page) ───────────────────────────────────────

export interface SearchProductRow {
  id: string;
  title: string;
  slug: string;
  sku: string;
  category: string;
  categorySlug: string;
  price: number;
  originalPrice: number;
  image: string;
  badges: string[];
  color: { name: string; hex: string };
  inStock: boolean;
}

/**
 * Returns every matching variant card ranked highest-relevance first — the
 * data behind the full search results page. Same field-scoring engine as
 * fetchSuggestions, but scored and ranked PER VARIANT and uncapped (the
 * suggestions dropdown shows the top 8 products; the results page shows all
 * matching colourways).
 */
/** Exact-match trigger phrases that mean "show me the whole catalog" rather than a real search term. */
const ALL_PRODUCTS_QUERIES = new Set([
  "all",
  "all products",
  "everything",
  "show all",
  "show everything",
  "show me everything",
  "show me all",
  "all items",
  "everything else",
]);

function isShowAllQuery(lower: string): boolean {
  return ALL_PRODUCTS_QUERIES.has(lower.trim());
}

/** Product+variant → SearchProductRow expansion, unscored (show-all queries). */
function expandVariantRows(catalog: SearchCatalogEntry[]): SearchProductRow[] {
  const rows: SearchProductRow[] = [];
  for (const entry of catalog) {
    const base = {
      id: entry.id,
      title: entry.title,
      slug: entry.slug,
      category: entry.category,
      categorySlug: entry.category_slug,
      price: entry.price,
      originalPrice: entry.original_price,
      badges: entry.badges,
    };
    if (entry.variants.length === 0) {
      rows.push({ ...base, sku: entry.base_sku, image: entry.image, color: { name: "", hex: "#cccccc" }, inStock: true });
      continue;
    }
    for (const v of entry.variants) {
      rows.push({ ...base, sku: v.sku, image: v.image, color: { name: v.colorName, hex: v.colorHex }, inStock: v.inStock });
    }
  }
  return rows;
}

export async function searchProducts(q: string, log: OpLogger): Promise<SearchProductRow[]> {
  const lower = q.toLowerCase();
  const catalog = await loadSearchCatalog(log);

  if (isShowAllQuery(lower)) {
    const rows = expandVariantRows(catalog).sort(
      (a, b) => Number(b.inStock) - Number(a.inStock) || a.title.localeCompare(b.title),
    );
    log.step(`Search - "${q}" is a show-all query, returning full catalog (${rows.length} rows)`);
    return rows;
  }

  const rows = rankVariantRows(catalog, lower);
  log.step(`Search - ${rows.length} variant cards matched "${q}" across ${catalog.length} products`);
  return rows;
}

// ─── fetchNewArrivals (new-arrivals page) ─────────────────────────────────────

export interface NewArrivalRow extends SearchProductRow {
  createdAt: string;
  occasion: string;
  isTrending: boolean;
}

/**
 * One listing card per product, built from its primary variant's sku/image —
 * the same convention Spotlight placards use.
 */
function toListingRow(entry: SearchCatalogEntry): NewArrivalRow {
  const primary = entry.variants[0];
  return {
    id: entry.id,
    title: entry.title,
    slug: entry.slug,
    sku: primary?.sku ?? entry.base_sku,
    category: entry.category,
    categorySlug: entry.category_slug,
    price: entry.price,
    originalPrice: entry.original_price,
    image: primary?.image || entry.image,
    badges: entry.badges,
    color: primary
      ? { name: primary.colorName, hex: primary.colorHex }
      : { name: "", hex: "#cccccc" },
    inStock: entry.variants.length === 0 ? true : entry.variants.some((v) => v.inStock),
    createdAt: entry.created_at,
    occasion: entry.occasion,
    isTrending: entry.is_trending ?? false,
  };
}

/** Newest first — the ordering every listing defaults to. */
const byNewest = (a: SearchCatalogEntry, b: SearchCatalogEntry) =>
  a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;

/**
 * Newest published products first — one card per product. Served from the same
 * in-memory search catalog, so it inherits its 10-min TTL + invalidation.
 */
export async function fetchNewArrivals(
  limit: number,
  log: OpLogger,
  gender?: string,
  trendingOnly?: boolean,
): Promise<NewArrivalRow[]> {
  const catalog = await loadSearchCatalog(log);

  let pool = [...catalog];
  if (gender) {
    const want = gender.toLowerCase();
    pool = pool.filter((entry) => {
      const g = entry.gender.trim().toLowerCase();
      // Unisex / empty / unrecognized values show on both gendered pages;
      // only an explicit opposite-gender tag excludes a product.
      return g === want || (g !== "girls" && g !== "boys");
    });
  }
  if (trendingOnly) pool = pool.filter((entry) => entry.is_trending);

  const rows: NewArrivalRow[] = pool.sort(byNewest).slice(0, limit).map(toListingRow);

  log.step(`New arrivals - ${rows.length} products (limit=${limit}${gender ? `, gender=${gender}` : ""}${trendingOnly ? ", trending" : ""}) from ${catalog.length} in catalog`);
  return rows;
}

// ─── fetchCategoryProducts (category listing pages) ──────────────────────────

export interface CategoryListing {
  /** Every published product in the category, before the page limit is applied. */
  total: number;
  rows: NewArrivalRow[];
}

/**
 * Every published product filed under one category (`category_slug`), newest
 * first. Categories are the product taxonomy — each product carries exactly one
 * — which is why this is its own listing rather than a filter on the collection
 * strips: a category page is a permanent browse, not a curated or derived view.
 *
 * `total` is the un-capped size of the category so the page can label itself
 * honestly ("42 styles") even when it only renders the first `limit` cards.
 * Read off the same in-memory catalog the rest of the storefront uses, so it
 * costs no extra DB round trip and stays in step with search and the PDP.
 */
export async function fetchCategoryProducts(
  categorySlug: string,
  limit: number,
  log: OpLogger,
): Promise<CategoryListing> {
  const catalog = await loadSearchCatalog(log);
  const want = categorySlug.trim().toLowerCase();

  const pool = catalog.filter((entry) => entry.category_slug.trim().toLowerCase() === want);
  const rows = pool.sort(byNewest).slice(0, limit).map(toListingRow);

  log.step(`Category "${want}" - ${rows.length} of ${pool.length} products returned (limit=${limit}) from ${catalog.length} in catalog`);
  return { total: pool.length, rows };
}

// ─── fetchCollectionCounts (Collections page placards/tiles) ─────────────────

export interface CollectionCounts {
  newArrivals: number;
  girls: number;
  boys: number;
  trending: number;
  occasion: number;
}

/** Every distinct wear type (product category) each collection actually holds. */
export interface CollectionWearTypes {
  newArrivals: string[];
  girls: string[];
  boys: string[];
  trending: string[];
  occasion: string[];
}

/**
 * Counts stay flat at the top level so the payload keeps its original shape;
 * wearTypes rides alongside as its own object. An older frontend simply ignores
 * the extra key.
 */
export interface CollectionFacets extends CollectionCounts {
  wearTypes: CollectionWearTypes;
}

/**
 * The distinct wear types in a bucket, most common first (alphabetical on a tie),
 * so a placard leads with what the collection is mostly made of and a lone
 * odd-one-out still gets named, just last. Compared case-insensitively but
 * returned in the catalog's own casing.
 */
function wearTypesOf(entries: SearchCatalogEntry[]): string[] {
  const seen = new Map<string, { label: string; n: number }>();
  for (const e of entries) {
    const label = (e.category ?? "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const hit = seen.get(key);
    if (hit) hit.n += 1;
    else seen.set(key, { label, n: 1 });
  }
  return [...seen.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .map((v) => v.label);
}

/**
 * How many published styles sit behind each storefront collection, and which wear
 * types they span. Both are read off the same in-memory catalog the listings
 * themselves use, so a placard's number and its wear-type list always agree with
 * the page it links to, and it costs no extra DB round trip.
 *
 * Filters mirror the listing pages exactly: gender uses fetchNewArrivals' rule
 * (unisex/untagged shows on BOTH gendered pages, only an explicit opposite tag
 * excludes), and occasion counts products actually tagged for one — blank and
 * "General wear" fold into the catalog tail there, so they aren't occasion
 * styles. Note these are un-capped totals; the listings themselves fetch at
 * most 48, so a catalog past that will show more here than the page renders.
 *
 * Because the buckets are built from the WHOLE catalog rather than the handful of
 * preview products the strip fetches, a collection holding a single product of
 * some other wear type still lists that type.
 */
export async function fetchCollectionCounts(log: OpLogger): Promise<CollectionFacets> {
  const catalog = await loadSearchCatalog(log);

  const matchesGender = (entry: SearchCatalogEntry, want: "girls" | "boys") => {
    const g = entry.gender.trim().toLowerCase();
    return g === want || (g !== "girls" && g !== "boys");
  };

  // Bucket once, then derive both the count and the wear types from each — the
  // two can never drift out of step the way two separate filter passes could.
  const buckets = {
    newArrivals: catalog,
    girls: catalog.filter((e) => matchesGender(e, "girls")),
    boys: catalog.filter((e) => matchesGender(e, "boys")),
    trending: catalog.filter((e) => e.is_trending === true),
    occasion: catalog.filter((e) => {
      // First occasion only — same convention the occasions page buckets by.
      const o = ((e.occasion ?? "").split(",")[0] ?? "").trim().toLowerCase();
      return o !== "" && o !== "general wear";
    }),
  };

  const facets: CollectionFacets = {
    newArrivals: buckets.newArrivals.length,
    girls: buckets.girls.length,
    boys: buckets.boys.length,
    trending: buckets.trending.length,
    occasion: buckets.occasion.length,
    wearTypes: {
      newArrivals: wearTypesOf(buckets.newArrivals),
      girls: wearTypesOf(buckets.girls),
      boys: wearTypesOf(buckets.boys),
      trending: wearTypesOf(buckets.trending),
      occasion: wearTypesOf(buckets.occasion),
    },
  };

  log.step(`Collection counts - all=${facets.newArrivals} girls=${facets.girls} boys=${facets.boys} trending=${facets.trending} occasion=${facets.occasion}`);
  log.step(`Collection wear types - all=[${facets.wearTypes.newArrivals.join(", ")}] girls=[${facets.wearTypes.girls.join(", ")}] boys=[${facets.wearTypes.boys.join(", ")}] trending=[${facets.wearTypes.trending.join(", ")}] occasion=[${facets.wearTypes.occasion.join(", ")}]`);
  return facets;
}

/**
 * Per-VARIANT ranking for the full results page: every colour variant is
 * scored and sorted as its own card (product-level fields + its own colour),
 * so a "maroon" search ranks the maroon colourway on its colour match while
 * the blue colourway of the same product only ranks if it matches some other
 * way. Ties: title bucket → match strength → score → in-stock first →
 * alphabetical title.
 */
export function rankVariantRows(catalog: SearchCatalogEntry[], lower: string): SearchProductRow[] {
  const plan = planQuery(lower);
  const ranked: Array<{ row: SearchProductRow; score: number; titleRank: number; strength: number }> = [];
  for (const entry of catalog) {
    const base = {
      id: entry.id,
      title: entry.title,
      slug: entry.slug,
      category: entry.category,
      categorySlug: entry.category_slug,
      price: entry.price,
      originalPrice: entry.original_price,
      badges: entry.badges,
    };
    if (entry.variants.length === 0) {
      const { score, titleRank, strength } = scoreEntry(entry, lower, plan);
      if (score > MIN_RESULT_SCORE) {
        ranked.push({
          score,
          titleRank,
          strength,
          row: { ...base, sku: entry.base_sku, image: entry.image, color: { name: "", hex: "#cccccc" }, inStock: true },
        });
      }
      continue;
    }
    for (const v of entry.variants) {
      const { score, titleRank, strength } = scoreVariant(entry, v, lower, plan);
      if (score > MIN_RESULT_SCORE) {
        ranked.push({
          score,
          titleRank,
          strength,
          row: { ...base, sku: v.sku, image: v.image, color: { name: v.colorName, hex: v.colorHex }, inStock: v.inStock },
        });
      }
    }
  }
  // Stable sort keeps a product's equal-scoring colourways in catalog order.
  ranked.sort(
    (a, b) =>
      a.titleRank - b.titleRank ||
      a.strength - b.strength ||
      b.score - a.score ||
      Number(b.row.inStock) - Number(a.row.inStock) ||
      a.row.title.localeCompare(b.row.title),
  );
  return ranked.map((r) => r.row);
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
    .limit(1)
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
    .limit(1)
    .maybeSingle();
  if (pubErr) throw pubErr;
  log.step(`DB fetch - complete  ${fms(performance.now() - t0)}  found=${!!published}`);
  return published as PdpProductRow | null;
}

// Resolve a product by SKU — the real identifier now that slugs are non-unique
// (two products can share a slug; see migration 20260619_slug_not_unique.sql). The
// sku is either a product's base_sku or one of its variants' variant_sku, both of
// which ARE globally unique. We resolve to the product id first (a variant sku is the
// common PDP case), then fetch the full product by id so ALL its variants come back
// — not the join-filtered subset a single embedded filter would return.
export async function fetchProductBySku(
  sku: string,
  log: OpLogger,
): Promise<PdpProductRow | null> {
  const sb = requireAdmin();
  const t0 = performance.now();
  log.step(`DB resolve - product id by sku=${sku}`);

  let productId: string | null = null;

  const { data: variant, error: vErr } = await sb
    .from("product_variants")
    .select("product_id")
    .eq("variant_sku", sku)
    .maybeSingle();
  if (vErr) throw vErr;
  productId = (variant?.product_id as string | undefined) ?? null;

  if (!productId) {
    const { data: base, error: bErr } = await sb
      .from("products")
      .select("id")
      .eq("base_sku", sku)
      .maybeSingle();
    if (bErr) throw bErr;
    productId = (base?.id as string | undefined) ?? null;
  }

  if (!productId) {
    log.step(`DB resolve - no product for sku=${sku}  ${fms(performance.now() - t0)}`);
    return null;
  }

  const { data: published, error } = await sb
    .from("products")
    .select(PDP_PRODUCT_SELECT)
    .eq("id", productId)
    .maybeSingle();
  if (error) throw error;
  log.step(`DB fetch - product by sku complete  ${fms(performance.now() - t0)}  found=${!!published}`);

  const row = published as PdpProductRow | null;

  // The PDP always shows a size guide: products with no linked chart (or whose
  // chart was deleted — FK is ON DELETE SET NULL) fall back to the default
  // chart. Failure here (e.g. size_charts table missing) never breaks the PDP —
  // the product just ships without a chart and the button stays hidden.
  if (row && !row.size_charts) {
    const { data: defChart, error: chartErr } = await sb
      .from("size_charts")
      .select("id, name, rows")
      .eq("is_default", true)
      .maybeSingle();
    if (chartErr) {
      log.step(`Size chart fallback - unavailable (${chartErr.message})`);
    } else if (defChart) {
      row.size_charts = defChart as { id: string; name: string; rows: unknown[] };
      log.step(`Size chart fallback - attached default chart "${defChart.name}"`);
    }
  }

  return row;
}

export async function fetchRecommendedProducts(
  slug: string,
  categorySlug: string,
  log: OpLogger,
  anchorHint?: { gender?: string | undefined; price?: number | undefined },
) {
  const sb = requireAdmin();

  const REC_SELECT = `
    title, slug, category_slug, price, original_price, base_sku, tags, badges, gender, sizes, is_unlimited,
    is_featured, is_new_arrival, is_trending, is_bestseller,
    product_images(image_url, is_primary),
    product_variants(variant_sku, stock, is_unlimited, sort_order)
  `;

  // Anchor product's gender + price drive ranking for BOTH the same-category
  // results and the cross-category padding, so recommendations stay gender- and
  // price-consistent with the product being viewed.
  //
  // The PDP passes these in (it already has the product loaded), letting us skip
  // the lookup. We only hit the DB when the hint is absent (e.g. a direct API call).
  let anchorGender = anchorHint?.gender ?? null;
  let anchorPrice = typeof anchorHint?.price === "number" ? anchorHint.price : null;
  if (anchorGender === null || anchorPrice === null) {
    log.step(`DB fetch - anchor gender/price  slug=${slug}  (no hint supplied)`);
    const { data: anchor } = await sb
      .from("products")
      .select("gender, price")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();
    if (anchorGender === null) anchorGender = anchor?.gender ?? null;
    if (anchorPrice === null) anchorPrice = Number(anchor?.price) || 0;
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

  const list = (recommended || []).slice().sort(rankByGenderThenPrice).slice(0, 5);

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
  productSlug: string;
  // Variant SKU this review is for ('' = legacy product-level review). Lets the
  // PDP show the current variant's reviews first, then the other variants'.
  sku: string;
  rating: number;
  date: string;
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
  id, user_name, product_slug, sku, rating, comment, verified, images, created_at
`;

// "2026-06-02T..." → "2 Jun 2026" (matches the date style the PDP renders).
const REVIEW_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${REVIEW_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Fetch all reviews for a product — identified by its full set of variant SKUs
 * (base + every colour) rather than its slug, since slugs aren't unique and a
 * sku uniquely pins down the product — and aggregate them into the ReviewsData
 * shape the PDP consumes. Aggregation (average, 5→1 distribution) is computed in
 * JS — the per-product review count is small, mirroring how recommendations are
 * mapped in-process rather than via SQL aggregates.
 *
 * A product with no reviews returns a valid empty payload (totalReviews: 0),
 * NOT an error — the PDP renders a "no reviews yet" state for that case.
 */
export async function fetchReviewsDataBySkus(
  skus: string[],
  log: OpLogger,
): Promise<ReviewsData> {
  const sb = requireAdmin();

  log.step(`DB fetch - reviews  skus=${skus.join(",")}`);
  const t1 = performance.now();
  const { data, error } = await sb
    .from("product_reviews")
    .select(REVIEWS_SELECT)
    .in("sku", skus)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data || [];
  log.step(`DB fetch - reviews complete  ${fms(performance.now() - t1)}  count=${rows.length}`);

  const totalReviews = rows.length;
  const ratingSum = rows.reduce((acc: number, r) => acc + (Number(r.rating) || 0), 0);
  const averageRating = totalReviews > 0 ? Math.round((ratingSum / totalReviews) * 10) / 10 : 0;

  // 5★ → 1★, always present even when count is 0 (the PDP renders a bar per row).
  const counts = new Map<number, number>([[5, 0], [4, 0], [3, 0], [2, 0], [1, 0]]);
  for (const r of rows) {
    const stars = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 0)));
    counts.set(stars, (counts.get(stars) ?? 0) + 1);
  }
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: counts.get(stars) ?? 0 }));

  const reviews: ReviewItem[] = rows.map((r) => {
    const item: ReviewItem = {
      id: String(r.id),
      user: r.user_name,
      productSlug: r.product_slug || "",
      sku: r.sku || "",
      rating: Number(r.rating) || 0,
      date: formatReviewDate(r.created_at),
      comment: r.comment || "",
      verified: !!r.verified,
    };
    // `images` is optional on ReviewItem — only attach it when present, rather
    // than assigning `undefined` (which exactOptionalPropertyTypes rejects).
    if (Array.isArray(r.images) && r.images.length > 0) item.images = r.images as string[];
    return item;
  });

  return { averageRating, totalReviews, distribution, reviews };
}
