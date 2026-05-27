import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X, Minus, Plus, ShoppingBag, Heart, ExternalLink, Eye } from "lucide-react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
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
  color: { name: string; hex: string };
  badges: string[];
  tags: string[];
  // cart-specific
  quantity?: number;
  size?: string;
  availability?: string;
  // wishlist-specific
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

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
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

  const handleViewFull = () => {
    onClose();
    navigate(pdpUrl);
  };

  const handleMoveToCart = async () => {
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
    const next = Math.max(1, liveQty + delta);
    void updateQuantity(product.id, next);
  };

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
            className="fixed inset-0 z-[99] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer */}
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
            className="fixed inset-x-0 bottom-0 z-[100] flex flex-col bg-white rounded-t-3xl shadow-2xl max-h-[82vh] outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
            >
              <div className="w-12 h-1.5 rounded-full bg-gray-200" />
            </div>

            {/* Header row */}
            <div className="flex items-center justify-between px-4 sm:px-6 pt-2 pb-3 flex-shrink-0">
              <span className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
                Quick View
                <Eye size={16} className="text-gray-900" />
              </span>
              <button
                ref={closeRef}
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-800"
                aria-label="Close quick view"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-4">
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                {/* Product image */}
                <div className="sm:w-48 md:w-56 lg:w-60 flex-shrink-0">
                  <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100">
                    <img
                      src={product.image}
                      alt={product.title}
                      onError={(e) => {
                        e.currentTarget.src = "/fallback-product.webp";
                      }}
                      className="w-full h-full object-cover object-center"
                    />
                  </div>
                </div>

                {/* Product details */}
                <div className="flex-1 min-w-0 flex flex-col gap-3 pb-2">
                  {/* Title + brand */}
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 leading-snug">
                      {product.title}
                    </h2>
                    {product.brand && (
                      <p className="text-sm text-brand-teal font-medium mt-0.5">{product.brand}</p>
                    )}
                  </div>

                  {/* Price */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-2xl font-bold text-brand-teal">₹{product.price}</span>
                    {product.originalPrice > product.price && (
                      <>
                        <span className="text-sm line-through text-gray-400">
                          ₹{product.originalPrice}
                        </span>
                        <span className="text-xs font-bold bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                          {discount}% off
                        </span>
                      </>
                    )}
                  </div>

                  {/* Stock status */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        inStock ? "bg-green-500" : "bg-red-400"
                      }`}
                    />
                    <span
                      className={`text-sm font-medium ${
                        inStock ? "text-green-700" : "text-red-500"
                      }`}
                    >
                      {inStock
                        ? product.source === "cart"
                          ? product.availability || "In Stock"
                          : "In Stock"
                        : "Out of Stock"}
                    </span>
                  </div>

                  {/* Badges */}
                  {product.badges.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {sortBadges(product.badges)
                        .slice(0, 3)
                        .map((tag, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="bg-gradient-to-r from-purple-50 to-indigo-50 text-indigo-800 border border-indigo-100 text-xs px-2 py-0.5 rounded-md font-medium shadow-sm"
                          >
                            {tag}
                          </Badge>
                        ))}
                    </div>
                  )}

                  {/* Color + size */}
                  <div className="flex items-center gap-4 flex-wrap">
                    {product.color.hex && (
                      <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <span
                          className="w-6 h-6 rounded-full border-2 border-gray-300 shadow-sm flex-shrink-0"
                          style={{ backgroundColor: product.color.hex }}
                        />
                        {product.color.name || "Color"}
                      </span>
                    )}
                    {product.size && (
                      <span className="text-sm font-medium text-gray-700 bg-gray-100 px-3 py-1 rounded-full">
                        Size: {product.size}
                      </span>
                    )}
                  </div>

                  {/* Category / SKU */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span>
                      Category:{" "}
                      <span className="text-gray-600 font-medium">{formattedCategory}</span>
                    </span>
                    <span>
                      SKU:{" "}
                      <span className="text-gray-600 font-medium font-mono">{product.sku}</span>
                    </span>
                  </div>

                  {/* Quantity stepper — cart items only */}
                  {product.source === "cart" && (
                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-sm text-gray-600 font-medium">Quantity:</span>
                      <div className="flex items-center border border-gray-300 rounded-full overflow-hidden bg-white w-fit">
                        <button
                          onClick={() => handleQtyChange(-1)}
                          className="px-3 py-1.5 hover:bg-gray-100 transition"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="px-3 text-sm font-semibold min-w-[2ch] text-center">
                          {liveQty}
                        </span>
                        <button
                          onClick={() => handleQtyChange(1)}
                          className="px-3 py-1.5 hover:bg-gray-100 transition"
                          aria-label="Increase quantity"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CTA footer */}
            <div className="flex-shrink-0 border-t border-gray-100 px-4 sm:px-6 py-4 bg-white">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <Button
                  variant="outline"
                  onClick={handleViewFull}
                  className="flex-1 h-11 border-gray-300 text-gray-700 hover:border-brand-teal hover:text-brand-teal rounded-full font-semibold text-sm gap-1.5"
                >
                  <ExternalLink size={14} />
                  View Full Product
                </Button>

                {product.source === "wishlist" && (
                  <Button
                    onClick={() => void handleMoveToCart()}
                    disabled={!inStock}
                    className="flex-1 h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full font-semibold text-sm gap-1.5 disabled:opacity-60"
                  >
                    <ShoppingBag size={14} />
                    Move to Cart
                  </Button>
                )}

                <Button
                  disabled={!inStock}
                  className="flex-1 h-11 bg-brand-teal hover:bg-[#0C5D53] text-white rounded-full font-semibold text-sm disabled:opacity-60"
                >
                  Buy Now
                </Button>

                {/* Wishlist toggle shown only for cart-source items */}
                {product.source === "cart" && (
                  <button
                    onClick={handleWishlistToggle}
                    className={`w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full border transition-colors ${
                      wishlisted
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-gray-300 text-gray-500 hover:border-primary/50 hover:text-primary hover:bg-primary/5"
                    }`}
                    aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
                  >
                    <Heart size={16} fill={wishlisted ? "currentColor" : "none"} />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
