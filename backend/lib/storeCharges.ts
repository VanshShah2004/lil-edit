import { supabaseAdmin } from "./supabase.js";

// ─── Admin-configurable store charges (delivery + gift wrapping) ─────────────
// The delivery rule and the gift-wrap rate used to be hardcoded constants in
// routes/checkout.ts. They now live in the single-row public.site_settings table
// (migration 20260827_store_charges.sql) so an admin can change them from
// General Settings without a deploy.
//
// These numbers price real money, and they're read on the checkout hot path, so
// they're cached in memory and refreshed by a background watcher + busted
// immediately after an admin saves. getStoreCharges() is a synchronous read of
// that cache.
//
// FAIL-SAFE: if the row can't be read (no service-role key, migration not
// applied, transient DB error) we keep the last known good values, falling back
// to DEFAULTS — which are exactly the constants this replaced. A glitch in the
// settings system must never make delivery accidentally free or gift wrapping
// accidentally expensive; it should just behave like it did before.
//
// The frontend does NOT read site_settings directly (RLS denies it) — it fetches
// GET /api/store-charges, which serves this same snapshot. That's deliberate: the
// price a customer is shown and the price they're charged then come from one
// value on one instance, instead of two copies of a constant drifting apart.

export interface StoreCharges {
  /** Flat delivery fee applied to an order below the free-delivery threshold. */
  deliveryFee: number;
  /** Delivery is FREE when subtotal > this. Fee applies when 0 < subtotal <= this. */
  freeDeliveryThreshold: number;
  /** Gift wrapping, charged per ITEM (per unit, not per line). 0 = wrap for free. */
  giftWrapFee: number;
}

export interface StoreChargesSnapshot extends StoreCharges {
  updatedAt: string | null;
  updatedByEmail: string | null;
}

/** The values this system replaced — also the fallback when the DB can't be read. */
export const DEFAULT_CHARGES: StoreCharges = {
  deliveryFee: 199,
  freeDeliveryThreshold: 5000,
  giftWrapFee: 100,
};

// Same cadence as the maintenance watcher. Also bounds cross-instance staleness:
// each instance caches its own snapshot, so an admin's save only busts the
// instance that served it — the others converge within this window.
const REFRESH_MS = 15_000;

let snapshot: StoreChargesSnapshot = { ...DEFAULT_CHARGES, updatedAt: null, updatedByEmail: null };
let loaded = false;
let watcher: ReturnType<typeof setInterval> | null = null;

/** Coerce a DB numeric (which arrives as string|number) to a safe, non-negative number. */
function money(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Synchronous read for the pricing hot path. Never throws. */
export function getStoreCharges(): StoreChargesSnapshot {
  return snapshot;
}

/** True once the first read has settled (success or fail). */
export function isStoreChargesLoaded(): boolean {
  return loaded;
}

/**
 * The delivery rule, in ONE place for the whole backend:
 *   fee when 0 < subtotal <= freeDeliveryThreshold, free otherwise.
 * An empty cart pays nothing. Mirrored in lil-edit/src/lib/pricing.ts, which is
 * fed the same charges from GET /api/store-charges.
 */
export function computeDeliveryFee(subtotal: number, charges: StoreCharges = snapshot): number {
  return subtotal > 0 && subtotal <= charges.freeDeliveryThreshold ? charges.deliveryFee : 0;
}

/**
 * Gift wrapping for a whole order: the per-item rate × the number of UNITS.
 * `itemCount` must be the priced unit count (after out-of-stock exclusions), so
 * the customer is only charged to wrap what actually ships.
 */
export function computeGiftWrapFee(itemCount: number, charges: StoreCharges = snapshot): number {
  if (itemCount <= 0) return 0;
  return Math.max(0, Math.round(itemCount * charges.giftWrapFee * 100) / 100);
}

/**
 * Read the charges from the DB and update the in-memory snapshot. Reads via the
 * service-role client (site_settings is RLS-locked). On any failure it KEEPS the
 * current snapshot rather than flapping prices mid-checkout.
 */
export async function refreshStoreCharges(): Promise<StoreChargesSnapshot> {
  if (!supabaseAdmin) {
    // No service role → can't read the locked table. Behave exactly like the
    // old hardcoded constants, and say so once to avoid watcher log spam.
    if (!loaded) {
      console.warn(
        `[storeCharges] SUPABASE_SERVICE_ROLE_KEY not set — using built-in defaults (delivery ₹${DEFAULT_CHARGES.deliveryFee} below ₹${DEFAULT_CHARGES.freeDeliveryThreshold}, gift wrap ₹${DEFAULT_CHARGES.giftWrapFee}/item)`,
      );
    }
    snapshot = { ...DEFAULT_CHARGES, updatedAt: null, updatedByEmail: null };
    loaded = true;
    return snapshot;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .select("delivery_fee, free_delivery_threshold, gift_wrap_fee, charges_updated_at, charges_updated_by_email")
      .eq("id", true)
      .maybeSingle();

    if (error) {
      // Missing columns (migration not applied) or a transient error. Keep what
      // we have — the defaults are the pre-migration behaviour, so this is safe.
      console.warn(
        `[storeCharges] read failed — keeping last known charges (delivery ₹${snapshot.deliveryFee}, free above ₹${snapshot.freeDeliveryThreshold}, gift ₹${snapshot.giftWrapFee})  code=${(error as { code?: string }).code ?? "?"}  ${error.message}`,
      );
      loaded = true;
      return snapshot;
    }

    const next: StoreChargesSnapshot = {
      deliveryFee: money(data?.delivery_fee, DEFAULT_CHARGES.deliveryFee),
      freeDeliveryThreshold: money(data?.free_delivery_threshold, DEFAULT_CHARGES.freeDeliveryThreshold),
      giftWrapFee: money(data?.gift_wrap_fee, DEFAULT_CHARGES.giftWrapFee),
      updatedAt: (data?.charges_updated_at as string | null) ?? null,
      updatedByEmail: (data?.charges_updated_by_email as string | null) ?? null,
    };

    // Log only on an actual change, so a price move is auditable without spam.
    if (
      loaded &&
      (next.deliveryFee !== snapshot.deliveryFee ||
        next.freeDeliveryThreshold !== snapshot.freeDeliveryThreshold ||
        next.giftWrapFee !== snapshot.giftWrapFee)
    ) {
      console.log(
        `[storeCharges] changed → delivery ₹${next.deliveryFee} (free above ₹${next.freeDeliveryThreshold}), gift wrap ₹${next.giftWrapFee}/item${next.updatedByEmail ? `  by=${next.updatedByEmail}` : ""}`,
      );
    }
    snapshot = next;
    loaded = true;
    return snapshot;
  } catch (err) {
    console.warn(`[storeCharges] read threw — keeping last known charges: ${(err as Error).message}`);
    loaded = true;
    return snapshot;
  }
}

/** Force an immediate refresh — call right after an admin save so it applies now. */
export async function bustStoreCharges(): Promise<StoreChargesSnapshot> {
  return refreshStoreCharges();
}

/** Prime the snapshot at boot and start the background refresh loop (idempotent). */
export function startStoreChargesWatcher(): void {
  if (watcher) return;
  void refreshStoreCharges();
  watcher = setInterval(() => {
    void refreshStoreCharges();
  }, REFRESH_MS);
  // Don't hold the process open just for the watcher.
  if (typeof watcher.unref === "function") watcher.unref();
  console.log(`[storeCharges] watcher started — polling site_settings every ${REFRESH_MS / 1000}s (falls back to built-in defaults)`);
}
