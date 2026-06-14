import { performance } from "perf_hooks";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response, type RequestHandler } from "express";
import Razorpay from "razorpay";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { mutationLimiter } from "../middleware/rateLimiters.js";
import { createLog, fms, type OpLogger } from "../lib/logger.js";
import { redisGet, redisSet, redisDel, redisKey, CHECKOUT_TTL_S } from "../lib/redis.js";
import { sendOrderConfirmation } from "../lib/orderEmail.js";
import type { ProductRow, VariantRow, ImageRow } from "../lib/catalogRowTypes.js";

// ─── Razorpay-prepaid checkout: cart → order placement ──────────────────────────
// verify-then-create. /initiate prices the order server-side, creates a Razorpay
// order, and stashes the priced snapshot in Redis. The customer pays. /verify (and
// the /webhook backstop) verify the payment, then call the place_order RPC, which
// atomically writes the order, decrements stock, seeds the audit trail, and clears
// the cart. No DB order exists until payment is verified.

const router = Router();
const db = () => supabaseAdmin ?? supabaseAnon;

const checkoutKey = (razorpayOrderId: string) => redisKey("checkout", razorpayOrderId);
const orderListKey = (userId: string) => redisKey("order", `list:${userId}`);
const orderDetailKey = (userId: string, orderId: string) => redisKey("order", `detail:${userId}:${orderId}`);
const cartKey = (userId: string) => redisKey("cart", userId);

// ─── Razorpay client + config ────────────────────────────────────────────────────
const KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
const isConfigured = (): boolean => Boolean(KEY_ID && KEY_SECRET);
// Lazily constructed: the Razorpay SDK constructor THROWS when key_id is empty, so we
// must not build it at import time (the keys are a manual setup step — an unset env var
// would otherwise crash the whole backend on boot). Only the routes that actually hit
// Razorpay call this, and they're guarded by isConfigured().
let _razorpay: Razorpay | null = null;
function getRazorpay(): Razorpay {
  if (!_razorpay) _razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
  return _razorpay;
}

// ─── Pricing (authoritative; the frontend lib/pricing.ts mirrors the shipping rule) ─
// ₹199 shipping when 0 < subtotal ≤ 5000, free otherwise.
const FREE_SHIPPING_THRESHOLD = 5000;
const SHIPPING_FEE = 199;
function computeShipping(subtotal: number): number {
  return subtotal > 0 && subtotal <= FREE_SHIPPING_THRESHOLD ? SHIPPING_FEE : 0;
}

// One concrete coupon: FIRST10 = 10% off the subtotal, eligible only on a customer's
// first order. Validated live at /coupon, re-checked at /initiate + /verify, and
// finally asserted in the RPC (p_expect_first_order).
const COUPON_CODE = "FIRST10";
const COUPON_RATE = 0.1;

// ─── Types ────────────────────────────────────────────────────────────────────────
type CheckoutProduct = ProductRow & { id: string };

interface RawLine {
  product_slug: string;
  sku: string;
  size: string;
  quantity: number;
}

// Snake_case so the object doubles as the RPC's p_items element. stock/is_unlimited
// are extra keys used only for the early pre-check; the RPC ignores them.
interface PricedLine {
  product_id: string | null;
  product_slug: string;
  category_slug: string;
  sku: string;
  size: string;
  title: string;
  image_url: string;
  color_name: string;
  color_hex: string;
  unit_price: number;
  original_price: number;
  quantity: number;
  line_total: number;
  stock: number | null;
  is_unlimited: boolean;
}

// A cart line that can no longer be priced (variant/sku removed, or product deleted).
// Surfaced to the customer so they remove it — never silently dropped from the charge.
interface UnavailableLine {
  product_slug: string;
  sku: string;
  title: string;
}

interface AddressSnapshot {
  label: string | null;
  line1: string;
  line2: string;
  landmark: string | null;
  city: string;
  state: string;
  country: string;
  pincode: string;
}

