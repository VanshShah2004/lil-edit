import { Router, type Request, type Response } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { createLog } from "../lib/logger.js";

const router = Router();
const db = () => supabaseAdmin ?? supabaseAnon;

// ─── Shared helpers ────────────────────────────────────────────────────────────

const PRODUCT_SELECT = `
  title, slug, category_slug, brand, price, original_price, tags, badges, base_sku, is_unlimited,
  product_images(id, image_url, is_primary, sort_order, variant_id),
  product_variants(id, variant_sku, color_name, color_hex, stock, is_unlimited, sort_order)
`.trim();

function enrichWishlistRow(row: any, product: any) {
  const variants: any[] = [...(product.product_variants ?? [])].sort(
    (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const images: any[] = [...(product.product_images ?? [])].sort(
    (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const variant = variants.find((v: any) => v.variant_sku === row.sku) ?? null;
  const primaryImage =
    images.find((img: any) => !!img.is_primary)?.image_url ||
    images[0]?.image_url ||
    "";

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
    color: {
      name: (variant?.color_name ?? "") as string,
      hex: (variant?.color_hex ?? "#cccccc") as string,
    },
    inStock,
    tags: (product.tags ?? []) as string[],
    badges: (product.badges ?? []) as string[],
  };
}

async function batchFetchProducts(slugs: string[]) {
  return db()
    .from("products")
    .select(PRODUCT_SELECT)
    .in("slug", slugs);
}

// Shared upsert-into-cart logic (reused by move-to-cart routes)
async function upsertCartItem(
  userId: string,
  productSlug: string,
  sku: string,
  qty: number
) {
  const { data: existing, error: existErr } = await db()
    .from("cart_items")
    .select("id, quantity")
    .eq("user_id", userId)
    .eq("sku", sku)
    .eq("size", "")
    .maybeSingle();

  if (existErr) return { error: existErr };

  if (existing) {
    const newQty = (existing.quantity as number) + qty;
    const { error } = await db()
      .from("cart_items")
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return { error, action: "incremented" as const };
  }

  const { error } = await db()
    .from("cart_items")
    .insert({ user_id: userId, product_slug: productSlug, sku, size: "", quantity: qty });
  return { error, action: "added" as const };
}

// ─── GET /api/wishlist ─────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("WISHLIST GET");
  const userId = (req as AuthenticatedRequest).userId;
  log.step(`user=${userId}  client=${supabaseAdmin ? "admin" : "anon"}`);

  try {
    const { data: rows, error: rowErr } = await db()
      .from("wishlist_items")
      .select("id, sku, product_slug, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (rowErr) {
      log.error(`wishlist_items query failed  code=${(rowErr as any).code}  msg=${rowErr.message}`, rowErr).end("WISHLIST GET");
      res.status(500).json({ error: rowErr.message });
      return;
    }

    log.step(`rows=${rows?.length ?? 0}`);

    if (!rows || rows.length === 0) {
      log.success("empty wishlist").end("WISHLIST GET");
      res.json({ items: [] });
      return;
    }

    const slugs = [...new Set(rows.map((r) => r.product_slug as string))];
    const { data: products, error: prodErr } = await batchFetchProducts(slugs);

    if (prodErr) {
      log.error(`product fetch failed  code=${(prodErr as any).code}  msg=${prodErr.message}`, prodErr).end("WISHLIST GET");
      res.status(500).json({ error: prodErr.message });
      return;
    }

    const productMap = new Map<string, any>(
      (products ?? []).map((p: any) => [p.slug as string, p])
    );

    const items = rows
      .map((row) => {
        const product = productMap.get(row.product_slug as string);
        if (!product) return null;
        return enrichWishlistRow(row, product);
      })
      .filter(Boolean);

    log.success(`${items.length} items returned`).end("WISHLIST GET");
    res.json({ items });
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
    // Validate product + SKU
    const { data: product, error: prodErr } = await db()
      .from("products")
      .select("base_sku, product_variants(variant_sku)")
      .eq("slug", product_slug)
      .maybeSingle();

    if (prodErr) {
      log.error(`product validation failed  code=${(prodErr as any).code}`, prodErr).end("WISHLIST ADD");
      res.status(500).json({ error: "Could not validate product" });
      return;
    }
    if (!product) {
      log.warn(`product not found  slug=${product_slug}`).end("WISHLIST ADD");
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const validSkus: string[] = [
      product.base_sku as string,
      ...((product.product_variants as any[] ?? []).map((v: any) => v.variant_sku as string)),
    ];
    if (!validSkus.includes(sku)) {
      log.warn(`invalid sku=${sku}  valid=[${validSkus.join(",")}]`).end("WISHLIST ADD");
      res.status(400).json({ error: "SKU does not belong to this product" });
      return;
    }

    // Insert — unique constraint handles duplicates gracefully
    const { data: inserted, error: insertErr } = await db()
      .from("wishlist_items")
      .insert({ user_id: userId, product_slug, sku })
      .select("id")
      .maybeSingle();

    if (insertErr) {
      // Unique constraint violation = already wishlisted
      if ((insertErr as any).code === "23505") {
        log.step("already wishlisted — returning 200").end("WISHLIST ADD");
        res.json({ ok: true, action: "already_exists" });
        return;
      }
      log.error(`insert failed  code=${(insertErr as any).code}  msg=${insertErr.message}`, insertErr).end("WISHLIST ADD");
      res.status(500).json({ error: insertErr.message });
      return;
    }

    log.success(`inserted  id=${inserted?.id}`).end("WISHLIST ADD");
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
    // Verify ownership + fetch the row
    const { data: row, error: rowErr } = await db()
      .from("wishlist_items")
      .select("id, product_slug, sku")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (rowErr) {
      log.error(`row fetch failed  code=${(rowErr as any).code}`, rowErr).end("WISHLIST MOVE TO CART");
      res.status(500).json({ error: rowErr.message });
      return;
    }
    if (!row) {
      log.warn(`wishlist item not found or unauthorized  id=${id}`).end("WISHLIST MOVE TO CART");
      res.status(404).json({ error: "Wishlist item not found" });
      return;
    }

    log.step(`moving slug=${row.product_slug}  sku=${row.sku}`);

    // Upsert into cart
    const { error: cartErr, action } = await upsertCartItem(
      userId,
      row.product_slug as string,
      row.sku as string,
      1
    );

    if (cartErr) {
      log.error(`cart upsert failed  code=${(cartErr as any).code}  msg=${cartErr.message}`, cartErr).end("WISHLIST MOVE TO CART");
      res.status(500).json({ error: cartErr.message });
      return;
    }
    log.step(`cart upsert action=${action}`);

    // Remove from wishlist
    const { error: delErr } = await db()
      .from("wishlist_items")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (delErr) {
      log.error(`wishlist delete failed  code=${(delErr as any).code}`, delErr).end("WISHLIST MOVE TO CART");
      res.status(500).json({ error: delErr.message });
      return;
    }

    log.success(`moved to cart  wishlist_id=${id}  cart_action=${action}`).end("WISHLIST MOVE TO CART");
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
    const { data: rows, error: rowErr } = await db()
      .from("wishlist_items")
      .select("id, product_slug, sku")
      .eq("user_id", userId);

    if (rowErr) {
      log.error(`rows fetch failed  code=${(rowErr as any).code}`, rowErr).end("WISHLIST MOVE ALL TO CART");
      res.status(500).json({ error: rowErr.message });
      return;
    }

    if (!rows || rows.length === 0) {
      log.success("wishlist empty — nothing to move").end("WISHLIST MOVE ALL TO CART");
      res.json({ ok: true, moved: 0, skipped: 0 });
      return;
    }

    // Batch-fetch product data to check stock
    const slugs = [...new Set(rows.map((r) => r.product_slug as string))];
    const { data: products, error: prodErr } = await batchFetchProducts(slugs);

    if (prodErr) {
      log.error(`product fetch failed  code=${(prodErr as any).code}`, prodErr).end("WISHLIST MOVE ALL TO CART");
      res.status(500).json({ error: prodErr.message });
      return;
    }

    const productMap = new Map<string, any>(
      (products ?? []).map((p: any) => [p.slug as string, p])
    );

    log.step(`total rows=${rows.length}  unique slugs=${slugs.length}`);

    let moved = 0;
    let skipped = 0;
    const movedIds: string[] = [];

    for (const row of rows) {
      const product = productMap.get(row.product_slug as string);
      if (!product) { skipped++; continue; }

      const enriched = enrichWishlistRow(row, product);
      if (!enriched.inStock) { skipped++; continue; }

      const { error: cartErr } = await upsertCartItem(
        userId,
        row.product_slug as string,
        row.sku as string,
        1
      );

      if (cartErr) {
        log.error(`cart upsert failed for sku=${row.sku}  code=${(cartErr as any).code}`, cartErr);
        skipped++;
        continue;
      }

      movedIds.push(row.id as string);
      moved++;
    }

    // Delete all successfully moved items from wishlist
    if (movedIds.length > 0) {
      const { error: delErr } = await db()
        .from("wishlist_items")
        .delete()
        .in("id", movedIds)
        .eq("user_id", userId);

      if (delErr) {
        log.error(`bulk wishlist delete failed  code=${(delErr as any).code}`, delErr).end("WISHLIST MOVE ALL TO CART");
        res.status(500).json({ error: delErr.message });
        return;
      }
    }

    log.success(`moved=${moved}  skipped=${skipped}`).end("WISHLIST MOVE ALL TO CART");
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
    const { error } = await db()
      .from("wishlist_items")
      .delete()
      .eq("user_id", userId);

    if (error) {
      log.error(`clear failed  code=${(error as any).code}  msg=${error.message}`, error).end("WISHLIST CLEAR");
      res.status(500).json({ error: error.message });
      return;
    }

    log.success("wishlist cleared").end("WISHLIST CLEAR");
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
    const { data, error } = await db()
      .from("wishlist_items")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error) {
      log.error(`delete failed  code=${(error as any).code}  msg=${error.message}`, error).end("WISHLIST REMOVE");
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      log.warn(`item not found  id=${id}`).end("WISHLIST REMOVE");
      res.status(404).json({ error: "Wishlist item not found" });
      return;
    }

    log.success(`removed  id=${id}`).end("WISHLIST REMOVE");
    res.json({ ok: true });
  } catch (err) {
    log.error("unhandled error", err).end("WISHLIST REMOVE");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
