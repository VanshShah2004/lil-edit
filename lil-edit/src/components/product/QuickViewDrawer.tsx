import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Minus,
  Plus,
  ShoppingBag,
  Heart,
  ExternalLink,
  Eye,
  Share2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthPrompt } from "@/contexts/AuthPromptContext";
import { saveGuestIntent } from "@/lib/guestStorage";
import ShareSheet from "@/components/product/ShareSheet";

const BADGE_PRIORITY = ["newarrival", "trending", "bestseller", "featured"];
const sortBadges = (badges: string[]) => {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  return [...badges].sort((a, b) => {
    const ai = BADGE_PRIORITY.findIndex((p) => norm(a).includes(p));
    const bi = BADGE_PRIORITY.findIndex((p) => norm(b).includes(p));
    return (ai === -1 ? -1 : ai) - (bi === -1 ? -1 : bi);
  });
};

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 768
  );
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isDesktop;
}

export type QuickViewProduct = {
  source: "cart" | "wishlist" | "order";
  id: string;
  // Live-catalog link for order snapshots: string = exists, null = product
  // deleted (so the PDP would 404), undefined = unknown/not an order snapshot.
  productId?: string | null;
  sku: string;
  slug: string;
  categorySlug: string;
  title: string;
  price: number;
  originalPrice: number;
  image: string;
  images?: string[];
  color: { name: string; hex: string };
  badges: string[];
  tags: string[];
  quantity?: number;
  size?: string;
  availability?: string;
  brand?: string;
  inStock?: boolean;
  stock?: number | null;
  isUnlimited?: boolean;
  // Enriched from the live product (orders/cart snapshots don't carry this).
  descriptionPoints?: string[];
};

export type QuickViewDrawerProps = {
  open: boolean;
  product: QuickViewProduct | null;
  onClose: () => void;
  // Admin/preview contexts (e.g. the Curation Studio) hide the "Buy Now" CTA, which
  // has no meaning there. Defaults to false so all shopper-facing usages are unchanged.
  hideBuyNow?: boolean;
  // When true, the drawer renders a skeleton in place of the content — lets a caller
  // open the drawer INSTANTLY and fill it in once its product fetch resolves. Defaults
  // to false, so callers that pass a fully-formed product see no change.
  loading?: boolean;
};