interface CheckoutSnapshot {
  userId: string;
  mode: "cart" | "direct";
  address: AddressSnapshot;
  item: RawLine | null; // direct mode only — lets the webhook re-price without Redis
  items: PricedLine[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  itemCount: number;
  expectFirstOrder: boolean;
}

type Source = { mode: "cart" } | { mode: "direct"; item: RawLine };

// Small typed error so the pricing helpers can signal an HTTP status to the route.
class PriceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
function pickImage(product: CheckoutProduct, variant: VariantRow | null): string {
  const images: ImageRow[] = [...(product.product_images ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const variantImages = variant ? images.filter((img) => img.variant_id === variant.id) : [];
  return (
    variantImages.find((img) => !!img.is_primary)?.image_url ||
    variantImages[0]?.image_url ||
    images.find((img) => !!img.is_primary)?.image_url ||
    images[0]?.image_url ||
    ""
  );
}

// Returns true when the user has placed zero orders (FIRST10 eligibility).
async function isFirstOrder(userId: string, log: OpLogger): Promise<boolean> {
  const t0 = performance.now();
  const { count, error } = await db()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    log.error(`first-order check failed  ${error.message}`, error);
    throw new PriceError(500, "Could not check order history");
  }
  const first = (count ?? 0) === 0;
  log.step(`DB first-order check: ${fms(performance.now() - t0)}  existingOrders=${count ?? 0}  → ${first ? "FIRST order (eligible)" : "not first"}`);
  return first;
}

// Price a cart or a single direct item into line snapshots + subtotal/shipping. No
// discount applied here — the caller layers that on.
async function priceOrder(
  userId: string,
  source: Source,
  log: OpLogger,
): Promise<{ items: PricedLine[]; subtotal: number; shippingFee: number; itemCount: number; unavailable: UnavailableLine[] }> {
  let rawLines: RawLine[];
  if (source.mode === "cart") {
    const t0Cart = performance.now();
    const { data: cartRows, error } = await db()
      .from("cart_items")
      .select("sku, size, quantity, product_slug")
      .eq("user_id", userId);
    if (error) { log.error(`cart read failed  ${error.message}`, error); throw new PriceError(500, "Could not read cart"); }
    log.step(`DB cart_items read: ${fms(performance.now() - t0Cart)}  rows=${cartRows?.length ?? 0}`);
    rawLines = (cartRows ?? []).map((r) => ({
      product_slug: r.product_slug as string,
      sku: r.sku as string,
      size: (r.size as string) ?? "",
      quantity: r.quantity as number,
    }));
  } else {
    rawLines = [source.item];
    log.step(`direct item  slug=${source.item.product_slug}  sku=${source.item.sku}  size="${source.item.size}"  qty=${source.item.quantity}`);
  }
  log.step(`pricing source=${source.mode}  rawLines=${rawLines.length}`);

  if (rawLines.length === 0) return { items: [], subtotal: 0, shippingFee: 0, itemCount: 0, unavailable: [] };

  const slugs = [...new Set(rawLines.map((l) => l.product_slug))];
  const t0Prod = performance.now();
  const { data: products, error: prodErr } = await db()
    .from("products")
    .select(`
      id, title, slug, category_slug, base_sku, price, original_price, is_unlimited,
      product_images(id, image_url, is_primary, sort_order, variant_id),
      product_variants(id, variant_sku, color_name, color_hex, stock, is_unlimited, sort_order)
    `)
    .in("slug", slugs);
  if (prodErr) { log.error(`products read failed  ${prodErr.message}`, prodErr); throw new PriceError(500, "Could not price order"); }
  log.step(`DB products read: ${fms(performance.now() - t0Prod)}  slugs=${slugs.length}  rows=${products?.length ?? 0}`);

  // Index by SKU, not slug: slugs are non-unique, so two fetched products can share a
  // slug — a slug-keyed map would collapse them and mis-price. Every base_sku and every
  // variant_sku is globally unique, so a per-sku index resolves each line to the exact
  // product even when slugs collide.
  const skuToProduct = new Map<string, CheckoutProduct>();
  for (const p of (products ?? []) as unknown as CheckoutProduct[]) {
    if (p.base_sku) skuToProduct.set(p.base_sku as string, p);
    for (const v of p.product_variants ?? []) skuToProduct.set(v.variant_sku, p);
  }

  const items: PricedLine[] = [];
  const unavailable: UnavailableLine[] = [];
  for (const line of rawLines) {
    const product = skuToProduct.get(line.sku);
    if (!product) {
      // The line's sku no longer resolves to a product (its variant/sku was removed, the
      // product was deleted, or its slug changed since add-to-cart). A direct buy is an
      // error; a stale cart line is flagged unavailable — NOT silently dropped, which
      // would undercharge vs. what the cart shows.
      if (source.mode === "direct") throw new PriceError(404, "Product not found");
      log.warn(`unavailable cart line — sku no longer resolves  slug=${line.product_slug}  sku=${line.sku}`);
      unavailable.push({ product_slug: line.product_slug, sku: line.sku, title: line.product_slug });
      continue;
    }

    const variants: VariantRow[] = [...(product.product_variants ?? [])];
    const variant = variants.find((v) => v.variant_sku === line.sku) ?? null;
    const isUnlimited = variant ? !!variant.is_unlimited : !!product.is_unlimited;
    const stock: number | null = isUnlimited ? null : (variant?.stock ?? 0);
    const unitPrice = Number(product.price) || 0;
    const originalPrice = Number(product.original_price ?? product.price) || unitPrice;
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));

    items.push({
      product_id: product.id,
      product_slug: product.slug as string,
      category_slug: (product.category_slug as string) ?? "",
      sku: line.sku,
      size: line.size ?? "",
      title: (product.title as string) ?? "",
      image_url: pickImage(product, variant),
      color_name: variant?.color_name ?? "",
      color_hex: variant?.color_hex ?? "",
      unit_price: unitPrice,
      original_price: originalPrice,
      quantity: qty,
      line_total: unitPrice * qty,
      stock,
      is_unlimited: isUnlimited,
    });
    log.step(`  priced line  sku=${line.sku}  "${(product.title as string ?? "").slice(0, 30)}"  ₹${unitPrice}×${qty}=₹${unitPrice * qty}  stock=${isUnlimited ? "∞" : stock}`);
  }

