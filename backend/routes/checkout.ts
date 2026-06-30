import { performance } from "perf_hooks";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response, type RequestHandler } from "express";
import Razorpay from "razorpay";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { mutationLimiter } from "../middleware/rateLimiters.js";
import { createLog, fms, type OpLogger } from "../lib/logger.js";
import { redisGet, redisSet, redisDel, redisSetNX, redisKey, CHECKOUT_TTL_S } from "../lib/redis.js";
import { sendOrderConfirmation } from "../lib/orderEmail.js";
import { resolveRecipientEmail } from "../lib/recipientEmail.js";
import { publicSiteUrl } from "../lib/siteUrl.js";
import { verifyReviewsForOrder } from "../lib/reviewsVerification.js";
// Receipt backstop: re-sends the confirmation receipt for an already-placed order IFF none
// was recorded, so a placement that was interrupted before its detached send can't silently
// lose the receipt. No-op on the happy path (a recorded receipt). Fire-and-forget; never throws.
import { sendReceiptIfMissing } from "../lib/orderReceipt.js";
import { validateCoupon } from "../lib/coupons.js";
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
// A per-user reservation of the first-order coupon, held only while a checkout is in flight
// so two concurrent /initiate calls can't both mint a discounted order (see /initiate).
const couponHoldKey = (userId: string, code: string) => redisKey("checkout", `coupon-hold:${userId}:${code}`);
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

// Coupons are fully table-driven (admin-managed in the `coupons` table) and validated
// server-side via lib/coupons.ts validateCoupon(). FIRST10 used to be hardcoded here; it
// now lives in that table like any other coupon (first_order_only + once_per_user flags).

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
  // The coupon code applied to this order, or null. Carried so placement records it on
  // the order and increments the coupon's usage count.
  couponCode: string | null;
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

// Place the order through the locked RPC. Returns the RPC result row. Coupon validity is
// enforced preventively at /coupon + /initiate (verify-then-create means a paid order is
// always honored), so placement just records the coupon + increments its usage.
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
    p_clear_cart: snap.mode === "cart",
    p_coupon_code: snap.couponCode ?? null,
  };

  log.step(`RPC place_order →  user=${snap.userId}  items=${args.p_items.length}  total=₹${snap.total}  txn=${paymentId}  clearCart=${args.p_clear_cart}  coupon=${snap.couponCode ?? "none"}`);
  const t0 = performance.now();
  const { data, error } = await db().rpc("place_order", args);
  if (error) { log.error(`place_order RPC failed  ${error.message}`, error); throw new Error(`place_order failed: ${error.message}`); }
  const result = (Array.isArray(data) ? data[0] : data) as
    | { order_id: string | null; order_number: string | null; result: string }
    | undefined;
  log.step(`RPC place_order returned: ${fms(performance.now() - t0)}  result=${result?.result ?? "∅"}  order=${result?.order_number ?? "—"}`);

  if (!result) throw new Error("place_order returned no row");
  return result;
}

