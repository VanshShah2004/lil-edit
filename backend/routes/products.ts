import { performance } from "perf_hooks";
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
  fetchProductBySlug,
  fetchProductTitleBySlug,
  fetchRecommendedProducts,
  type RecommendedTimingCallbacks
} from "../lib/persistCatalog.js";
import { PdpTimer } from "../lib/pdpPerfLogger.js";
import {
  redisGet,
  redisSet,
  redisDel,
  redisKey,
  PRODUCT_TTL_S,
  REC_TTL_S,
  CATALOG_LIST_TTL_S,
  CATALOG_DETAIL_TTL_S,
} from "../lib/redis.js";

const IS_DEV = process.env.NODE_ENV !== "production";

// ─── In-process L1 cache (warm between requests on same dyno) ───────────────
// Redis is L2. On a cache miss we check Redis first, then Supabase.
const DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
interface CacheEntry { payload: object; expiresAt: number; }
const detailCache = new Map<string, CacheEntry>();

function getL1(key: string): object | null {
  const entry = detailCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { detailCache.delete(key); return null; }
  return entry.payload;
}
function setL1(key: string, payload: object) {
  detailCache.set(key, { payload, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
}

// Bust both L1 and Redis on publish/update
export async function invalidateDetailCache(slug: string): Promise<void> {
  detailCache.delete(slug);
  await redisDel(redisKey("pdp", slug), redisKey("rec", slug));
}

// ─── Catalog Redis key helpers ────────────────────────────────────────────────
function catalogListKey(status: string, limit: number | undefined): string {
  return redisKey("catalog-list", `${status}:${limit ?? "ALL"}`);
}

function catalogDetailKey(baseSku: string): string {
  return redisKey("catalog-detail", baseSku);
}

/** All possible catalog-list cache permutations (3 statuses × 2 page sizes). */
const CATALOG_LIST_ALL_KEYS = (["ALL", "PUBLISHED", "DRAFT"] as const).flatMap(s =>
  [10 as number | undefined, undefined].map(l => catalogListKey(s, l))
);

/** Bust catalog Redis caches after any mutation (launch or delete). */
async function invalidateCatalogCaches(baseSku?: string): Promise<void> {
  const keys = baseSku
    ? [...CATALOG_LIST_ALL_KEYS, catalogDetailKey(baseSku)]
    : CATALOG_LIST_ALL_KEYS;
  await redisDel(...keys);
  if (IS_DEV) {
    console.log(`[Redis] INVALIDATE catalog list (${CATALOG_LIST_ALL_KEYS.length} keys)${baseSku ? ` + detail sku=${baseSku}` : ""}`);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const status = req.query.status as "ALL" | "PUBLISHED" | "DRAFT" | undefined;
    const limitQuery = req.query.limit as string | undefined;
    const limit = limitQuery ? parseInt(limitQuery, 10) : undefined;

    if (status) {
      const data = await fetchFilteredProducts(status, limit);
      res.json({
        published: data.published,
        drafts: data.drafts,
        products: {
          published: data.published,
          drafts: data.drafts
        },
        totalCount: data.totalCount,
        total: data.totalCount,
        hasMore: data.hasMore
      });
    } else {
      // Default fallback (backward compatible with no query parameters)
      const data = await fetchAllProducts();
      res.json({
        published: data.published,
        drafts: data.drafts,
        products: {
          published: data.published,
          drafts: data.drafts
        },
        totalCount: data.published.length + data.drafts.length,
        total: data.published.length + data.drafts.length,
        hasMore: false
      });
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Mock reviews payload — served from /api/products/reviews, not the PDP critical path. */
function buildMockReviewsData(productTitle: string) {
  return {
    averageRating: 4.8,
    totalReviews: 124,
    distribution: [
      { stars: 5, count: 98 },
      { stars: 4, count: 18 },
      { stars: 3, count: 5 },
      { stars: 2, count: 2 },
      { stars: 1, count: 1 },
    ],
    reviews: [
      {
        id: "rev-1",
        user: "Priya S.",
        rating: 5,
        date: "12 Oct 2023",
        title: `Absolutely gorgeous ${productTitle}!`,
        comment:
          "Highly recommend this! The fabric is so premium and my daughter loved it. Worth every rupee!",
        verified: true,
      },
      {
        id: "rev-2",
        user: "Neha Verma",
        rating: 4,
        date: "05 Nov 2023",
        title: "Beautiful style and rich look",
        comment:
          "Precisely as shown in the pictures. The fit was a tiny bit loose but we managed perfectly. Very elegant.",
        verified: true,
      },
      {
        id: "rev-3",
        user: "Anjali K.",
        rating: 5,
        date: "28 Nov 2023",
        title: "Perfect purchase",
        comment:
          "Excellent craftsmanship. The material is soft and highly comfortable for kids. Five stars!",
        verified: true,
      },
    ],
  };
}

// Helper to map DB catalog schema to frontend Product schema (no reviews — lazy-loaded separately)
function mapDatabaseProductToFrontend(dbProduct: any, isDraft: boolean) {
  const images = (isDraft ? (dbProduct.draft_product_images || []) : (dbProduct.product_images || []))
    .slice()
    .sort((a: { sort_order?: number }, b: { sort_order?: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const variants = (isDraft ? (dbProduct.draft_product_variants || []) : (dbProduct.product_variants || []))
    .slice()
    .sort((a: { sort_order?: number }, b: { sort_order?: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const mappedImages = images.map((img: any) => ({
    id: String(img.id),
    url: img.image_url,
    isPrimary: !!img.is_primary,
    sortOrder: img.sort_order
  }));

  const globalImages = mappedImages.filter((img: any) => {
    const dbImg = images.find((i: any) => i.id === img.id);
    return !dbImg || !dbImg.variant_id;
  });

  const colors = variants.map((v: any) => {
    const variantImages = mappedImages.filter((img: any) => {
      const dbImg = images.find((i: any) => i.id === img.id);
      return dbImg && dbImg.variant_id === v.id;
    });

    return {
      name: v.color_name,
      hex: v.color_hex || "#cccccc",
      sku: v.variant_sku,
      stock: v.stock,
      isUnlimited: !!v.is_unlimited,
      images: variantImages
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
    care: dbProduct.care_instructions || "",
    sizes: dbProduct.sizes || [],
    images: globalImages.length > 0 ? globalImages : mappedImages,
    colors: colors,
    featured: !!dbProduct.is_featured,
    newArrival: !!dbProduct.is_new_arrival,
    bestseller: !!dbProduct.is_bestseller,
    trending: !!dbProduct.is_trending,
    isUnlimited: !!dbProduct.is_unlimited,
  };
}

// Helper to map DB catalog schema to recommended items format
function mapDatabaseToRecommended(dbProd: any) {
  const images = dbProd.product_images || [];
  const primaryImg = images.find((img: any) => img.is_primary)?.image_url || images[0]?.image_url || "";
  
  return {
    title: dbProd.title,
    slug: dbProd.slug,
    categorySlug: dbProd.category_slug,
    price: dbProd.price,
    originalPrice: dbProd.original_price || dbProd.price,
    image: primaryImg,
    sku: dbProd.base_sku,
    tags: dbProd.tags || []
  };
}

// GET /api/products/detail — Fetches catalog product by slug and variant SKU (no recommendations)
// ⚡ Critical path: Returns core product data immediately without waiting for recommendation queries
router.get("/detail", async (req: Request, res: Response) => {
  const slug = req.query.slug as string;
  const sku = req.query.sku as string;
  const category = req.query.category as string;

  if (!slug || !sku) {
    res.status(400).json({ error: "Slug and SKU parameters are required." });
    return;
  }

  // ── Start perf timer for this request ────────────────────────────────────
  const timer = new PdpTimer(slug);

  // ⚡ L1: in-process memory cache
  timer.start("cache_lookup");
  const l1Hit = getL1(slug);
  timer.end("cache_lookup");

  if (l1Hit) {
    timer.setCacheHit(true);
    timer.log();
    res.json(l1Hit);
    return;
  }

  // ⚡ L2: Redis cache
  timer.start("redis_lookup");
  const l2Hit = await redisGet<object>(redisKey("pdp", slug));
  timer.end("redis_lookup");

  if (l2Hit) {
    timer.setCacheHit(true);
    timer.setRedisHit(true);
    timer.log();
    setL1(slug, l2Hit); // warm L1 from Redis
    res.json(l2Hit);
    return;
  }

  try {
    // Fetch ONLY product — recommendations are lazy-loaded separately (non-blocking)
    timer.start("db_product");
    const product = await fetchProductBySlug(slug);
    timer.end("db_product");

    if (!product) {
      timer.log();
      res.status(404).json({ error: "Product not found." });
      return;
    }

    // Strict URL validation checks
    // 1. Slug matches
    if (product.slug !== slug) {
      timer.log();
      res.status(404).json({ error: "Slug mismatch." });
      return;
    }

    // 2. Category matches (if category is provided)
    if (category && product.category_slug !== category) {
      timer.log();
      res.status(404).json({ error: "Category mismatch." });
      return;
    }

    // 3. SKU belongs to the product (either base_sku or one of the variant_skus)
    const hasBaseSkuMatch = product.base_sku === sku;
    const hasVariantSkuMatch = product.product_variants?.some((v: any) => v.variant_sku === sku);

    if (!hasBaseSkuMatch && !hasVariantSkuMatch) {
      timer.log();
      res.status(404).json({ error: "SKU does not belong to this product." });
      return;
    }

    // Map product only — no recommendations in critical path
    const mappedProduct = mapDatabaseProductToFrontend(product, false);
    const responsePayload = { product: mappedProduct };

    // 💾 Store in L1 + L2
    setL1(slug, responsePayload);
    void redisSet(redisKey("pdp", slug), responsePayload, PRODUCT_TTL_S);

    // ── Emit perf report to server log before sending ─────────────────────
    timer.log();

    res.json(responsePayload);
  } catch (err) {
    timer.log();
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/products/reviews — Lazy-load customer reviews (non-blocking)
router.get("/reviews", async (req: Request, res: Response) => {
  const slug = req.query.slug as string;

  if (!slug) {
    res.status(400).json({ error: "slug parameter is required." });
    return;
  }

  try {
    const timer = new PdpTimer(`reviews:${slug}`);
    timer.start("db_reviews");
    const title = await fetchProductTitleBySlug(slug);
    timer.end("db_reviews");

    if (!title) {
      timer.log();
      res.status(404).json({ error: "Product not found." });
      return;
    }

    const reviewsData = buildMockReviewsData(title);
    timer.log();
    res.json({ reviewsData });
  } catch (err) {
    console.error(
      "[Reviews] Error fetching reviews:",
      err instanceof Error ? err.message : String(err)
    );
    res.status(200).json({ reviewsData: null, error: "Failed to load reviews" });
  }
});

// GET /api/products/recommendations — Lazy-load recommendations (non-blocking)
// ⚡ Separate from critical path: Can fail without breaking the PDP
router.get("/recommendations", async (req: Request, res: Response) => {
  const slug = req.query.slug as string;
  const category = req.query.category as string;

  if (!slug) {
    res.status(400).json({ error: "slug parameter is required." });
    return;
  }

  try {
    // ── Start perf timer for recommendations request ────────────────────
    const timer = new PdpTimer(`rec:${slug}`);

    // ⚡ Redis cache for recommendations (longer TTL — change less often)
    timer.start("redis_lookup");
    const cachedRec = await redisGet<{ recommended: object[] }>(redisKey("rec", slug));
    timer.end("redis_lookup");

    if (cachedRec) {
      timer.setCacheHit(true);
      timer.log();
      res.json(cachedRec);
      return;
    }

    timer.start("db_rec_category");
    const recTimingCallbacks: RecommendedTimingCallbacks = {
      onCategoryQueryDone: () => timer.end("db_rec_category"),
      onPadQueryDone:      () => timer.end("db_rec_pad"),
    };

    timer.start("db_recommendations");
    const recommendedList = await fetchRecommendedProducts(slug, category || "", recTimingCallbacks);
    timer.end("db_recommendations");

    const mappedRecommended = (recommendedList || []).map(mapDatabaseToRecommended);
    const recPayload = { recommended: mappedRecommended };

    void redisSet(redisKey("rec", slug), recPayload, REC_TTL_S);

    // ── Emit perf report to server log ──────────────────────────────────
    timer.log();

    res.json(recPayload);
  } catch (err) {
    // Graceful degradation: Return empty recommendations rather than failing the request
    console.error("[Recommendations] Error fetching recommendations:", err instanceof Error ? err.message : String(err));
    res.status(200).json({ recommended: [], error: "Failed to load recommendations" });
  }
});

interface StoredProduct {
  status: "DRAFT" | "PUBLISHED";
  receivedAt: string;
  data: Record<string, unknown>;
}

let lastProduct: StoredProduct | null = null;

function buildPublicPayload(): Record<string, unknown> | null {
  if (!lastProduct) return null;
  return { status: lastProduct.status, receivedAt: lastProduct.receivedAt, ...lastProduct.data };
}

// POST /api/products/preview — Curation Studio + optional Supabase persistence
router.post("/preview", async (req: Request, res: Response) => {
  const t0 = performance.now();
  const { status, ...data } = req.body as { status: string; [key: string]: unknown };

  const normalized: "DRAFT" | "PUBLISHED" = status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  const sku  = String(data.sku  ?? "UNKNOWN");
  const name = String(data.name ?? "Untitled");
  const slug = String(data.slug ?? "");

  lastProduct = {
    status: normalized,
    receivedAt: new Date().toISOString(),
    data,
  };

  if (IS_DEV) console.log(`[API] ${normalized} REQUEST RECEIVED → sku=${sku} name="${name}"`);

  const previewPath = "/api/products/preview";
  const payload = buildPublicPayload();

  let database:
    | { ok: true; draftProductId?: string; publishedProductId?: string }
    | { ok: false; skipped: true; reason: string }
    | { ok: false; error: string } = { ok: false, skipped: true, reason: "not_configured" };

  if (isSupabaseCatalogConfigured()) {
    try {
      if (normalized === "DRAFT") {
        if (IS_DEV) console.log(`[DB] DRAFT → saveDraftToDatabase sku=${sku}`);
        const { draftProductId } = await saveDraftToDatabase(data);
        void invalidateCatalogCaches(sku);
        if (IS_DEV) console.log(`[REDIS] DRAFT → INVALIDATE catalog-detail=${sku} catalog-list=all`);
        database = { ok: true, draftProductId };
        if (IS_DEV) console.log(`[API] DRAFT RESPONSE → ${Math.round(performance.now() - t0)}ms sku=${sku} draftId=${draftProductId}`);
      } else {
        if (IS_DEV) console.log(`[DB] LAUNCH → launchProductToDatabase sku=${sku}`);
        const { publishedProductId } = await launchProductToDatabase(data);
        // Bust PDP L1 + PDP Redis + catalog Redis so all caches reflect new state
        void invalidateDetailCache(slug);
        void invalidateCatalogCaches(sku);
        if (IS_DEV) console.log(`[REDIS] LAUNCH → INVALIDATE pdp=${slug} catalog-detail=${sku} catalog-list=all`);
        database = { ok: true, publishedProductId };
        if (IS_DEV) console.log(`[API] LAUNCH RESPONSE → ${Math.round(performance.now() - t0)}ms sku=${sku} publishedId=${publishedProductId}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[API] ${normalized} FAILED → ${Math.round(performance.now() - t0)}ms sku=${sku} error="${message}"`);
      database = { ok: false, error: message };
      res.status(500).json({
        ok: false,
        status: normalized,
        previewPath,
        payload,
        database,
      });
      return;
    }
  } else {
    database = {
      ok: false,
      skipped: true,
      reason:
        "Set SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_SERVICE_KEY) in backend/.env to persist drafts and launches.",
    };
    if (IS_DEV) console.log(`[API] ${normalized} SKIPPED → Supabase not configured`);
  }

  res.json({
    ok: true,
    status: lastProduct.status,
    previewPath,
    payload,
    database,
  });
});

router.get("/preview", (_req: Request, res: Response) => {
  const payload = buildPublicPayload();
  if (!payload) {
    res.json({
      message:
        "No product received yet. Use Save Draft or Launch Product in the Curation Studio first.",
    });
    return;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json(payload);
});

// GET /api/products/catalog-list — Thin initial list (scalars + primary image, no variants)
router.get("/catalog-list", async (req: Request, res: Response) => {
  const t0 = performance.now();
  try {
    const status = (req.query.status as "ALL" | "PUBLISHED" | "DRAFT" | undefined) ?? "ALL";
    const limitQuery = req.query.limit as string | undefined;
    const limit = limitQuery ? parseInt(limitQuery, 10) : undefined;
    const rKey = catalogListKey(status, limit);

    if (IS_DEV) console.log(`[API] LIST REQUEST RECEIVED → status=${status} limit=${limit ?? "ALL"}`);

    // ── L2: Redis cache ──────────────────────────────────────────────────────
    const cached = await redisGet<object>(rKey);
    if (cached) {
      if (IS_DEV) {
        console.log(`[REDIS] LIST → HIT key=${rKey}`);
        console.log(`[TRACE] LIST FLOW:\n  Redis → HIT\n  No DB query`);
        console.log(`[API] LIST RESPONSE → ${Math.round(performance.now() - t0)}ms (Redis hit)`);
      }
      res.setHeader("X-Cache", "HIT");
      res.json(cached);
      return;
    }
    if (IS_DEV) console.log(`[REDIS] LIST → MISS key=${rKey}`);
    // ────────────────────────────────────────────────────────────────────────

    const result = await fetchThinProductList(status, limit);

    // Store in Redis for cross-session reuse
    void redisSet(rKey, result, CATALOG_LIST_TTL_S);

    if (IS_DEV) {
      console.log(`[REDIS] LIST → STORED key=${rKey} TTL=${CATALOG_LIST_TTL_S}s`);
      console.log(`[TRACE] LIST FLOW:\n  Redis → MISS\n  DB → HIT\n  Response cached (TTL ${CATALOG_LIST_TTL_S}s)`);
      console.log(`[API] LIST RESPONSE → ${Math.round(performance.now() - t0)}ms rows=${result.products.length} hasMore=${result.hasMore}`);
    }

    res.setHeader("X-Cache", "MISS");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/products/catalog-detail?sku=<base_sku> — Full detail for one product (lazy)
router.get("/catalog-detail", async (req: Request, res: Response) => {
  const t0 = performance.now();
  const sku = req.query.sku as string;
  if (!sku) {
    res.status(400).json({ error: "sku parameter is required." });
    return;
  }

  const rKey = catalogDetailKey(sku);
  if (IS_DEV) console.log(`[API] DETAIL REQUEST RECEIVED → sku=${sku}`);

  try {
    // ── L2: Redis cache ──────────────────────────────────────────────────────
    const cached = await redisGet<object>(rKey);
    if (cached) {
      if (IS_DEV) {
        console.log(`[REDIS] DETAIL → HIT key=${rKey}`);
        console.log(`[TRACE] DETAIL FLOW:\n  Redis → HIT\n  No DB query`);
        console.log(`[API] DETAIL RESPONSE → ${Math.round(performance.now() - t0)}ms sku=${sku} (Redis hit)`);
      }
      res.setHeader("X-Cache", "HIT");
      res.json(cached);
      return;
    }
    if (IS_DEV) console.log(`[REDIS] DETAIL → MISS key=${rKey}`);
    // ────────────────────────────────────────────────────────────────────────

    const { published, draft } = await fetchProductDetailBySku(sku);
    const payload = {
      published: published ? { ...published, status: "PUBLISHED" } : null,
      draft:     draft     ? { ...draft,      status: "DRAFT"      } : null,
    };

    // Store in Redis for cross-session reuse
    void redisSet(rKey, payload, CATALOG_DETAIL_TTL_S);

    if (IS_DEV) {
      console.log(`[REDIS] DETAIL → STORED key=${rKey} TTL=${CATALOG_DETAIL_TTL_S}s`);
      console.log(`[TRACE] DETAIL FLOW:\n  Redis → MISS\n  DB → HIT\n  Response cached (TTL ${CATALOG_DETAIL_TTL_S}s)`);
      console.log(`[API] DETAIL RESPONSE → ${Math.round(performance.now() - t0)}ms sku=${sku} published=${!!published} draft=${!!draft}`);
    }

    res.setHeader("X-Cache", "MISS");
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/products/:id?status=DRAFT|PUBLISHED&base_sku=<sku>
router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const status  = req.query.status   as string;
  const baseSku = req.query.base_sku as string | undefined;

  if (status !== "DRAFT" && status !== "PUBLISHED") {
    res.status(400).json({ error: "Invalid or missing status query parameter. Must be DRAFT or PUBLISHED." });
    return;
  }

  if (!isSupabaseCatalogConfigured()) {
    res.status(503).json({ error: "Supabase is not configured." });
    return;
  }

  try {
    await deleteProductFromDatabase(id as string, status as "DRAFT" | "PUBLISHED");
    // Bust catalog Redis caches so the deleted version is not served again
    void invalidateCatalogCaches(baseSku);
    res.json({ success: true, message: `Successfully deleted ${status} product ${id}.` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Products] Delete failed for ${id}:`, message);
    res.status(500).json({ error: message });
  }
});

export default router;
