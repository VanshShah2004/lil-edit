import { Router, type Request, type Response } from "express";
import {
  fetchAllProducts,
  fetchFilteredProducts,
  fetchThinProductList,
  fetchProductDetailBySku,
  isSupabaseCatalogConfigured,
  launchProductToDatabase,
  saveDraftToDatabase,
  deleteProductFromDatabase,
  fetchProductBySku,
  fetchRecommendedProducts,
  fetchReviewsDataBySkus,
  fetchSuggestions,
  searchProducts,
  invalidateSearchCatalog,
  type SuggestionRow,
  type SearchProductRow,
} from "../lib/persistCatalog.js";
import type { ProductRow, ImageRow } from "../lib/catalogRowTypes.js";
import {
  redisGet,
  redisSet,
  redisDel,
  redisKey,
  PRODUCT_TTL_S,
  REC_TTL_S,
  REVIEWS_TTL_S,
  CATALOG_LIST_TTL_S,
  CATALOG_DETAIL_TTL_S,
  SUGGESTION_TTL_S,
} from "../lib/redis.js";
import { createLog, type OpLogger } from "../lib/logger.js";
import { invalidateAllCurationSections } from "./curation.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { logActivity, optionalUserId } from "../lib/activityLog.js";
import { logAdminAction } from "../lib/adminAudit.js";

// ─── In-process L1 cache (PDP detail only) ───────────────────────────────────
const DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const DETAIL_CACHE_MAX    = 30;
interface CacheEntry { payload: object; expiresAt: number; }
const detailCache = new Map<string, CacheEntry>();