// Post-placement: bust the owner's order + cart caches and drop the snapshot, then
// fire-and-forget the confirmation email and review verification. Shared by /verify and /webhook.
async function afterPlacement(snap: CheckoutSnapshot, razorpayOrderId: string, result: { order_id: string | null; order_number: string | null }, log: OpLogger): Promise<void> {
  const keys = [orderListKey(snap.userId), checkoutKey(razorpayOrderId)];
  if (result.order_id) keys.push(orderDetailKey(snap.userId, result.order_id));
  if (snap.mode === "cart") keys.push(cartKey(snap.userId));
  log.step(`post-placement: busting ${keys.length} cache key(s)${snap.mode === "cart" ? " (incl. cart)" : ""} + dropping checkout snapshot`);
  await redisDel(log, ...keys);

  // Fire-and-forget — slow/failing tasks must never affect a paid, placed order.
  log.step(`queuing post-placement tasks: confirmation email + review verification`);
  void (async () => {
    // Confirmation receipt — best-effort and isolated in its own try so a mail issue can
    // never skip the review verification that follows.
    try {
      let recipientEmail = "";
      let recipientName: string | undefined;
      try {
        const { data } = await db().from("profiles").select("email, first_name, last_name").eq("id", snap.userId).maybeSingle();
        recipientEmail = (data?.email as string) ?? "";
        recipientName = [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim() || undefined;
      } catch { /* best-effort profile lookup */ }
      // Fall back to the auth email when the profile has none, so a missing/cleared
      // profiles.email can't silently swallow the receipt (the buyer authenticated to place
      // this order, so an auth identity email exists).
      recipientEmail = await resolveRecipientEmail(snap.userId, recipientEmail, log);
      const mail = await sendOrderConfirmation({
        orderId: result.order_id ?? "",
        orderNumber: result.order_number ?? "",
        recipientEmail,
        recipientName,
        items: snap.items.map((it) => ({
          title: it.title,
          sku: it.sku,
          size: it.size || undefined,
          colorName: it.color_name || undefined,
          quantity: it.quantity,
          unitPrice: it.unit_price,
          lineTotal: it.line_total,
          imageUrl: it.image_url || undefined,
        })),
        subtotal: snap.subtotal,
        discount: snap.discount,
        shippingFee: snap.shippingFee,
        total: snap.total,
        itemCount: snap.itemCount,
        paymentMethod: "online",
        orderUrl: result.order_id ? `${publicSiteUrl()}/orders/${result.order_id}` : undefined,
        address: {
          label: snap.address.label,
          line1: snap.address.line1,
          line2: snap.address.line2 || undefined,
          landmark: snap.address.landmark,
          city: snap.address.city,
          state: snap.address.state,
          country: snap.address.country,
          pincode: snap.address.pincode,
        },
      });
      // Record the receipt send (kind='receipt') so the admin can see it actually went
      // out — and offer a re-send if it didn't. Best-effort, same posture as the status-
      // notification audit: a missing table (pre-migration) or a lost row must never turn
      // a successful send into a failure. The order is placed as "confirmed" at this point.
      if (mail.sent && result.order_id) {
        const { error: recErr } = await db().from("order_notifications").insert({
          order_id: result.order_id,
          status: "confirmed",
          kind: "receipt",
          recipient_email: recipientEmail,
          sent_by: null,
          sent_by_name: "System",
        });
        if (recErr) log.warn(`could not record receipt notification (table missing?): ${recErr.message}`);
      }
    } catch (e) {
      log.warn(`confirmation email failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
    }

    // Mark any pending reviews for products in this order as verified.
    await verifyReviewsForOrder(snap.userId, snap.items, log);
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

  // Re-derive the discount from the coupon recorded in the Razorpay notes (the Redis
  // snapshot is the normal, exact path — this only runs if it was evicted). The coupon is
  // re-validated against the table for this user; the capturedPaise assert below refuses
  // to place if anything drifted (e.g. a coupon that expired post-payment), so a
  // mismatched order is never written.
  const notesCoupon = (typeof notes.coupon === "string" ? notes.coupon : "").trim().toUpperCase();
  let discount = 0;
  let couponCode: string | null = null;
  if (notesCoupon) {
    const v = await validateCoupon(db(), notesCoupon, priced.subtotal, userId, log);
    if (v.valid) { discount = v.discount; couponCode = notesCoupon; }
  }
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
    couponCode,
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

    // Some cart lines no longer resolve to a live product (deleted product, or a removed/
    // renamed variant SKU). The cart GET hides these exact lines via the SAME skuToProduct
    // lookup (cart.ts → `if (!product) return null`), so the customer never saw them — which
    // means blocking here just dead-ends checkout on an item they can't see to remove. Instead
    // prune the dead lines from the cart (best-effort, cart mode only) and continue with the
    // items the cart actually shows, so what they see == what they pay. (Direct mode never
    // reaches here: priceOrder throws 404 for an unavailable direct item.)
    if (priced.unavailable.length > 0 && mode === "cart") {
      const deadSkus = [...new Set(priced.unavailable.map((u) => u.sku))];
      log.warn(`pruning ${priced.unavailable.length} dead cart line(s) the cart already hides: ${deadSkus.join(", ")}`);
      const { error: pruneErr } = await db().from("cart_items").delete().eq("user_id", userId).in("sku", deadSkus);
      if (pruneErr) log.warn(`cart prune failed (non-fatal): ${pruneErr.message}`);
      else await redisDel(log, cartKey(userId));
    }

    if (priced.items.length === 0) {
      log.warn("nothing to checkout (empty)").end("CHECKOUT INITIATE");
      res.status(400).json({ error: mode === "cart" ? "Your cart is empty." : "Item unavailable." });
      return;
    }

    // Early (non-locking) stock pre-check — catch the common OOS case before the
    // customer pays (and before we reserve the coupon below). The authoritative
    // lock+decrement is still in the RPC at /verify.
    const oversold = findOversold(priced.items);
    if (oversold) {
      log.warn(`pre-check oversold  sku=${oversold.sku}  stock=${oversold.stock}  qty=${oversold.quantity}`).end("CHECKOUT INITIATE");
      res.status(409).json({ error: `"${oversold.title}" is out of stock.`, sku: oversold.sku });
      return;
    }

    // ── Coupon resolution (discount is ALWAYS computed server-side; never trusted) ──
    // All coupons are admin-managed rows validated against the `coupons` table (active /
    // not expired / not exhausted / min-order / per-user rules). Usage is incremented
    // atomically inside place_order on the created path (exactly once).
    //
    // For a coupon with a per-user rule (first_order_only / once_per_user) we take a
    // short-lived per-user Redis hold: validateCoupon reads order history, but orders
    // aren't written until /verify, so two /initiate calls fired before either pays would
    // both pass and both mint a discounted order. The hold lets only one in-flight
    // checkout carry such a code; a concurrent one is priced full. Redis down ⇒
    // "unavailable" ⇒ fail OPEN (apply) rather than deny a legit discount. A reusable
    // coupon needs no hold (it's allowed multiple times anyway, bounded by max_uses).
    let discount = 0;
    let appliedCode: string | null = null;

    if (couponCode) {
      const v = await validateCoupon(db(), couponCode, priced.subtotal, userId, log);
      if (v.valid && v.coupon) {
        const perUser = v.coupon.first_order_only || v.coupon.once_per_user;
        let held = false;
        if (perUser) {
          const hold = await redisSetNX(couponHoldKey(userId, v.coupon.code), String(log.sr), CHECKOUT_TTL_S, log);
          held = hold === "held";
          if (held) log.warn(`coupon "${v.coupon.code}" already held by another in-flight checkout for this user — pricing at full price`);
        }
        if (!held) {
          discount = v.discount;
          appliedCode = v.coupon.code;
        }
      } else {
        log.warn(`coupon "${couponCode}" rejected: ${v.reason}`);
      }
    }

    const total = priced.subtotal + priced.shippingFee - discount;
    log.step(`coupon "${couponCode || "none"}" → ${appliedCode ? `APPLIED (${appliedCode}, -₹${discount})` : couponCode ? "rejected" : "none"}`);
    log.step(`subtotal=₹${priced.subtotal}  shipping=₹${priced.shippingFee}  discount=₹${discount}  total=₹${total}`);

    // Create the Razorpay order. Notes are the durable fallback the webhook can read
    // even if Redis evicted the snapshot (direct item stashed as JSON).
    const notes: Record<string, string> = { userId, addressId, mode };
    if (directItem) notes.item = JSON.stringify(directItem);
    if (appliedCode) notes.coupon = appliedCode;
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
      couponCode: appliedCode,
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
        couponApplied: appliedCode,
      },
    });
  } catch (err) {
    // PriceError messages are deliberate + safe to surface ("Your cart is empty", etc.).
    // Anything else is unexpected — return a generic message + a correlation ref (the
    // logger's serial) so the raw error/DB internals are logged server-side only.
    if (err instanceof PriceError) {
      log.warn(`initiate rejected (${err.status})  ${err.message}`).end("CHECKOUT INITIATE");
      res.status(err.status).json({ error: err.message });
      return;
    }
    log.error("initiate failed", err).end("CHECKOUT INITIATE");
    res.status(500).json({ error: "Something went wrong starting checkout. Please try again.", ref: String(log.sr) });
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
      // This payment was already placed (the webhook beat us here, or a prior /verify placed it
      // but was interrupted before its detached receipt went out). Backstop the receipt — sends
      // only if none was recorded, so the happy path (receipt already sent) is a no-op.
      void sendReceiptIfMissing(already.id);
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

    // Run post-placement side-effects ONLY for the first placement of this payment. A
    // concurrent /verify (or the /webhook backstop) that lost the race gets result='exists'
    // — place_order's per-user advisory lock serialized them and its idempotency check
    // returned the already-placed order. Re-running afterPlacement would send a SECOND
    // confirmation receipt and write a duplicate notification row, so skip it. The response
    // stays correct: place_order returns the existing order's id/number on 'exists'.
    if (result.result === "created") {
      await afterPlacement(snap, razorpay_order_id, result, log);
    } else {
      // Idempotent placement: the first placement already ran afterPlacement. Still backstop the
      // receipt in case that first placement was interrupted before its detached send (no-op when
      // a receipt is already recorded). Other side-effects are safe to skip — already done or
      // self-healing. place_order returns the existing order's id on 'exists'.
      log.step(`idempotent placement (result=${result.result}) — backstopping receipt only`);
      if (result.order_id) void sendReceiptIfMissing(result.order_id);
    }
    log.success(`placed  order=${result.order_number}  result=${result.result}  ${fms(log.elapsed())}`).end("CHECKOUT VERIFY");
    res.json({ orderId: result.order_id, orderNumber: result.order_number });
  } catch (err) {
    if (err instanceof PriceError) {
      log.warn(`verify rejected (${err.status})  ${err.message}`).end("CHECKOUT VERIFY");
      res.status(err.status).json({ error: err.message });
      return;
    }
    // Don't leak internals on an unexpected failure. The webhook backstop still places the
    // order if the payment was captured, so reassure rather than alarm — with a ref to log.
    log.error("verify failed", err).end("CHECKOUT VERIFY");
    res.status(500).json({ error: "We couldn't confirm your payment right now. If you were charged, your order will be created automatically — please check your Orders in a few minutes.", ref: String(log.sr) });
  }
});

// ─── GET /api/checkout/active-coupons — list active coupons for dropdowns ──────────
// Accepts ?subtotal= so each coupon can be checked for applicability against the
// current user + cart value. Returns applicable: boolean + reason per coupon.
router.get("/active-coupons", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("CHECKOUT ACTIVE COUPONS");
  const userId = (req as AuthenticatedRequest).userId;
  const subtotal = Math.max(0, Number(req.query.subtotal) || 0);
  try {
    const { data, error } = await db()
      .from("coupons")
      .select("*")
      .eq("is_active", true);

    if (error) {
      if (error.code === "42P01" || error.code === "42703" || /does not exist|schema cache/i.test(error.message ?? "")) {
        log.warn(`coupons query failed (${error.code}): ${error.message}`).end("CHECKOUT ACTIVE COUPONS");
        res.json({ coupons: [] });
        return;
      }
      log.error(`failed to fetch active coupons: ${error.message}`, error).end("CHECKOUT ACTIVE COUPONS");
      res.json({ coupons: [] });
      return;
    }

    // Filter out expired coupons
    const liveCoupons = (data ?? []).filter((c: any) => {
      if (!c.expires_at) return true;
      return new Date(c.expires_at).getTime() > Date.now();
    });

    // Validate each coupon against the current user + subtotal
    const results: Array<{
      code: string; discount_type: string; discount_value: number;
      min_order_amount: number | null; max_discount_amount: number | null;
      first_order_only: boolean; once_per_user: boolean;
      applicable: boolean; reason: string;
    }> = [];

    await Promise.all(
      liveCoupons.map(async (c: any) => {
        const firstOrderOnly = !!c.first_order_only;
        const oncePerUser = !!c.once_per_user;

        // Validate whenever we have a subtotal, or when per-user rules may exclude this
        // coupon (first-order / once-per-user). Without this, subtotal=0 skips checks and
        // first-order coupons would appear as applicable to returning customers.
        const needsValidation = subtotal > 0 || firstOrderOnly || oncePerUser;

        let applicable = true;
        let reason = "";

        if (needsValidation) {
          const v = await validateCoupon(db(), c.code, subtotal, userId, log);
          applicable = v.valid;
          reason = v.reason;

          // First-order-only coupons: show only when the user can apply them right now
          // (eligible first order + min order met + not expired, etc.). Never gray them out.
          if (firstOrderOnly && !applicable) return;

          // Other per-user permanent rejections: hide instead of showing grayed-out.
          if (!applicable) {
            const isPerUserRejection =
              reason.includes("first order") ||
              reason.includes("already used");
            if (isPerUserRejection) return;
          }
        }

        results.push({
          code: c.code,
          discount_type: c.discount_type,
          discount_value: c.discount_value,
          min_order_amount: c.min_order_amount ?? null,
          max_discount_amount: c.max_discount_amount ?? null,
          first_order_only: c.first_order_only ?? false,
          once_per_user: c.once_per_user ?? false,
          applicable,
          reason,
        });
      })
    );

    // Sort: applicable coupons first
    results.sort((a, b) => (a.applicable === b.applicable ? 0 : a.applicable ? -1 : 1));

    log.success(`served ${results.length} coupons (${results.filter(c => c.applicable).length} applicable)`).end("CHECKOUT ACTIVE COUPONS");
    res.json({ coupons: results });
  } catch (err) {
    log.error("active coupons handler failed", err).end("CHECKOUT ACTIVE COUPONS");
    res.json({ coupons: [] });
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
    if (!code) {
      log.success("empty code").end("CHECKOUT COUPON");
      res.json({ valid: false, discount: 0, reason: "Invalid coupon code." });
      return;
    }

    // All coupons are admin-managed rows validated against the table (incl. per-user rules).
    const v = await validateCoupon(db(), code, subtotal, userId, log);
    log.success(`${v.valid ? `valid  discount=₹${v.discount}` : `invalid: ${v.reason}`}`).end("CHECKOUT COUPON");
    res.json({ valid: v.valid, discount: v.discount, reason: v.reason });
  } catch (err) {
    if (err instanceof PriceError) {
      log.warn(`coupon check rejected (${err.status})  ${err.message}`).end("CHECKOUT COUPON");
      res.status(err.status).json({ error: err.message });
      return;
    }
    log.error("coupon check failed", err).end("CHECKOUT COUPON");
    res.status(500).json({ error: "Could not check the coupon right now. Please try again.", ref: String(log.sr) });
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
      // The order already exists — normally because /verify placed it AND sent the receipt, so
      // this short-circuits. But if /verify placed it yet was interrupted before its detached
      // receipt send, this is the path that recovers it: backstop the receipt (no-op when one is
      // already recorded). Detached so Razorpay is still ack'd immediately.
      void sendReceiptIfMissing(already.id);
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

    // First-placement-only side-effects (same guard as /verify): on an idempotent 'exists'
    // (e.g. /verify already placed this payment) skip afterPlacement so the backstop can't
    // double-send the confirmation receipt or duplicate the notification row.
    if (result.result === "created") {
      await afterPlacement(snap, razorpayOrderId, result, log);
    } else {
      // Idempotent placement (e.g. /verify already placed this payment): backstop the receipt in
      // case that first placement was interrupted before its detached send (no-op when a receipt
      // is already recorded). place_order returns the existing order's id on 'exists'.
      log.step(`idempotent placement (result=${result.result}) — backstopping receipt only`);
      if (result.order_id) void sendReceiptIfMissing(result.order_id);
    }
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