  const subtotal = items.reduce((s, it) => s + it.line_total, 0);
  const itemCount = items.reduce((s, it) => s + it.quantity, 0);
  const shippingFee = computeShipping(subtotal);
  log.step(`priced: ${items.length} line(s)  units=${itemCount}  subtotal=₹${subtotal}  shipping=₹${shippingFee}  unavailable=${unavailable.length}`);
  return { items, subtotal, shippingFee, itemCount, unavailable };
}

// First line whose stock can't cover its quantity (null = unlimited → always fine).
function findOversold(items: PricedLine[]): PricedLine | null {
  for (const it of items) {
    if (!it.is_unlimited && it.stock !== null && it.stock < it.quantity) return it;
  }
  return null;
}

// p_items for the RPC = the snapshot minus the pre-check-only fields.
function toRpcItems(items: PricedLine[]) {
  return items.map(({ stock: _stock, is_unlimited: _is_unlimited, ...snapshot }) => snapshot);
}

// Place the order through the locked RPC. Handles the rare discount_invalid retry
// (drop only the first-order assertion — the priced totals already match what was
// charged). Returns the RPC result row.
async function callPlaceOrder(
  snap: CheckoutSnapshot,
  paymentId: string,
  log: OpLogger,
): Promise<{ order_id: string | null; order_number: string | null; result: string }> {
  const args = {
    p_user_id: snap.userId,
    p_shipping_address: snap.address,
    p_items: toRpcItems(snap.items),
    p_subtotal: snap.subtotal,
    p_discount: snap.discount,
    p_shipping_fee: snap.shippingFee,
    p_total: snap.total,
    p_item_count: snap.itemCount,
    p_payment_method: "online",
    p_payment_status: "paid",
    p_status: "confirmed",
    p_transaction_id: paymentId,
    p_expect_first_order: snap.expectFirstOrder,
    p_clear_cart: snap.mode === "cart",
  };

  log.step(`RPC place_order →  user=${snap.userId}  items=${args.p_items.length}  total=₹${snap.total}  txn=${paymentId}  clearCart=${args.p_clear_cart}  expectFirst=${snap.expectFirstOrder}`);
  const t0 = performance.now();
  let { data, error } = await db().rpc("place_order", args);
  if (error) { log.error(`place_order RPC failed  ${error.message}`, error); throw new Error(`place_order failed: ${error.message}`); }
  let result = (Array.isArray(data) ? data[0] : data) as
    | { order_id: string | null; order_number: string | null; result: string }
    | undefined;
  log.step(`RPC place_order returned: ${fms(performance.now() - t0)}  result=${result?.result ?? "∅"}  order=${result?.order_number ?? "—"}`);

  if (result?.result === "discount_invalid") {
    log.warn("first-order assertion failed at placement — retrying once without it (totals already match the charge)");
    const t1 = performance.now();
    ({ data, error } = await db().rpc("place_order", { ...args, p_expect_first_order: false }));
    if (error) { log.error(`place_order retry failed  ${error.message}`, error); throw new Error(`place_order retry failed: ${error.message}`); }
    result = (Array.isArray(data) ? data[0] : data) as typeof result;
    log.step(`RPC place_order retry: ${fms(performance.now() - t1)}  result=${result?.result ?? "∅"}  order=${result?.order_number ?? "—"}`);
  }

  if (!result) throw new Error("place_order returned no row");
  return result;
}

