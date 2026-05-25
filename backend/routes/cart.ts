import { Router, type Request, type Response } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { createLog } from "../lib/logger.js";

const router = Router();
const db = () => supabaseAdmin ?? supabaseAnon;

// ���── Helper: log full Supabase error object ───────────────────────────────────
function logSupabaseError(label: string, err: unknown) {
  const e = err as Record<string, unknown> | null;
  console.error(`[CART] ${label}`, {
    message: (e as any)?.message,
    code:    (e as any)?.code,
    details: (e as any)?.details,
    hint:    (e as any)?.hint,
    raw:     JSON.stringify(e),
  });
}

// ─── GET /api/cart/ping — no-auth diagnostic ──────────────────────────────────
// Verifies the backend can query cart_items at all. Call from browser:
// GET http://localhost:5000/api/cart/ping
router.get("/ping", async (_req: Request, res: Response) => {
  console.log("[CART PING] testing cart_items access");
  console.log("[CART PING] using client:", supabaseAdmin ? "supabaseAdmin (service role)" : "supabaseAnon");

  const { data, error } = await db()
    .from("cart_items")
    .select("id")
    .limit(1);

  if (error) {
    logSupabaseError("ping failed", error);
    res.status(500).json({
      ok: false,
      error: error.message,
      code: (error as any).code,
      hint: (error as any).hint,
      details: (error as any).details,
    });
    return;
  }

  console.log("[CART PING] success — cart_items accessible, sample row count:", data?.length ?? 0);
  res.json({ ok: true, rowsReturned: data?.length ?? 0 });
});

// ─── GET /api/cart ─────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("CART GET");
  const userId = (req as AuthenticatedRequest).userId;
  log.step(`user=${userId}`);
  console.log(`[CART GET] user=${userId}  client=${supabaseAdmin ? "admin" : "anon"}`);

  try {
    // 1. Fetch all cart rows for this user
    console.log("[CART GET] querying cart_items...");
    const { data: cartRows, error: cartErr } = await db()
      .from("cart_items")
      .select("id, sku, size, quantity, product_slug, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (cartErr) {
      logSupabaseError("cart_items query failed", cartErr);
      log.error("cart fetch failed", cartErr).end("CART GET");
      res.status(500).json({
        error: cartErr.message,
        code: (cartErr as any).code,
        hint: (cartErr as any).hint,
      });
      return;
    }
    console.log(`[CART GET] cart_items rows=${cartRows?.length ?? 0}`);

    if (!cartRows || cartRows.length === 0) {
      log.success("empty cart").end("CART GET");
      res.json({ items: [] });
      return;
    }

    // 2. Batch-fetch product data for all unique slugs
    const slugs = [...new Set(cartRows.map((r) => r.product_slug as string))];
    const { data: products, error: prodErr } = await db()
      .from("products")
      .select(`
        title, slug, category_slug, price, original_price, tags, base_sku, is_unlimited,
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

    // 3. Enrich each cart row with live product data
    const items = cartRows
      .map((row) => {
        const product = productMap.get(row.product_slug as string);
        if (!product) return null; // product may have been deleted

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
          color: {
            name: (variant?.color_name ?? "") as string,
            hex: (variant?.color_hex ?? "#cccccc") as string,
          },
          availability,
          tags: (product.tags ?? []) as string[],
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

  log.step(`user=${userId}  slug=${product_slug}  sku=${sku}  size="${sizeVal}"  qty=${qty}`);
  console.log(`[CART ADD] user=${userId}  slug=${product_slug}  sku=${sku}  size="${sizeVal}"  qty=${qty}`);
  console.log(`[CART ADD] client=${supabaseAdmin ? "admin" : "anon"}`);

  try {
    // Validate product exists and SKU belongs to it
    console.log("[CART ADD] validating product...");
    const { data: product, error: prodErr } = await db()
      .from("products")
      .select("base_sku, product_variants(variant_sku)")
      .eq("slug", product_slug)
      .maybeSingle();

    if (prodErr) {
      logSupabaseError("product validation failed", prodErr);
      log.error("product validation failed", prodErr).end("CART ADD");
      res.status(500).json({
        error: "Could not validate product",
        code: (prodErr as any).code,
        hint: (prodErr as any).hint,
      });
      return;
    }
    console.log(`[CART ADD] product found=${!!product}`);
    if (!product) {
      log.warn(`product not found  slug=${product_slug}`).end("CART ADD");
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const validSkus: string[] = [
      product.base_sku as string,
      ...((product.product_variants as any[] ?? []).map((v: any) => v.variant_sku as string)),
    ];
    if (!validSkus.includes(sku)) {
      log.warn(`invalid sku=${sku} for slug=${product_slug}`).end("CART ADD");
      res.status(400).json({ error: "SKU does not belong to this product" });
      return;
    }

    // Check for existing row — if found, increment quantity
    console.log("[CART ADD] checking for existing cart_items row...");
    const { data: existing, error: existErr } = await db()
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", userId)
      .eq("sku", sku)
      .eq("size", sizeVal)
      .maybeSingle();

    if (existErr) {
      logSupabaseError("existing row check failed", existErr);
      log.error("existing row check failed", existErr).end("CART ADD");
      res.status(500).json({
        error: existErr.message,
        code: (existErr as any).code,
        hint: (existErr as any).hint,
      });
      return;
    }
    console.log(`[CART ADD] existing row found=${!!existing}`);

    if (existing) {
      const newQty = (existing.quantity as number) + qty;
      console.log(`[CART ADD] incrementing id=${existing.id}  ${existing.quantity}→${newQty}`);
      const { error: updateErr } = await db()
        .from("cart_items")
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq("id", existing.id);

      if (updateErr) {
        logSupabaseError("increment failed", updateErr);
        log.error("quantity increment failed", updateErr).end("CART ADD");
        res.status(500).json({
          error: updateErr.message,
          code: (updateErr as any).code,
          hint: (updateErr as any).hint,
        });
        return;
      }

      log.success(`incremented  id=${existing.id}  qty=${existing.quantity}→${newQty}`).end("CART ADD");
      res.json({ ok: true, action: "incremented", cartItemId: existing.id, quantity: newQty });
    } else {
      console.log("[CART ADD] inserting new row into cart_items...");
      const { data: inserted, error: insertErr } = await db()
        .from("cart_items")
        .insert({ user_id: userId, product_slug, sku, size: sizeVal, quantity: qty })
        .select("id")
        .single();

      if (insertErr) {
        logSupabaseError("insert failed", insertErr);
        log.error("insert failed", insertErr).end("CART ADD");
        res.status(500).json({
          error: insertErr.message,
          code: (insertErr as any).code,
          hint: (insertErr as any).hint,
        });
        return;
      }

      console.log(`[CART ADD] inserted id=${inserted.id}`);
      log.success(`inserted  id=${inserted.id}`).end("CART ADD");
      res.status(201).json({ ok: true, action: "added", cartItemId: inserted.id, quantity: qty });
    }
  } catch (err) {
    log.error("unhandled error", err).end("CART ADD");
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
// IMPORTANT: this route must be registered BEFORE /:id so /clear is not
// matched as an id parameter.
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
