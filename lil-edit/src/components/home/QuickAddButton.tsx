import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/contexts/CartContext";
import { hydrateSkus } from "@/lib/productHydration";

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
  const [adding, setAdding] = useState(false);
  const [outOfStock, setOutOfStock] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const doAdd = async (size: string, oos: boolean = outOfStock) => {
    setAdding(true);
    try {
      await addToCart(
        { product_slug: product.slug, sku: product.sku, size, quantity: 1 },
        { outOfStock: oos }
      );
      setOpen(false);
    } finally {
      setAdding(false);
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
      const map = await hydrateSkus([product.sku]);
      const view = map.get(product.sku);
      const isOOS = !!view && !view.isUnlimited && (view.stock ?? 0) <= 0;
      setOutOfStock(isOOS);
      const resolvedSizes = view?.sizes ?? [];
      if (resolvedSizes.length <= 1) {
        await doAdd(resolvedSizes[0] ?? "", isOOS);
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
            {sizes.map((size) => (
              <button
                key={size}
                onClick={() => void doAdd(size)}
                disabled={adding}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors flex items-center gap-1 ${
                  adding ? "bg-[#0F766E] text-white cursor-not-allowed" : "bg-gray-100 hover:bg-[#0F766E] hover:text-white"
                }`}
              >
                {adding && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                {size}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickAddButton;
