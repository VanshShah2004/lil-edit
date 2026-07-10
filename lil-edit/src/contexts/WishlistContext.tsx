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
import { useCart } from "@/contexts/CartContext";
import {
  addToWishlist as apiAdd,
  clearWishlist as apiClear,
  fetchWishlist,
  moveAllToCart as apiMoveAll,
  moveToCart as apiMoveToCart,
  removeWishlistItem as apiRemove,
  type WishlistItem,
} from "@/lib/wishlistApi";
import { hydrateSkus, resolveVariantSku, type ResolvedSkuView } from "@/lib/productHydration";
import {
  getGuestWishlist,
  setGuestWishlist,
  clearGuestWishlist,
  addGuestWishlistLine,
  removeGuestWishlistLine,
  guestWishlistLineId,
  parseGuestWishlistLineId,
  type GuestWishlistLine,
} from "@/lib/guestStorage";

interface WishlistContextType {
  wishlistItems: WishlistItem[];
  wishlistCount: number;
  loading: boolean;
  isWishlisted: (productSlug: string, sku: string) => boolean;
  addToWishlist: (productSlug: string, sku: string) => Promise<void>;
  removeFromWishlist: (wishlistItemId: string) => Promise<void>;
  moveToCart: (wishlistItemId: string) => Promise<void>;
  moveAllToCart: () => Promise<void>;
  moveSelectedToCart: (wishlistItemIds: string[]) => Promise<void>;
  clearWishlist: () => Promise<void>;
  refetchWishlist: () => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

// Build a display-ready WishlistItem from a stored guest line + its resolved product view.
function buildGuestWishlistItem(line: GuestWishlistLine, v: ResolvedSkuView): WishlistItem {
  return {
    id: guestWishlistLineId(line.sku),
    sku: line.sku,
    productSlug: v.slug,
    title: v.title,
    slug: v.slug,
    categorySlug: v.categorySlug,
    brand: v.brand,
    price: v.price,
    originalPrice: v.originalPrice,
    image: v.image,
    images: v.images,
    color: v.color,
    inStock: v.availability !== "Out of Stock",
    tags: v.tags,
    badges: v.badges,
    createdAt: new Date().toISOString(),
  };
}

// Hydrate the localStorage guest wishlist into WishlistItems. Resolves display data by SKU
// (one batched call) and drops lines whose SKU no longer exists — heal-not-delete.
async function hydrateGuestWishlist(): Promise<WishlistItem[]> {
  const lines = getGuestWishlist();
  if (lines.length === 0) return [];
  const views = await hydrateSkus(lines.map((l) => l.sku));

  const items: WishlistItem[] = [];
  const survivingLines: GuestWishlistLine[] = [];
  for (const line of lines) {
    const v = views.get(line.sku);
    if (!v) continue; // sku no longer resolves — prune this guest line
    items.push(buildGuestWishlistItem(line, v));
    survivingLines.push({ ...line, product_slug: v.slug }); // heal a stale display slug
  }
  if (survivingLines.length !== lines.length) {
    console.log(`[WishlistContext] guest wishlist healed  ${lines.length}→${survivingLines.length} line(s)`);
    setGuestWishlist(survivingLines);
  }
  return items;
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { refetchCart } = useCart();
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchTick, setFetchTick] = useState(0);
  const abortRef    = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Depend on the stable user *id*, not the user object — see the matching note
  // in CartContext. Prevents the wishlist being GET'd on every Supabase auth
  // event when the user identity hasn't actually changed.
  const userId = user?.id ?? null;

  const wishlistCount = wishlistItems.length;

