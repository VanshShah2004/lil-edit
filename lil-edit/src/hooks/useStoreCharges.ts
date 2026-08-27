import { useEffect, useState } from "react";

import {
  fetchStoreCharges,
  DEFAULT_STORE_CHARGES,
  type StoreCharges,
} from "@/lib/storeChargesApi";

// ─── The admin-set delivery + gift-wrapping charges, for the storefront ──────
// Cart and Checkout both need these, and both mount independently, so the fetch
// is memoised at module scope: the first component to ask kicks off ONE request
// and every later mount reuses the resolved value. Charges change rarely (an
// admin edits them by hand), so a per-session cache is plenty — and it keeps the
// Cart→Checkout hand-off showing the same delivery line without a refetch flash.
//
// A failed request does NOT cache: the next mount retries, and until then the
// component renders DEFAULT_STORE_CHARGES — the same numbers the backend falls
// back to, so a hiccup degrades to the old hardcoded behaviour rather than to a
// quote that disagrees with what /initiate will actually charge.

let cached: StoreCharges | null = null;
let inFlight: Promise<StoreCharges> | null = null;

function loadOnce(): Promise<StoreCharges> {
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  inFlight = fetchStoreCharges()
    .then((charges) => {
      cached = charges;
      console.log(
        `[useStoreCharges] loaded — delivery ₹${charges.deliveryFee} (free above ₹${charges.freeDeliveryThreshold}), gift wrap ₹${charges.giftWrapFee}/item`,
      );
      return charges;
    })
    .catch((err: unknown) => {
      console.error("[useStoreCharges] load failed — using defaults", err);
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Drop the cache so the next mount refetches — call after an admin saves. */
export function invalidateStoreCharges(): void {
  cached = null;
}

export interface UseStoreCharges {
  charges: StoreCharges;
  /** False until the real charges land. The returned charges are the defaults until then. */
  loaded: boolean;
}

export function useStoreCharges(): UseStoreCharges {
  const [charges, setCharges] = useState<StoreCharges>(cached ?? DEFAULT_STORE_CHARGES);
  const [loaded, setLoaded] = useState(cached !== null);

  useEffect(() => {
    // Already cached? The initial state above read it, so there is nothing to do —
    // and setting state here would just cost a cascading render.
    if (cached) return;
    let active = true;
    void loadOnce()
      .then((next) => {
        if (!active) return;
        setCharges(next);
        setLoaded(true);
      })
      .catch(() => {
        // Keep the defaults on screen; `loaded` stays false so a caller that cares
        // (e.g. one that wants to hold a "Free delivery" promise back) can tell.
        if (active) setLoaded(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { charges, loaded };
}
