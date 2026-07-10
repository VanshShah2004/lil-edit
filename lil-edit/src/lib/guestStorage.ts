/**
 * Guest (logged-out) cart + wishlist, persisted in localStorage.
 *
 * A logged-out shopper builds a cart/wishlist here; the moment they do something
 * that needs an account (checkout, or moving a wishlist item into their real cart)
 * we stash a short-lived "intent" and bounce them through /login. Nothing here is
 * ever the source of truth for pricing or fulfillment — the server re-prices every
 * line by SKU at checkout — so we only store the identity of each line (slug/sku/
 * size/qty), never trusted prices, and hydrate display data via GET /api/products/by-skus.
 *
 * Line identity mirrors the DB rules used server-side:
 *   cart line     = (sku, size)   — see backend/routes/cart.ts POST /add
 *   wishlist line = (sku)         — see backend/routes/wishlist.ts POST /add
 */

const CART_KEY = "guest_cart_v1";
const WISHLIST_KEY = "guest_wishlist_v1";
const INTENT_KEY = "guest_intent_v1";

// Same 99/line ceiling the cart API and DB constraint enforce. Guest-side is a
// convenience clamp; /checkout/initiate re-validates against live stock authoritatively.
const MAX_QTY = 99;

// A guest intent is a hand-off token for the login round-trip, not durable state.
// Short TTL so a stale one can't hijack a later, unrelated checkout on the same device.
const INTENT_TTL_MS = 15 * 60 * 1000;

export interface GuestCartLine {
  product_slug: string;
  sku: string;
  size: string;
  quantity: number;
}

export interface GuestWishlistLine {
  product_slug: string;
  sku: string;
}

/** Display-enriched item carried through the login redirect into the Checkout page. */
export interface GuestCheckoutItem {
  product_slug: string;
  sku: string;
  size: string;
  quantity: number;
  // Display-only — the summary renders without a round-trip; /initiate re-prices by sku.
  title?: string;
  price?: number;
  originalPrice?: number;
  image?: string;
  colorName?: string;
}

export type GuestIntent =
  | { type: "guest_checkout"; items: GuestCheckoutItem[]; createdAt: number }
  | { type: "guest_move_to_cart"; items: GuestCartLine[]; createdAt: number };

// ─── low-level read/write ────────────────────────────────────────────────────
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[guestStorage] could not read ${key}`, err);
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[guestStorage] could not write ${key}`, err);
  }
}

const clampQty = (n: number) => Math.min(MAX_QTY, Math.max(1, Math.floor(Number(n) || 1)));

// A stable synthetic id so the Cart UI (which keys rows + mutations off item.id) works
// the same for guests. Encodes the line identity so the context can round-trip id → line.
export function guestCartLineId(sku: string, size: string): string {
  return `guest:${sku}::${size}`;
}
export function parseGuestCartLineId(id: string): { sku: string; size: string } | null {
  if (!id.startsWith("guest:")) return null;
  const rest = id.slice("guest:".length);
  const idx = rest.indexOf("::");
  if (idx === -1) return null;
  return { sku: rest.slice(0, idx), size: rest.slice(idx + 2) };
}
export function guestWishlistLineId(sku: string): string {
  return `guest-wish:${sku}`;
}
export function parseGuestWishlistLineId(id: string): { sku: string } | null {
  if (!id.startsWith("guest-wish:")) return null;
  return { sku: id.slice("guest-wish:".length) };
}

// ─── guest cart ──────────────────────────────────────────────────────────────
export function getGuestCart(): GuestCartLine[] {
  return read<GuestCartLine[]>(CART_KEY, []);
}
export function setGuestCart(lines: GuestCartLine[]): void {
  write(CART_KEY, lines);
}
export function clearGuestCart(): void {
  write(CART_KEY, []);
}

/**
 * Add (or increment) a line, merging on (sku, size) and clamping to
 * min(MAX_QTY, maxQty). `maxQty` is the live stock ceiling the caller resolved
 * (omitted = 99-only clamp, the old behavior). Returns the delta actually
 * applied — 0 when the line was already at the cap — so the caller can surface
 * a "quantity capped" note instead of a plain success toast.
 */
export function addGuestCartLine(line: GuestCartLine, maxQty: number = MAX_QTY): number {
  const cap = Math.max(1, Math.min(MAX_QTY, Math.floor(maxQty) || MAX_QTY));
  const lines = getGuestCart();
  const existing = lines.find((l) => l.sku === line.sku && l.size === line.size);
  let applied: number;
  if (existing) {
    const before = existing.quantity;
    existing.quantity = Math.min(cap, before + clampQty(line.quantity));
    applied = existing.quantity - before;
  } else {
    const qty = Math.min(cap, clampQty(line.quantity));
    lines.push({ ...line, quantity: qty });
    applied = qty;
  }
  setGuestCart(lines);
  return applied;
}