// Post-placement: bust the owner's order + cart caches and drop the snapshot, then
// fire-and-forget the confirmation email. Shared by /verify and /webhook.
async function afterPlacement(snap: CheckoutSnapshot, razorpayOrderId: string, result: { order_id: string | null; order_number: string | null }, log: OpLogger): Promise<void> {
  const keys = [orderListKey(snap.userId), checkoutKey(razorpayOrderId)];
  if (result.order_id) keys.push(orderDetailKey(snap.userId, result.order_id));
  if (snap.mode === "cart") keys.push(cartKey(snap.userId));
  log.step(`post-placement: busting ${keys.length} cache key(s)${snap.mode === "cart" ? " (incl. cart)" : ""} + dropping checkout snapshot`);
  await redisDel(log, ...keys);

  // Fire-and-forget — a slow/failing email must never affect a paid, placed order.
  log.step(`queuing confirmation email (fire-and-forget)  order=${result.order_number ?? "—"}`);
  void (async () => {
    let email = "";
    try {
      const { data } = await db().from("profiles").select("email").eq("id", snap.userId).maybeSingle();
      email = (data?.email as string) ?? "";
    } catch { /* best-effort lookup for the stub */ }
    await sendOrderConfirmation({
      orderId: result.order_id ?? "",
      orderNumber: result.order_number ?? "",
      recipientEmail: email,
      total: snap.total,
      itemCount: snap.itemCount,
    });
  })();
}

// Recover the priced snapshot for a Razorpay order: Redis first (the exact quote the
// customer paid), else re-price from DB using the order notes and assert the
// recomputed total matches the captured amount — never place a drifted cart.
async function recoverSnapshot(razorpayOrderId: string, capturedPaise: number, log: OpLogger): Promise<CheckoutSnapshot | null> {
  const cached = await redisGet<CheckoutSnapshot>(checkoutKey(razorpayOrderId), log);
  if (cached) {
    log.step(`snapshot recovered from Redis  mode=${cached.mode}  items=${cached.items.length}  total=₹${cached.total}`);
    return cached;
  }

  log.warn("snapshot missing from Redis — falling back to Razorpay order notes + re-price");
  const t0 = performance.now();
  const rzpOrder = await getRazorpay().orders.fetch(razorpayOrderId);
  log.step(`razorpay order fetch: ${fms(performance.now() - t0)}`);
  const notes = (rzpOrder.notes ?? {}) as Record<string, string | number>;
  const userId = String(notes.userId ?? "");
  const addressId = String(notes.addressId ?? "");
  const mode = (String(notes.mode ?? "cart") === "direct" ? "direct" : "cart") as "cart" | "direct";
  if (!userId || !addressId) {
    log.error("notes fallback missing userId/addressId — cannot place");
    return null;
  }

  const address = await loadAddress(userId, addressId, log);
  if (!address) {
    log.error("notes fallback — address no longer exists");
    return null;
  }

  let source: Source;
  let directItem: RawLine | null = null;
  if (mode === "direct") {
    const itemRaw = typeof notes.item === "string" ? notes.item : "";
    try { directItem = itemRaw ? (JSON.parse(itemRaw) as RawLine) : null; } catch { directItem = null; }
    if (!directItem) { log.error("notes fallback — direct item unrecoverable"); return null; }
    source = { mode: "direct", item: directItem };
  } else {
    source = { mode: "cart" };
  }

  const priced = await priceOrder(userId, source, log);
  if (priced.items.length === 0) { log.error("notes fallback — nothing to price"); return null; }
  if (priced.unavailable.length > 0) { log.error(`notes fallback — ${priced.unavailable.length} line(s) now unavailable; refusing to place`); return null; }
  const firstOrder = await isFirstOrder(userId, log);
  // Re-apply FIRST10 if still eligible; the assert below guards against any drift.
  const discount = firstOrder ? Math.round(priced.subtotal * COUPON_RATE) : 0;
  const total = priced.subtotal + priced.shippingFee - discount;

  if (Math.round(total * 100) !== capturedPaise) {
    log.error(`notes fallback — recomputed total ₹${total} (${Math.round(total * 100)}p) ≠ captured ${capturedPaise}p; refusing to place`);
    return null;
  }

  return {
    userId, mode, address,
    item: directItem,
    items: priced.items, subtotal: priced.subtotal, discount,
    shippingFee: priced.shippingFee, total, itemCount: priced.itemCount,
    expectFirstOrder: firstOrder,
  };
}

