import { performance } from "perf_hooks";
import { Router, type Request, type Response } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { createLog, fms } from "../lib/logger.js";
import { redisGet, redisSet, redisDel, redisKey, CART_TTL_S } from "../lib/redis.js";
import { fetchProductsBySkus } from "../lib/productsBySku.js";
import { logActivity } from "../lib/activityLog.js";
import type { ProductRow, VariantRow, ImageRow } from "../lib/catalogRowTypes.js";

const router = Router();
const db = () => supabaseAdmin ?? supabaseAnon;
const cartKey = (userId: string) => redisKey("cart", userId);

// Hard ceiling for a single cart line. Enforced on every write path here (add,
// increment, qty update, size/color merges), mirrored client-side in the steppers,
// and backstopped in the DB (cart_items_quantity_max + move_wishlist_to_cart's
// LEAST clamp — migration 20260710_cart_qty_cap.sql).
const MAX_QTY = 99;

// ─── GET /api/cart ─────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("CART GET");
  const userId = (req as AuthenticatedRequest).userId;
  log.step(`user=${userId}  client=${supabaseAdmin ? "admin" : "anon"}`);

  try {
    // ── L2 Redis cache check ──────────────────────────────────────────────────
    const cacheKey = cartKey(userId);
    const cached = await redisGet<{ items: unknown[] }>(cacheKey, log);
    if (cached) {
      log.success(`cache HIT  items=${cached.items.length}  total=${fms(log.elapsed())}`).end("CART GET");
      res.json(cached);
      return;
    }

    // ── DB: cart_items ────────────────────────────────────────────────────────
    const t0CartItems = performance.now();
    const { data: cartRows, error: cartErr } = await db()
      .from("cart_items")
      .select("id, sku, size, quantity, product_slug, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    log.step(`DB cart_items: ${fms(performance.now() - t0CartItems)}  rows=${cartRows?.length ?? 0}`);

    if (cartErr) {
      log.error(`cart_items query failed  code=${cartErr.code}  hint=${cartErr.hint}  msg=${cartErr.message}`, cartErr).end("CART GET");
      res.status(500).json({ error: cartErr.message });
      return;
    }

    if (!cartRows || cartRows.length === 0) {
      void redisSet(cacheKey, { items: [] }, CART_TTL_S, log);
      log.success(`empty cart  total=${fms(log.elapsed())}`).end("CART GET");
      res.json({ items: [] });
      return;
    }

    // ── DB: products (with variants + images) ─────────────────────────────────
    // Resolved by SKU, not by the stored product_slug: slugs are non-unique and go
    // stale when a product is renamed (title edit → new slug on republish), which
    // used to make live lines unresolvable — and the self-heal below then DELETED
    // them from the cart. The SKU never changes, so it is the resolver; the stored
    // slug is display-only and healed further down when it drifts.
    const skus = [...new Set(cartRows.map((r) => r.sku as string))];
    const t0Products = performance.now();
    const { data: products, error: prodErr } = await fetchProductsBySkus(
      db(),
      skus,
      `
        title, slug, category_slug, base_sku, price, original_price, tags, badges, sizes, is_unlimited,
        is_featured, is_new_arrival, is_trending, is_bestseller,
        product_images(id, image_url, is_primary, sort_order, variant_id),
        product_variants(id, variant_sku, color_name, color_hex, stock, is_unlimited, sort_order)
      `,
      log,
    );
    log.step(`DB products: ${fms(performance.now() - t0Products)}  skus=${skus.length}  rows=${products?.length ?? 0}`);

    if (prodErr) {
      log.error("product fetch failed", prodErr).end("CART GET");
      res.status(500).json({ error: prodErr.message });
      return;
    }

    // ── Item mapping ──────────────────────────────────────────────────────────
    const t0Map = performance.now();
    // Index by SKU, not slug: slugs are non-unique, so resolve each cart line to its
    // exact product by the (globally unique) base_sku / variant_sku it was added with.
    const skuToProduct = new Map<string, ProductRow>();
    for (const p of (products ?? []) as unknown as ProductRow[]) {
      if (p.base_sku) skuToProduct.set(p.base_sku as string, p);
      for (const v of p.product_variants ?? []) skuToProduct.set(v.variant_sku, p);
    }

    const items = cartRows
      .map((row) => {
        const product = skuToProduct.get(row.sku as string);
        if (!product) return null;

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
          colors: variants.map((v) => ({
            name: (v.color_name ?? "") as string,
            hex: (v.color_hex ?? "#cccccc") as string,
            sku: v.variant_sku as string,
          })),
          availability,
          stock,
          isUnlimited,
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
    log.step(`item mapping: ${fms(performance.now() - t0Map)}  items=${items.length}`);

    // ── Self-heal: refresh stale slugs, prune rows whose SKU no longer exists ─
    // Two distinct cases now that resolution is SKU-based:
    //   1. SKU resolves but the stored product_slug drifted (product renamed → new
    //      slug on republish). The line is alive — UPDATE the stored slug so the
    //      row stays accurate for anything that still reads it (activity feed, logs).
    //   2. SKU resolves to nothing anywhere in the catalog (product deleted, or the
    //      variant SKU itself removed). Truly dead — delete, so the DB matches what
    //      the customer sees. Both are best-effort: a failure just retries next read.
    const driftedBySlug = new Map<string, string[]>(); // live slug → cart row ids
    for (const row of cartRows) {
      const product = skuToProduct.get(row.sku as string);
      const liveSlug = product?.slug as string | undefined;
      if (product && liveSlug && liveSlug !== (row.product_slug as string)) {
        const ids = driftedBySlug.get(liveSlug) ?? [];
        ids.push(row.id as string);
        driftedBySlug.set(liveSlug, ids);
      }
    }
    if (driftedBySlug.size > 0) {
      const driftedCount = [...driftedBySlug.values()].reduce((n, ids) => n + ids.length, 0);
      log.warn(`healing ${driftedCount} cart row(s) with a stale product_slug (product renamed)`);
      for (const [liveSlug, ids] of driftedBySlug) {
        const { error: healErr } = await db().from("cart_items").update({ product_slug: liveSlug }).in("id", ids);
        if (healErr) log.warn(`slug heal failed (non-fatal): ${healErr.message}`);
      }
    }

    const deadRows = cartRows.filter((r) => !skuToProduct.has(r.sku as string));
    if (deadRows.length > 0) {
      const deadIds = deadRows.map((r) => r.id as string);
      log.warn(`pruning ${deadRows.length} dead cart row(s) — sku no longer exists in the catalog: ${deadRows.map((r) => r.sku).join(", ")}`);
      const { error: pruneErr } = await db().from("cart_items").delete().in("id", deadIds);
      if (pruneErr) log.warn(`cart prune failed (non-fatal): ${pruneErr.message}`);
    }

    // ── Cache + respond ───────────────────────────────────────────────────────
    const payload = { items };
    await redisSet(cacheKey, payload, CART_TTL_S, log);
    log.success(`cache MISS → SET  items=${items.length}  total=${fms(log.elapsed())}`).end("CART GET");
    res.json(payload);
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

  if (!sku || typeof sku !== "string") {
    log.warn("missing sku").end("CART ADD");
    res.status(400).json({ error: "sku is required" });
    return;
  }

  const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(quantity) || 1)));
  const sizeVal = typeof size === "string" ? size.trim() : "";

  log.step(`user=${userId}  slug=${product_slug ?? "∅"}  sku=${sku}  size="${sizeVal}"  qty=${qty}  client=${supabaseAdmin ? "admin" : "anon"}`);

  try {
    // Validate by SKU, not slug: the sku (variant_sku or base_sku) is globally unique
    // and self-identifying. Resolve the owning product's CURRENT slug server-side and
    // store THAT — the client's product_slug is never trusted (same idiom as wishlist
    // /add), so a mismatched or stale slug+sku pair can't be persisted.
    const t0Validate = performance.now();
    let serverSlug: string | null = null;
    let isUnlimited = false;
    let stock: number | null = null;

    const { data: variantRows, error: vErr } = await db()
      .from("products")
      .select("slug, is_unlimited, product_variants!inner(variant_sku, stock, is_unlimited)")
      .eq("product_variants.variant_sku", sku)
      .limit(1);
    if (vErr) {
      log.error(`variant validation failed  code=${vErr.code}  msg=${vErr.message}`, vErr).end("CART ADD");
      res.status(500).json({ error: "Could not validate product" });
      return;
    }
    serverSlug = (variantRows?.[0]?.slug as string | undefined) ?? null;
    if (serverSlug && variantRows?.[0]?.product_variants?.[0]) {
      const v = variantRows[0].product_variants[0];
      isUnlimited = !!v.is_unlimited || !!variantRows[0].is_unlimited;
      stock = isUnlimited ? null : (v.stock ?? 0);
    }

    if (!serverSlug) {
      const { data: baseRow, error: bErr } = await db()
        .from("products")
        .select("slug, is_unlimited")
        .eq("base_sku", sku)
        .maybeSingle();
      if (bErr) {
        log.error(`base-sku validation failed  code=${bErr.code}  msg=${bErr.message}`, bErr).end("CART ADD");
        res.status(500).json({ error: "Could not validate product" });
        return;
      }
      serverSlug = (baseRow?.slug as string | undefined) ?? null;
      if (serverSlug) {
        isUnlimited = !!baseRow?.is_unlimited;
        stock = isUnlimited ? null : 0;
      }
    }
    log.step(`DB sku validate: ${fms(performance.now() - t0Validate)}  slug=${serverSlug ?? "∅"}`);

    if (!serverSlug) {
      log.warn(`sku not found  sku=${sku}`).end("CART ADD");
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (typeof product_slug === "string" && product_slug && product_slug !== serverSlug) {
      log.warn(`client slug mismatch  client=${product_slug}  server=${serverSlug} — using server slug`);
    }

    const maxAllowed = isUnlimited ? MAX_QTY : Math.min(MAX_QTY, stock ?? 0);
    const clampedQty = Math.min(maxAllowed, qty);

    if (clampedQty <= 0) {
      log.warn(`out of stock  sku=${sku}`).end("CART ADD");
      res.status(409).json({ error: "Product is out of stock" });
      return;
    }

    const t0Conflict = performance.now();
    const { data: existing, error: existErr } = await db()
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", userId)
      .eq("sku", sku)
      .eq("size", sizeVal)
      .maybeSingle();
    log.step(`DB conflict check: ${fms(performance.now() - t0Conflict)}  existing=${!!existing}`);

    if (existErr) {
      log.error(`existing row check failed  code=${existErr.code}  msg=${existErr.message}`, existErr).end("CART ADD");
      res.status(500).json({ error: existErr.message });
      return;
    }

    if (existing) {
      const newQty = Math.min(maxAllowed, (existing.quantity as number) + clampedQty);
      const t0Write = performance.now();
      const { error: updateErr } = await db()
        .from("cart_items")
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      log.step(`DB increment: ${fms(performance.now() - t0Write)}`);

      if (updateErr) {
        log.error(`increment failed  code=${updateErr.code}  msg=${updateErr.message}`, updateErr).end("CART ADD");
        res.status(500).json({ error: updateErr.message });
        return;
      }

      await redisDel(log, cartKey(userId));

      // Analytics: the INSERT trigger only sees brand-new rows, so a re-add that
      // lands as a quantity increment is logged here (delta actually applied, so a
      // 99-cap clamp doesn't overcount). Fire-and-forget.
      const applied = newQty - (existing.quantity as number);
      if (applied > 0) {
        void logActivity({
          type: "cart_add",
          userId,
          productSlug: serverSlug,
          sku,
          metadata: { size: sizeVal, quantity: applied, via: "increment" },
        });
      }

      log.success(`incremented  id=${existing.id}  qty=${existing.quantity}→${newQty}  total=${fms(log.elapsed())}`).end("CART ADD");
      res.json({ ok: true, action: "incremented", cartItemId: existing.id, quantity: newQty });
    } else {
      const t0Write = performance.now();
      const { data: inserted, error: insertErr } = await db()
        .from("cart_items")
        .insert({ user_id: userId, product_slug: serverSlug, sku, size: sizeVal, quantity: clampedQty })
        .select("id")
        .single();
      log.step(`DB insert: ${fms(performance.now() - t0Write)}`);

      if (insertErr) {
        log.error(`insert failed  code=${insertErr.code}  msg=${insertErr.message}`, insertErr).end("CART ADD");
        res.status(500).json({ error: insertErr.message });
        return;
      }

      await redisDel(log, cartKey(userId));
      log.success(`inserted  id=${inserted.id}  total=${fms(log.elapsed())}`).end("CART ADD");
      res.status(201).json({ ok: true, action: "added", cartItemId: inserted.id, quantity: clampedQty });
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
    const t0Fetch = performance.now();
    const { data: current, error: fetchErr } = await db()
      .from("cart_items")
      .select("id, sku, size, quantity, product_slug")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    log.step(`DB fetch item: ${fms(performance.now() - t0Fetch)}`);

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

    // Validate the new SKU belongs to the same product. The owning product is resolved
    // by the row's CURRENT sku, never by the stored slug: slugs are non-unique (a
    // .eq("slug").maybeSingle() throws when two products share one) and go stale after
    // a rename — the sku is the identity.
    const t0Validate = performance.now();
    const { data: skuOwner, error: ownerErr } = await db()
      .from("product_variants")
      .select("product_id")
      .eq("variant_sku", current.sku as string)
      .maybeSingle();
    if (ownerErr) {
      log.error("sku owner lookup failed", ownerErr).end("CART UPDATE COLOR");
      res.status(500).json({ error: "Could not validate SKU" });
      return;
    }
    const productSelect = db().from("products").select("slug, is_unlimited, product_variants(variant_sku, stock, is_unlimited)");
    const { data: product, error: prodErr } = await (skuOwner
      ? productSelect.eq("id", skuOwner.product_id as string)
      : productSelect.eq("base_sku", current.sku as string)
    ).maybeSingle();
    log.step(`DB product validate: ${fms(performance.now() - t0Validate)}  via=${skuOwner ? "variant_sku" : "base_sku"}`);

    if (prodErr || !product) {
      log.error("product fetch failed", prodErr).end("CART UPDATE COLOR");
      res.status(500).json({ error: "Could not validate SKU" });
      return;
    }
    const validSkus: string[] = [
      product.base_sku as string,
      ...((product.product_variants as { variant_sku: string }[] ?? []).map((v) => v.variant_sku)),
    ];
    if (!validSkus.includes(newSku)) {
      log.warn(`sku not on product  newSku=${newSku}`).end("CART UPDATE COLOR");
      res.status(400).json({ error: "SKU does not belong to this product" });
      return;
    }

    const variantData = (product.product_variants as any[] ?? []).find(v => v.variant_sku === newSku);
    const isUnlimited = variantData ? !!variantData.is_unlimited : !!product.is_unlimited;
    const stock = isUnlimited ? null : (variantData?.stock ?? 0);
    const maxAllowed = isUnlimited ? MAX_QTY : Math.min(MAX_QTY, stock ?? 0);

    // Check for an existing item with the new SKU + same size
    const t0Conflict = performance.now();
    const { data: conflict } = await db()
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", userId)
      .eq("sku", newSku)
      .eq("size", current.size as string)
      .neq("id", id)
      .maybeSingle();
    log.step(`DB conflict check: ${fms(performance.now() - t0Conflict)}  conflict=${!!conflict}`);

    if (conflict) {
      const mergedQty = Math.min(maxAllowed, (conflict.quantity as number) + (current.quantity as number));
      const t0Merge = performance.now();
      const { error: mergeErr } = await db()
        .from("cart_items")
        .update({ quantity: mergedQty, product_slug: product.slug as string, updated_at: new Date().toISOString() })
        .eq("id", conflict.id);
      if (mergeErr) {
        log.error("merge failed", mergeErr).end("CART UPDATE COLOR");
        res.status(500).json({ error: mergeErr.message });
        return;
      }
      await db().from("cart_items").delete().eq("id", id).eq("user_id", userId);
      log.step(`DB merge+delete: ${fms(performance.now() - t0Merge)}`);
      await redisDel(log, cartKey(userId));
      log.success(`merged  qty=${mergedQty}  total=${fms(log.elapsed())}`).end("CART UPDATE COLOR");
      res.json({ ok: true, action: "merged", mergedId: conflict.id, quantity: mergedQty });
      return;
    }

    // product_slug is refreshed alongside the sku so a stale stored slug heals here too.
    const clampedCurrentQty = Math.min(maxAllowed, current.quantity as number);
    const t0Write = performance.now();
    const { error: updateErr } = await db()
      .from("cart_items")
      .update({ sku: newSku, quantity: clampedCurrentQty, product_slug: product.slug as string, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
    log.step(`DB update sku: ${fms(performance.now() - t0Write)}`);

    if (updateErr) {
      log.error("update failed", updateErr).end("CART UPDATE COLOR");
      res.status(500).json({ error: updateErr.message });
      return;
    }

    await redisDel(log, cartKey(userId));
    log.success(`color updated  id=${id}  sku="${newSku}"  total=${fms(log.elapsed())}`).end("CART UPDATE COLOR");
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
    const t0Fetch = performance.now();
    const { data: current, error: fetchErr } = await db()
      .from("cart_items")
      .select("id, sku, quantity")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    log.step(`DB fetch item: ${fms(performance.now() - t0Fetch)}`);

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

    // To cap merging properly, fetch stock for current sku
    const t0Validate = performance.now();
    const { data: skuOwner } = await db()
      .from("product_variants")
      .select("product_id")
      .eq("variant_sku", current.sku as string)
      .maybeSingle();
    const productSelect = db().from("products").select("is_unlimited, product_variants(variant_sku, stock, is_unlimited)");
    const { data: product } = await (skuOwner
      ? productSelect.eq("id", skuOwner.product_id as string)
      : productSelect.eq("base_sku", current.sku as string)
    ).maybeSingle();
    
    let maxAllowed = MAX_QTY;
    if (product) {
      const variantData = (product.product_variants as any[] ?? []).find(v => v.variant_sku === current.sku);
      const isUnlimited = variantData ? !!variantData.is_unlimited : !!product.is_unlimited;
      const stock = isUnlimited ? null : (variantData?.stock ?? 0);
      maxAllowed = isUnlimited ? MAX_QTY : Math.min(MAX_QTY, stock ?? 0);
    }
    log.step(`DB product validate: ${fms(performance.now() - t0Validate)}  maxAllowed=${maxAllowed}`);

    // Check if an item with the same sku + newSize already exists
    const t0Conflict = performance.now();
    const { data: conflict } = await db()
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", userId)
      .eq("sku", current.sku as string)
      .eq("size", newSize)
      .neq("id", id)
      .maybeSingle();
    log.step(`DB conflict check: ${fms(performance.now() - t0Conflict)}  conflict=${!!conflict}`);

    if (conflict) {
      // Merge: add quantities into the existing item, delete the current one
      const mergedQty = Math.min(maxAllowed, (conflict.quantity as number) + (current.quantity as number));
      const t0Merge = performance.now();
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
      log.step(`DB merge+delete: ${fms(performance.now() - t0Merge)}`);
      await redisDel(log, cartKey(userId));
      log.success(`merged into existing item  qty=${mergedQty}  total=${fms(log.elapsed())}`).end("CART UPDATE SIZE");
      res.json({ ok: true, action: "merged", mergedId: conflict.id, quantity: mergedQty });
      return;
    }

    // No conflict — plain size update
    const t0Write = performance.now();
    const { error: updateErr } = await db()
      .from("cart_items")
      .update({ size: newSize, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
    log.step(`DB update size: ${fms(performance.now() - t0Write)}`);

    if (updateErr) {
      log.error("update failed", updateErr).end("CART UPDATE SIZE");
      res.status(500).json({ error: updateErr.message });
      return;
    }

    await redisDel(log, cartKey(userId));
    log.success(`size updated  id=${id}  size="${newSize}"  total=${fms(log.elapsed())}`).end("CART UPDATE SIZE");
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
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
    log.warn(`invalid quantity=${quantity}`).end("CART UPDATE QTY");
    res.status(400).json({ error: `quantity must be an integer between 1 and ${MAX_QTY}` });
    return;
  }

  log.step(`user=${userId}  id=${id}  qty=${qty}`);

  try {
    // Read the current row first: analytics needs the old quantity to classify the
    // change (stepper up = cart_add, stepper down = cart_remove, each with the delta).
    const t0Fetch = performance.now();
    const { data: current, error: fetchErr } = await db()
      .from("cart_items")
      .select("id, quantity, product_slug, sku, size")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    log.step(`DB fetch item: ${fms(performance.now() - t0Fetch)}`);

    if (fetchErr) {
      log.error("fetch failed", fetchErr).end("CART UPDATE QTY");
      res.status(500).json({ error: fetchErr.message });
      return;
    }
    if (!current) {
      log.warn(`item not found  id=${id}`).end("CART UPDATE QTY");
      res.status(404).json({ error: "Cart item not found" });
      return;
    }

    const t0Validate = performance.now();
    const { data: skuOwner } = await db()
      .from("product_variants")
      .select("product_id")
      .eq("variant_sku", current.sku as string)
      .maybeSingle();
    const productSelect = db().from("products").select("is_unlimited, product_variants(variant_sku, stock, is_unlimited)");
    const { data: product } = await (skuOwner
      ? productSelect.eq("id", skuOwner.product_id as string)
      : productSelect.eq("base_sku", current.sku as string)
    ).maybeSingle();
    
    let maxAllowed = MAX_QTY;
    if (product) {
      const variantData = (product.product_variants as any[] ?? []).find(v => v.variant_sku === current.sku);
      const isUnlimited = variantData ? !!variantData.is_unlimited : !!product.is_unlimited;
      const stock = isUnlimited ? null : (variantData?.stock ?? 0);
      maxAllowed = isUnlimited ? MAX_QTY : Math.min(MAX_QTY, stock ?? 0);
    }
    log.step(`DB product validate: ${fms(performance.now() - t0Validate)}  maxAllowed=${maxAllowed}`);

    const clampedQty = Math.min(maxAllowed, qty);

    const t0Write = performance.now();
    const { data, error } = await db()
      .from("cart_items")
      .update({ quantity: clampedQty, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id, quantity")
      .maybeSingle();
    log.step(`DB update qty: ${fms(performance.now() - t0Write)}`);

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

    await redisDel(log, cartKey(userId));

    // Analytics: log the applied delta as an add or remove. Fire-and-forget.
    const delta = qty - (current.quantity as number);
    if (delta !== 0) {
      void logActivity({
        type: delta > 0 ? "cart_add" : "cart_remove",
        userId,
        productSlug: current.product_slug as string,
        sku: current.sku as string,
        metadata: { size: current.size as string, quantity: Math.abs(delta), via: "quantity_update" },
      });
    }

    log.success(`updated  id=${id}  qty=${qty}  total=${fms(log.elapsed())}`).end("CART UPDATE QTY");
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
    const t0Write = performance.now();
    const { error } = await db()
      .from("cart_items")
      .delete()
      .eq("user_id", userId);
    log.step(`DB delete all: ${fms(performance.now() - t0Write)}`);

    if (error) {
      log.error("clear failed", error).end("CART CLEAR");
      res.status(500).json({ error: error.message });
      return;
    }

    await redisDel(log, cartKey(userId));
    log.success(`cart cleared  total=${fms(log.elapsed())}`).end("CART CLEAR");
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
    const t0Write = performance.now();
    const { data, error } = await db()
      .from("cart_items")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id, product_slug, sku, size, quantity")
      .maybeSingle();
    log.step(`DB delete item: ${fms(performance.now() - t0Write)}`);

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

    await redisDel(log, cartKey(userId));

    // Analytics: an explicit line removal (the only remove path a customer sees).
    // Post-checkout clearing happens inside place_order and is deliberately NOT a
    // remove — a purchase is not an abandonment. Fire-and-forget.
    void logActivity({
      type: "cart_remove",
      userId,
      productSlug: data.product_slug as string,
      sku: data.sku as string,
      metadata: { size: data.size as string, quantity: data.quantity as number, via: "remove" },
    });

    log.success(`removed  id=${id}  total=${fms(log.elapsed())}`).end("CART REMOVE");
    res.json({ ok: true });
  } catch (err) {
    log.error("unhandled error", err).end("CART REMOVE");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