  const refetchWishlist = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFetchTick((t) => t + 1), 50);
  }, []);

  const isWishlisted = useCallback(
    (productSlug: string, sku: string) =>
      wishlistItems.some((item) => item.productSlug === productSlug && item.sku === sku),
    [wishlistItems]
  );

  // Logged out → the wishlist lives in localStorage (guest wishlist); logged in → the DB
  // wishlist is the source of truth.
  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (!userId) {
      console.log(`[WishlistContext] hydrating guest wishlist  tick=${fetchTick}`);
      // Syncing to external state (localStorage guest wishlist) — same pattern as the DB branch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true);
      hydrateGuestWishlist()
        .then((items) => {
          if (!ctrl.signal.aborted) setWishlistItems(items);
        })
        .catch((err) => {
          if (!ctrl.signal.aborted) {
            console.error("[WishlistContext] guest hydrate failed", err);
            setWishlistItems([]);
          }
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
      return () => ctrl.abort();
    }

    console.log(`[WishlistContext] fetching wishlist  user=${userId}  tick=${fetchTick}`);
    setLoading(true);
    fetchWishlist()
      .then((items) => {
        if (!ctrl.signal.aborted) setWishlistItems(items);
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) {
          console.error("[WishlistContext] fetch failed", err);
          setWishlistItems([]);
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [userId, fetchTick]);

  // Reverse a just-added wishlist item. Re-fetch so we hold the real row id (the
  // add is optimistic and the row briefly carries a temp id), and drop it from
  // the displayed list right away — keyed on slug+sku so the heart empties
  // whether state still holds the temp row or the refetched one.
  const undoAddToWishlist = useCallback(
    async (productSlug: string, sku: string) => {
      try {
        const items = await fetchWishlist();
        const item = items.find((i) => i.productSlug === productSlug && i.sku === sku);
        setWishlistItems((prev) =>
          prev.filter((i) => !(i.productSlug === productSlug && i.sku === sku)),
        );
        if (!item) {
          refetchWishlist();
          return;
        }
        await apiRemove(item.id);
        console.log(`[WishlistContext] undo add  slug=${productSlug}  sku=${sku}`);
        refetchWishlist();
        toast.success("Removed from wishlist!");
      } catch (err) {
        console.error("[WishlistContext] undoAddToWishlist failed", err);
        toast.error("Could not undo");
        refetchWishlist();
      }
    },
    [refetchWishlist],
  );

  // Guest counterpart to undoAddToWishlist — drop the localStorage line, then re-hydrate.
  const undoAddGuestWishlist = useCallback(
    (sku: string) => {
      removeGuestWishlistLine(sku);
      console.log(`[WishlistContext] undo guest add  sku=${sku}`);
      refetchWishlist();
      toast.success("Removed from wishlist!");
    },
    [refetchWishlist],
  );

  const addToWishlist = useCallback(
    async (productSlug: string, sku: string) => {
      // Guest: persist to localStorage and re-hydrate. The variant is resolved
      // client-side (localStorage is ours to write) — placards emit exact variant
      // skus so this is usually a no-op, and the hydration cache makes it cheap.
      if (!user) {
        const { sku: resolvedSku, view } = await resolveVariantSku(sku);
        const slug = view?.slug ?? productSlug;
        if (resolvedSku !== sku) console.log(`[WishlistContext] resolved sku  ${sku} → ${resolvedSku}`);
        if (getGuestWishlist().some((l) => l.sku === resolvedSku)) return; // already saved
        addGuestWishlistLine({ product_slug: slug, sku: resolvedSku });
        console.log("[WishlistContext] guest addToWishlist", slug, resolvedSku);
        refetchWishlist();
        toast.success("Added to wishlist!", {
          duration: 6000,
          action: { label: "Undo", onClick: () => undoAddGuestWishlist(resolvedSku) },
        });
        return;
      }
      // Optimistic: add a placeholder so heart fills instantly — no network before
      // the fill. The backend resolves a stray base_sku to the primary variant and
      // returns the stored sku, which Undo targets.
      const tempId = `temp-${productSlug}-${sku}`;
      setWishlistItems((prev) => {
        if (prev.some((i) => i.productSlug === productSlug && i.sku === sku)) return prev;
        return [
          ...prev,
          {
            id: tempId,
            sku,
            productSlug,
            title: "",
            slug: productSlug,
            categorySlug: "",
            brand: "",
            price: 0,
            originalPrice: 0,
            image: "",
            images: [],
            color: { name: "", hex: "#cccccc" },
            inStock: true,
            tags: [],
            badges: [],
            createdAt: new Date().toISOString(),
          },
        ];
      });
      try {
        const { sku: storedSku } = await apiAdd(productSlug, sku);
        toast.success("Added to wishlist!", {
          duration: 6000,
          action: {
            label: "Undo",
            onClick: () => void undoAddToWishlist(productSlug, storedSku),
          },
        });
        refetchWishlist();
      } catch (err) {
        setWishlistItems((prev) => prev.filter((i) => i.id !== tempId));
        toast.error(err instanceof Error ? err.message : "Could not add to wishlist");
      }
    },
    [user, refetchWishlist, undoAddToWishlist, undoAddGuestWishlist]
  );

  const removeFromWishlist = useCallback(async (wishlistItemId: string) => {
    // Guest: drop the localStorage line by the sku encoded in its synthetic id.
    if (!user) {
      const parsed = parseGuestWishlistLineId(wishlistItemId);
      if (!parsed) return;
      removeGuestWishlistLine(parsed.sku);
      setWishlistItems((prev) => prev.filter((item) => item.id !== wishlistItemId));
      toast.success("Removed from wishlist!");
      return;
    }
    let snapshot: WishlistItem[] = [];
    setWishlistItems((prev) => {
      snapshot = prev;
      return prev.filter((item) => item.id !== wishlistItemId);
    });
    try {
      await apiRemove(wishlistItemId);
      toast.success("Removed from wishlist!");
    } catch {
      setWishlistItems(snapshot);
      toast.error("Could not remove from wishlist");
    }
  }, [user]);

  // Moving a saved item into the *real* cart requires an account. For guests the Wishlist
  // page intercepts the click and routes through login (saving a guest_move_to_cart intent),
  // so these three never run logged-out; the guards are a defensive backstop.
  const moveToCart = useCallback(
    async (wishlistItemId: string) => {
      if (!user) return;
      let snapshot: WishlistItem[] = [];
      setWishlistItems((prev) => {
        snapshot = prev;
        return prev.filter((item) => item.id !== wishlistItemId);
      });
      try {
        await apiMoveToCart(wishlistItemId);
        refetchCart();
        toast.success("Moved to cart!");
      } catch (err) {
        setWishlistItems(snapshot);
        toast.error(err instanceof Error ? err.message : "Could not move to cart");
      }
    },
    [user, refetchCart]
  );

  const moveAllToCart = useCallback(async () => {
    if (!user) return;
    let snapshot: WishlistItem[] = [];
    // Optimistically clear in-stock items
    setWishlistItems((prev) => {
      snapshot = prev;
      return prev.filter((item) => !item.inStock);
    });
    try {
      const { moved, skipped } = await apiMoveAll();
      refetchCart();
      refetchWishlist(); // sync real state after batch move
      if (skipped > 0) {
        toast.success(`${moved} item${moved !== 1 ? "s" : ""} moved to cart. ${skipped} out-of-stock item${skipped !== 1 ? "s" : ""} skipped.`);
      } else {
        toast.success(`${moved} item${moved !== 1 ? "s" : ""} moved to cart!`);
      }
    } catch (err) {
      setWishlistItems(snapshot);
      toast.error(err instanceof Error ? err.message : "Could not move items to cart");
    }
  }, [user, refetchCart, refetchWishlist]);

  // Move just the checked wishlist lines to cart (the "Move Selected to Cart" button —
  // the selective counterpart to moveAllToCart). Sequential like CartContext.reorder, so
  // one failed/out-of-stock line can't abort the rest. Refetches once at the end.
  const moveSelectedToCart = useCallback(
    async (wishlistItemIds: string[]) => {
      if (!user) return;
      const ids = wishlistItemIds.filter((id) =>
        wishlistItems.find((item) => item.id === id)?.inStock,
      );
      if (ids.length === 0) {
        toast.error("Select at least one in-stock item to move");
        return;
      }
      let moved = 0;
      let failed = 0;
      for (const id of ids) {
        try {
          await apiMoveToCart(id);
          moved += 1;
        } catch (err) {
          console.error("[WishlistContext] moveSelectedToCart: could not move", id, err);
          failed += 1;
        }
      }
      refetchCart();
      refetchWishlist(); // sync real state after the batch move
      if (failed > 0) toast.error(`${moved} moved, ${failed} failed. Please try again.`);
      else toast.success(`${moved} item${moved !== 1 ? "s" : ""} moved to cart!`);
    },
    [user, wishlistItems, refetchCart, refetchWishlist],
  );

  const clearWishlistFn = useCallback(async () => {
    if (!user) {
      clearGuestWishlist();
      setWishlistItems([]);
      return;
    }
    let snapshot: WishlistItem[] = [];
    setWishlistItems((prev) => {
      snapshot = prev;
      return [];
    });
    try {
      await apiClear();
    } catch {
      setWishlistItems(snapshot);
      toast.error("Could not clear wishlist");
    }
  }, [user]);

  return (
    <WishlistContext.Provider
      value={{
        wishlistItems,
        wishlistCount,
        loading,
        isWishlisted,
        addToWishlist,
        removeFromWishlist,
        moveToCart,
        moveAllToCart,
        moveSelectedToCart,
        clearWishlist: clearWishlistFn,
        refetchWishlist,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextType {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used inside <WishlistProvider>");
  return ctx;
}
