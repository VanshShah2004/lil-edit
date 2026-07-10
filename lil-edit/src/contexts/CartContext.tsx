import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  addToCart as apiAdd,
  clearCart as apiClear,
  fetchCart,
  removeCartItem as apiRemove,
  updateCartItemQty as apiUpdateQty,
  updateCartItemSize as apiUpdateSize,
  updateCartItemColor as apiUpdateColor,
  type AddToCartPayload,
  type CartItem,
} from "@/lib/cartApi";
import { hydrateSkus, type ResolvedSkuView } from "@/lib/productHydration";
import {
  getGuestCart,
  setGuestCart,
  clearGuestCart,
  addGuestCartLine,
  setGuestCartQty,
  removeGuestCartLine,
  changeGuestCartSize,
  changeGuestCartSku,
  guestCartLineId,
  parseGuestCartLineId,
  type GuestCartLine,
} from "@/lib/guestStorage";

interface CartContextType {
  cartItems: CartItem[];
  cartCount: number;
  loading: boolean;
  addToCart: (payload: AddToCartPayload, opts?: { outOfStock?: boolean }) => Promise<void>;
  reorder: (items: AddToCartPayload[]) => Promise<{ added: number; failed: number }>;
  updateQuantity: (cartItemId: string, quantity: number) => Promise<void>;
  updateSize: (cartItemId: string, size: string) => Promise<void>;
  updateColor: (cartItemId: string, sku: string) => Promise<void>;
  removeItem: (cartItemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refetchCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// Build a display-ready CartItem from a stored guest line + its resolved product view.
// Mirrors the shape GET /api/cart returns per line so the Cart UI is identical for guests.
function buildGuestCartItem(line: GuestCartLine, v: ResolvedSkuView): CartItem {
  return {
    id: guestCartLineId(line.sku, line.size),
    sku: line.sku,
    size: line.size,
    sizes: v.sizes,
    quantity: line.quantity,
    title: v.title,
    slug: v.slug,
    categorySlug: v.categorySlug,
    price: v.price,
    originalPrice: v.originalPrice,
    image: v.image,
    images: v.images,
    color: v.color,
    colors: v.colors,
    availability: v.availability,
    stock: v.stock,
    isUnlimited: v.isUnlimited,
    tags: v.tags,
    badges: v.badges,
  };
}

// Hydrate the localStorage guest cart into CartItems. Resolves display data by SKU (one
// batched call), drops lines whose SKU no longer exists in the catalog, and heals a stored
// slug that drifted — the same heal-not-delete posture as the DB cart's GET self-heal.
async function hydrateGuestCart(): Promise<CartItem[]> {
  const lines = getGuestCart();
  if (lines.length === 0) return [];
  const views = await hydrateSkus(lines.map((l) => l.sku));

  const items: CartItem[] = [];
  const survivingLines: GuestCartLine[] = [];
  for (const line of lines) {
    const v = views.get(line.sku);
    if (!v) continue; // sku no longer resolves — prune this guest line
    items.push(buildGuestCartItem(line, v));
    survivingLines.push({ ...line, product_slug: v.slug }); // heal a stale display slug
  }

  const healed =
    survivingLines.length !== lines.length ||
    survivingLines.some((l, i) => l.product_slug !== lines[i]?.product_slug);
  if (healed) {
    console.log(`[CartContext] guest cart healed  ${lines.length}→${survivingLines.length} line(s)`);
    setGuestCart(survivingLines);
  }
  return items;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  // Incrementing this triggers a re-fetch without needing loadCart in dependency arrays
  const [fetchTick, setFetchTick] = useState(0);
  const abortRef   = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Depend on the stable user *id*, not the user object. Supabase hands back a
  // fresh User object on every auth event (INITIAL_SESSION, SIGNED_IN,
  // TOKEN_REFRESHED…), and a new object reference would re-fire the fetch each
  // time — the cause of the cart being GET'd 4× on load. The id only changes on
  // an actual login/logout, and the token is fetched fresh per request anyway.
  const userId = user?.id ?? null;

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const refetchCart = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFetchTick((t) => t + 1), 50);
  }, []);

  // Fetch cart whenever user changes or refetchCart() is called. Logged out → the cart
  // lives in localStorage (guest cart); logged in → the DB cart is the source of truth.
  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (!userId) {
      console.log(`[CartContext] hydrating guest cart  tick=${fetchTick}`);
      // Syncing to external state (localStorage guest cart) — same pattern as the DB branch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true);
      hydrateGuestCart()
        .then((items) => {
          if (!ctrl.signal.aborted) setCartItems(items);
        })
        .catch((err) => {
          if (!ctrl.signal.aborted) {
            console.error("[CartContext] guest hydrate failed", err);
            setCartItems([]);
          }
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
      return () => ctrl.abort();
    }

    console.log(`[CartContext] fetching cart  user=${userId}  tick=${fetchTick}`);
    setLoading(true);
    fetchCart()
      .then((items) => {
        if (!ctrl.signal.aborted) setCartItems(items);
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) {
          console.error("[CartContext] fetch failed", err);
          setCartItems([]);
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [userId, fetchTick]);

  // Reverse a just-added line. Re-fetch first so we act on the authoritative
  // row — Undo can be clicked before the add's debounced refetch lands, or for
  // a brand-new line that isn't in local state yet — then subtract exactly what
  // this add contributed, removing the row entirely if that zeroes it out.
  const undoAddToCart = useCallback(
    async (sku: string, size: string, addedQty: number) => {
      try {
        const items = await fetchCart();
        const line = items.find((i) => i.sku === sku && i.size === size);
        if (!line) {
          refetchCart();
          return;
        }
        const nextQty = line.quantity - addedQty;
        if (nextQty > 0) {
          await apiUpdateQty(line.id, nextQty);
        } else {
          await apiRemove(line.id);
        }
        console.log(`[CartContext] undo add  sku=${sku}  size=${size}  -${addedQty}`);
        refetchCart();
        toast.success("Removed from cart!");
      } catch (err) {
        console.error("[CartContext] undoAddToCart failed", err);
        toast.error("Could not undo");
        refetchCart();
      }
    },
    [refetchCart]
  );

  // Guest counterpart to undoAddToCart — subtract this add's contribution from the
  // localStorage line (removing it if that zeroes out), then re-hydrate.
  const undoAddGuestCart = useCallback(
    (sku: string, size: string, addedQty: number) => {
      const line = getGuestCart().find((l) => l.sku === sku && l.size === size);
      if (line) {
        const next = line.quantity - addedQty;
        if (next > 0) setGuestCartQty(sku, size, next);
        else removeGuestCartLine(sku, size);
        console.log(`[CartContext] undo guest add  sku=${sku}  size=${size}  -${addedQty}`);
      }
      refetchCart();
      toast.success("Removed from cart!");
    },
    [refetchCart]
  );

  const addToCart = useCallback(
    async (payload: AddToCartPayload, opts?: { outOfStock?: boolean }) => {
      const addedQty = payload.quantity ?? 1;
      // Guest: persist to localStorage and re-hydrate. No login wall — the sign-in
      // prompt happens later, at checkout (see Cart.tsx).
      if (!user) {
        addGuestCartLine({
          product_slug: payload.product_slug,
          sku: payload.sku,
          size: payload.size,
          quantity: addedQty,
        });
        console.log("[CartContext] guest addToCart", payload.sku, payload.size, `×${addedQty}`);
        refetchCart();
        toast.success("Added to cart!", {
          description: opts?.outOfStock ? "This product is currently out of stock." : undefined,
          descriptionClassName: "text-red-600",
          duration: 6000,
          action: {
            label: "Undo",
            onClick: () => undoAddGuestCart(payload.sku, payload.size, addedQty),
          },
        });
        return;
      }
      try {
        const { outOfStock } = await apiAdd(payload);
        toast.success("Added to cart!", {
          description: outOfStock ? "This product is currently out of stock." : undefined,
          descriptionClassName: "text-red-600",
          duration: 6000,
          action: {
            label: "Undo",
            onClick: () =>
              void undoAddToCart(payload.sku, payload.size, addedQty),
          },
        });
        refetchCart();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not add to cart");
      }
    },
    [user, refetchCart, undoAddToCart, undoAddGuestCart]
  );

  // Re-add a whole order's worth of lines to the cart (the Reorder button on the
  // Orders / Order detail pages). Adds sequentially — not in parallel — so the
  // increment-or-insert in /cart/add stays race-free per (sku,size) and we don't
  // fire a burst of writes. A line whose product/variant has since been removed
  // throws (404) and is counted as failed rather than aborting the rest, so one
  // discontinued item can't block re-adding everything else. Refetches once at the
  // end (not per item) so the bag + count update in a single pass.
  const reorder = useCallback(
    async (items: AddToCartPayload[]): Promise<{ added: number; failed: number }> => {
      if (!user) {
        toast.error("Please log in to reorder");
        return { added: 0, failed: 0 };
      }
      let added = 0;
      let failed = 0;
      for (const item of items) {
        try {
          await apiAdd(item);
          added += 1;
        } catch (err) {
          console.error("[CartContext] reorder: could not add", item.sku, err);
          failed += 1;
        }
      }
      console.log(`[CartContext] reorder done  added=${added}  failed=${failed}`);
      if (added > 0) refetchCart();
      return { added, failed };
    },
    [user, refetchCart]
  );

  const updateQuantity = useCallback(async (cartItemId: string, quantity: number) => {
    // Guest: mutate localStorage + local state directly (no API, display data unchanged).
    if (!user) {
      const parsed = parseGuestCartLineId(cartItemId);
      if (!parsed) return;
      setGuestCartQty(parsed.sku, parsed.size, quantity);
      setCartItems((prev) =>
        prev.map((item) => (item.id === cartItemId ? { ...item, quantity } : item))
      );
      return;
    }
    // Capture previous state for rollback inside the functional updater
    let snapshot: CartItem[] = [];
    setCartItems((prev) => {
      snapshot = prev;
      return prev.map((item) =>
        item.id === cartItemId ? { ...item, quantity } : item
      );
    });
    try {
      await apiUpdateQty(cartItemId, quantity);
    } catch {
      setCartItems(snapshot);
      toast.error("Could not update quantity");
    }
  }, [user]);

  const updateSize = useCallback(async (cartItemId: string, size: string) => {
    // Guest: change the stored size (merging into an existing sku+size line) then
    // re-hydrate — a merge can combine two lines, so we rebuild from storage.
    if (!user) {
      const parsed = parseGuestCartLineId(cartItemId);
      if (!parsed) return;
      changeGuestCartSize(parsed.sku, parsed.size, size);
      refetchCart();
      return;
    }
    let snapshot: CartItem[] = [];
    setCartItems((prev) => {
      snapshot = prev;
      return prev.map((item) =>
        item.id === cartItemId ? { ...item, size } : item
      );
    });
    try {
      await apiUpdateSize(cartItemId, size);
      // Backend may have merged items; refetch to get the accurate cart state
      refetchCart();
    } catch {
      setCartItems(snapshot);
      toast.error("Could not update size");
    }
  }, [user, refetchCart]);

  const updateColor = useCallback(async (cartItemId: string, sku: string) => {
    // Guest: change the stored variant sku (merging into an existing newSku+size line)
    // then re-hydrate — the new sku brings its own image/color/stock.
    if (!user) {
      const parsed = parseGuestCartLineId(cartItemId);
      if (!parsed) return;
      changeGuestCartSku(parsed.sku, sku, parsed.size);
      refetchCart();
      return;
    }
    let snapshot: CartItem[] = [];
    setCartItems((prev) => {
      snapshot = prev;
      return prev.map((item) => {
        if (item.id !== cartItemId) return item;
        const matched = item.colors.find((c) => c.sku === sku);
        return matched
          ? { ...item, sku, color: { name: matched.name, hex: matched.hex } }
          : item;
      });
    });
    try {
      await apiUpdateColor(cartItemId, sku);
      refetchCart();
    } catch {
      setCartItems(snapshot);
      toast.error("Could not update color");
    }
  }, [user, refetchCart]);

  const removeItem = useCallback(async (cartItemId: string) => {
    if (!user) {
      const parsed = parseGuestCartLineId(cartItemId);
      if (!parsed) return;
      removeGuestCartLine(parsed.sku, parsed.size);
      setCartItems((prev) => prev.filter((item) => item.id !== cartItemId));
      return;
    }
    let snapshot: CartItem[] = [];
    setCartItems((prev) => {
      snapshot = prev;
      return prev.filter((item) => item.id !== cartItemId);
    });
    try {
      await apiRemove(cartItemId);
    } catch {
      setCartItems(snapshot);
      toast.error("Could not remove item");
    }
  }, [user]);

  const clearCartFn = useCallback(async () => {
    if (!user) {
      clearGuestCart();
      setCartItems([]);
      return;
    }
    let snapshot: CartItem[] = [];
    setCartItems((prev) => {
      snapshot = prev;
      return [];
    });
    try {
      await apiClear();
    } catch {
      setCartItems(snapshot);
      toast.error("Could not clear cart");
    }
  }, [user]);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        cartCount,
        loading,
        addToCart,
        reorder,
        updateQuantity,
        updateSize,
        updateColor,
        removeItem,
        clearCart: clearCartFn,
        refetchCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextType {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
