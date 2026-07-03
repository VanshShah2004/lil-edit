import { useMemo, useState, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Heart, Minus, Plus, Share2, X, Mail, Link2, MoreHorizontal, Check } from "lucide-react";
import { FaFacebook, FaTwitter, FaWhatsapp, FaInstagram, FaTelegramPlane, FaPinterestP, FaSnapchatGhost, FaRedditAlien } from "react-icons/fa";
import { IoChatbubbleEllipses } from "react-icons/io5";
import { motion, AnimatePresence } from "framer-motion";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi
} from "@/components/ui/carousel";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import ProductGalleryImage from "@/components/ProductGalleryImage";
import { preconnectProductImageOrigin } from "@/lib/productImage";
import { buildPdpPath } from "@/lib/pdpUrl";
import type { Product } from "@/types/product";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useAuth } from "@/contexts/AuthContext";

interface ProductPreviewViewProps {
  product: Product;
  previewMode?: boolean;
  compact?: boolean;
  forceMobileLayout?: boolean;
  initialColorName?: string;
  onColorChange?: (colorName: string) => void;
}

const ProductPreviewView = ({
  product,
  previewMode = false,
  compact = false,
  forceMobileLayout = false,
  initialColorName,
  onColorChange,
}: ProductPreviewViewProps) => {
  const [activeImage, setActiveImage] = useState(0);
  const [api, setApi] = useState<CarouselApi>();
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerApi, setViewerApi] = useState<CarouselApi>();
  const thumbnailStripRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDesktop] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 768 : false);
  const { addToCart, removeItem, cartItems } = useCart();
  const { isWishlisted, addToWishlist, removeFromWishlist, wishlistItems } = useWishlist();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    return preconnectProductImageOrigin();
  }, []);

  useLayoutEffect(() => {
    if (!api) return;
    const onSelect = () => {
      const idx = api.selectedScrollSnap();
      setActiveImage(idx);
      if (viewerApi) viewerApi.scrollTo(idx);
    };
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, viewerApi]);

  useLayoutEffect(() => {
    if (!viewerApi) return;
    const onSelect = () => {
      const idx = viewerApi.selectedScrollSnap();
      setActiveImage(idx);
      if (api) api.scrollTo(idx);
    };
    viewerApi.on("select", onSelect);
    return () => {
      viewerApi.off("select", onSelect);
    };
  }, [viewerApi, api]);

  useEffect(() => {
    if (!isViewerOpen) return;

    if (viewerApi) {
      viewerApi.scrollTo(activeImage, true);
    }

    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsViewerOpen(false);
      else if (e.key === "ArrowLeft") viewerApi?.scrollPrev();
      else if (e.key === "ArrowRight") viewerApi?.scrollNext();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalStyle;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isViewerOpen, viewerApi, activeImage]);

  useEffect(() => {
    if (!shareOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShareOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shareOpen]);

  useEffect(() => {
    if (isViewerOpen && thumbnailStripRef.current) {
      const activeEl = thumbnailStripRef.current.children[activeImage] as HTMLElement;
      if (activeEl) {
        const scrollLeft = activeEl.offsetLeft - thumbnailStripRef.current.clientWidth / 2 + activeEl.clientWidth / 2;
        thumbnailStripRef.current.scrollTo({ left: scrollLeft, behavior: "smooth" });
      }
    }
  }, [activeImage, isViewerOpen]);

  const handleThumbnailClick = (idx: number) => {
    setActiveImage(idx);
    api?.scrollTo(idx);
    viewerApi?.scrollTo(idx);
  };
  const [selectedSize, setSelectedSize] = useState(product.sizes[0] ?? "");
  const [activeColor, setActiveColor] = useState(product.colors[0] || null);

  useEffect(() => {
    if (initialColorName) {
      const color = product.colors.find(c => c.name === initialColorName);
      if (color) setActiveColor(color);
    }
  }, [initialColorName, product.colors]);
  const [quantity, setQuantity] = useState(1);

  // Gallery Logic: Color images first, then fallback to product images
  const galleryImages = useMemo(() => {
    const colorImages = activeColor?.images?.map(img => img.url) || [];
    const productImages = product.images.map(img => img.url) || [];
    
    // Combine but ensure we have at least one image
    const combined = [...colorImages, ...productImages];
    return combined.length > 0 ? combined : ["https://placehold.co/600x750?text=No+Image"];
  }, [activeColor, product.images]);

  useEffect(() => {
    // Reset active image when gallery changes
    setActiveImage(0);
    api?.scrollTo(0);
  }, [galleryImages, api]);

  const discountPercent = useMemo(() => {
    if (!product.originalPrice || product.originalPrice <= product.price) return 0;
    return Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
  }, [product.originalPrice, product.price]);

  const flags = [
    product.newArrival ? "New Arrival" : null,
    product.featured ? "Featured" : null,
    product.bestseller ? "Bestseller" : null,
    product.trending ? "Trending" : null,
    ...product.badges,
  ].filter(Boolean) as string[];

  const images = galleryImages;
  const mobileOnly = forceMobileLayout;

  const currentSku = activeColor?.sku || product.sku;
  // Bag fills (like the wishlist heart) when this variant's SKU is already in the cart.
  const isInCart = cartItems.some((i) => i.sku === currentSku);
  const isCurrentUnlimited = activeColor ? !!activeColor.isUnlimited : product.colors.some(c => c.isUnlimited);
  const currentStock = activeColor ? (activeColor.stock ?? 0) : product.colors.reduce((sum, c) => sum + (c.stock ?? 0), 0);

  const getStockStatus = () => {
    if (isCurrentUnlimited) return { label: "In Stock", class: "text-green-600 bg-green-50" };
    if (currentStock <= 0) return { label: "Out of Stock", class: "text-red-500 bg-red-50" };
    if (currentStock < 5) return { label: `Only ${currentStock} Left`, class: "text-orange-500 bg-orange-50" };
    return { label: "In Stock", class: "text-green-600 bg-green-50" };
  };

  const stockStatus = getStockStatus();

  const handleAddToCart = async () => {
    if (previewMode) return;
    if (!selectedSize && product.sizes.length > 0) {
      toast.error("Please select a size before adding to cart");
      return;
    }
    setCartBusy(true);
    try {
      await addToCart({
        product_slug: product.slug,
        sku: currentSku,
        size: selectedSize ?? "",
        quantity,
      });
    } finally {
      setCartBusy(false);
    }
  };

  // Bag icon toggles cart membership: filled (in cart) → remove every line for this
  // SKU; empty → run the normal add flow. Keyed by SKU to match the bag's filled state.
  const handleBagToggle = async () => {
    if (previewMode) return;
    if (!isInCart) {
      await handleAddToCart();
      return;
    }
    setCartBusy(true);
    try {
      const matches = cartItems.filter((i) => i.sku === currentSku);
      for (const m of matches) await removeItem(m.id);
      toast.success("Removed from cart!");
    } finally {
      setCartBusy(false);
    }
  };

  // Direct "Buy Now": go straight to checkout with just this item (the cart is never
  // touched). The backend re-prices from {slug, sku, size, quantity}; the extra fields
  // are display-only so the checkout summary renders without a round-trip.
  const handleBuyNow = () => {
    if (previewMode) return;
    if (!selectedSize && product.sizes.length > 0) {
      toast.error("Please select a size before buying");
      return;
    }
    if (!user) {
      toast.error("Please log in to continue");
      navigate("/login");
      return;
    }
    navigate("/checkout", {
      state: {
        mode: "direct",
        item: {
          product_slug: product.slug,
          sku: currentSku,
          size: selectedSize ?? "",
          quantity,
          title: product.title,
          price: product.price,
          originalPrice: product.originalPrice ?? product.price,
          image: galleryImages[0] ?? "",
          colorName: activeColor?.name ?? "",
        },
      },
    });
  };

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}${buildPdpPath(product.categorySlug, product.slug, currentSku)}` : '';
  const websiteUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Branded share copy. shareFullText embeds both links for free-text channels
  // (WhatsApp / SMS / email / Instagram / native share). shareCaption omits the
  // product link for channels that take it as a separate param, so it isn't shown
  // twice. shareTitle is a one-liner for title-only fields (Reddit / native sheet).
  const shareHook = `Main Character Fit Detected. 👑\n\nMeet ${product.title}—your next wardrobe obsession. ✨`;
  const shareSignoff = `The Lil Edit\nCulture Meets Cool.`;
  const shareFullText = `${shareHook}\n\nGet yours:\n${shareUrl} 🛍️\n\nDiscover more styles:\n${websiteUrl}\n\n${shareSignoff}`;
  const shareCaption = `${shareHook}\n\nDiscover more styles:\n${websiteUrl}\n\n${shareSignoff}`;
  const shareTitle = `Main Character Fit Detected — Meet ${product.title} ✨`;

  // Prefetch the hero photo as a File the moment the sheet opens, so a native
  // share can attach the actual product image synchronously within the user's
  // tap (Web Share API Level 2). Stored as a Promise so a tap before the fetch
  // settles still resolves to the file. Cleared when the sheet closes.
  const shareImageRef = useRef<Promise<File | null> | null>(null);
  useEffect(() => {
    if (!shareOpen) {
      shareImageRef.current = null;
      return;
    }
    shareImageRef.current = (async () => {
      try {
        const imgUrl = galleryImages[0];
        if (!imgUrl) {
          console.warn("[share-image] no gallery image to attach");
          return null;
        }
        console.log("[share-image] fetching", imgUrl);
        const res = await fetch(imgUrl, { mode: "cors" });
        if (!res.ok) {
          console.warn("[share-image] fetch failed  status=", res.status);
          return null;
        }
        const blob = await res.blob();
        const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
        const file = new File([blob], `${product.slug}.${ext}`, { type: blob.type });
        console.log("[share-image] ready", { type: blob.type, sizeKB: Math.round(blob.size / 1024), name: file.name });
        return file;
      } catch (err) {
        console.warn("[share-image] fetch error (likely CORS on the image host) —", err);
        return null;
      }
    })();
  }, [shareOpen, galleryImages, product.slug]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // Native OS share sheet. Attaches the product photo when the platform supports
  // file sharing, otherwise shares text + link, otherwise copies to clipboard.
  // When files are attached, the caption carries both links since many targets
  // drop the separate `url` field in that case.
  const handleNativeShare = async () => {
    const file = shareImageRef.current ? await shareImageRef.current : null;
    const canShareFile = !!file && !!navigator.canShare?.({ files: [file] });
    console.log("[share-native] file=", !!file, " canShareFile=", canShareFile, " hasShareApi=", !!navigator.share);
    try {
      if (canShareFile && file) {
        // Image attached — embed both links in text since file shares drop `url`.
        await navigator.share({ title: shareTitle, text: shareFullText, files: [file] });
        console.log("[share-native] shared WITH photo");
        setShareOpen(false);
        return;
      }
      if (navigator.share) {
        // No file-share support (most desktops) — text + link only, no photo.
        await navigator.share({ title: shareTitle, text: shareCaption, url: shareUrl });
        console.log("[share-native] shared text only — this device can't attach files");
        setShareOpen(false);
        return;
      }
    } catch (err) {
      // User dismissed the native sheet — not an error worth surfacing.
      if ((err as Error)?.name === "AbortError") {
        console.log("[share-native] dismissed by user");
        setShareOpen(false);
        return;
      }
      console.warn("[share-native] share error —", err);
    }
    navigator.clipboard.writeText(shareFullText);
    toast.success("Caption copied to clipboard");
    setShareOpen(false);
  };

  const handleShare = (platform: 'whatsapp' | 'twitter' | 'facebook' | 'instagram' | 'telegram' | 'sms' | 'email' | 'pinterest' | 'snapchat' | 'reddit' | 'more') => {
    let url = '';
    switch (platform) {
      case 'whatsapp':
        url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareFullText)}`;
        break;
      case 'twitter':
        url = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareCaption)}`;
        break;
      case 'facebook':
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareCaption)}`;
        break;
      case 'instagram':
        navigator.clipboard.writeText(shareFullText);
        toast.success('Caption copied! Paste it in your Instagram story or DM');
        setShareOpen(false);
        return;
      case 'telegram':
        url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareCaption)}`;
        break;
      case 'sms':
        url = `sms:?body=${encodeURIComponent(shareFullText)}`;
        window.location.href = url;
        setShareOpen(false);
        return;
      case 'email':
        url = `mailto:?subject=${encodeURIComponent(`Meet ${product.title}✨`)}&body=${encodeURIComponent(shareFullText)}`;
        window.location.href = url;
        setShareOpen(false);
        return;
      case 'pinterest':
        url = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&description=${encodeURIComponent(shareCaption)}&media=${encodeURIComponent(galleryImages[0] || '')}`;
        break;
      case 'snapchat':
        url = `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(shareUrl)}`;
        break;
      case 'reddit':
        url = `https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareTitle)}`;
        break;
      case 'more':
        void handleNativeShare();
        return;
    }
    window.open(url, '_blank');
    setShareOpen(false);
  };

  return (
    <div className={`${compact ? "p-3" : "p-0"} ${mobileOnly ? "pt-3 px-3" : ""} bg-white`}>
      <div className={`flex ${compact || mobileOnly ? "flex-col gap-3" : "flex-col md:flex-row gap-4 md:gap-8 lg:gap-12"}`}>
        <div className={`w-full ${mobileOnly ? "block pt-1" : "md:hidden"}`}>
          <p className="text-xs leading-[1.35] font-bold uppercase tracking-[0.2em] text-[#0f766e] mb-2 w-fit">{product.brand}</p>
          <h1 className={`${compact ? "text-lg" : "text-2xl"} font-semibold text-slate-900 leading-tight mb-2`}>
            {product.title}
          </h1>
        </div>

        <div className={`w-full ${compact || mobileOnly ? "" : "md:w-[55%]"} flex ${compact || mobileOnly ? "flex-col" : "flex-col md:flex-row"} gap-4`}>
          <div className={`${compact || mobileOnly ? "order-2" : "order-2 md:order-1 w-full md:w-24"} shrink-0`}>
            <div className={`flex ${compact || mobileOnly ? "justify-start overflow-x-auto" : "justify-start md:flex-col overflow-x-auto md:overflow-y-auto"} gap-3 no-scrollbar`}>
              {images.map((img, idx) => (
                <button
                  key={`${img}-${idx}`}
                  onClick={() => handleThumbnailClick(idx)}
                  className={`w-16 ${compact || mobileOnly ? "" : "md:w-20"} aspect-[4/5] rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                    activeImage === idx ? "border-[#0F766E]" : "border-gray-200"
                  }`}
                >
                  <ProductGalleryImage
                    src={img}
                    alt={`${product.title} thumbnail ${idx + 1}`}
                    variant="thumbnail"
                    lazy={idx !== activeImage}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>

          <div className={`${compact || mobileOnly ? "order-1" : "order-1 md:order-2"} flex-1`}>
            <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden border border-border/30">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeColor?.name || 'default'}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="w-full h-full"
                >
                  <Carousel
                    setApi={setApi}
                    opts={{ loop: true }}
                    className="w-full h-full cursor-grab active:cursor-grabbing"
                  >
                    <CarouselContent className="ml-0 h-full">
                      {images.map((img, idx) => (
                        <CarouselItem key={idx} className="pl-0 basis-full h-full">
                          <div className="w-full h-full overflow-hidden">
                            <ProductGalleryImage
                              src={img}
                              alt={`${product.title} ${idx + 1}`}
                              variant={idx === 0 ? "hero" : "carousel"}
                              priority={idx === 0}
                              lazy={idx !== 0 && idx !== activeImage}
                              className={`w-full h-full object-cover select-none transition-transform duration-500 hover:scale-105 ${!previewMode ? "cursor-zoom-in" : ""}`}
                              draggable={false}
                              onClick={() => {
                                if (!previewMode) setIsViewerOpen(true);
                              }}
                            />
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                  </Carousel>
                </motion.div>
              </AnimatePresence>
              {discountPercent > 0 && (
                <div className="absolute top-3 right-3 bg-red-500 text-white px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider pointer-events-none z-10 shadow-lg">
                  -{discountPercent}%
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`w-full ${compact || mobileOnly ? "" : "md:w-[45%]"}`}>
          <p className={`${mobileOnly ? "hidden" : "hidden md:block"} text-xs leading-[1.35] font-bold uppercase tracking-[0.2em] text-[#0f766e] mb-2 w-fit`}>{product.brand}</p>
          <h1 className={`${mobileOnly ? "hidden" : "hidden md:block"} ${compact ? "text-lg" : "text-2xl"} font-semibold text-slate-900 leading-snug mb-3`}>
            {product.title}
          </h1>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className={`${compact ? "text-xl" : "text-2xl"} font-bold text-[#0B5B55]`}>₹{product.price}</span>
              {product.originalPrice > 0 && <span className="line-through text-gray-400">₹{product.originalPrice}</span>}
              {discountPercent > 0 && <span className="text-xs font-semibold text-red-500">{discountPercent}% OFF</span>}
            </div>
            
            <motion.div 
              key={currentSku}
              initial={{ opacity: 0, x: 5 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[10px] font-mono font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded border border-gray-400"
            >
              {currentSku}
            </motion.div>
          </div>

          {flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1 sm:mt-1.5 mb-4">
              {flags.map((flag, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="bg-gradient-to-r from-purple-50 to-indigo-50 text-indigo-800 border border-indigo-100 text-[10px] sm:text-[11px] px-2 py-0.5 whitespace-nowrap rounded-md font-medium shadow-sm"
                >
                  {flag}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex gap-5 mb-5 text-black items-center">
            <button
              type="button"
              disabled={previewMode || wishlistBusy}
              onClick={async (e) => {
                e.stopPropagation();
                console.log("[heart] clicked  slug=", product.slug, "sku=", currentSku, "previewMode=", previewMode, "wishlistBusy=", wishlistBusy);
                if (previewMode) return;
                setWishlistBusy(true);
                try {
                  const wishlisted = isWishlisted(product.slug, currentSku);
                  if (wishlisted) {
                    const entry = wishlistItems.find(
                      (i) => i.productSlug === product.slug && i.sku === currentSku
                    );
                    if (entry) await removeFromWishlist(entry.id);
                  } else {
                    await addToWishlist(product.slug, currentSku);
                  }
                } finally {
                  setWishlistBusy(false);
                }
              }}
              className="p-1 -m-1 transition-colors disabled:opacity-40 cursor-pointer outline-none"
              title={isWishlisted(product.slug, currentSku) ? "Remove from wishlist" : "Add to wishlist"}
            >
              {/* Stroke stays black always (text-black); the wishlisted state fills the
                  heart with the primary colour via `fill-primary` (CSS fill overrides the
                  attribute), so the black border reads over the fill. */}
              <Heart
                strokeWidth={isWishlisted(product.slug, currentSku) ? 1.5 : 2}
                className={`w-[30px] h-[30px] md:w-6 md:h-6 text-black ${isWishlisted(product.slug, currentSku) ? "fill-primary" : "fill-none"}`}
              />
            </button>
            {!previewMode ? (
              <button
                onClick={() => setShareOpen(true)}
                className="p-1 -m-1 transition-colors hover:text-[#0B5B55] outline-none cursor-pointer"
              >
                <Share2 className="w-[30px] h-[30px] md:w-6 md:h-6" />
              </button>
            ) : (
              <button disabled className="p-1 -m-1 opacity-40 cursor-not-allowed outline-none">
                <Share2 className="w-[30px] h-[30px] md:w-6 md:h-6" />
              </button>
            )}
            <button
              type="button"
              disabled={cartBusy || previewMode}
              onClick={() => void handleBagToggle()}
              className="p-1 -m-1 transition-colors hover:text-[#0B5B55] outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title={isInCart ? "Remove from cart" : "Add to cart"}
            >
              {/* lucide ShoppingBag geometry, hand-rolled so only the bag BODY fills with
                  teal. Filling via the lucide component fills the open handle arc into a
                  solid blob — so the top line + handle stay stroke-only (black) on top. */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={isInCart ? 1.5 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-black w-[30px] h-[30px] md:w-6 md:h-6"
              >
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" fill={isInCart ? "#4DB6AC" : "none"} />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </button>
          </div>

          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Color: <span className="text-[#0B5B55] font-semibold">{activeColor?.name}</span></p>
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md ${stockStatus.class}`}>
                {stockStatus.label}
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              {product.colors
                .sort((a, b) => {
                  // Put active color first
                  if (activeColor?.name === a.name) return -1;
                  if (activeColor?.name === b.name) return 1;
                  return 0;
                })
                .map((color) => (
                <button 
                  key={color.name} 
                  onClick={() => {
                    setActiveColor(color);
                    onColorChange?.(color.name);
                  }} 
                  className="group flex flex-col items-center"
                >
                  <div className="relative">
                    <motion.div
                      className={`w-10 h-10 rounded-full border-2 transition-all duration-300 ${activeColor?.name === color.name ? "border-[#115E59] scale-110" : "border-gray-200 group-hover:border-gray-300"}`}
                      style={{ backgroundColor: color.hex }}
                    />
                    {activeColor?.name === color.name && (
                      <motion.div 
                        layoutId="active-color-ring"
                        className="absolute inset-[-4px] rounded-full border border-primary/40"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                  </div>
                  <span className={`mt-2 text-[10px] transition-colors ${activeColor?.name === color.name ? "text-[#0B5B55] font-bold" : "text-slate-500"}`}>
                    {color.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <p className="text-sm font-medium mb-2">Size</p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((size) => (
                <button
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    selectedSize === size ? "bg-[#B19CD9] text-black" : "bg-gray-100 text-slate-900"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <p className="text-sm font-medium mb-2">Quantity</p>
            <div className="flex items-center border-2 border-[#08423E] rounded-xl w-fit h-10">
              <button onClick={() => setQuantity((prev) => Math.max(1, prev - 1))} className="h-10 w-10 flex items-center justify-center text-[#08423E]">
                <Minus size={16} />
              </button>
              <span className="px-4 font-semibold tabular-nums">{quantity}</span>
              <button onClick={() => setQuantity((prev) => Math.min(99, prev + 1))} className="h-10 w-10 flex items-center justify-center text-[#08423E]">
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-10 mb-6">
            <button
              onClick={() => void handleAddToCart()}
              disabled={cartBusy || previewMode}
              className="w-full text-black py-3 rounded-xl font-bold text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
              style={{ backgroundColor: "#B19CD9" }}
            >
              {cartBusy ? "Adding…" : "ADD TO CART"}
            </button>
            <button
              onClick={handleBuyNow}
              disabled={cartBusy || previewMode}
              className="w-full text-white py-3 rounded-xl font-bold text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
              style={{ backgroundColor: "#0B5B55" }}
            >
              BUY NOW
            </button>
          </div>

          <section>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="p-3 rounded-xl bg-[#F9F8FA] border border-border/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Fabric</p>
                <p className="text-xs font-medium">{product.fabric}</p>
              </div>
              <div className="p-3 rounded-xl bg-[#F9F8FA] border border-border/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Fit</p>
                <p className="text-xs font-medium">{product.fit}</p>
              </div>
              <div className="p-3 rounded-xl bg-[#F9F8FA] border border-border/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Occasion</p>
                <p className="text-xs font-medium">{product.occasion}</p>
              </div>
              <div className="p-3 rounded-xl bg-[#F9F8FA] border border-border/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Care</p>
                <p className="text-xs font-medium">{product.care_instructions}</p>
              </div>
            </div>

            <h2 className="text-base font-semibold text-slate-900 mb-3">Product Details</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700">
              {product.descriptionPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* FULL SCREEN VIEWER */}
      {isViewerOpen && !previewMode && (
        <div
          className="fixed inset-0 z-[100] h-[100dvh] flex flex-col bg-black/95 overflow-hidden"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)'
          }}
          onClick={() => setIsViewerOpen(false)}
        >
          {/* TOP BAR */}
          <div className="w-full max-w-7xl mx-auto h-auto flex items-center justify-between px-4 md:px-8 py-4 shrink-0 text-white z-10 pointer-events-none">
            <div className="w-10"></div>
            <div className="text-sm md:text-base font-semibold tracking-widest bg-black/40 px-4 py-1.5 rounded-full backdrop-blur-md">
              {activeImage + 1} / {images.length}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setIsViewerOpen(false); }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition pointer-events-auto"
            >
              <X size={24} />
            </button>
          </div>

          {/* MAIN IMAGE AREA */}
          <div
            className="flex-1 min-h-0 flex items-center justify-center relative w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <Carousel
              setApi={setViewerApi}
              opts={{ loop: true, startIndex: activeImage }}
              className="absolute inset-0 w-full h-full [&>div.overflow-hidden]:h-full"
            >
              <CarouselContent className="h-full ml-0 items-center">
                {images.map((img, idx) => (
                  <CarouselItem key={idx} className="pl-0 basis-full h-full flex items-center justify-center">
                    <ProductGalleryImage
                      src={img}
                      alt={`Preview ${idx + 1}`}
                      variant="fullscreen"
                      priority={idx === activeImage}
                      lazy={idx !== activeImage}
                      className="max-h-full max-w-full object-contain select-none cursor-zoom-out hover:scale-[1.01] transition-transform duration-500 px-2 sm:px-4"
                      draggable={false}
                      onClick={() => setIsViewerOpen(false)}
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          </div>

          {/* THUMBNAIL STRIP */}
          <div className="w-full max-w-7xl mx-auto pb-3 md:pb-6 shrink-0 pointer-events-none">
            <div
              className="h-[80px] sm:h-[90px] mx-auto flex items-center justify-center gap-3 overflow-x-auto px-4 md:px-8 pointer-events-auto no-scrollbar scroll-smooth snap-x snap-mandatory"
              ref={thumbnailStripRef}
              onClick={(e) => e.stopPropagation()}
            >
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveImage(idx);
                    viewerApi?.scrollTo(idx);
                    api?.scrollTo(idx);
                  }}
                  className={`relative shrink-0 w-[50px] sm:w-[60px] aspect-[4/5] rounded-lg overflow-hidden transition-all duration-200 snap-start bg-black/50 ${activeImage === idx ? 'border-2 border-[#0F766E]' : 'border border-gray-300'
                    }`}
                  style={{ opacity: activeImage === idx ? 1 : 0.6 }}
                >
                  <ProductGalleryImage
                    src={img}
                    alt={`Thumbnail ${idx + 1}`}
                    variant="thumbnail"
                    lazy
                    className="w-full h-full object-cover pointer-events-none hover:opacity-100 transition-opacity"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Share Bottom Sheet ── */}
      {createPortal(
        <AnimatePresence>
          {shareOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setShareOpen(false)}
              />
              {/* Sheet – scale/fade on desktop, slide-up on mobile */}
              <motion.div
                className="fixed z-[201] bottom-0 inset-x-0 md:bottom-auto md:top-1/2 md:left-1/2 md:right-auto md:max-w-[440px] md:w-full md:rounded-3xl bg-white rounded-t-[28px] shadow-[0_-12px_60px_rgba(0,0,0,0.18)] md:shadow-2xl overflow-hidden"
                initial={isDesktop ? { opacity: 0, scale: 0.96, x: "-50%", y: "-50%" } : { opacity: 0.8, y: "100%" }}
                animate={isDesktop ? { opacity: 1, scale: 1, x: "-50%", y: "-50%" } : { opacity: 1, y: 0 }}
                exit={isDesktop ? { opacity: 0, scale: 0.96, x: "-50%", y: "-50%" } : { opacity: 0.8, y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
                style={{ maxHeight: "90dvh" }}
              >
                {/* Drag Handle (mobile only) */}
                <div className="md:hidden flex justify-center pt-3 pb-1">
                  <div className="w-10 h-[4px] rounded-full bg-gray-400" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-4 md:pt-5 pb-4">
                  <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">Share this product</h3>
                  <button
                    onClick={() => setShareOpen(false)}
                    className="w-9 h-9 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors shrink-0"
                  >
                    <X size={15} className="text-gray-700" />
                  </button>
                </div>

                {/* Product Preview Card */}
                <div className="mx-5 mb-4 rounded-2xl bg-gradient-to-br from-gray-100 to-slate-100 border border-gray-300 overflow-hidden">
                  <div className="flex items-center gap-4 p-4">
                    <div className="relative w-[84px] h-[84px] rounded-xl overflow-hidden bg-white border border-gray-300 shrink-0 shadow-sm">
                      <img src={galleryImages[0] || ""} alt={product.title} className="w-full h-full object-cover" />
                      {discountPercent > 0 && (
                        <div className="absolute top-0 left-0 bg-red-500 text-white text-[8px] font-bold px-1.5 py-[2px] rounded-br-lg">
                          {discountPercent}% OFF
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0b5b55] mb-0.5">{product.brand}</p>
                      <p className="text-[14px] font-semibold text-slate-900 leading-snug line-clamp-2">{product.title}</p>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-[16px] font-bold text-slate-900">₹{product.price.toLocaleString()}</span>
                        {product.originalPrice > 0 && product.originalPrice > product.price && (
                          <span className="text-[12px] line-through text-gray-500 font-medium">₹{product.originalPrice.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* URL Preview Row */}
                <div className="mx-5 mb-5 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-100 border border-gray-300">
                  <Link2 size={13} className="text-gray-500 shrink-0" />
                  <span className="flex-1 text-[11px] text-gray-600 truncate font-mono">{shareUrl}</span>
                  <motion.button
                    onClick={handleCopyLink}
                    animate={copied ? { scale: [1, 1.15, 1] } : {}}
                    transition={{ duration: 0.25 }}
                    title={copied ? "Copied!" : "Copy link"}
                    className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                      copied
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-white text-[#0b5b55] border border-gray-300 hover:border-[#0f766e]"
                    }`}
                  >
                    {copied ? <Check size={13} /> : <Link2 size={13} />}
                  </motion.button>
                </div>

                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mx-5 mb-4" />

                {/* Social Platforms */}
                <div className="px-5 pb-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-600 mb-3">Share via</p>
                  <div className="relative">
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
                      {[
                        { id: 'whatsapp' as const, label: 'WhatsApp', icon: <FaWhatsapp size={20} className="text-white" />, bg: 'bg-[#25D366]' },
                        { id: 'instagram' as const, label: 'Instagram', icon: <FaInstagram size={20} className="text-white" />, bg: 'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]' },
                        { id: 'pinterest' as const, label: 'Pinterest', icon: <FaPinterestP size={20} className="text-white" />, bg: 'bg-[#E60023]' },
                        { id: 'telegram' as const, label: 'Telegram', icon: <FaTelegramPlane size={20} className="text-white" />, bg: 'bg-[#0088CC]' },
                        { id: 'snapchat' as const, label: 'Snapchat', icon: <FaSnapchatGhost size={18} className="text-black" />, bg: 'bg-[#FFFC00]' },
                        { id: 'reddit' as const, label: 'Reddit', icon: <FaRedditAlien size={20} className="text-white" />, bg: 'bg-[#FF4500]' },
                        { id: 'twitter' as const, label: 'Twitter', icon: <FaTwitter size={20} className="text-white" />, bg: 'bg-[#1DA1F2]' },
                        { id: 'facebook' as const, label: 'Facebook', icon: <FaFacebook size={20} className="text-white" />, bg: 'bg-[#1877F2]' },
                      ].map((item, i) => (
                        <motion.button
                          key={item.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.04 * i, duration: 0.22, ease: "easeOut" }}
                          onClick={() => handleShare(item.id)}
                          className="flex flex-col items-center gap-1.5 shrink-0 group cursor-pointer min-w-[58px]"
                        >
                          <div className={`w-[50px] h-[50px] rounded-2xl ${item.bg} flex items-center justify-center shadow-md group-hover:scale-110 group-active:scale-95 transition-all duration-200`}>
                            {item.icon}
                          </div>
                          <span className="text-[10px] font-semibold text-slate-700 whitespace-nowrap">{item.label}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Utility Row */}
                <div className="px-5 pt-1 pb-7 md:pb-5">
                  <div className="flex gap-3 -mx-1 px-1">
                    {[
                      { id: 'sms',   label: 'Messages', icon: <IoChatbubbleEllipses size={20} className="text-white" />, bg: 'bg-[#34C759]', onClick: () => handleShare('sms') },
                      { id: 'email', label: 'Email',    icon: <Mail size={18} className="text-white" />,                 bg: 'bg-slate-600',  onClick: () => handleShare('email') },
                      {
                        id: 'copy',
                        label: copied ? 'Copied!' : 'Copy Link',
                        icon: copied ? <Check size={18} className="text-emerald-700" /> : <Link2 size={18} className="text-slate-600" />,
                        bg: copied ? 'bg-emerald-100' : 'bg-gray-200',
                        onClick: handleCopyLink,
                      },
                      { id: 'more',  label: 'More',     icon: <MoreHorizontal size={18} className="text-slate-600" />,  bg: 'bg-gray-200',   onClick: () => handleShare('more') },
                    ].map((item, i) => (
                      <motion.button
                        key={`util-${item.id}`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.26 + 0.04 * i, duration: 0.22, ease: "easeOut" }}
                        onClick={item.onClick}
                        className="flex flex-col items-center gap-1.5 shrink-0 group cursor-pointer min-w-[58px]"
                      >
                        <div className={`w-[50px] h-[50px] rounded-2xl ${item.bg} flex items-center justify-center shadow-sm group-hover:scale-110 group-active:scale-95 transition-all duration-200`}>
                          {item.icon}
                        </div>
                        <span className="text-[10px] font-semibold text-slate-700 whitespace-nowrap">{item.label}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default ProductPreviewView;