export function setGuestCartQty(sku: string, size: string, quantity: number): void {
  const lines = getGuestCart();
  const line = lines.find((l) => l.sku === sku && l.size === size);
  if (line) {
    line.quantity = clampQty(quantity);
    setGuestCart(lines);
  }
}

export function removeGuestCartLine(sku: string, size: string): void {
  setGuestCart(getGuestCart().filter((l) => !(l.sku === sku && l.size === size)));
}

/** Change a line's size, merging into an existing (sku, newSize) line if one exists. */
export function changeGuestCartSize(sku: string, fromSize: string, toSize: string): void {
  const lines = getGuestCart();
  const line = lines.find((l) => l.sku === sku && l.size === fromSize);
  if (!line) return;
  const conflict = lines.find((l) => l.sku === sku && l.size === toSize && l !== line);
  if (conflict) {
    conflict.quantity = Math.min(MAX_QTY, conflict.quantity + line.quantity);
    setGuestCart(lines.filter((l) => l !== line));
  } else {
    line.size = toSize;
    setGuestCart(lines);
  }
}

/** Change a line's variant sku (color), merging into an existing (newSku, size) line if one exists. */
export function changeGuestCartSku(fromSku: string, toSku: string, size: string): void {
  const lines = getGuestCart();
  const line = lines.find((l) => l.sku === fromSku && l.size === size);
  if (!line) return;
  const conflict = lines.find((l) => l.sku === toSku && l.size === size && l !== line);
  if (conflict) {
    conflict.quantity = Math.min(MAX_QTY, conflict.quantity + line.quantity);
    setGuestCart(lines.filter((l) => l !== line));
  } else {
    line.sku = toSku;
    setGuestCart(lines);
  }
}

// ─── guest wishlist ──────────────────────────────────────────────────────────
export function getGuestWishlist(): GuestWishlistLine[] {
  return read<GuestWishlistLine[]>(WISHLIST_KEY, []);
}
export function setGuestWishlist(lines: GuestWishlistLine[]): void {
  write(WISHLIST_KEY, lines);
}
export function clearGuestWishlist(): void {
  write(WISHLIST_KEY, []);
}

/** Add a wishlist line, deduped on sku (globally unique; slug is display-only). */
export function addGuestWishlistLine(line: GuestWishlistLine): void {
  const lines = getGuestWishlist();
  if (lines.some((l) => l.sku === line.sku)) return;
  lines.push(line);
  setGuestWishlist(lines);
}

export function removeGuestWishlistLine(sku: string): void {
  setGuestWishlist(getGuestWishlist().filter((l) => l.sku !== sku));
}

// ─── guest intent (login hand-off) ───────────────────────────────────────────
export function saveGuestIntent(intent: Omit<GuestIntent, "createdAt">): void {
  write(INTENT_KEY, { ...intent, createdAt: Date.now() });
}

/** Read the pending intent, or null if none / expired (expired ones are cleared). */
export function readGuestIntent(): GuestIntent | null {
  const intent = read<GuestIntent | null>(INTENT_KEY, null);
  if (!intent) return null;
  if (!intent.createdAt || Date.now() - intent.createdAt > INTENT_TTL_MS) {
    clearGuestIntent();
    return null;
  }
  return intent;
}

export function clearGuestIntent(): void {
  try {
    localStorage.removeItem(INTENT_KEY);
  } catch (err) {
    console.warn("[guestStorage] could not clear intent", err);
  }
}

// ─── moved-to-cart marker (wishlist → cart → login hand-off) ──────────────────
// After a guest's wishlist "move to cart" is consumed into the account's DB cart, this
// records which SKUs were moved so the Cart page pre-selects ONLY those for checkout —
// a returning user's pre-existing cart items are not swept into that checkout.
const MOVED_MARKER_KEY = "guest_moved_skus_v1";
const MOVED_MARKER_TTL_MS = 10 * 60 * 1000;

export function setMovedToCartMarker(skus: string[]): void {
  write(MOVED_MARKER_KEY, { skus, createdAt: Date.now() });
}

export function readMovedToCartMarker(): string[] | null {
  const m = read<{ skus: string[]; createdAt: number } | null>(MOVED_MARKER_KEY, null);
  if (!m || !m.createdAt || Date.now() - m.createdAt > MOVED_MARKER_TTL_MS) {
    clearMovedToCartMarker();
    return null;
  }
  return m.skus?.length ? m.skus : null;
}

export function clearMovedToCartMarker(): void {
  try {
    localStorage.removeItem(MOVED_MARKER_KEY);
  } catch (err) {
    console.warn("[guestStorage] could not clear moved marker", err);
  }
}
