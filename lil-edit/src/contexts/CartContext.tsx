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

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const refetchCart = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFetchTick((t) => t + 1), 50);
  }, []);

  // Fetch cart whenever user changes or refetchCart() is called
  useEffect(() => {
    if (!user) {
      setCartItems([]);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

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
  }, [user, fetchTick]);

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
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
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
