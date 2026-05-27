import { useEffect, useRef, useState } from "react";
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
import { motion, AnimatePresence, useDragControls, useMotionValue, animate } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";

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
  source: "cart" | "wishlist";
  id: string;
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
};

export type QuickViewDrawerProps = {
  open: boolean;
  product: QuickViewProduct | null;
  onClose: () => void;
};

export default function QuickViewDrawer({ open, product, onClose }: QuickViewDrawerProps) {
  const navigate = useNavigate();
  const { cartItems, updateQuantity } = useCart();
  const { moveToCart, isWishlisted, addToWishlist, removeFromWishlist, wishlistItems } =
    useWishlist();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dragControls = useDragControls();
  const swipeStartX = useRef(0);
  const swipeActive = useRef(false);
  const dragX = useMotionValue(0);
  const isDesktop = useIsDesktop();
  const [activeImg, setActiveImg] = useState(0);
  const [slideDir, setSlideDir] = useState<1 | -1>(1);

  useEffect(() => { setActiveImg(0); }, [product?.id]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => closeRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!product) return null;

  const allImages =
    product.images && product.images.length > 0 ? product.images : [product.image];
  const total = allImages.length;

  const goTo = (idx: number, dir: 1 | -1) => { setSlideDir(dir); setActiveImg(idx); };
  const prev = () => goTo((activeImg - 1 + total) % total, -1);
  const next = () => goTo((activeImg + 1) % total, 1);

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

  const inStock =
    product.source === "wishlist"
      ? (product.inStock ?? true)
      : !product.availability?.toLowerCase().includes("out");

  const handleViewFull = () => { onClose(); navigate(pdpUrl); };
  const handleMoveToCart = async () => { await moveToCart(product.id); onClose(); };
  const handleWishlistToggle = () => {
    if (wishlisted && wishlistItemForProduct) {
      void removeFromWishlist(wishlistItemForProduct.id);
    } else {
      void addToWishlist(product.slug, product.sku);
    }
  };
  const handleQtyChange = (delta: number) => {
    void updateQuantity(product.id, Math.max(1, liveQty + delta));
  };

  // ── Shared pieces ────────────────────────────────────────────────────────

  const carousel = (heightClass: string, inlineHeight?: string) => (
    <motion.div
      className={`relative rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0 ${heightClass}`}
      style={{ ...(inlineHeight ? { height: inlineHeight } : {}), touchAction: "pan-y", x: dragX }}
      onPointerDown={(e) => {
        swipeStartX.current = e.clientX;
        swipeActive.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!swipeActive.current) return;
        dragX.set(e.clientX - swipeStartX.current);
      }}
      onPointerUp={(e) => {
        swipeActive.current = false;
        const dx = e.clientX - swipeStartX.current;
        if (dx < -40) {
          dragX.set(0);
          next();
        } else if (dx > 40) {
          dragX.set(0);
          prev();
        } else {
          void animate(dragX, 0, { type: "spring", stiffness: 600, damping: 40 });
        }
      }}
      onPointerCancel={() => {
        swipeActive.current = false;
        void animate(dragX, 0, { type: "spring", stiffness: 600, damping: 40 });
      }}
    >
      <AnimatePresence initial={false} custom={slideDir}>
        <motion.img
          key={activeImg}
          custom={slideDir}
          draggable={false}
          variants={{
            enter: (dir: number) => ({ x: dir * 280, opacity: 0 }),
            center: { x: 0, opacity: 1 },
            exit: (dir: number) => ({ x: dir * -280, opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
          src={allImages[activeImg]}
          alt={`${product.title} — image ${activeImg + 1}`}
          onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
          className="absolute inset-0 w-full h-full object-cover object-center select-none"
        />
      </AnimatePresence>
      {total > 1 && (
        <span className="absolute top-2 right-2 bg-black/40 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full z-10">
          {activeImg + 1} / {total}
        </span>
      )}
    </motion.div>
  );

  const thumbs = () => (
    <div className="flex gap-2 overflow-x-auto no-scrollbar flex-shrink-0 py-1">
      {allImages.map((img, i) => (
        <button
          key={i}
          onClick={() => goTo(i, i > activeImg ? 1 : -1)}
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
        <span className="text-xl sm:text-2xl font-bold text-brand-teal">₹{product.price}</span>
        {product.originalPrice > product.price && (
          <>
            <span className="text-sm line-through text-gray-400">₹{product.originalPrice}</span>
            <span className="text-xs font-bold bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">{discount}% off</span>
          </>
        )}
      </div>

      {/* Stock + Color + Size */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${inStock ? "bg-green-500" : "bg-red-400"}`} />
          <span className={`text-xs font-semibold ${inStock ? "text-green-700" : "text-red-500"}`}>
            {inStock ? (product.source === "cart" ? product.availability || "In Stock" : "In Stock") : "Out of Stock"}
          </span>
        </div>
        {product.color.hex && (
          <>
            <span className="text-gray-300">·</span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
              <span className="w-4 h-4 rounded-full border border-gray-300 shadow-sm flex-shrink-0" style={{ backgroundColor: product.color.hex }} />
              {product.color.name || "Color"}
            </span>
          </>
        )}
        {product.size && (
          <>
            <span className="text-gray-300">·</span>
            <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">Size: {product.size}</span>
          </>
        )}
      </div>

      {/* Badges */}
      {product.badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sortBadges(product.badges).map((tag, i) => (
            <Badge key={i} variant="secondary" className="bg-gradient-to-r from-purple-50 to-indigo-50 text-indigo-800 border border-indigo-100 text-[10px] sm:text-xs px-2 py-0.5 rounded-md font-medium shadow-sm">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Category / SKU */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] sm:text-xs text-gray-400">
        <span>Category: <span className="text-gray-600 font-medium">{formattedCategory}</span></span>
        <span>SKU: <span className="text-gray-600 font-medium font-mono">{product.sku}</span></span>
      </div>

      {/* Qty stepper — cart only */}
      {product.source === "cart" && (
        <div className="flex items-center gap-2.5">
          <span className="text-xs sm:text-sm text-gray-600 font-medium">Qty:</span>
          <div className="flex items-center border border-gray-300 rounded-full overflow-hidden bg-white w-fit">
            <button onClick={() => handleQtyChange(-1)} className="px-2.5 py-1 hover:bg-gray-100 transition" aria-label="Decrease quantity"><Minus size={11} /></button>
            <span className="px-3 text-sm font-semibold min-w-[2ch] text-center">{liveQty}</span>
            <button onClick={() => handleQtyChange(1)} className="px-2.5 py-1 hover:bg-gray-100 transition" aria-label="Increase quantity"><Plus size={11} /></button>
          </div>
        </div>
      )}
    </div>
  );

  const ctaMobile = () => (
    <div className="flex flex-row gap-2">
      <Button variant="outline" onClick={handleViewFull} className="flex-1 h-10 border-gray-300 text-gray-700 hover:border-brand-teal hover:text-brand-teal rounded-full font-semibold text-xs sm:text-sm gap-1.5">
        <ExternalLink size={13} /> View Full Product
      </Button>
      {product.source === "wishlist" && (
        <Button onClick={() => void handleMoveToCart()} disabled={!inStock} className="flex-1 h-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full font-semibold text-xs sm:text-sm gap-1.5 disabled:opacity-60">
          <ShoppingBag size={13} /> Move to Cart
        </Button>
      )}
      <Button disabled={!inStock} className="flex-1 h-10 bg-brand-teal hover:bg-[#0C5D53] text-white rounded-full font-semibold text-xs sm:text-sm disabled:opacity-60">
        Buy Now
      </Button>
      {product.source === "cart" && (
        <button onClick={handleWishlistToggle} className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full border transition-colors ${wishlisted ? "border-primary/30 bg-primary/10 text-primary" : "border-gray-300 text-gray-500 hover:border-primary/50 hover:text-primary hover:bg-primary/5"}`} aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}>
          <Heart size={15} fill={wishlisted ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );

  const ctaDesktop = () => (
    <div className="flex gap-2">
      {product.source === "wishlist" && (
        <Button onClick={() => void handleMoveToCart()} disabled={!inStock} className="flex-1 h-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full font-semibold text-sm gap-1.5 disabled:opacity-60">
          <ShoppingBag size={13} /> Move to Cart
        </Button>
      )}
      <Button disabled={!inStock} className="flex-1 h-10 bg-brand-teal hover:bg-[#0C5D53] text-white rounded-full font-semibold text-sm disabled:opacity-60">
        Buy Now
      </Button>
      <Button variant="outline" onClick={handleViewFull} className="flex-1 h-10 border-gray-300 text-gray-700 hover:border-brand-teal hover:text-brand-teal rounded-full font-semibold text-sm gap-1.5">
        <ExternalLink size={13} /> View Full Product
      </Button>
      {product.source === "cart" && (
        <button onClick={handleWishlistToggle} className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full border transition-colors ${wishlisted ? "border-primary/30 bg-primary/10 text-primary" : "border-gray-300 text-gray-500 hover:border-primary/50 hover:text-primary hover:bg-primary/5"}`} aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}>
          <Heart size={15} fill={wishlisted ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-[99] bg-black/25"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer — always slides up from bottom */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Quick product view"
            tabIndex={-1}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={{ bottom: 0.3 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 400) onClose();
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 380, mass: 0.8 }}
            className={`fixed inset-x-0 bottom-0 z-[100] flex flex-col bg-white rounded-t-3xl shadow-2xl outline-none overflow-hidden ${
              isDesktop ? "max-h-[88vh]" : "max-h-[65vh]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
            >
              <div className="w-12 h-1.5 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className={`flex items-center justify-between px-4 sm:px-5 md:px-6 flex-shrink-0 ${isDesktop ? "pt-1 pb-3 border-b border-gray-100" : "pt-1 pb-0"}`}>
              <span className="flex items-center gap-1.5 text-sm font-bold text-gray-900 opacity-65">
                Quick View <Eye size={15} />
              </span>
              <div className="flex items-center gap-1">
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-brand-teal outline-none"
                  aria-label="Share product"
                >
                  <Share2 size={16} />
                </button>
                <button
                  ref={closeRef}
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-800 outline-none"
                  aria-label="Close quick view"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

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
                        <h2 className="text-2xl font-bold text-gray-900 leading-snug">{product.title}</h2>
                        {product.brand && (
                          <p className="text-sm text-brand-teal font-medium mt-0.5">{product.brand}</p>
                        )}
                      </div>
                      {details()}
                    </div>
                  </div>
                </div>

                {/* Desktop CTA — sticky footer */}
                <div className="flex-shrink-0 border-t border-gray-100 px-5 py-4 bg-white">
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
                      <p className="text-xs sm:text-sm text-brand-teal font-medium mt-0.5">{product.brand}</p>
                    )}
                  </div>
                  <div className="px-3 sm:px-4">{carousel("h-[26rem] sm:h-[30rem]")}</div>
                  <div className="px-3 sm:px-4 pt-2 pb-1">{thumbs()}</div>
                  <div className="px-4 sm:px-5 pb-4">{details()}</div>
                </div>

                {/* Mobile CTA footer */}
                <div className="flex-shrink-0 border-t border-gray-100 px-4 sm:px-5 py-3 bg-white">
                  {ctaMobile()}
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
