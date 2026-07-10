import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/contexts/CartContext";
import { resolveVariantSku } from "@/lib/productHydration";

// Only slug + sku are needed to add a line; sizes are fetched on demand. Kept as
// a narrow shape so any card (curated homepage items, PDP recommendations, …)
// can pass its product without conforming to a heavier type.
type QuickAddProduct = { slug: string; sku: string };

// Desktop-only quick add: hover reveals this button (parent wrapper is hidden on
// mobile). Clicking fetches sizes for the SKU on demand — the card only carries
// slug/sku/price, not the full size list — then either adds directly (no sizes)
// or opens a size picker before adding.
const QuickAddButton = ({ product }: { product: QuickAddProduct }) => {
  const { addToCart } = useCart();
  const [open, setOpen] = useState(false);
  const [sizes, setSizes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Track WHICH size is being added (not just a global boolean) so the size picker
  // only spins the clicked chip, never all of them. null = nothing adding.
  const [addingSize, setAddingSize] = useState<string | null>(null);
  const adding = addingSize !== null;
  const [outOfStock, setOutOfStock] = useState(false);
  // The concrete colour-variant SKU to add. Placards hand us the product's base_sku,
  // which isn't purchasable on its own — handleClick resolves it to a real variant
  // SKU (below) so the cart line carries the right colour + stock.
  const [resolvedSku, setResolvedSku] = useState(product.sku);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const doAdd = async (size: string, sku: string = resolvedSku, oos: boolean = outOfStock) => {
    setAddingSize(size);
    try {
      await addToCart(
        { product_slug: product.slug, sku, size, quantity: 1 },
        { outOfStock: oos }
      );
      setOpen(false);
    } finally {
      setAddingSize(null);
    }
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      // Placards now carry the exact variant sku; resolveVariantSku is a defensive
      // no-op for those, and still maps a stray base_sku to its primary variant.
      const { sku: skuToAdd, view } = await resolveVariantSku(product.sku);
      setResolvedSku(skuToAdd);
      const isOOS = !!view && !view.isUnlimited && (view.stock ?? 0) <= 0;
      setOutOfStock(isOOS);
      const resolvedSizes = view?.sizes ?? [];
      if (resolvedSizes.length <= 1) {
        // Sizes resolved — hand off to the add. Clear `loading` first so the button
        // label transitions Loading… → Adding… (both set in the same tick, so React
        // batches them into one render — no flash of the default "Add to Cart").
        setLoading(false);
        await doAdd(resolvedSizes[0] ?? "", skuToAdd, isOOS);
        return;
      }
      setSizes(resolvedSizes);
      setOpen(true);
    } catch {
      toast.error("Couldn't load sizes — try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => void handleClick(e)}
        disabled={loading || adding}
        className={`w-full py-1.5 rounded-lg font-medium text-[10px] md:text-xs shadow-sm transition-colors flex items-center justify-center gap-1 ${
          loading || adding
            ? "bg-[#0F766E] text-white cursor-not-allowed"
            : "bg-white/90 backdrop-blur text-foreground hover:bg-[#0F766E] hover:text-white"
        }`}
      >
        {(loading || adding) && <Loader2 className="w-3 h-3 animate-spin" />}
        {loading ? "Loading…" : adding ? "Adding…" : "Add to Cart"}
      </button>

      {open && sizes && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-lg border border-border p-2 z-20">
          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 px-1">Select Size</p>
          <div className="flex flex-wrap gap-1.5">
            {sizes.map((size) => {
              const isAddingThis = addingSize === size;
              return (
                <button
                  key={size}
                  onClick={() => void doAdd(size)}
                  disabled={adding}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors flex items-center gap-1 ${
                    isAddingThis
                      ? "bg-[#0F766E] text-white cursor-not-allowed"
                      : adding
                        ? "bg-gray-100 opacity-50 cursor-not-allowed"
                        : "bg-gray-100 hover:bg-[#0F766E] hover:text-white"
                  }`}
                >
                  {isAddingThis && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickAddButton;