function getL1(key: string): object | null {
  const entry = detailCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { detailCache.delete(key); return null; }
  // Move to end so it is treated as most recently used
  detailCache.delete(key);
  detailCache.set(key, entry);
  return entry.payload;
}
function setL1(key: string, payload: object, log: OpLogger) {
  if (detailCache.size >= DETAIL_CACHE_MAX) {
    const evicted = detailCache.keys().next().value as string;
    detailCache.delete(evicted);
    log.step(`L1 cache - EVICT (LRU)  evicted=${evicted}  size=${detailCache.size}/${DETAIL_CACHE_MAX}`);
  }
  detailCache.set(key, { payload, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
  log.step(`L1 cache - SET  key=${key}  size=${detailCache.size}/${DETAIL_CACHE_MAX}`);
}

export async function invalidateDetailCache(slug: string, skus: string[], log: OpLogger): Promise<void> {
  // PDP detail caches are keyed by SKU (a product is resolved by sku now that slugs are
  // non-unique); the recommendation cache is still keyed by slug. Bust every sku the
  // product is reachable by — its base_sku plus each variant_sku.
  for (const s of skus) detailCache.delete(s);
  await redisDel(log, redisKey("rec", slug), ...skus.map((s) => redisKey("pdp", s)));
}

// ─── Catalog Redis key helpers ────────────────────────────────────────────────
function catalogListKey(status: string, limit: number | undefined): string {
  return redisKey("catalog-list", `${status}:${limit ?? "ALL"}`);
}

function catalogDetailKey(baseSku: string): string {
  return redisKey("catalog-detail", baseSku);
}

const CATALOG_LIST_ALL_KEYS = (["ALL", "PUBLISHED", "DRAFT"] as const).flatMap((s) =>
  [10 as number | undefined, undefined].map((l) => catalogListKey(s, l))
);

async function invalidateCatalogCaches(log: OpLogger, baseSku?: string): Promise<void> {
  const keys = baseSku
    ? [...CATALOG_LIST_ALL_KEYS, catalogDetailKey(baseSku)]
    : CATALOG_LIST_ALL_KEYS;
  log.step(`Invalidate - catalog caches  keys=${keys.length}${baseSku ? `  sku=${baseSku}` : ""}`);
  await redisDel(log, ...keys);
}

// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

// ─── POST /upload-url — issue a signed Supabase Storage upload URL ────────────
router.post("/upload-url", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  if (!supabaseAdmin) {
    res.status(503).json({ error: "Supabase service role not configured" });
    return;
  }

  const { path } = req.body as { path?: string };
  if (!path || typeof path !== "string") {
    res.status(400).json({ error: "path is required" });
    return;
  }

  // Allowlist: products/{sku}/{context}/{uuid}.jpg — no path traversal possible
  if (!/^products\/[\w-]+\/[\w-]+\/[\w-]+\.jpg$/.test(path)) {
    res.status(400).json({ error: "Invalid path format" });
    return;
  }

  const { data, error } = await supabaseAdmin.storage
    .from("product-images")
    .createSignedUploadUrl(path);

  if (error || !data) {
    res.status(500).json({ error: error?.message ?? "Failed to create signed URL" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const publicUrl   = `${supabaseUrl}/storage/v1/object/public/product-images/${path}`;

  res.json({ signedUrl: data.signedUrl, publicUrl });
});

// ─── Legacy full-detail list ──────────────────────────────────────────────────
// Returns published AND drafts — admin-only (consumed by the EditProduct admin
// page). Gated so unpublished products are never served to anon/non-admin callers.
router.get("/", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const log = createLog().start("PRODUCT LIST");
  try {
    const status    = req.query.status as "ALL" | "PUBLISHED" | "DRAFT" | undefined;
    const limitQuery = req.query.limit as string | undefined;
    const limit     = limitQuery ? parseInt(limitQuery, 10) : undefined;
    log.step(`status=${status ?? "ALL"}  limit=${limit ?? "ALL"}`);

    if (status) {
      const data = await fetchFilteredProducts(status, limit, log);
      log.success(`returned published=${data.published.length}  drafts=${data.drafts.length}`);
      log.end("PRODUCT LIST");
      res.json({
        published: data.published,
        drafts: data.drafts,
        totalCount: data.totalCount,
        hasMore: data.hasMore,
      });
    } else {
      const data = await fetchAllProducts(log);
      log.success(`returned published=${data.published.length}  drafts=${data.drafts.length}`);
      log.end("PRODUCT LIST");
      res.json({
        published: data.published,
        drafts: data.drafts,
        totalCount: data.published.length + data.drafts.length,
        hasMore: false,
      });
    }
  } catch (err) {
    log.error("failed", err).end("PRODUCT LIST");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── DB → frontend shape mappers ─────────────────────────────────────────────
function mapDatabaseProductToFrontend(dbProduct: ProductRow, isDraft: boolean) {
  const images: ImageRow[] = (isDraft ? (dbProduct.draft_product_images || []) : (dbProduct.product_images || []))
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const variants = (isDraft ? (dbProduct.draft_product_variants || []) : (dbProduct.product_variants || []))
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const mappedImages = images.map((img) => ({
    id: String(img.id),
    url: img.image_url,
    isPrimary: !!img.is_primary,
    sortOrder: img.sort_order,
  }));

  const globalImages = mappedImages.filter((img) => {
    const dbImg = images.find((i) => i.id === img.id);
    return !dbImg || !dbImg.variant_id;
  });

  const colors = variants.map((v) => {
    const variantImages = mappedImages.filter((img) => {
      const dbImg = images.find((i) => i.id === img.id);
      return dbImg && dbImg.variant_id === v.id;
    });
    return {
      name: v.color_name,
      hex: v.color_hex || "#cccccc",
      sku: v.variant_sku,
      stock: v.stock,
      isUnlimited: !!v.is_unlimited,
      images: variantImages,
    };
  });

  return {
    title: dbProduct.title,
    slug: dbProduct.slug,
    categorySlug: dbProduct.category_slug,
    brand: dbProduct.brand,
    sku: dbProduct.base_sku,
    category: dbProduct.category,
    gender: dbProduct.gender,
    price: dbProduct.price,
    originalPrice: dbProduct.original_price || dbProduct.price,
    tags: dbProduct.tags || [],
    badges: dbProduct.badges || [],
    descriptionPoints: dbProduct.description_points || [],
    fabric: dbProduct.fabric || "",
    fit: dbProduct.fit || "",
    occasion: dbProduct.occasion || "",
    care_instructions: dbProduct.care_instructions || "",
    sizes: dbProduct.sizes || [],
    images: globalImages.length > 0 ? globalImages : mappedImages,
    colors,
    featured: !!dbProduct.is_featured,
    newArrival: !!dbProduct.is_new_arrival,
    bestseller: !!dbProduct.is_bestseller,
    trending: !!dbProduct.is_trending,
    isUnlimited: !!dbProduct.is_unlimited,
  };
}

function mapDatabaseToRecommended(dbProd: ProductRow) {
  const images    = dbProd.product_images || [];
  const primaryImg = images.find((img) => img.is_primary)?.image_url || images[0]?.image_url || "";
  return {
    title: dbProd.title,
    slug: dbProd.slug,
    categorySlug: dbProd.category_slug,
    price: dbProd.price,
    originalPrice: dbProd.original_price || dbProd.price,
    image: primaryImg,
    sku: dbProd.base_sku,
    tags: dbProd.tags || [],
    // Custom badges plus the merchandising flags rendered as labels — same composition
    // the cart and wishlist endpoints use, so the sidebar shows "New Arrival" etc.
    badges: [
      ...(dbProd.badges ?? []),
      ...(dbProd.is_featured    ? ["Featured"]    : []),
      ...(dbProd.is_new_arrival ? ["New Arrival"] : []),
      ...(dbProd.is_trending    ? ["Trending"]    : []),
      ...(dbProd.is_bestseller  ? ["Bestseller"]  : []),
    ] as string[],
  };
}

// ─── GET /api/products/detail — PDP critical path ────────────────────────────
router.get("/detail", async (req: Request, res: Response) => {
  const log   = createLog().start("PDP DETAIL");
  const slug  = req.query.slug     as string;
  const sku   = req.query.sku      as string;
  const category = req.query.category as string;

  if (!slug || !sku) {
    log.warn("Missing slug or sku").end("PDP DETAIL");
    res.status(400).json({ error: "Slug and SKU parameters are required." });
    return;
  }

  log.step(`slug=${slug}  sku=${sku}  category=${category || "any"}`);

  // Slugs are non-unique (two products can share a title → slug), so the SKU is the
  // resolver and the PDP caches are keyed by SKU, not slug.
  log.step("L1 cache - checking");
  const l1Hit = getL1(sku);
  if (l1Hit) {
    log.success("L1 cache - HIT  served from memory").end("PDP DETAIL");
    res.json(l1Hit);
    return;
  }
  log.step("L1 cache - MISS");

  // L2 Redis cache
  const l2Hit = await redisGet<object>(redisKey("pdp", sku), log);
  if (l2Hit) {
    setL1(sku, l2Hit, log);
    log.step("L1 cache - warmed from Redis");
    log.success("L2 Redis - HIT  served from Redis").end("PDP DETAIL");
    res.json(l2Hit);
    return;
  }

  try {
    const product = await fetchProductBySku(sku, log);

    if (!product) {
      log.warn(`product not found  sku=${sku}`).end("PDP DETAIL");
      res.status(404).json({ error: "Product not found." });
      return;
    }

    // Canonical-URL validation: the product resolved by sku must match the slug (and
    // category, when supplied) in the URL. A stale slug (e.g. after a title edit) → 404,
    // exactly as before. Because resolution is by sku, this never rejects a correct
    // slug+sku pair — and the "SKU belongs to product" check is now implicit.
    log.step("Validate - slug match");
    if (product.slug !== slug) {
      log.warn(`slug mismatch  expected=${slug}  got=${product.slug}`).end("PDP DETAIL");
      res.status(404).json({ error: "Slug mismatch." });
      return;
    }

    if (category) {
      log.step("Validate - category match");
      if (product.category_slug !== category) {
        log.warn(`category mismatch  expected=${category}  got=${product.category_slug}`).end("PDP DETAIL");
        res.status(404).json({ error: "Category mismatch." });
        return;
      }
    }

    const mappedProduct  = mapDatabaseProductToFrontend(product, false);
    const responsePayload = { product: mappedProduct };

    setL1(sku, responsePayload, log);
    void redisSet(redisKey("pdp", sku), responsePayload, PRODUCT_TTL_S, log);

    log.success(`served from DB  slug=${slug}  sku=${sku}`).end("PDP DETAIL");
    res.json(responsePayload);
  } catch (err) {
    log.error("unhandled error", err).end("PDP DETAIL");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── GET /api/products/reviews — lazy-loaded reviews ─────────────────────────
router.get("/reviews", async (req: Request, res: Response) => {
  const log     = createLog().start("PDP REVIEWS");
  const skusRaw = req.query.skus as string;
  const skus    = skusRaw ? skusRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  if (skus.length === 0) {
    log.warn("Missing skus").end("PDP REVIEWS");
    res.status(400).json({ error: "skus parameter is required." });
    return;
  }

  const cacheKey = skus.slice().sort().join(",");
  log.step(`skus=${cacheKey}`);

  try {
    const cached = await redisGet<{ reviewsData: object }>(redisKey("reviews", cacheKey), log);
    if (cached) {
      log.success("L2 Redis - HIT  served from cache").end("PDP REVIEWS");
      res.json(cached);
      return;
    }

    const reviewsData = await fetchReviewsDataBySkus(skus, log);
    const payload      = { reviewsData };

    void redisSet(redisKey("reviews", cacheKey), payload, REVIEWS_TTL_S, log);

    log.success(`${reviewsData.totalReviews} reviews returned  avg=${reviewsData.averageRating}`).end("PDP REVIEWS");
    res.json(payload);
  } catch (err) {
    log.error("failed", err);
    res.status(200).json({ reviewsData: null, error: "Failed to load reviews" });
    log.end("PDP REVIEWS");
  }
});

// ─── GET /api/products/recommendations — lazy-loaded recommendations ──────────
router.get("/recommendations", async (req: Request, res: Response) => {
  const log      = createLog().start("PDP RECOMMENDATIONS");
  const slug     = req.query.slug     as string;
  const category = req.query.category as string;
  // Anchor gender + price passed by the PDP (it already has them) so the backend
  // skips the anchor DB lookup. Both optional — the function falls back if absent.
  const gender   = (req.query.gender as string) || undefined;
  const priceRaw = req.query.price as string | undefined;
  const price    = priceRaw !== undefined && priceRaw !== "" && !Number.isNaN(Number(priceRaw))
    ? Number(priceRaw)
    : undefined;

  if (!slug) {
    log.warn("Missing slug").end("PDP RECOMMENDATIONS");
    res.status(400).json({ error: "slug parameter is required." });
    return;
  }

  log.step(`slug=${slug}  category=${category || "any"}  gender=${gender ?? "?"}  price=${price ?? "?"}`);

  try {
    const cachedRec = await redisGet<{ recommended: object[] }>(redisKey("rec", slug), log);
    if (cachedRec) {
      log.success("L2 Redis - HIT  served from cache").end("PDP RECOMMENDATIONS");
      res.json(cachedRec);
      return;
    }

    const recommendedList  = await fetchRecommendedProducts(slug, category || "", log, { gender, price });
    const mappedRecommended = (recommendedList || []).map(mapDatabaseToRecommended);
    const recPayload        = { recommended: mappedRecommended };

    void redisSet(redisKey("rec", slug), recPayload, REC_TTL_S, log);

    log.success(`${mappedRecommended.length} recommendations returned`).end("PDP RECOMMENDATIONS");
    res.json(recPayload);
  } catch (err) {
    log.error("failed — returning empty recommendations", err);
    res.status(200).json({ recommended: [], error: "Failed to load recommendations" });
    log.end("PDP RECOMMENDATIONS");
  }
});

// ─── POST /api/products/preview — draft save or product launch ────────────────
router.post("/preview", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { status, ...data } = req.body as { status: string; [key: string]: unknown };
  const normalized: "DRAFT" | "PUBLISHED" = status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  const sku  = String(data.sku  ?? "UNKNOWN");
  const name = String(data.name ?? "Untitled");
  const slug = String(data.slug ?? "");
  const adminId = (req as AuthenticatedRequest).userId;

  const opName = normalized === "DRAFT" ? "DRAFT SAVE" : "PRODUCT LAUNCH";
  const log    = createLog().start(opName);
  log.step(`sku=${sku}  name="${name}"  slug=${slug}`);

  const previewPath = "/api/products/preview";
  // Echo the submitted product back in the response, built per-request — no shared
  // module-level state, so concurrent admins never see each other's payloads.
  const payload     = { status: normalized, receivedAt: new Date().toISOString(), ...data };

  let database:
    | { ok: true; draftProductId?: string; publishedProductId?: string }
    | { ok: false; skipped: true; reason: string }
    | { ok: false; error: string };

  if (isSupabaseCatalogConfigured()) {
    try {
      if (normalized === "DRAFT") {
        const { draftProductId } = await saveDraftToDatabase(data, log);
        void invalidateCatalogCaches(log, sku);
        database = { ok: true, draftProductId };
        log.success(`draft saved  draftId=${draftProductId}`);
        void logAdminAction({
          adminId,
          action: "product_draft_saved",
          targetType: "product",
          targetId: sku,
          summary: `Saved draft for "${name}" (${sku})`,
          metadata: { slug, draftProductId },
        });
      } else {
        const { publishedProductId } = await launchProductToDatabase(data, log);
        // PDP caches are keyed by sku — bust the base_sku plus every variant (colour) sku.
        const variantSkus = Array.isArray((data as { selectedColors?: Array<{ sku?: unknown }> }).selectedColors)
          ? (data as { selectedColors: Array<{ sku?: unknown }> }).selectedColors.map((c) => String(c.sku ?? "")).filter(Boolean)
          : [];
        void invalidateDetailCache(slug, [sku, ...variantSkus], log);
        void invalidateCatalogCaches(log, sku);
        invalidateSearchCatalog();
        log.step("Search catalog - invalidated (product launched)");
        void invalidateAllCurationSections(log);
        log.step("Curation sections - invalidated (product launched)");
        database = { ok: true, publishedProductId };
        log.success(`product launched  publishedId=${publishedProductId}`);
        void logAdminAction({
          adminId,
          action: "product_launched",
          targetType: "product",
          targetId: sku,
          summary: `Launched product "${name}" (${sku})`,
          metadata: { slug, publishedProductId },
        });
      }
    } catch (err) {
      log.error("persistence failed", err).end(opName);
      database = { ok: false, error: err instanceof Error ? err.message : String(err) };
      res.status(500).json({ ok: false, status: normalized, previewPath, payload, database });
      return;
    }
  } else {
    log.warn("Supabase not configured — persistence skipped");
    database = {
      ok: false,
      skipped: true,
      reason: "Set SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_SERVICE_KEY) in backend/.env to persist drafts and launches.",
    };
  }

  log.end(opName);
  res.json({ ok: true, status: normalized, previewPath, payload, database });
});

// ─── GET /api/products/catalog-list — thin initial list ──────────────────────
// Can include drafts (status=DRAFT, or the default ALL) — admin-only (consumed by
// the ManageProducts admin page). Middleware runs before the Redis read.
router.get("/catalog-list", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const log    = createLog().start("CATALOG LIST");
  const status = (req.query.status as "ALL" | "PUBLISHED" | "DRAFT" | undefined) ?? "ALL";
  const limitQuery = req.query.limit as string | undefined;
  const limit  = limitQuery ? parseInt(limitQuery, 10) : undefined;
  const rKey   = catalogListKey(status, limit);

  log.step(`status=${status}  limit=${limit ?? "ALL"}  key=${rKey}`);

  try {
    const cached = await redisGet<object>(rKey, log);
    if (cached) {
      log.success("L2 Redis - HIT  served from cache").end("CATALOG LIST");
      res.setHeader("X-Cache", "HIT");
      res.json(cached);
      return;
    }

    const result = await fetchThinProductList(status, limit, log);
    void redisSet(rKey, result, CATALOG_LIST_TTL_S, log);

    log.end("CATALOG LIST");
    res.setHeader("X-Cache", "MISS");
    res.json(result);
  } catch (err) {
    log.error("failed", err).end("CATALOG LIST");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── GET /api/products/catalog-detail — full detail per SKU (lazy) ────────────
// Returns the draft object for a SKU — admin-only (consumed by ManageProducts).
// Without this gate, drafts were enumerable by walking the predictable SKU space.
router.get("/catalog-detail", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const sku = req.query.sku as string;
  if (!sku) {
    res.status(400).json({ error: "sku parameter is required." });
    return;
  }

  const log  = createLog().start("CATALOG DETAIL");
  const rKey = catalogDetailKey(sku);
  log.step(`sku=${sku}  key=${rKey}`);

  try {
    const cached = await redisGet<object>(rKey, log);
    if (cached) {
      log.success("L2 Redis - HIT  served from cache").end("CATALOG DETAIL");
      res.setHeader("X-Cache", "HIT");
      res.json(cached);
      return;
    }

    const { published, draft } = await fetchProductDetailBySku(sku, log);
    const payload = {
      published: published ? { ...published, status: "PUBLISHED" } : null,
      draft:     draft     ? { ...draft,      status: "DRAFT"      } : null,
    };

    void redisSet(rKey, payload, CATALOG_DETAIL_TTL_S, log);

    log.success(`served from DB  published=${!!published}  draft=${!!draft}`).end("CATALOG DETAIL");
    res.setHeader("X-Cache", "MISS");
    res.json(payload);
  } catch (err) {
    log.error("failed", err).end("CATALOG DETAIL");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── GET /api/products/suggestions — search auto-complete ────────────────────
router.get("/suggestions", async (req: Request, res: Response) => {
  const log = createLog().start("SEARCH SUGGESTIONS");
  const raw = (req.query.q as string | undefined) ?? "";
  const q   = raw.trim();

  if (q.length < 1 || q.length > 100) {
    log.step(`q.length=${q.length} — skipped`).end("SEARCH SUGGESTIONS");
    res.json({ suggestions: [] });
    return;
  }

  const cacheKey = redisKey("suggestions", q.toLowerCase());

  try {
    const cached = await redisGet<{ suggestions: SuggestionRow[] }>(cacheKey, log);
    if (cached) {
      log.success("L2 Redis - HIT  served from cache").end("SEARCH SUGGESTIONS");
      res.json(cached);
      return;
    }

    const suggestions = await fetchSuggestions(q, log);
    const payload = { suggestions };
    void redisSet(cacheKey, payload, SUGGESTION_TTL_S, log);

    log.success(`${suggestions.length} suggestions returned`).end("SEARCH SUGGESTIONS");
    res.json(payload);
  } catch (err) {
    log.error("failed — returning empty suggestions", err);
    res.status(200).json({ suggestions: [] });
    log.end("SEARCH SUGGESTIONS");
  }
});

// ─── GET /api/products/search — full search results page ─────────────────────
router.get("/search", async (req: Request, res: Response) => {
  const log = createLog().start("SEARCH RESULTS");
  const raw = (req.query.q as string | undefined) ?? "";
  const q   = raw.trim();

  if (q.length < 1 || q.length > 100) {
    log.step(`q.length=${q.length} — skipped`).end("SEARCH RESULTS");
    res.json({ query: q, count: 0, products: [] });
    return;
  }

  const cacheKey = redisKey("search", q.toLowerCase());

  // Record the search in the admin activity feed. Fire-and-forget (the token decode
  // + insert must not add latency to the response) and best-effort (never throws).
  // Runs on both the cache-hit and DB paths so every real search is captured.
  const logSearch = (resultCount: number) => {
    void (async () => {
      const userId = await optionalUserId(req);
      await logActivity({ type: "search", userId, metadata: { query: q, result_count: resultCount } });
    })();
  };

  try {
    const cached = await redisGet<{ query: string; count: number; products: SearchProductRow[] }>(cacheKey, log);
    if (cached) {
      log.success("L2 Redis - HIT  served from cache").end("SEARCH RESULTS");
      logSearch(cached.count);
      res.json(cached);
      return;
    }

    const products = await searchProducts(q, log);
    const payload = { query: q, count: products.length, products };
    void redisSet(cacheKey, payload, SUGGESTION_TTL_S, log);

    log.success(`${products.length} results returned for "${q}"`).end("SEARCH RESULTS");
    logSearch(products.length);
    res.json(payload);
  } catch (err) {
    log.error("failed — returning empty results", err);
    res.status(200).json({ query: q, count: 0, products: [] });
    log.end("SEARCH RESULTS");
  }
});

// ─── DELETE /api/products/:id ─────────────────────────────────────────────────
router.delete("/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const id      = req.params.id as string;
  const status  = req.query.status   as string;
  const baseSku = req.query.base_sku as string | undefined;
  const adminId = (req as AuthenticatedRequest).userId;

  if (status !== "DRAFT" && status !== "PUBLISHED") {
    res.status(400).json({ error: "Invalid or missing status query parameter. Must be DRAFT or PUBLISHED." });
    return;
  }

  if (!isSupabaseCatalogConfigured()) {
    res.status(503).json({ error: "Supabase is not configured." });
    return;
  }

  const log = createLog().start("PRODUCT DELETE");
  log.step(`id=${id}  status=${status}  sku=${baseSku ?? "unknown"}`);

  try {
    await deleteProductFromDatabase(id, status as "DRAFT" | "PUBLISHED", log);
    void invalidateCatalogCaches(log, baseSku);
    if (status === "PUBLISHED") {
      invalidateSearchCatalog();
      log.step("Search catalog - invalidated (published product deleted)");
      void invalidateAllCurationSections(log);
      log.step("Curation sections - invalidated (published product deleted)");
    }
    log.success(`deleted  id=${id}  status=${status}`).end("PRODUCT DELETE");
    void logAdminAction({
      adminId,
      action: "product_deleted",
      targetType: "product",
      targetId: baseSku ?? id,
      summary: `Deleted ${status.toLowerCase()} product ${baseSku ?? id}`,
      metadata: { productId: id, status, baseSku: baseSku ?? null },
    });
    res.json({ success: true, message: `Successfully deleted ${status} product ${id}.` });
  } catch (err) {
    log.error("delete failed", err).end("PRODUCT DELETE");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