export default function QuickViewDrawer({ open, product, onClose, hideBuyNow = false, loading = false }: QuickViewDrawerProps) {
  const navigate = useNavigate();
  const { cartItems, updateQuantity } = useCart();
  const { moveToCart, isWishlisted, addToWishlist, removeFromWishlist, wishlistItems } =
    useWishlist();
  const { user } = useAuth();
  const { promptAuth } = useAuthPrompt();
  const sheetRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  // Embla drives the image gallery — the same engine as the PDP gallery. The old
  // hand-rolled pointer swipe animated the outgoing image using the PREVIOUS
  // slide direction (framer's `custom` on the child wins over AnimatePresence's,
  // and the exiting child still carries last render's value), so every time you
  // reversed direction both images flew the same way and the swipe looked broken
  // one-sided. Embla is symmetric by construction and adds momentum,
  // rubber-banding at the edges and a live peek of the neighbouring slide.
  const [emblaApi, setEmblaApi] = useState<CarouselApi>();
  const [activeImg, setActiveImg] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);

  // Resizable sheet height — the drag handle lets the user pull the drawer
  // taller/shorter instead of only dragging it closed.
  const defaultHeightVh = isDesktop ? 88 : 65;
  const minHeightVh = 30;
  const maxHeightVh = isDesktop ? 94 : 92;
  const [sheetHeightVh, setSheetHeightVh] = useState(defaultHeightVh);
  const resizeStartY = useRef(0);
  const resizeStartHeightVh = useRef(defaultHeightVh);
  const resizing = useRef(false);

  // Reset to the default height each time the drawer is (re)opened.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) setSheetHeightVh(defaultHeightVh); }, [open, defaultHeightVh]);

  const handleResizeStart = (e: ReactPointerEvent) => {
    resizing.current = true;
    resizeStartY.current = e.clientY;
    resizeStartHeightVh.current = sheetHeightVh;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleResizeMove = (e: ReactPointerEvent) => {
    if (!resizing.current) return;
    const deltaVh = ((resizeStartY.current - e.clientY) / window.innerHeight) * 100;
    setSheetHeightVh(Math.min(maxHeightVh, Math.max(minHeightVh, resizeStartHeightVh.current + deltaVh)));
  };
  const handleResizeEnd = () => {
    if (!resizing.current) return;
    resizing.current = false;
    if (sheetHeightVh <= minHeightVh + 5) onClose();
  };

  // Mirror whichever slide embla settled on into `activeImg`, which drives the
  // thumbnail highlight and the "n / total" badge — direction-agnostic.
  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setActiveImg(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  // Reset the gallery to the first image whenever the drawer opens or a different
  // product is shown. `open` matters because the carousel unmounts on close and
  // embla always remounts on slide 0 — without this, `activeImg` (badge +
  // thumbnail highlight) would keep pointing at the last-viewed slide.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveImg(0);
    emblaApi?.scrollTo(0, true); // jump, no slide animation
  }, [open, product?.id, emblaApi]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    // <html>'s own background is the cream design token (--background:
    // 275 32% 99%), painted so sub-pixel gaps next to a fixed overlay show page
    // color instead of white (see index.css). Below this bottom sheet's rounded
    // corners that same cream shows through as a visible sliver against the
    // sheet's pure white — same class of gap the repo already patches to black
    // for Radix overlays via body[data-scroll-locked]. Force it to solid white
    // here so the sheet reads as flush all the way to the screen edge.
    document.documentElement.style.backgroundColor = "#fff";
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.backgroundColor = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus into the dialog on open — onto the sheet itself, NOT the close
  // button. Focusing the button lit up its `focus-visible` ring, so every open
  // painted a teal ring + white offset gap around the X. The sheet is
  // tabIndex={-1} + outline-none, so focus is still trapped in the right place
  // for Escape/Tab and screen readers, with nothing drawn.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => sheetRef.current?.focus({ preventScroll: true }), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!product) return null;

  const allImages =
    product.images && product.images.length > 0 ? product.images : [product.image];
  const total = allImages.length;

  const goTo = (idx: number) => emblaApi?.scrollTo(idx);

  const liveCartItem =
    product.source === "cart" ? cartItems.find((i) => i.id === product.id) : undefined;
  const liveQty = liveCartItem?.quantity ?? product.quantity ?? 1;

  const wishlisted = isWishlisted(product.slug, product.sku);
  const wishlistItemForProduct = wishlistItems.find(
    (i) => i.slug === product.slug && i.sku === product.sku
  );

  const discount =
    product.originalPrice > product.price
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
      : 0;

  const formattedCategory = product.categorySlug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const pdpUrl = `/collections/${product.categorySlug}/product/${product.slug}$${product.sku}`;

  // An order line whose product has since been deleted (productId nulled by the
  // ON DELETE SET NULL link) has no live PDP to open — guard the navigation.
  const productUnavailable = product.source === "order" && product.productId === null;

  const inStock =
    product.source === "wishlist"
      ? (product.inStock ?? true)
      : !product.availability?.toLowerCase().includes("out");

  // In preview contexts (hideBuyNow) with no "Move to Cart", "View Product" is the
  // lone CTA — render it compact/centered instead of stretched full-width.
  const soleViewButton = hideBuyNow && product.source !== "wishlist";

  const handleViewFull = () => { if (productUnavailable) return; onClose(); navigate(pdpUrl); };
  // Direct "Buy Now": straight to checkout with just this item (cart untouched). The
  // backend re-prices from {slug, sku, size, quantity}; the rest is display-only.
  const handleBuyNow = () => {
    const enriched = {
      product_slug: product.slug,
      sku: product.sku,
      size: product.size ?? "",
      quantity: liveQty,
      title: product.title,
      price: product.price,
      originalPrice: product.originalPrice,
      image: product.image,
      colorName: product.color?.name ?? "",
    };
    // Guest: prompt login/signup, then resume to /checkout, where this item is placed as a
    // one-off order (the cart is untouched — same as the logged-in direct buy).
    if (!user) {
      saveGuestIntent({ type: "guest_checkout", items: [enriched] });
      onClose();
      promptAuth("/checkout");
      return;
    }
    onClose();
    navigate("/checkout", { state: { mode: "direct", item: enriched } });
  };
  const handleMoveToCart = async () => {
    // Guest: moving into the real cart needs an account — stash it and route through login → /cart.
    if (!user) {
      saveGuestIntent({
        type: "guest_move_to_cart",
        items: [{ product_slug: product.slug, sku: product.sku, size: "", quantity: 1 }],
      });
      onClose();
      promptAuth("/cart");
      return;
    }
    await moveToCart(product.id);
    onClose();
  };
  const handleWishlistToggle = () => {
    if (wishlisted && wishlistItemForProduct) {
      void removeFromWishlist(wishlistItemForProduct.id);
    } else {
      void addToWishlist(product.slug, product.sku);
    }
  };
  const handleQtyChange = (delta: number) => {
    const maxAllowed = product.isUnlimited ? 99 : Math.min(99, product.stock ?? 99);

    if (delta > 0 && liveQty >= maxAllowed) {
      toast.error("No more qty available");
      return;
    }

    // 1–maxAllowed, matching the backend clamp; at a bound the click is a no-op.
    const next = Math.min(maxAllowed, Math.max(1, liveQty + delta));
    if (next === liveQty) return;
    void updateQuantity(product.id, next);
  };

  // ── Shared pieces ────────────────────────────────────────────────────────

  const carousel = (heightClass: string, inlineHeight?: string) => (
    <div
      className={`relative rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0 ${heightClass}`}
      style={inlineHeight ? { height: inlineHeight } : undefined}
    >
      {/* Embla arbitrates horizontal-vs-vertical itself, so a mostly-vertical
          drag still scrolls the sheet while a horizontal one pages the gallery —
          in either direction, with the same physics. */}
      <Carousel
        setApi={setEmblaApi}
        opts={{ loop: total > 1, watchDrag: total > 1 }}
        className={`w-full h-full ${total > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <CarouselContent className="ml-0 h-full">
          {allImages.map((img, i) => (
            <CarouselItem key={i} className="pl-0 basis-full h-full">
              <img
                src={img}
                alt={`${product.title} — image ${i + 1}`}
                draggable={false}
                onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                className="w-full h-full object-cover object-center select-none"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      {total > 1 && (
        <span className="absolute top-2 right-2 bg-black/40 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full z-10">
          {activeImg + 1} / {total}
        </span>
      )}
    </div>
  );

  const thumbs = () => (
    <div className="flex gap-2 overflow-x-auto no-scrollbar flex-shrink-0 py-1 px-1">
      {allImages.map((img, i) => (
        <button
          key={i}
          onClick={() => goTo(i)}
          className={`flex-shrink-0 w-16 h-20 rounded-xl overflow-hidden border-2 transition-all duration-200 ${
            activeImg === i
              ? "border-brand-teal scale-105 shadow-md"
              : "border-gray-200 hover:border-gray-400 opacity-70 hover:opacity-100"
          }`}
          aria-label={`View image ${i + 1}`}
        >
          <img src={img} alt={`${product.title} ${i + 1}`} onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }} className="w-full h-full object-cover object-center" />
        </button>
      ))}
    </div>
  );

  const details = () => (
    <div className="space-y-3">
      {/* Price */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-3xl md:text-2xl font-bold text-brand-teal">₹{product.price}</span>
        {product.originalPrice > product.price && (
          <>
            <span className="text-lg md:text-base line-through text-gray-400">₹{product.originalPrice}</span>
            <span className="text-sm md:text-xs font-bold bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">{discount}% off</span>
          </>
        )}
      </div>

      {/* Stock */}
      <div className="flex items-center gap-1.5">
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${inStock ? "bg-green-500" : "bg-red-400"}`} />
        <span className={`text-base md:text-lg font-semibold ${inStock ? "text-green-700" : "text-red-500"}`}>
          {inStock ? (product.source === "cart" ? product.availability || "In Stock" : "In Stock") : "Out of Stock"}
        </span>
      </div>

      {/* Badges */}
      {product.badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sortBadges(product.badges).map((tag, i) => (
            <Badge key={i} variant="secondary" className="bg-gradient-to-r from-purple-50 to-indigo-50 text-indigo-800 border border-indigo-100 text-sm md:text-xs px-2.5 py-1 rounded-md font-medium shadow-sm">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Color + Size */}
      <div className="flex items-center gap-3 flex-wrap">
        {product.color.hex && (
          <span className="flex items-center gap-1.5 text-base md:text-lg font-medium text-gray-700">
            <span className="w-5 h-5 md:w-6 md:h-6 rounded-full border border-gray-300 shadow-sm flex-shrink-0" style={{ backgroundColor: product.color.hex }} />
            {product.color.name || "Color"}
          </span>
        )}
        {product.color.hex && product.size && <span className="text-gray-900 font-bold">·</span>}
        {product.size && (
          <span className="text-base md:text-lg font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">Size&nbsp;:&nbsp; {product.size}</span>
        )}
      </div>

      {/* Qty stepper — cart only */}
      {product.source === "cart" && (
        <div className="flex items-center gap-2.5">
          <span className="text-base md:text-lg text-gray-600 font-medium">Qty&nbsp;:</span>
          <div className="flex items-center border border-gray-400 rounded-full overflow-hidden bg-white w-fit">
            <button onClick={() => handleQtyChange(-1)} className="px-3 py-1.5 md:py-2 hover:bg-gray-100 transition" aria-label="Decrease quantity"><Minus size={13} /></button>
            <span className="px-3 text-base md:text-lg font-semibold min-w-[2ch] text-center">{liveQty}</span>
            <button onClick={() => handleQtyChange(1)} className={`px-3 py-1.5 md:py-2 transition ${liveQty >= (product.isUnlimited ? 99 : Math.min(99, product.stock ?? 99)) ? "opacity-30" : "hover:bg-gray-100"}`} aria-label="Increase quantity"><Plus size={13} /></button>
          </div>
        </div>
      )}

      {/* Category / SKU */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-base md:text-lg text-gray-700">
        <span>Category&nbsp;: <span className="text-gray-600 font-medium">{formattedCategory}</span></span>
        <span>SKU&nbsp;: <span className="text-gray-600 font-medium font-mono">{product.sku}</span></span>
      </div>

      {/* Product details — enriched from the live product (snapshots don't carry it). */}
      {product.descriptionPoints && product.descriptionPoints.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-sm md:text-base font-semibold text-gray-900">Product Details</h3>
          <ul className="list-disc pl-4 space-y-1 text-sm md:text-base text-gray-600">
            {product.descriptionPoints.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const ctaMobile = () => (
    <div className={`flex flex-row gap-2 ${hideBuyNow ? "justify-center" : ""}`}>
      <Button
        variant="default"
        onClick={handleViewFull}
        disabled={productUnavailable}
        className={`h-11 rounded-full font-semibold text-base gap-1.5 disabled:opacity-60 bg-primary hover:bg-primary/90 text-primary-foreground ${soleViewButton ? "px-10" : "flex-1"}`}
      >
        <ExternalLink size={15} /> {productUnavailable ? "Product Unavailable" : "View Product"}
      </Button>
      {product.source === "wishlist" && (
        <Button onClick={() => void handleMoveToCart()} disabled={!inStock} className="flex-1 h-11 bg-brand-teal hover:bg-[#0C5D53] text-white rounded-full font-semibold text-base gap-1.5 disabled:opacity-60">
          <ShoppingBag size={15} /> Move to Cart
        </Button>
      )}
      {!hideBuyNow && (
        <Button onClick={handleBuyNow} disabled={!inStock} className="flex-1 h-11 bg-brand-teal hover:bg-[#0C5D53] text-white rounded-full font-semibold text-base disabled:opacity-60">
          Buy Now
        </Button>
      )}
    </div>
  );

  const ctaDesktop = () => (
    <div className={`flex gap-2 ${hideBuyNow ? "justify-center" : ""}`}>
      {product.source === "wishlist" && (
        <Button onClick={() => void handleMoveToCart()} disabled={!inStock} className="flex-1 h-11 bg-brand-teal hover:bg-[#0C5D53] text-white rounded-full font-semibold text-base gap-1.5 disabled:opacity-60">
          <ShoppingBag size={15} /> Move to Cart
        </Button>
      )}
      {!hideBuyNow && (
        <Button onClick={handleBuyNow} disabled={!inStock} className="flex-1 h-11 bg-brand-teal hover:bg-[#0C5D53] text-white rounded-full font-semibold text-base disabled:opacity-60">
          Buy Now
        </Button>
      )}
      <Button
        variant="default"
        onClick={handleViewFull}
        disabled={productUnavailable}
        className={`h-11 rounded-full font-semibold text-base gap-1.5 disabled:opacity-60 bg-primary hover:bg-primary/90 text-primary-foreground ${soleViewButton ? "min-w-[20rem]" : "flex-1"}`}
      >
        <ExternalLink size={15} /> {productUnavailable ? "Product Unavailable" : "View Product"}
      </Button>
    </div>
  );

  // Loading skeleton — shown while the opener is still fetching the product, so the
  // drawer can slide up INSTANTLY on click and fill in when the data arrives.
  const skeleton = () => (
    <div className="flex-1 overflow-hidden p-4 sm:p-6">
      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        <div className="w-full md:w-[42%] h-64 md:h-[26rem] rounded-2xl bg-gray-200 animate-pulse shrink-0" />
        <div className="flex-1 space-y-4 py-1">
          <div className="h-8 w-3/4 rounded-lg bg-gray-200 animate-pulse" />
          <div className="h-4 w-1/3 rounded bg-gray-200 animate-pulse" />
          <div className="h-9 w-1/2 rounded-lg bg-gray-200 animate-pulse" />
          <div className="space-y-2 pt-3">
            <div className="h-4 w-full rounded bg-gray-100 animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-gray-100 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-gray-100 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );

  // Header action pill — same filled-grey chrome ShareSheet uses, so the two
  // sheets read as one family when the share sheet layers on top. Shared here so
  // the heart / share / close buttons can't drift apart again.
  const iconBtn =
    "w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-[299] bg-black/25"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer — always slides up from bottom */}
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Quick product view"
            tabIndex={-1}
            // Height is plain CSS, not a framer-animated value: `dvh` tracks the
            // VISIBLE viewport, which is the same basis handleResizeMove divides by
            // (window.innerHeight). With `vh` the two disagreed — vh resolves against
            // the LARGE viewport (as if the browser toolbar were retracted), so at
            // maxHeightVh the sheet could grow taller than the visible area and push
            // its own drag handle out of reach under `overflow-hidden`. Keeping height
            // out of `animate` also means a resize drag never springs, so `transition`
            // now governs only `y`.
            style={{ height: `${sheetHeightVh}dvh` }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 380, mass: 0.8 }}
            className="fixed inset-x-0 bottom-0 z-[300] flex flex-col bg-white rounded-t-3xl shadow-2xl outline-none overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle — pull up/down to resize the sheet's height */}
            <div
              onPointerDown={handleResizeStart}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
              className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-ns-resize active:cursor-ns-resize touch-none select-none"
            >
              <div className="w-12 h-1.5 rounded-full bg-gray-400" />
            </div>

            {/* Header — padding is plain responsive Tailwind rather than the
                isDesktop branch: useIsDesktop breaks at 768px, which is exactly
                `md`, so the header no longer re-renders on resize. */}
            <div className="flex items-center justify-between px-4 sm:px-5 md:px-6 flex-shrink-0 pt-1 pb-3">
              <span className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-[0.15em] text-brand-teal">
                <Eye size={14} /> Quick View
              </span>
              <div className="flex items-center gap-1">
                {product.source === "cart" && (
                  <button
                    onClick={handleWishlistToggle}
                    className={`${iconBtn} ${wishlisted ? "text-primary" : "text-gray-500 hover:text-primary"}`}
                    aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
                  >
                    <Heart size={19} fill={wishlisted ? "currentColor" : "none"} />
                  </button>
                )}
                <button
                  onClick={() => setShareOpen(true)}
                  disabled={productUnavailable}
                  className={`${iconBtn} text-gray-500 hover:text-brand-teal disabled:opacity-40 disabled:cursor-not-allowed`}
                  aria-label="Share product"
                >
                  <Share2 size={19} />
                </button>
                <button
                  onClick={onClose}
                  className={`${iconBtn} text-gray-500 hover:text-gray-800`}
                  aria-label="Close quick view"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Hairline under the bar at BOTH breakpoints — mirrors ShareSheet's
                divider. Previously desktop-only, which left the mobile sheet's
                header floating unanchored above the content. */}
            <div className="h-px mx-4 sm:mx-5 md:mx-6 mb-[10px] flex-shrink-0 bg-gradient-to-r from-transparent via-gray-300 to-transparent" />

            <AnimatePresence mode="wait" initial={false}>
              {loading ? (
                <motion.div
                  key="qv-skeleton"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-1 flex-col min-h-0"
                >
                  {skeleton()}
                </motion.div>
              ) : (
                <motion.div
                  key="qv-content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className="flex flex-1 flex-col min-h-0"
                >
                  {isDesktop ? (
              /* ══ DESKTOP: single shared scroll, two columns side-by-side ══ */
              <>
                <div className="flex-1 overflow-y-auto overscroll-contain">
                  <div className="flex flex-row">

                    {/* Left: image + thumbnails */}
                    <div className="w-[42%] flex-shrink-0 flex flex-col gap-2 p-4">
                      {carousel("", "26rem")}
                      {thumbs()}
                    </div>

                    {/* Right: title + details */}
                    <div className="flex-1 px-5 pt-4 pb-4 border-l border-gray-100 space-y-3">
                      <div>
                        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 leading-snug">{product.title}</h2>
                        {product.brand && (
                          <p className="text-lg md:text-xl text-brand-teal font-medium mt-0.5 uppercase">{product.brand}</p>
                        )}
                      </div>
                      {details()}
                    </div>
                  </div>
                </div>

                {/* Desktop CTA — sticky footer */}
                <div className="flex-shrink-0 border-t border-gray-100 px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] bg-white">
                  {ctaDesktop()}
                </div>
              </>
            ) : (
              /* ══ MOBILE: single scrollable column ══ */
              <>
                <div className="flex-1 overflow-y-auto overscroll-contain">
                  {/* Title + brand */}
                  <div className="px-4 sm:px-5 pt-0 pb-4">
                    <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-snug">{product.title}</h2>
                    {product.brand && (
                      <p className="text-sm sm:text-base text-brand-teal font-medium mt-0.5 uppercase">{product.brand}</p>
                    )}
                  </div>
                  <div className="px-3 sm:px-4">{carousel("h-[26rem] sm:h-[30rem]")}</div>
                  <div className="px-3 sm:px-4 pt-2 pb-1">{thumbs()}</div>
                  <div className="px-4 sm:px-5 pb-4">{details()}</div>
                </div>

                {/* Mobile CTA footer */}
                {/* pb keeps the CTAs clear of the home indicator / gesture bar. The
                    env() term is exactly the strip that used to sit outside the layout
                    viewport and show the page background; it is now the sheet's own
                    white. 0.75rem is the previous py-3, so nothing moves where the
                    inset is 0 (every desktop browser, non-notched phones). */}
                <div className="flex-shrink-0 border-t border-gray-100 px-4 sm:px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] bg-white">
                  {ctaMobile()}
                </div>
              </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    {/* Branded share sheet — same experience as the PDP, layered above the
        drawer (z-350). Wired once here, so it works in both the mobile and
        desktop drawer layouts. */}
    <ShareSheet
      open={shareOpen}
      onClose={() => setShareOpen(false)}
      product={{
        categorySlug: product.categorySlug,
        slug: product.slug,
        sku: product.sku,
        title: product.title,
        brand: product.brand ?? "",
        price: product.price,
        originalPrice: product.originalPrice,
        image: product.image,
      }}
    />
    </>
  );
}
