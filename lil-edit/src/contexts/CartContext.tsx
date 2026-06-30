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

interface CartContextType {
  cartItems: CartItem[];
  cartCount: number;
  loading: boolean;
  addToCart: (payload: AddToCartPayload) => Promise<void>;
  reorder: (items: AddToCartPayload[]) => Promise<{ added: number; failed: number }>;
  updateQuantity: (cartItemId: string, quantity: number) => Promise<void>;
  updateSize: (cartItemId: string, size: string) => Promise<void>;
  updateColor: (cartItemId: string, sku: string) => Promise<void>;
  removeItem: (cartItemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refetchCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

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

  // Fetch cart whenever user changes or refetchCart() is called
  useEffect(() => {
    if (!userId) {
      // Reset to the logged-out cart — syncing to external auth state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCartItems([]);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

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

  const addToCart = useCallback(
    async (payload: AddToCartPayload) => {
      if (!user) {
        toast.error("Please log in to add items to your cart");
        return;
      }
      try {
        await apiAdd(payload);
        toast.success("Added to cart!");
        refetchCart();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not add to cart");
      }
    },
    [user, refetchCart]
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
  }, []);

  const updateSize = useCallback(async (cartItemId: string, size: string) => {
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
  }, [refetchCart]);

  const updateColor = useCallback(async (cartItemId: string, sku: string) => {
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
  }, [refetchCart]);

  const removeItem = useCallback(async (cartItemId: string) => {
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
  }, []);

  const clearCartFn = useCallback(async () => {
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
  }, []);

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
