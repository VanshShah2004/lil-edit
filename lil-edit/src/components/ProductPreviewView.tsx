import { useMemo, useState, useEffect, useLayoutEffect, useRef } from "react";
import { Heart, Minus, Plus, Share2, ShoppingBag, Star, X, ChevronRight, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi
} from "@/components/ui/carousel";
import { Badge } from "@/components/ui/badge";
import type { Product } from "@/types/product";

interface ProductPreviewViewProps {
  product: Product;
  previewMode?: boolean;
  compact?: boolean;
  forceMobileLayout?: boolean;
  initialColorName?: string;
}

const ProductPreviewView = ({
  product,
  previewMode = false,
  compact = false,
  forceMobileLayout = false,
  initialColorName,
}: ProductPreviewViewProps) => {
  const [activeImage, setActiveImage] = useState(0);
  const [api, setApi] = useState<CarouselApi>();
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerApi, setViewerApi] = useState<CarouselApi>();
  const thumbnailStripRef = useRef<HTMLDivElement>(null);

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
  const currentStock = activeColor?.stock ?? product.stock;

  const getStockStatus = () => {
    if (currentStock <= 0) return { label: "Out of Stock", class: "text-red-500 bg-red-50" };
    if (currentStock < 5) return { label: `Only ${currentStock} Left`, class: "text-orange-500 bg-orange-50" };
    return { label: "In Stock", class: "text-green-600 bg-green-50" };
  };

  const stockStatus = getStockStatus();

  return (
    <div className={`${compact ? "p-3" : "p-0"} ${mobileOnly ? "pt-3 px-3" : ""} bg-white`}>
      <div className={`flex ${compact || mobileOnly ? "flex-col gap-5" : "flex-col md:flex-row gap-8 md:gap-12"}`}>
        <div className={`w-full ${mobileOnly ? "block pt-1" : "md:hidden"}`}>
          <p className="text-xs leading-[1.35] font-bold uppercase tracking-[0.2em] bg-gradient-to-r from-[#0B5B55] to-primary bg-clip-text text-transparent mb-2 w-fit">{product.brand}</p>
          <h1 className={`${compact ? "text-lg" : "text-2xl"} font-semibold text-slate-900 leading-snug mb-3`}>
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
                  <img src={img} alt={`${product.title} thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
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
                            <img
                              src={img}
                              alt={`${product.title} ${idx + 1}`}
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
          <p className={`${mobileOnly ? "hidden" : "hidden md:block"} text-xs leading-[1.35] font-bold uppercase tracking-[0.2em] bg-gradient-to-r from-[#0B5B55] to-primary bg-clip-text text-transparent mb-2 w-fit`}>{product.brand}</p>
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
              className="text-[10px] font-mono font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100"
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

          <div className="flex gap-4 mb-5 text-black">
            <Heart size={18} />
            <Share2 size={18} />
            <ShoppingBag size={18} />
            {!previewMode && <Star size={18} />}
          </div>

          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Color: <span className="text-[#0B5B55] font-semibold">{activeColor?.name}</span></p>
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${stockStatus.class}`}>
                {stockStatus.label}
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              {product.colors.map((color) => (
                <button 
                  key={color.name} 
                  onClick={() => setActiveColor(color)} 
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
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
            <div className="flex items-center border-2 border-[#08423E] rounded-full w-fit h-10">
              <button onClick={() => setQuantity((prev) => Math.max(1, prev - 1))} className="h-10 w-10 flex items-center justify-center text-[#08423E]">
                <Minus size={16} />
              </button>
              <span className="px-4 font-semibold tabular-nums">{quantity}</span>
              <button onClick={() => setQuantity((prev) => prev + 1)} className="h-10 w-10 flex items-center justify-center text-[#08423E]">
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 mb-6">
            <button className="w-full text-black py-3 rounded-full font-bold text-sm" style={{ backgroundColor: "#B19CD9" }}>
              ADD TO CART
            </button>
            <button className="w-full text-white py-3 rounded-full font-bold text-sm" style={{ backgroundColor: "#0B5B55" }}>
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
                <p className="text-xs font-medium">{product.care}</p>
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
                    <img
                      src={img}
                      alt={`Preview ${idx + 1}`}
                      className="max-h-full max-w-full object-contain select-none cursor-zoom-out hover:scale-[1.01] transition-transform duration-500 px-2 sm:px-4"
                      draggable={false}
                      onClick={() => setIsViewerOpen(false)}
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>

            {/* Desktop Left / Right Controls */}
            <button
              className="hidden md:flex absolute left-4 md:left-8 xl:left-12 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 items-center justify-center rounded-full text-white backdrop-blur transition-all disabled:opacity-50 z-10"
              onClick={(e) => { e.stopPropagation(); viewerApi?.scrollPrev(); }}
            >
              <ChevronLeft size={28} />
            </button>
            <button
              className="hidden md:flex absolute right-4 md:right-8 xl:right-12 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 items-center justify-center rounded-full text-white backdrop-blur transition-all disabled:opacity-50 z-10"
              onClick={(e) => { e.stopPropagation(); viewerApi?.scrollNext(); }}
            >
              <ChevronRight size={28} />
            </button>
          </div>

          {/* THUMBNAIL STRIP */}
          <div className="w-full max-w-7xl mx-auto pb-3 md:pb-6 shrink-0 pointer-events-none">
            <div
              className="h-[80px] sm:h-[90px] mx-auto flex items-center md:justify-center gap-3 overflow-x-auto px-4 md:px-8 pointer-events-auto no-scrollbar scroll-smooth snap-x snap-mandatory"
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
                  <img
                    src={img}
                    alt={`Thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover pointer-events-none hover:opacity-100 transition-opacity"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductPreviewView;