// Idempotency: has this Razorpay payment already produced an order? Lets /verify and
// the webhook short-circuit a retry WITHOUT re-pricing (the snapshot is deleted on the
// first successful placement, and a first-order discount can't be re-derived once the
// order exists). The transaction_id unique index guarantees at most one row.
async function findPlacedOrder(paymentId: string, log: OpLogger): Promise<{ id: string; order_number: string } | null> {
  const t0 = performance.now();
  const { data } = await db()
    .from("orders")
    .select("id, order_number")
    .eq("transaction_id", paymentId)
    .maybeSingle();
  log.step(`DB idempotency lookup (transaction_id): ${fms(performance.now() - t0)}  → ${data ? `EXISTS ${(data.order_number as string)}` : "none"}`);
  if (!data) return null;
  return { id: data.id as string, order_number: data.order_number as string };
}

async function loadAddress(userId: string, addressId: string, log: OpLogger): Promise<AddressSnapshot | null> {
  const t0 = performance.now();
  const { data, error } = await db()
    .from("addresses")
    .select("id, label, line1, line2, landmark, city, state, country, pincode")
    .eq("id", addressId)
    .eq("user_id", userId)
    .maybeSingle();
  log.step(`DB address load: ${fms(performance.now() - t0)}  → ${data ? `found (${(data.city as string) ?? "?"})` : "not found / not owned"}`);
  if (error || !data) {
    if (error) log.warn(`address query error  ${error.message}`);
    return null;
  }
  return {
    label: (data.label as string) ?? null,
    line1: (data.line1 as string) ?? "",
    line2: (data.line2 as string) ?? "",
    landmark: (data.landmark as string) ?? null,
    city: (data.city as string) ?? "",
    state: (data.state as string) ?? "",
    country: (data.country as string) ?? "",
    pincode: (data.pincode as string) ?? "",
  };
}

