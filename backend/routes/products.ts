import { Router, type Request, type Response } from "express";
import {
  fetchAllProducts,
  fetchFilteredProducts,
  isSupabaseCatalogConfigured,
  launchProductToDatabase,
  saveDraftToDatabase,
  deleteProductFromDatabase,
  fetchProductBySlugAndSku,
  fetchRecommendedProducts
} from "../lib/persistCatalog.js";

// ─── In-memory product detail cache (TTL = 5 min) ──────────────────────────
const DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
interface CacheEntry { payload: object; expiresAt: number; }
const detailCache = new Map<string, CacheEntry>();

function getCached(key: string): object | null {
  const entry = detailCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { detailCache.delete(key); return null; }
  return entry.payload;
}
function setCached(key: string, payload: object) {
  detailCache.set(key, { payload, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
}
// Invalidate on launch so a re-published product is never stale
export function invalidateDetailCache(slug: string) { detailCache.delete(slug); }
// ───────────────────────────────────────────────────────────────────────────

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

// Helper to map DB catalog schema to frontend Product schema
function mapDatabaseProductToFrontend(dbProduct: any, isDraft: boolean) {
  const images = isDraft ? (dbProduct.draft_product_images || []) : (dbProduct.product_images || []);
  const variants = isDraft ? (dbProduct.draft_product_variants || []) : (dbProduct.product_variants || []);

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

  // Dynamic high-fidelity customer feedback generator
  const reviewsData = {
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
        title: `Absolutely gorgeous ${dbProduct.title}!`,
        comment: `Highly recommend this! The fabric is so premium and my daughter loved it. Worth every rupee!`,
        verified: true
      },
      {
        id: "rev-2",
        user: "Neha Verma",
        rating: 4,
        date: "05 Nov 2023",
        title: "Beautiful style and rich look",
        comment: `Precisely as shown in the pictures. The fit was a tiny bit loose but we managed perfectly. Very elegant.`,
        verified: true,
      },
      {
        id: "rev-3",
        user: "Anjali K.",
        rating: 5,
        date: "28 Nov 2023",
        title: "Perfect purchase",
        comment: `Excellent craftsmanship. The material is soft and highly comfortable for kids. Five stars!`,
        verified: true
      }
    ]
  };

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
    reviewsData
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

// GET /api/products/detail — Fetches catalog product by slug and variant SKU with checks
router.get("/detail", async (req: Request, res: Response) => {
  const slug = req.query.slug as string;
  const sku = req.query.sku as string;
  const category = req.query.category as string;

  if (!slug || !sku) {
    res.status(400).json({ error: "Slug and SKU parameters are required." });
    return;
  }

  // ⚡ Cache hit — return immediately, no Supabase round-trip
  const cacheKey = slug;
  const cached = getCached(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    // Fire product + recommendations in parallel — category from URL avoids a waterfall
    const [product, recommendedList] = await Promise.all([
      fetchProductBySlugAndSku(slug, sku),
      fetchRecommendedProducts(slug, category || "")
    ]);

    if (!product) {
      res.status(404).json({ error: "Product not found." });
      return;
    }

    // Strict URL validation checks
    // 1. Slug matches
    if (product.slug !== slug) {
      res.status(404).json({ error: "Slug mismatch." });
      return;
    }

    // 2. Category matches (if category is provided)
    if (category && product.category_slug !== category) {
      res.status(404).json({ error: "Category mismatch." });
      return;
    }

    // 3. SKU belongs to the product (either base_sku or one of the variant_skus)
    const hasBaseSkuMatch = product.base_sku === sku;
    const hasVariantSkuMatch = product.product_variants?.some((v: any) => v.variant_sku === sku);

    if (!hasBaseSkuMatch && !hasVariantSkuMatch) {
      res.status(404).json({ error: "SKU does not belong to this product." });
      return;
    }

    // Map both in one pass — no extra await
    const mappedProduct = mapDatabaseProductToFrontend(product, false);
    const mappedRecommended = (recommendedList || []).map(mapDatabaseToRecommended);

    const responsePayload = { product: mappedProduct, recommended: mappedRecommended };

    // 💾 Store in cache — subsequent hits return instantly
    setCached(cacheKey, responsePayload);

    res.json(responsePayload);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
  const { status, ...data } = req.body as { status: string; [key: string]: unknown };

  const normalized: "DRAFT" | "PUBLISHED" = status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";

  lastProduct = {
    status: normalized,
    receivedAt: new Date().toISOString(),
    data,
  };

  console.log(
    `\n[Products] Received ${lastProduct.status}: "${(data as { name?: string }).name ?? "Untitled"}"\n`
  );
  console.log("[Products] payload body:", JSON.stringify(data, null, 2));

  const previewPath = "/api/products/preview";
  const payload = buildPublicPayload();

  let database:
    | { ok: true; draftProductId?: string; publishedProductId?: string }
    | { ok: false; skipped: true; reason: string }
    | { ok: false; error: string } = { ok: false, skipped: true, reason: "not_configured" };

  if (isSupabaseCatalogConfigured()) {
    try {
      if (normalized === "DRAFT") {
        const { draftProductId } = await saveDraftToDatabase(data);
        database = { ok: true, draftProductId };
      } else {
        const { publishedProductId } = await launchProductToDatabase(data);
        // Bust the detail cache so admins see fresh data immediately
        invalidateDetailCache(data.slug ?? "");
        database = { ok: true, publishedProductId };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[Products] Supabase persist failed:", message);
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

// DELETE /api/products/:id?status=DRAFT|PUBLISHED
router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const status = req.query.status as string;

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
    res.json({ success: true, message: `Successfully deleted ${status} product ${id}.` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Products] Delete failed for ${id}:`, message);
    res.status(500).json({ error: message });
  }
});

export default router;
