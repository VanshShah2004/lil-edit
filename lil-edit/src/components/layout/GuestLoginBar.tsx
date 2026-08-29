import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { LogIn, ShoppingBag, Heart } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";

/**
 * Thin "you still have to log in" strip for guests who already have items.
 *
 * A logged-out shopper's bag/wishlist live in localStorage (see lib/guestStorage.ts) and
 * are NOT tied to their account until they sign in — so a full bag is exactly the moment
 * the missing login matters most. Renders under the page heading on Cart/Wishlist.
 *
 * Self-gating: returns null for a signed-in user or an empty bag+wishlist, so a caller
 * only has to drop it in where it belongs on the page.
 */
export default function GuestLoginBar() {
  const { user } = useAuth();
  const { cartCount } = useCart();
  const { wishlistCount } = useWishlist();
  const location = useLocation();

  const show = !user && (cartCount > 0 || wishlistCount > 0);

  useEffect(() => {
    if (show) {
      console.log(
        `[GuestLoginBar] guest with saved items — bag: ${cartCount}, wishlist: ${wishlistCount}`,
      );
    }
  }, [show, cartCount, wishlistCount]);

  if (!show) return null;

  // Come back to wherever the shopper was when they take the bar up on it.
  const redirect = `?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`;

  return (
    // Mobile stacks (message row, then a full-width button row) so nothing has to
    // shrink or truncate at 320-430px; from sm up it collapses to a single row.
    <div className="flex flex-col gap-2.5 rounded-md border-2 border-brand-teal/60 bg-brand-teal/[0.07] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-3">
      <div className="flex items-start gap-2 min-w-0 text-brand-teal sm:items-center">
        {/* Counts, so the bar says what is actually waiting — not just "log in". */}
        <span className="flex items-center gap-1.5 shrink-0 text-xs sm:text-sm font-semibold leading-snug">
          {cartCount > 0 && (
            <span className="flex items-center gap-1">
              <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              {cartCount}
            </span>
          )}
          {cartCount > 0 && wishlistCount > 0 && (
            <span className="text-brand-teal/40" aria-hidden="true">
              ·
            </span>
          )}
          {wishlistCount > 0 && (
            <span className="flex items-center gap-1">
              <Heart className="w-4 h-4" aria-hidden="true" />
              {wishlistCount}
            </span>
          )}
        </span>
        {/* Wraps instead of truncating — the stacked mobile row has the width for it. */}
        <p className="text-xs sm:text-sm leading-snug">
          <span className="font-semibold">You're not logged in.</span>{" "}
          <span className="hidden sm:inline text-brand-teal/80">
            Log in to save these to your account and check out.
          </span>
          <span className="sm:hidden text-brand-teal/80">Log in to save these.</span>
        </p>
      </div>

      {/* Full-width pair on mobile, natural width on desktop. */}
      <div className="flex items-center gap-2 shrink-0">
        <Link
          to={`/login${redirect}`}
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md bg-brand-teal px-3.5 py-2 sm:py-1.5 text-xs sm:text-sm font-semibold text-white hover:bg-[#0C5D53] transition-colors"
        >
          <LogIn className="w-4 h-4" aria-hidden="true" /> Log in
        </Link>
        <Link
          to={`/signup${redirect}`}
          className="flex-1 sm:flex-none inline-flex items-center justify-center whitespace-nowrap rounded-md border border-brand-teal/40 bg-white/60 sm:bg-transparent px-3.5 py-2 sm:py-1.5 text-xs sm:text-sm font-semibold text-brand-teal hover:bg-brand-teal/10 transition-colors"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