// ─── POST /api/checkout/initiate ─────────────────────────────────────────────────
router.post("/initiate", requireAuth, mutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("CHECKOUT INITIATE");
  const userId = (req as AuthenticatedRequest).userId;

  if (!isConfigured()) {
    log.error("Razorpay not configured (RAZORPAY_KEY_ID/SECRET unset)").end("CHECKOUT INITIATE");
    res.status(503).json({ error: "Payments are not configured yet." });
    return;
  }

  const body = req.body as { mode?: unknown; item?: unknown; addressId?: unknown; couponCode?: unknown };
  const mode = body.mode === "direct" ? "direct" : "cart";
  const addressId = typeof body.addressId === "string" ? body.addressId : "";
  const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim().toUpperCase() : "";
  log.step(`user=${userId}  mode=${mode}  addressId=${addressId || "none"}  coupon=${couponCode || "none"}`);

  if (!addressId) {
    log.warn("missing addressId").end("CHECKOUT INITIATE");
    res.status(400).json({ error: "A delivery address is required." });
    return;
  }

  try {
    const address = await loadAddress(userId, addressId, log);
    if (!address) {
      log.warn("address not found / not owned").end("CHECKOUT INITIATE");
      res.status(404).json({ error: "Address not found." });
      return;
    }

    // Build + validate the direct item (cart mode reads the user's cart).
    let source: Source;
    let directItem: RawLine | null = null;
    if (mode === "direct") {
      const raw = (body.item ?? {}) as Record<string, unknown>;
      const slug = typeof raw.product_slug === "string" ? raw.product_slug : "";
      const sku = typeof raw.sku === "string" ? raw.sku : "";
      if (!slug || !sku) {
        log.warn("direct mode missing item slug/sku").end("CHECKOUT INITIATE");
        res.status(400).json({ error: "Invalid item." });
        return;
      }
      directItem = {
        product_slug: slug,
        sku,
        size: typeof raw.size === "string" ? raw.size : "",
        quantity: Math.max(1, Math.floor(Number(raw.quantity) || 1)),
      };
      source = { mode: "direct", item: directItem };
    } else {
      source = { mode: "cart" };
    }

    const priced = await priceOrder(userId, source, log);

    // Block if any cart line can no longer be priced (its variant/SKU was removed, or the
    // product was deleted). The cart page still shows such a line at the product price, so
    // silently dropping it here would bill LESS than the cart shows — the exact mismatch
    // this guards against. The customer removes it and retries; what they see == what they pay.
    if (priced.unavailable.length > 0) {
      const names = [...new Set(priced.unavailable.map((u) => u.title))].join(", ");
      log.warn(`blocking checkout — ${priced.unavailable.length} unavailable line(s): ${priced.unavailable.map((u) => u.sku).join(", ")}`).end("CHECKOUT INITIATE");
      res.status(409).json({
        error: `Some items in your cart are no longer available (${names}). Please remove them and try again.`,
        unavailable: priced.unavailable,
      });
      return;
    }

    if (priced.items.length === 0) {
      log.warn("nothing to checkout (empty)").end("CHECKOUT INITIATE");
      res.status(400).json({ error: mode === "cart" ? "Your cart is empty." : "Item unavailable." });
      return;
    }

    // Coupon: FIRST10 = 10% off subtotal, first order only.
    const firstOrder = await isFirstOrder(userId, log);
    const couponValid = couponCode === COUPON_CODE && firstOrder;
    const discount = couponValid ? Math.round(priced.subtotal * COUPON_RATE) : 0;
    const total = priced.subtotal + priced.shippingFee - discount;
    log.step(`coupon "${couponCode || "none"}" → ${couponValid ? "VALID (FIRST10, 10% off)" : couponCode ? "rejected" : "none"}`);
    log.step(`subtotal=₹${priced.subtotal}  shipping=₹${priced.shippingFee}  discount=₹${discount}  total=₹${total}  firstOrder=${firstOrder}`);

    // Early (non-locking) stock pre-check — catch the common OOS case before the
    // customer pays. The authoritative lock+decrement is still in the RPC at /verify.
    const oversold = findOversold(priced.items);
    if (oversold) {
      log.warn(`pre-check oversold  sku=${oversold.sku}  stock=${oversold.stock}  qty=${oversold.quantity}`).end("CHECKOUT INITIATE");
      res.status(409).json({ error: `"${oversold.title}" is out of stock.`, sku: oversold.sku });
      return;
    }

    // Create the Razorpay order. Notes are the durable fallback the webhook can read
    // even if Redis evicted the snapshot (direct item stashed as JSON).
    const notes: Record<string, string> = { userId, addressId, mode };
    if (directItem) notes.item = JSON.stringify(directItem);
    const amountPaise = Math.round(total * 100);
    log.step(`creating Razorpay order  amount=${amountPaise}p  notes=[${Object.keys(notes).join(",")}]`);
    const t0Rzp = performance.now();
    const rzpOrder = await getRazorpay().orders.create({ amount: amountPaise, currency: "INR", notes });
    log.step(`Razorpay order created: ${fms(performance.now() - t0Rzp)}  id=${rzpOrder.id}  amount=${amountPaise}p`);

    // Persist the EXACT priced snapshot so /verify places what was quoted + paid.
    const snapshot: CheckoutSnapshot = {
      userId, mode, address,
      item: directItem,
      items: priced.items, subtotal: priced.subtotal, discount,
      shippingFee: priced.shippingFee, total, itemCount: priced.itemCount,
      expectFirstOrder: couponValid, // only assert first-order when the discount was applied
    };
    await redisSet(checkoutKey(rzpOrder.id), snapshot, CHECKOUT_TTL_S, log);

    log.success(`initiated  rzpOrder=${rzpOrder.id}  total=₹${total}  ${fms(log.elapsed())}`).end("CHECKOUT INITIATE");
    res.json({
      razorpayOrderId: rzpOrder.id,
      amount: amountPaise,
      currency: "INR",
      keyId: KEY_ID,
      pricing: {
        items: priced.items.map(({ stock: _s, is_unlimited: _u, ...it }) => it),
        subtotal: priced.subtotal,
        discount,
        shippingFee: priced.shippingFee,
        total,
        itemCount: priced.itemCount,
        couponApplied: couponValid ? COUPON_CODE : null,
      },
    });
  } catch (err) {
    const status = err instanceof PriceError ? err.status : 500;
    log.error("initiate failed", err).end("CHECKOUT INITIATE");
    res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── POST /api/checkout/verify ───────────────────────────────────────────────────
router.post("/verify", requireAuth, mutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("CHECKOUT VERIFY");
  const userId = (req as AuthenticatedRequest).userId;

  if (!isConfigured()) {
    log.error("Razorpay not configured").end("CHECKOUT VERIFY");
    res.status(503).json({ error: "Payments are not configured yet." });
    return;
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = (req.body ?? {}) as {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  };
  log.step(`user=${userId}  rzpOrder=${razorpay_order_id}  payment=${razorpay_payment_id}`);

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    log.warn("missing razorpay fields").end("CHECKOUT VERIFY");
    res.status(400).json({ error: "Missing payment confirmation fields." });
    return;
  }

  try {
    // 1) Verify the signature: HMAC-SHA256("<order_id>|<payment_id>", KEY_SECRET).
    const expected = createHmac("sha256", KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (!safeEqualHex(expected, razorpay_signature)) {
      log.warn("signature mismatch — possible tampering").end("CHECKOUT VERIFY");
      res.status(400).json({ error: "Payment verification failed." });
      return;
    }
    log.step("HMAC signature verified ✓");

    // 1b) Idempotency: if this payment already placed an order (double-submit, or the
    // webhook beat us here), return it without re-pricing.
    const already = await findPlacedOrder(razorpay_payment_id, log);
    if (already) {
      log.success(`already placed (idempotent)  order=${already.order_number}`).end("CHECKOUT VERIFY");
      res.json({ orderId: already.id, orderNumber: already.order_number });
      return;
    }

    // 2) Confirm the payment is actually captured, and read its authoritative amount.
    const payment = await getRazorpay().payments.fetch(razorpay_payment_id);
    if (payment.status !== "captured") {
      log.warn(`payment not captured  status=${payment.status}`).end("CHECKOUT VERIFY");
      res.status(402).json({ error: "Payment was not captured." });
      return;
    }
    const capturedPaise = Number(payment.amount) || 0;
    log.step(`payment CAPTURED  amount=${capturedPaise}p (₹${capturedPaise / 100})  method=${payment.method ?? "?"}`);

    // 3) Recover the priced snapshot (Redis, else re-price from notes with an assert).
    const snap = await recoverSnapshot(razorpay_order_id, capturedPaise, log);
    if (!snap) {
      res.status(409).json({ error: "Your cart changed after payment — it will be refunded. Please contact support." });
      log.error("could not recover a safe snapshot — not placing").end("CHECKOUT VERIFY");
      return;
    }
    // Ownership: the authenticated caller must own this checkout.
    if (snap.userId !== userId) {
      log.warn(`ownership mismatch  snap=${snap.userId}  caller=${userId}`).end("CHECKOUT VERIFY");
      res.status(403).json({ error: "This payment does not belong to you." });
      return;
    }

    // 4) Place the order atomically (idempotent on razorpay_payment_id).
    const result = await callPlaceOrder(snap, razorpay_payment_id, log);

    if (result.result.startsWith("oversold")) {
      const sku = result.result.split(":")[1] ?? "";
      log.error(`PAID BUT OVERSOLD  sku=${sku}  payment=${razorpay_payment_id} — flag for refund`).end("CHECKOUT VERIFY");
      res.status(409).json({ error: "An item sold out during payment — it will be refunded.", sku });
      return;
    }

    await afterPlacement(snap, razorpay_order_id, result, log);
    log.success(`placed  order=${result.order_number}  result=${result.result}  ${fms(log.elapsed())}`).end("CHECKOUT VERIFY");
    res.json({ orderId: result.order_id, orderNumber: result.order_number });
  } catch (err) {
    log.error("verify failed", err).end("CHECKOUT VERIFY");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── POST /api/checkout/coupon — live "Apply" feedback ───────────────────────────
router.get("/coupon", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("CHECKOUT COUPON");
  const userId = (req as AuthenticatedRequest).userId;
  const code = String((req.query.code as string) ?? "").trim().toUpperCase();
  const subtotal = Math.max(0, Number(req.query.subtotal) || 0);
  log.step(`user=${userId}  code=${code}  subtotal=₹${subtotal}`);

  try {
    if (code !== COUPON_CODE) {
      log.success("unknown code").end("CHECKOUT COUPON");
      res.json({ valid: false, discount: 0, reason: "Invalid coupon code." });
      return;
    }
    const firstOrder = await isFirstOrder(userId, log);
    if (!firstOrder) {
      log.success("not first order").end("CHECKOUT COUPON");
      res.json({ valid: false, discount: 0, reason: "FIRST10 is only valid on your first order." });
      return;
    }
    const discount = Math.round(subtotal * COUPON_RATE);
    log.success(`valid  discount=₹${discount}`).end("CHECKOUT COUPON");
    res.json({ valid: true, discount, reason: "10% off your first order!" });
  } catch (err) {
    log.error("coupon check failed", err).end("CHECKOUT COUPON");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── POST /api/checkout/webhook — raw-body payment.captured backstop ──────────────
// Mounted in server.ts with express.raw() BEFORE the global JSON parser, so req.body
// is the raw Buffer the HMAC must be computed over. Runs the SAME place path as
// /verify, keyed by razorpay_payment_id, so it's a no-op when /verify already placed.
export const webhookHandler: RequestHandler = async (req: Request, res: Response) => {
  const log = createLog().start("CHECKOUT WEBHOOK");

  if (!WEBHOOK_SECRET) {
    log.error("RAZORPAY_WEBHOOK_SECRET unset — rejecting").end("CHECKOUT WEBHOOK");
    res.status(503).json({ error: "Webhook not configured." });
    return;
  }

  const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.from(String(req.body ?? ""));
  const signature = String(req.headers["x-razorpay-signature"] ?? "");
  const expected = createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
  if (!signature || !safeEqualHex(expected, signature)) {
    log.warn("bad webhook signature — rejecting").end("CHECKOUT WEBHOOK");
    res.status(400).json({ error: "Invalid signature." });
    return;
  }
  log.step("webhook signature verified ✓");

  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } } } };
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    log.warn("unparseable webhook body").end("CHECKOUT WEBHOOK");
    res.status(400).json({ error: "Bad body." });
    return;
  }

  // Ack everything else immediately so Razorpay stops retrying.
  if (event.event !== "payment.captured") {
    log.success(`ignored event=${event.event}`).end("CHECKOUT WEBHOOK");
    res.status(200).json({ ok: true });
    return;
  }

  const payment = event.payload?.payment?.entity;
  const paymentId = payment?.id ?? "";
  const razorpayOrderId = payment?.order_id ?? "";
  const capturedPaise = Number(payment?.amount) || 0;
  log.step(`payment.captured  payment=${paymentId}  rzpOrder=${razorpayOrderId}  amount=${capturedPaise}p`);

  if (!paymentId || !razorpayOrderId) {
    log.warn("missing payment/order id in event").end("CHECKOUT WEBHOOK");
    res.status(200).json({ ok: true }); // nothing actionable; don't make Razorpay retry
    return;
  }

  try {
    // Idempotency: if /verify (or an earlier webhook delivery) already placed this
    // payment, ack and stop — no re-pricing.
    const already = await findPlacedOrder(paymentId, log);
    if (already) {
      log.success(`already placed (idempotent)  order=${already.order_number}`).end("CHECKOUT WEBHOOK");
      res.status(200).json({ ok: true });
      return;
    }

    const snap = await recoverSnapshot(razorpayOrderId, capturedPaise, log);
    if (!snap) {
      // Can't safely place (drifted/unrecoverable). 200 so Razorpay stops; the paid
      // payment is surfaced for manual handling via logs.
      log.error("webhook could not recover a safe snapshot — manual review").end("CHECKOUT WEBHOOK");
      res.status(200).json({ ok: true });
      return;
    }

    const result = await callPlaceOrder(snap, paymentId, log);
    if (result.result.startsWith("oversold")) {
      log.error(`webhook PAID BUT OVERSOLD  payment=${paymentId} — flag for refund`).end("CHECKOUT WEBHOOK");
      res.status(200).json({ ok: true });
      return;
    }

    await afterPlacement(snap, razorpayOrderId, result, log);
    log.success(`webhook placed  order=${result.order_number}  result=${result.result}`).end("CHECKOUT WEBHOOK");
    res.status(200).json({ ok: true });
  } catch (err) {
    // 500 → Razorpay retries later (idempotent via transaction_id), e.g. transient DB error.
    log.error("webhook processing failed — will retry", err).end("CHECKOUT WEBHOOK");
    res.status(500).json({ error: "processing failed" });
  }
};

// Constant-time compare of two hex signatures (length-guarded so timingSafeEqual
// never throws on mismatched lengths).
function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

export default router;
