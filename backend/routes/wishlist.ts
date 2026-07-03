import { performance } from "perf_hooks";
import { Router, type Request, type Response } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { createLog, fms } from "../lib/logger.js";
import { redisGet, redisSet, redisDel, redisKey, WISHLIST_TTL_S } from "../lib/redis.js";
import type { ProductRow, VariantRow, ImageRow } from "../lib/catalogRowTypes.js";

const router = Router();
const db = () => supabaseAdmin ?? supabaseAnon;
const wishlistKey = (userId: string) => redisKey("wishlist", userId);
const cartKey     = (userId: string) => redisKey("cart",     userId);

// ─── Shared helpers ────────────────────────────────────────────────────────────

const PRODUCT_SELECT = `
  title, slug, category_slug, brand, price, original_price, tags, badges, base_sku, is_unlimited,
  is_featured, is_new_arrival, is_trending, is_bestseller,
  product_images(id, image_url, is_primary, sort_order, variant_id),
  product_variants(id, variant_sku, color_name, color_hex, stock, is_unlimited, sort_order)
`.trim();

interface WishlistItemRow {
  id: string;
  sku: string;
  product_slug: string;
  created_at?: string;
}

function enrichWishlistRow(row: WishlistItemRow, product: ProductRow) {
  const variants: VariantRow[] = [...(product.product_variants ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const images: ImageRow[] = [...(product.product_images ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const variant = variants.find((v) => v.variant_sku === row.sku) ?? null;
  const variantImages = variant
    ? images.filter((img) => img.variant_id === variant.id)
    : [];
  const globalImages = images.filter((img) => img.variant_id == null);
  const primaryImage =
    variantImages.find((img) => !!img.is_primary)?.image_url ||
    variantImages[0]?.image_url ||
    images.find((img) => !!img.is_primary)?.image_url ||
    images[0]?.image_url ||
    "";
  const allImageUrls = [
    ...variantImages.map((img) => img.image_url as string),
    ...globalImages.map((img) => img.image_url as string),
  ];
  const uniqueImages = [...new Set(allImageUrls)].filter(Boolean);

  const isUnlimited: boolean = variant ? !!variant.is_unlimited : !!product.is_unlimited;
  const stock: number | null = isUnlimited ? null : (variant?.stock ?? 0);
  const inStock = stock === null || stock > 0;

  return {
    id: row.id as string,
    sku: row.sku as string,
    productSlug: row.product_slug as string,
    createdAt: row.created_at as string,
    title: product.title as string,
    slug: product.slug as string,
    categorySlug: product.category_slug as string,
    brand: (product.brand ?? "") as string,
    price: product.price as number,
    originalPrice: (product.original_price ?? product.price) as number,
    image: primaryImage as string,
    images: uniqueImages,
    color: {
      name: (variant?.color_name ?? "") as string,
      hex: (variant?.color_hex ?? "#cccccc") as string,
    },
    inStock,
    tags: (product.tags ?? []) as string[],
    badges: [
      ...(product.badges ?? []),
      ...(product.is_featured    ? ["Featured"]     : []),
      ...(product.is_new_arrival ? ["New Arrival"]  : []),
      ...(product.is_trending    ? ["Trending"]     : []),
      ...(product.is_bestseller  ? ["Bestseller"]   : []),
    ] as string[],
  };
}

async function batchFetchProducts(slugs: string[]) {
  return db()
    .from("products")
    .select(PRODUCT_SELECT)
    .in("slug", slugs);
}

// Atomic move via Postgres RPC (migration 20260703_move_wishlist_to_cart.sql):
// deletes the wishlist row and upserts into cart in ONE transaction, so a retry
// or concurrent duplicate call can't double-add ('not_found' instead), and a
// failed cart write rolls the wishlist delete back with it.
async function moveWishlistItemToCart(userId: string, wishlistId: string) {
  const { data, error } = await db().rpc("move_wishlist_to_cart", {
    p_user_id: userId,
    p_wishlist_id: wishlistId,
  });
  return { error, action: data as "added" | "incremented" | "not_found" | null };
}

// ─── GET /api/wishlist ─────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("WISHLIST GET");
  const userId = (req as AuthenticatedRequest).userId;
  log.step(`user=${userId}  client=${supabaseAdmin ? "admin" : "anon"}`);

  try {
    // ── L2 Redis cache check ──────────────────────────────────────────────────
    const cacheKey = wishlistKey(userId);
    const cached = await redisGet<{ items: unknown[] }>(cacheKey, log);
    if (cached) {
      log.success(`cache HIT  items=${cached.items.length}  total=${fms(log.elapsed())}`).end("WISHLIST GET");
      res.json(cached);
      return;
    }

    // ── DB: wishlist_items ────────────────────────────────────────────────────
    const t0Rows = performance.now();
    const { data: rows, error: rowErr } = await db()
      .from("wishlist_items")
      .select("id, sku, product_slug, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    log.step(`DB wishlist_items: ${fms(performance.now() - t0Rows)}  rows=${rows?.length ?? 0}`);

    if (rowErr) {
      log.error(`wishlist_items query failed  code=${rowErr.code}  msg=${rowErr.message}`, rowErr).end("WISHLIST GET");
      res.status(500).json({ error: rowErr.message });
      return;
    }

    if (!rows || rows.length === 0) {
      void redisSet(cacheKey, { items: [] }, WISHLIST_TTL_S, log);
      log.success(`empty wishlist  total=${fms(log.elapsed())}`).end("WISHLIST GET");
      res.json({ items: [] });
      return;
    }

    // ── DB: products (with variants + images) ─────────────────────────────────
    const slugs = [...new Set(rows.map((r) => r.product_slug as string))];
    const t0Products = performance.now();
    const { data: products, error: prodErr } = await batchFetchProducts(slugs);
    log.step(`DB products: ${fms(performance.now() - t0Products)}  slugs=${slugs.length}  rows=${products?.length ?? 0}`);

    if (prodErr) {
      log.error(`product fetch failed  code=${prodErr.code}  msg=${prodErr.message}`, prodErr).end("WISHLIST GET");
      res.status(500).json({ error: prodErr.message });
      return;
    }

    // ── Item mapping ──────────────────────────────────────────────────────────
    const t0Map = performance.now();
    // Index by SKU, not slug: slugs are non-unique, so resolve each wishlist row to its
    // exact product by the (globally unique) base_sku / variant_sku it was saved with.
    const skuToProduct = new Map<string, ProductRow>();
    for (const p of (products ?? []) as unknown as ProductRow[]) {
      if (p.base_sku) skuToProduct.set(p.base_sku as string, p);
      for (const v of p.product_variants ?? []) skuToProduct.set(v.variant_sku, p);
    }

    const items = rows
      .map((row) => {
        const product = skuToProduct.get(row.sku as string);
        if (!product) return null;
        return enrichWishlistRow(row, product);
      })
      .filter(Boolean);
    log.step(`item mapping: ${fms(performance.now() - t0Map)}  items=${items.length}`);

    // ── Cache + respond ───────────────────────────────────────────────────────
    const payload = { items };
    await redisSet(cacheKey, payload, WISHLIST_TTL_S, log);
    log.success(`cache MISS → SET  items=${items.length}  total=${fms(log.elapsed())}`).end("WISHLIST GET");
    res.json(payload);
  } catch (err) {
    log.error("unhandled error", err).end("WISHLIST GET");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── POST /api/wishlist/add ────────────────────────────────────────────────────
router.post("/add", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("WISHLIST ADD");
  const userId = (req as AuthenticatedRequest).userId;

  const { product_slug, sku } = req.body as {
    product_slug?: string;
    sku?: string;
  };

  if (!product_slug || typeof product_slug !== "string") {
    log.warn("missing product_slug").end("WISHLIST ADD");
    res.status(400).json({ error: "product_slug is required" });
    return;
  }
  if (!sku || typeof sku !== "string") {
    log.warn("missing sku").end("WISHLIST ADD");
    res.status(400).json({ error: "sku is required" });
    return;
  }

  log.step(`user=${userId}  slug=${product_slug}  sku=${sku}`);

  try {
    // Validate by SKU, not slug: slugs are non-unique now, so .eq("slug").maybeSingle()
    // would throw when two products share a slug. The sku (variant_sku or base_sku) is
    // globally unique and self-identifying. Resolve the owning product's slug server-side
    // and store THAT — the client's product_slug is never trusted, so a mismatched
    // slug+sku pair can't be persisted (it would later leak into cart_items on move).
    const t0Validate = performance.now();
    let serverSlug: string | null = null;
    const { data: baseRow, error: bErr } = await db()
      .from("products")
      .select("slug")
      .eq("base_sku", sku)
      .maybeSingle();
    if (bErr) {
      log.error(`base-sku validation failed  code=${bErr.code}`, bErr).end("WISHLIST ADD");
      res.status(500).json({ error: "Could not validate product" });
      return;
    }
    serverSlug = (baseRow?.slug as string | undefined) ?? null;
    if (!serverSlug) {
      const { data: variantRows, error: vErr } = await db()
        .from("products")
        .select("slug, product_variants!inner(variant_sku)")
        .eq("product_variants.variant_sku", sku)
        .limit(1);
      if (vErr) {
        log.error(`variant validation failed  code=${vErr.code}`, vErr).end("WISHLIST ADD");
        res.status(500).json({ error: "Could not validate product" });
        return;
      }
      serverSlug = (variantRows?.[0]?.slug as string | undefined) ?? null;
    }
    log.step(`DB sku validate: ${fms(performance.now() - t0Validate)}  slug=${serverSlug}`);

    if (!serverSlug) {
      log.warn(`sku not found  sku=${sku}`).end("WISHLIST ADD");
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (serverSlug !== product_slug) {
      log.warn(`client slug mismatch  client=${product_slug}  server=${serverSlug} — using server slug`);
    }

    // Insert — unique constraint handles duplicates gracefully
    const t0Insert = performance.now();
    const { data: inserted, error: insertErr } = await db()
      .from("wishlist_items")
      .insert({ user_id: userId, product_slug: serverSlug, sku })
      .select("id")
      .maybeSingle();
    log.step(`DB insert: ${fms(performance.now() - t0Insert)}`);

    if (insertErr) {
      // Unique constraint violation = already wishlisted
      if (insertErr.code === "23505") {
        log.step("already wishlisted — returning 200").end("WISHLIST ADD");
        res.json({ ok: true, action: "already_exists" });
        return;
      }
      log.error(`insert failed  code=${insertErr.code}  msg=${insertErr.message}`, insertErr).end("WISHLIST ADD");
      res.status(500).json({ error: insertErr.message });
      return;
    }

    await redisDel(log, wishlistKey(userId));
    log.success(`inserted  id=${inserted?.id}  total=${fms(log.elapsed())}`).end("WISHLIST ADD");
    res.status(201).json({ ok: true, action: "added", wishlistItemId: inserted?.id });
  } catch (err) {
    log.error("unhandled error", err).end("WISHLIST ADD");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── POST /api/wishlist/move-to-cart/:id ──────────────────────────────────────
// IMPORTANT: registered before /:id so literal paths don't clash.
router.post("/move-to-cart/:id", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("WISHLIST MOVE TO CART");
  const userId = (req as AuthenticatedRequest).userId;
  const { id } = req.params;
  log.step(`user=${userId}  wishlist_id=${id}`);

  try {
    // Atomic RPC: verifies ownership, deletes from wishlist, upserts into cart —
    // all in one transaction.
    const t0Move = performance.now();
    const { error: moveErr, action } = await moveWishlistItemToCart(userId, String(id));
    log.step(`DB move RPC: ${fms(performance.now() - t0Move)}  action=${action}`);

    if (moveErr) {
      log.error(`move RPC failed  code=${moveErr.code}  msg=${moveErr.message}`, moveErr).end("WISHLIST MOVE TO CART");
      res.status(500).json({ error: moveErr.message });
      return;
    }
    if (action === "not_found" || !action) {
      log.warn(`wishlist item not found or unauthorized  id=${id}`).end("WISHLIST MOVE TO CART");
      res.status(404).json({ error: "Wishlist item not found" });
      return;
    }

    // Invalidate both caches — wishlist shrank, cart grew
    await redisDel(log, wishlistKey(userId), cartKey(userId));
    log.success(`moved to cart  wishlist_id=${id}  cart_action=${action}  total=${fms(log.elapsed())}`).end("WISHLIST MOVE TO CART");
    res.json({ ok: true, action });
  } catch (err) {
    log.error("unhandled error", err).end("WISHLIST MOVE TO CART");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── POST /api/wishlist/move-all-to-cart ──────────────────────────────────────
router.post("/move-all-to-cart", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("WISHLIST MOVE ALL TO CART");
  const userId = (req as AuthenticatedRequest).userId;
  log.step(`user=${userId}`);

  try {
    // Fetch all wishlist rows
    const t0Rows = performance.now();
    const { data: rows, error: rowErr } = await db()
      .from("wishlist_items")
      .select("id, product_slug, sku")
      .eq("user_id", userId);
    log.step(`DB wishlist_items: ${fms(performance.now() - t0Rows)}  rows=${rows?.length ?? 0}`);

    if (rowErr) {
      log.error(`rows fetch failed  code=${rowErr.code}`, rowErr).end("WISHLIST MOVE ALL TO CART");
      res.status(500).json({ error: rowErr.message });
      return;
    }

    if (!rows || rows.length === 0) {
      log.success(`wishlist empty — nothing to move  total=${fms(log.elapsed())}`).end("WISHLIST MOVE ALL TO CART");
      res.json({ ok: true, moved: 0, skipped: 0 });
      return;
    }

    // Batch-fetch product data to check stock
    const slugs = [...new Set(rows.map((r) => r.product_slug as string))];
    const t0Products = performance.now();
    const { data: products, error: prodErr } = await batchFetchProducts(slugs);
    log.step(`DB products: ${fms(performance.now() - t0Products)}  slugs=${slugs.length}`);

    if (prodErr) {
      log.error(`product fetch failed  code=${prodErr.code}`, prodErr).end("WISHLIST MOVE ALL TO CART");
      res.status(500).json({ error: prodErr.message });
      return;
    }

    // Index by SKU, not slug: slugs are non-unique, so resolve each wishlist row to its
    // exact product by the (globally unique) base_sku / variant_sku — same as GET.
    const skuToProduct = new Map<string, ProductRow>();
    for (const p of (products ?? []) as unknown as ProductRow[]) {
      if (p.base_sku) skuToProduct.set(p.base_sku as string, p);
      for (const v of p.product_variants ?? []) skuToProduct.set(v.variant_sku, p);
    }

    log.step(`total rows=${rows.length}  unique slugs=${slugs.length}`);

    let moved = 0;
    let skipped = 0;

    for (const row of rows) {
      const product = skuToProduct.get(row.sku as string);
      if (!product) { skipped++; continue; }

      const enriched = enrichWishlistRow(row, product);
      if (!enriched.inStock) { skipped++; continue; }

      // Atomic per item: cart upsert + wishlist delete in one transaction, so a
      // failure mid-batch leaves every item cleanly on exactly one side.
      const { error: moveErr, action } = await moveWishlistItemToCart(userId, row.id as string);

      if (moveErr) {
        log.error(`move RPC failed for sku=${row.sku}  code=${moveErr.code}`, moveErr);
        skipped++;
        continue;
      }
      if (action === "not_found" || !action) {
        // Row vanished under us (concurrent move/remove) — nothing to do.
        skipped++;
        continue;
      }

      moved++;
    }

    // Invalidate both caches — wishlist shrank, cart grew
    await redisDel(log, wishlistKey(userId), cartKey(userId));
    log.success(`moved=${moved}  skipped=${skipped}  total=${fms(log.elapsed())}`).end("WISHLIST MOVE ALL TO CART");
    res.json({ ok: true, moved, skipped });
  } catch (err) {
    log.error("unhandled error", err).end("WISHLIST MOVE ALL TO CART");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── DELETE /api/wishlist/clear ────────────────────────────────────────────────
// IMPORTANT: registered before /:id
router.delete("/clear", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("WISHLIST CLEAR");
  const userId = (req as AuthenticatedRequest).userId;
  log.step(`user=${userId}`);

  try {
    const t0Write = performance.now();
    const { error } = await db()
      .from("wishlist_items")
      .delete()
      .eq("user_id", userId);
    log.step(`DB delete all: ${fms(performance.now() - t0Write)}`);

    if (error) {
      log.error(`clear failed  code=${error.code}  msg=${error.message}`, error).end("WISHLIST CLEAR");
      res.status(500).json({ error: error.message });
      return;
    }

    await redisDel(log, wishlistKey(userId));
    log.success(`wishlist cleared  total=${fms(log.elapsed())}`).end("WISHLIST CLEAR");
    res.json({ ok: true });
  } catch (err) {
    log.error("unhandled error", err).end("WISHLIST CLEAR");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── DELETE /api/wishlist/:id ──────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("WISHLIST REMOVE");
  const userId = (req as AuthenticatedRequest).userId;
  const { id } = req.params;
  log.step(`user=${userId}  id=${id}`);

  try {
    const t0Write = performance.now();
    const { data, error } = await db()
      .from("wishlist_items")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    log.step(`DB delete item: ${fms(performance.now() - t0Write)}`);

    if (error) {
      log.error(`delete failed  code=${error.code}  msg=${error.message}`, error).end("WISHLIST REMOVE");
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      log.warn(`item not found  id=${id}`).end("WISHLIST REMOVE");
      res.status(404).json({ error: "Wishlist item not found" });
      return;
    }

    await redisDel(log, wishlistKey(userId));
    log.success(`removed  id=${id}  total=${fms(log.elapsed())}`).end("WISHLIST REMOVE");
    res.json({ ok: true });
  } catch (err) {
    log.error("unhandled error", err).end("WISHLIST REMOVE");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
