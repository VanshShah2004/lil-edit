import { Router, type Request, type Response } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { createLog } from "../lib/logger.js";

const router = Router();
const db = () => supabaseAdmin ?? supabaseAnon;

// ─── GET /api/cart ─────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("CART GET");
  const userId = (req as AuthenticatedRequest).userId;
  log.step(`user=${userId}  client=${supabaseAdmin ? "admin" : "anon"}`);

  try {
    const { data: cartRows, error: cartErr } = await db()
      .from("cart_items")
      .select("id, sku, size, quantity, product_slug, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (cartErr) {
      log.error(`cart_items query failed  code=${(cartErr as any).code}  hint=${(cartErr as any).hint}  msg=${cartErr.message}`, cartErr).end("CART GET");
      res.status(500).json({ error: cartErr.message });
      return;
    }

    log.step(`cart_items rows=${cartRows?.length ?? 0}`);

    if (!cartRows || cartRows.length === 0) {
      log.success("empty cart").end("CART GET");
      res.json({ items: [] });
      return;
    }

    const slugs = [...new Set(cartRows.map((r) => r.product_slug as string))];
    const { data: products, error: prodErr } = await db()
      .from("products")
      .select(`
        title, slug, category_slug, price, original_price, tags, badges, base_sku, sizes, is_unlimited,
        is_featured, is_new_arrival, is_trending, is_bestseller,
        product_images(id, image_url, is_primary, sort_order, variant_id),
        product_variants(id, variant_sku, color_name, color_hex, stock, is_unlimited, sort_order)
      `)
      .in("slug", slugs);

    if (prodErr) {
      log.error("product fetch failed", prodErr).end("CART GET");
      res.status(500).json({ error: prodErr.message });
      return;
    }

    const productMap = new Map<string, any>(
      (products ?? []).map((p: any) => [p.slug as string, p])
    );

    const items = cartRows
      .map((row) => {
        const product = productMap.get(row.product_slug as string);
        if (!product) return null;

        const variants: any[] = [...(product.product_variants ?? [])].sort(
          (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        );
        const images: any[] = [...(product.product_images ?? [])].sort(
          (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        );

        const variant = variants.find((v: any) => v.variant_sku === row.sku) ?? null;
        const variantImages = variant
          ? images.filter((img: any) => img.variant_id === variant.id)
          : [];
        const globalImages = images.filter((img: any) => img.variant_id == null);
        const primaryImage =
          variantImages.find((img: any) => !!img.is_primary)?.image_url ||
          variantImages[0]?.image_url ||
          images.find((img: any) => !!img.is_primary)?.image_url ||
          images[0]?.image_url ||
          "";
        const allImageUrls = [
          ...variantImages.map((img: any) => img.image_url as string),
          ...globalImages.map((img: any) => img.image_url as string),
        ];
        const uniqueImages = [...new Set(allImageUrls)].filter(Boolean);

        const isUnlimited: boolean = variant
          ? !!variant.is_unlimited
          : !!product.is_unlimited;
        const stock: number | null = isUnlimited ? null : (variant?.stock ?? 0);
        const availability =
          stock === null
            ? "In Stock"
            : stock <= 0
              ? "Out of Stock"
              : stock <= 3
                ? `Only ${stock} left`
                : "In Stock";

        return {
          id: row.id as string,
          sku: row.sku as string,
          size: row.size as string,
          quantity: row.quantity as number,
          title: product.title as string,
          slug: product.slug as string,
          categorySlug: product.category_slug as string,
          price: product.price as number,
          originalPrice: (product.original_price ?? product.price) as number,
          image: primaryImage as string,
          images: uniqueImages,
          color: {
            name: (variant?.color_name ?? "") as string,
            hex: (variant?.color_hex ?? "#cccccc") as string,
          },
          colors: variants.map((v: any) => ({
            name: (v.color_name ?? "") as string,
            hex: (v.color_hex ?? "#cccccc") as string,
            sku: v.variant_sku as string,
          })),
          availability,
          sizes: (product.sizes ?? []) as string[],
          tags: (product.tags ?? []) as string[],
          badges: [
            ...(product.badges ?? []),
            ...(product.is_featured    ? ["Featured"]    : []),
            ...(product.is_new_arrival ? ["New Arrival"] : []),
            ...(product.is_trending    ? ["Trending"]    : []),
            ...(product.is_bestseller  ? ["Bestseller"]  : []),
          ] as string[],
        };
      })
      .filter(Boolean);

    log.success(`${items.length} items returned`).end("CART GET");
    res.json({ items });
  } catch (err) {
    log.error("unhandled error", err).end("CART GET");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── POST /api/cart/add ────────────────────────────────────────────────────────
router.post("/add", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("CART ADD");
  const userId = (req as AuthenticatedRequest).userId;

  const { product_slug, sku, size, quantity } = req.body as {
    product_slug?: string;
    sku?: string;
    size?: string;
    quantity?: number;
  };

  if (!product_slug || typeof product_slug !== "string") {
    log.warn("missing product_slug").end("CART ADD");
    res.status(400).json({ error: "product_slug is required" });
    return;
  }
  if (!sku || typeof sku !== "string") {
    log.warn("missing sku").end("CART ADD");
    res.status(400).json({ error: "sku is required" });
    return;
  }

  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const sizeVal = typeof size === "string" ? size.trim() : "";

  log.step(`user=${userId}  slug=${product_slug}  sku=${sku}  size="${sizeVal}"  qty=${qty}  client=${supabaseAdmin ? "admin" : "anon"}`);

  try {
    const { data: product, error: prodErr } = await db()
      .from("products")
      .select("base_sku, product_variants(variant_sku)")
      .eq("slug", product_slug)
      .maybeSingle();

    if (prodErr) {
      log.error(`product validation failed  code=${(prodErr as any).code}  msg=${prodErr.message}`, prodErr).end("CART ADD");
      res.status(500).json({ error: "Could not validate product" });
      return;
    }
    if (!product) {
      log.warn(`product not found  slug=${product_slug}`).end("CART ADD");
      res.status(404).json({ error: "Product not found" });
      return;
    }
    log.step(`product found  base_sku=${product.base_sku}`);

    const validSkus: string[] = [
      product.base_sku as string,
      ...((product.product_variants as any[] ?? []).map((v: any) => v.variant_sku as string)),
    ];
    if (!validSkus.includes(sku)) {
      log.warn(`sku not on product  sku=${sku}  valid=[${validSkus.join(",")}]`).end("CART ADD");
      res.status(400).json({ error: "SKU does not belong to this product" });
      return;
    }

    const { data: existing, error: existErr } = await db()
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", userId)
      .eq("sku", sku)
      .eq("size", sizeVal)
      .maybeSingle();

    if (existErr) {
      log.error(`existing row check failed  code=${(existErr as any).code}  msg=${existErr.message}`, existErr).end("CART ADD");
      res.status(500).json({ error: existErr.message });
      return;
    }
    log.step(`existing row=${!!existing}`);

    if (existing) {
      const newQty = (existing.quantity as number) + qty;
      const { error: updateErr } = await db()
        .from("cart_items")
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq("id", existing.id);

      if (updateErr) {
        log.error(`increment failed  code=${(updateErr as any).code}  msg=${updateErr.message}`, updateErr).end("CART ADD");
        res.status(500).json({ error: updateErr.message });
        return;
      }

      log.success(`incremented  id=${existing.id}  qty=${existing.quantity}→${newQty}`).end("CART ADD");
      res.json({ ok: true, action: "incremented", cartItemId: existing.id, quantity: newQty });
    } else {
      const { data: inserted, error: insertErr } = await db()
        .from("cart_items")
        .insert({ user_id: userId, product_slug, sku, size: sizeVal, quantity: qty })
        .select("id")
        .single();

      if (insertErr) {
        log.error(`insert failed  code=${(insertErr as any).code}  msg=${insertErr.message}`, insertErr).end("CART ADD");
        res.status(500).json({ error: insertErr.message });
        return;
      }

      log.success(`inserted  id=${inserted.id}`).end("CART ADD");
      res.status(201).json({ ok: true, action: "added", cartItemId: inserted.id, quantity: qty });
    }
  } catch (err) {
    log.error("unhandled error", err).end("CART ADD");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── PATCH /api/cart/:id/color — change variant (sku) ────────────────────────
router.patch("/:id/color", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("CART UPDATE COLOR");
  const userId = (req as AuthenticatedRequest).userId;
  const { id } = req.params;
  const { sku } = req.body as { sku?: unknown };

  if (typeof sku !== "string" || !sku.trim()) {
    log.warn("invalid sku").end("CART UPDATE COLOR");
    res.status(400).json({ error: "sku must be a non-empty string" });
    return;
  }
  const newSku = sku.trim();
  log.step(`user=${userId}  id=${id}  newSku="${newSku}"`);

  try {
    const { data: current, error: fetchErr } = await db()
      .from("cart_items")
      .select("id, sku, size, quantity, product_slug")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchErr) {
      log.error("fetch failed", fetchErr).end("CART UPDATE COLOR");
      res.status(500).json({ error: fetchErr.message });
      return;
    }
    if (!current) {
      log.warn(`item not found  id=${id}`).end("CART UPDATE COLOR");
      res.status(404).json({ error: "Cart item not found" });
      return;
    }

    // Validate the new SKU belongs to the same product
    const { data: product, error: prodErr } = await db()
      .from("products")
      .select("base_sku, product_variants(variant_sku)")
      .eq("slug", current.product_slug as string)
      .maybeSingle();

    if (prodErr || !product) {
      log.error("product fetch failed", prodErr).end("CART UPDATE COLOR");
      res.status(500).json({ error: "Could not validate SKU" });
      return;
    }
    const validSkus: string[] = [
      product.base_sku as string,
      ...((product.product_variants as any[] ?? []).map((v: any) => v.variant_sku as string)),
    ];
    if (!validSkus.includes(newSku)) {
      log.warn(`sku not on product  newSku=${newSku}`).end("CART UPDATE COLOR");
      res.status(400).json({ error: "SKU does not belong to this product" });
      return;
    }

    // Check for an existing item with the new SKU + same size
    const { data: conflict } = await db()
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", userId)
      .eq("sku", newSku)
      .eq("size", current.size as string)
      .neq("id", id)
      .maybeSingle();

    if (conflict) {
      const mergedQty = (conflict.quantity as number) + (current.quantity as number);
      const { error: mergeErr } = await db()
        .from("cart_items")
        .update({ quantity: mergedQty, updated_at: new Date().toISOString() })
        .eq("id", conflict.id);
      if (mergeErr) {
        log.error("merge failed", mergeErr).end("CART UPDATE COLOR");
        res.status(500).json({ error: mergeErr.message });
        return;
      }
      await db().from("cart_items").delete().eq("id", id).eq("user_id", userId);
      log.success(`merged  qty=${mergedQty}`).end("CART UPDATE COLOR");
      res.json({ ok: true, action: "merged", mergedId: conflict.id, quantity: mergedQty });
      return;
    }

    const { error: updateErr } = await db()
      .from("cart_items")
      .update({ sku: newSku, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);

    if (updateErr) {
      log.error("update failed", updateErr).end("CART UPDATE COLOR");
      res.status(500).json({ error: updateErr.message });
      return;
    }

    log.success(`color updated  id=${id}  sku="${newSku}"`).end("CART UPDATE COLOR");
    res.json({ ok: true, action: "updated", id, sku: newSku });
  } catch (err) {
    log.error("unhandled error", err).end("CART UPDATE COLOR");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── PATCH /api/cart/:id/size — change selected size ──────────────────────────
router.patch("/:id/size", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("CART UPDATE SIZE");
  const userId = (req as AuthenticatedRequest).userId;
  const { id } = req.params;
  const { size } = req.body as { size?: unknown };

  if (typeof size !== "string" || !size.trim()) {
    log.warn("invalid size").end("CART UPDATE SIZE");
    res.status(400).json({ error: "size must be a non-empty string" });
    return;
  }
  const newSize = size.trim();
  log.step(`user=${userId}  id=${id}  newSize="${newSize}"`);

  try {
    // Fetch the item being changed so we know its sku and current quantity
    const { data: current, error: fetchErr } = await db()
      .from("cart_items")
      .select("id, sku, quantity")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchErr) {
      log.error("fetch failed", fetchErr).end("CART UPDATE SIZE");
      res.status(500).json({ error: fetchErr.message });
      return;
    }
    if (!current) {
      log.warn(`item not found  id=${id}`).end("CART UPDATE SIZE");
      res.status(404).json({ error: "Cart item not found" });
      return;
    }

    // Check if an item with the same sku + newSize already exists
    const { data: conflict } = await db()
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", userId)
      .eq("sku", current.sku as string)
      .eq("size", newSize)
      .neq("id", id)
      .maybeSingle();

    if (conflict) {
      // Merge: add quantities into the existing item, delete the current one
      const mergedQty = (conflict.quantity as number) + (current.quantity as number);
      const { error: mergeErr } = await db()
        .from("cart_items")
        .update({ quantity: mergedQty, updated_at: new Date().toISOString() })
        .eq("id", conflict.id);
      if (mergeErr) {
        log.error("merge update failed", mergeErr).end("CART UPDATE SIZE");
        res.status(500).json({ error: mergeErr.message });
        return;
      }
      await db().from("cart_items").delete().eq("id", id).eq("user_id", userId);
      log.success(`merged into existing item  qty=${mergedQty}`).end("CART UPDATE SIZE");
      res.json({ ok: true, action: "merged", mergedId: conflict.id, quantity: mergedQty });
      return;
    }

    // No conflict — plain size update
    const { error: updateErr } = await db()
      .from("cart_items")
      .update({ size: newSize, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);

    if (updateErr) {
      log.error("update failed", updateErr).end("CART UPDATE SIZE");
      res.status(500).json({ error: updateErr.message });
      return;
    }

    log.success(`size updated  id=${id}  size="${newSize}"`).end("CART UPDATE SIZE");
    res.json({ ok: true, action: "updated", id, size: newSize });
  } catch (err) {
    log.error("unhandled error", err).end("CART UPDATE SIZE");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── PATCH /api/cart/:id — update quantity ─────────────────────────────────────
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("CART UPDATE QTY");
  const userId = (req as AuthenticatedRequest).userId;
  const { id } = req.params;
  const { quantity } = req.body as { quantity?: unknown };

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) {
    log.warn(`invalid quantity=${quantity}`).end("CART UPDATE QTY");
    res.status(400).json({ error: "quantity must be an integer >= 1" });
    return;
  }

  log.step(`user=${userId}  id=${id}  qty=${qty}`);

  try {
    const { data, error } = await db()
      .from("cart_items")
      .update({ quantity: qty, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id, quantity")
      .maybeSingle();

    if (error) {
      log.error("update failed", error).end("CART UPDATE QTY");
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      log.warn(`item not found  id=${id}`).end("CART UPDATE QTY");
      res.status(404).json({ error: "Cart item not found" });
      return;
    }

    log.success(`updated  id=${id}  qty=${qty}`).end("CART UPDATE QTY");
    res.json({ ok: true, id: data.id, quantity: data.quantity });
  } catch (err) {
    log.error("unhandled error", err).end("CART UPDATE QTY");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── DELETE /api/cart/clear — remove all items (post-checkout) ─────────────────
// IMPORTANT: registered before /:id so "clear" is not matched as an id parameter.
router.delete("/clear", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("CART CLEAR");
  const userId = (req as AuthenticatedRequest).userId;
  log.step(`user=${userId}`);

  try {
    const { error } = await db()
      .from("cart_items")
      .delete()
      .eq("user_id", userId);

    if (error) {
      log.error("clear failed", error).end("CART CLEAR");
      res.status(500).json({ error: error.message });
      return;
    }

    log.success("cart cleared").end("CART CLEAR");
    res.json({ ok: true });
  } catch (err) {
    log.error("unhandled error", err).end("CART CLEAR");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── DELETE /api/cart/:id — remove single item ─────────────────────────────────
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("CART REMOVE");
  const userId = (req as AuthenticatedRequest).userId;
  const { id } = req.params;
  log.step(`user=${userId}  id=${id}`);

  try {
    const { data, error } = await db()
      .from("cart_items")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error) {
      log.error("delete failed", error).end("CART REMOVE");
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      log.warn(`item not found  id=${id}`).end("CART REMOVE");
      res.status(404).json({ error: "Cart item not found" });
      return;
    }

    log.success(`removed  id=${id}`).end("CART REMOVE");
    res.json({ ok: true });
  } catch (err) {
    log.error("unhandled error", err).end("CART REMOVE");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
