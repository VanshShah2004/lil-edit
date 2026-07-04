import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { addToCart as apiAddToCart } from "@/lib/cartApi";
import { addToWishlist as apiAddToWishlist } from "@/lib/wishlistApi";
import {
  readGuestIntent,
  clearGuestIntent,
  getGuestCart,
  clearGuestCart,
  getGuestWishlist,
  clearGuestWishlist,
  removeGuestWishlistLine,
  setMovedToCartMarker,
} from "@/lib/guestStorage";

// Merge the localStorage guest cart into the now-authenticated account cart. Each line goes
// through the normal /cart/add (which merges same-sku+size lines and caps at 99). Clears the
// guest cart afterward so it doesn't reappear on logout. Returns how many lines were added.
async function mergeGuestCart(): Promise<number> {
  const lines = getGuestCart();
  if (lines.length === 0) return 0;
  let merged = 0;
  for (const l of lines) {
    try {
      await apiAddToCart({ product_slug: l.product_slug, sku: l.sku, size: l.size, quantity: l.quantity });
      merged += 1;
    } catch (err) {
      console.error("[GuestIntentBridge] cart merge add failed", l.sku, err);
    }
  }
  clearGuestCart();
  return merged;
}

async function mergeGuestWishlist(): Promise<number> {
  const lines = getGuestWishlist();
  if (lines.length === 0) return 0;
  let merged = 0;
  for (const l of lines) {
    try {
      await apiAddToWishlist(l.product_slug, l.sku);
      merged += 1;
    } catch (err) {
      console.error("[GuestIntentBridge] wishlist merge add failed", l.sku, err);
    }
  }
  clearGuestWishlist();
  return merged;
}

/**
 * Reconciles a guest's local cart/wishlist with their account right after login/signup.
 * Mounted once, app-wide. Behavior depends on how the login was reached:
 *
 * - No intent ("just logged in normally") → merge the guest cart AND wishlist into the
 *   account, then clear local storage. This is the plain "add them accordingly" case.
 * - guest_move_to_cart → add the specifically-moved wishlist item(s) to the DB cart and mark
 *   them so the Cart page pre-selects only those for checkout; then merge any remaining guest
 *   cart/wishlist too. Lands on /cart.
 * - guest_checkout → the guest cart is placed as a ONE-OFF order on /checkout (never merged
 *   into the DB cart — that would double-charge), so only the wishlist is merged here. The
 *   Checkout page reads the intent, so it is NOT cleared here (cleared on order success).
 */
export default function GuestIntentBridge() {
  const { user } = useAuth();
  const { refetchCart } = useCart();
  const { refetchWishlist } = useWishlist();
  const navigate = useNavigate();
  const handledRef = useRef(false);

  const userId = user?.id ?? null;

  useEffect(() => {
    // Reset the one-shot guard on logout so a later login is handled again.
    if (!userId) {
      handledRef.current = false;
      return;
    }
    if (handledRef.current) return;
    handledRef.current = true;

    const intent = readGuestIntent();

    void (async () => {
      // 1. Intent-specific: pull the explicitly-moved wishlist items into the cart first, and
      //    mark them for checkout scoping. Removed from the guest wishlist so the merge below
      //    doesn't re-save them as wishlist items.
      if (intent?.type === "guest_move_to_cart") {
        setMovedToCartMarker(intent.items.map((i) => i.sku));
        clearGuestIntent(); // consume up-front (idempotent against a re-run / re-login)
        console.log(`[GuestIntentBridge] guest_move_to_cart  items=${intent.items.length}`);
        for (const it of intent.items) {
          try {
            await apiAddToCart({ product_slug: it.product_slug, sku: it.sku, size: it.size, quantity: it.quantity });
            removeGuestWishlistLine(it.sku);
          } catch (err) {
            console.error("[GuestIntentBridge] move-to-cart add failed", it.sku, err);
          }
        }
      }

      // 2. Merge remaining guest storage into the account. Wishlist always merges (safe).
      //    The cart merges too — EXCEPT under a guest_checkout intent, where the guest cart is
      //    checked out as a one-off order (merging it would double-charge).
      const wl = await mergeGuestWishlist();
      const ct = intent?.type === "guest_checkout" ? 0 : await mergeGuestCart();

      refetchCart();
      refetchWishlist();

      // 3. Feedback + navigation per case.
      if (intent?.type === "guest_checkout") {
        console.log("[GuestIntentBridge] guest_checkout pending → /checkout");
        if (window.location.pathname !== "/checkout") navigate("/checkout");
      } else if (intent?.type === "guest_move_to_cart") {
        toast.success("Moved to your cart");
        if (window.location.pathname !== "/cart") navigate("/cart");
      } else if (ct > 0 || wl > 0) {
        // Normal login — surface that the guest selections carried over.
        console.log(`[GuestIntentBridge] normal-login merge  cart=${ct}  wishlist=${wl}`);
        toast.success("Your saved items are now in your account");
      }
    })();
    // Fire on the login transition only; handledRef makes it one-shot.
  }, [userId, navigate, refetchCart, refetchWishlist]);

  return null;
}
