import { useLayoutEffect, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Heart,
  ShoppingBag,
  Star,
  Share2,
  Minus,
  Plus,
  X,
  ChevronLeft
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import product_images from "@/assets/products";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi
} from "@/components/ui/carousel";

const LAVENDER = "#C4B5D9";
const TEAL = "#0F766E";
const TEAL_DARK = "#115E59";
const SWATCH_GAP_PX = 12; // gap-3
const BETWEEN_BLOCKS_GAP_PX = SWATCH_GAP_PX * 4; // 4x swatch gap

// MOCK DATA
const product = {
  title: "Stunning Criss-Cross Back Knot Top And Crushed Sheen Lehenga",
  sku: "LIL-12345",
  category: "Kids Ethnic Wear",
  descriptionPoints: [
    "Top Closure: Tie-up knot at the back",
    "Bottom Closure: Side hook-and-zip",
    "Lining: Cotton lining",
    "Note: Embroidery placement may vary from the website image",
    "Note: The curve of the lehenga hem may vary as it is machine-wired",
    "Gender: Girls",
    "Material: Organza",
    "Colour: Lavender",
    "Waistband: Drawstring",
    "Sleeve Length: Sleeveless",
    "Image Taken Of: 2 - 3 Years",
    "Washing Care: Dry Clean",
    "Made in India",
  ],
  fabric: "Silk blend with soft inner lining",
  fit: "Regular fit",
  occasion: "Festive, Wedding, Party",
  care: "Dry clean recommended",
  price: 4999,
  originalPrice: 6500,
  images: [
    product_images["product-0001"]["lil-edit-product-0001-1-1.png"],
    product_images["product-0001"]["lil-edit-product-0001-1-2.png"],
    product_images["product-0001"]["lil-edit-product-0001-1-3.png"],
    product_images["product-0001"]["lil-edit-product-0001-1-4.png"],
    product_images["product-0001"]["lil-edit-product-0001-1-5.png"],
    product_images["product-0001"]["lil-edit-product-0001-1-6.png"],
    product_images["product-0001"]["lil-edit-product-0001-1-7.png"],
  ],
  sizes: ["6-12 Months", "1-2 Years", "2-3 Years", "3-4 Years"],
  colors: [
    { name: "White", hex: "#FFFFFF" },
    { name: "Black", hex: "#00000F" },

  ],
};

export default function ProductDetail() {
  const [activeImage, setActiveImage] = useState(0);
  const [api, setApi] = useState<CarouselApi>();
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerApi, setViewerApi] = useState<CarouselApi>();
  const [selectedSize, setSelectedSize] = useState(product.sizes[0]);
  const [selectedColor, setSelectedColor] = useState(product.colors[0].name);
  const [quantity, setQuantity] = useState(1);
  const [qtyBesideColors, setQtyBesideColors] = useState(true);

  const colorQtyWrapRef = useRef<HTMLDivElement | null>(null);
  const colorsRowRef = useRef<HTMLDivElement | null>(null);
  const qtyBlockRef = useRef<HTMLDivElement | null>(null);
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

    // Sync initial state when opened
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

  useLayoutEffect(() => {
    const el = colorQtyWrapRef.current;
    const colorsEl = colorsRowRef.current;
    const qtyEl = qtyBlockRef.current;
    if (!el || !colorsEl || !qtyEl) return;

    const compute = () => {
      const wrapWidth = el.clientWidth;
      const colorsWidth = colorsEl.offsetWidth;
      const qtyWidth = qtyEl.offsetWidth;
      const fits =
        colorsWidth + BETWEEN_BLOCKS_GAP_PX + qtyWidth <= wrapWidth;
      setQtyBesideColors(fits);
    };

    compute();

    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    ro.observe(colorsEl);
    ro.observe(qtyEl);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />

      {/* Breadcrumb */}
      <div className="page-container py-3 sm:py-4 text-sm text-gray-500">
        <Link to="/">Home</Link> <ChevronRight className="inline w-4 h-4 mx-1" />
        <span className="text-gray-800">{product.title}</span>
      </div>

      <main className="page-container w-full pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:pb-16">
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">

          {/* LEFT - IMAGES (60%) */}
          <div className="w-full lg:w-[55%] flex flex-col lg:flex-row gap-5">
            {/* Mobile-only title and price above image */}
            <div className="sm:hidden order-1">
              <h1 className="text-xl font-semibold text-slate-900 leading-snug">
                {product.title}
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-lg font-bold" style={{ color: TEAL }}>
                  ₹{product.price}
                </span>
                <span className="line-through text-gray-500">
                  ₹{product.originalPrice}
                </span>
              </div>
            </div>

            {/* Thumbnails */}
            <div className="order-3 lg:order-1 w-full lg:w-28 shrink-0 relative">
              <div className="flex justify-center lg:justify-start lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto w-full h-full lg:absolute lg:inset-0 no-scrollbar">
                {product.images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleThumbnailClick(idx)}
                    className={`w-24 h-32 lg:w-28 lg:h-36 rounded-xl overflow-hidden shrink-0 ${activeImage === idx
                      ? "border-4 border-[#0F766E]"
                      : "border border-gray-200"
                      }`}
                  >
                    <img
                      src={img}
                      alt={`${product.title} thumbnail ${idx + 1}`}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Main Image */}
            <div className="order-2 lg:order-2 flex-1 flex justify-center items-start">
              <Carousel
                setApi={setApi}
                opts={{ loop: true }}
                className="w-full max-w-[420px] bg-white rounded-2xl overflow-hidden shadow-md cursor-grab active:cursor-grabbing"
              >
                <CarouselContent className="ml-0">
                  {product.images.map((img, idx) => (
                    <CarouselItem key={idx} className="pl-0 basis-full">
                      <div className="w-full aspect-[4/5] overflow-hidden">
                        <img
                          src={img}
                          alt={`${product.title} ${idx + 1}`}
                          className="w-full h-full object-cover select-none hover:scale-105 transition duration-500 cursor-zoom-in"
                          draggable={false}
                          onClick={() => setIsViewerOpen(true)}
                        />
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>
            </div>
          </div>

          {/* RIGHT - DETAILS (40%) */}
          <div className="w-full lg:w-[45%]">

            {/* Title */}
            <h1 className="hidden sm:block text-xl sm:text-2xl lg:text-4xl font-semibold text-slate-900 leading-snug mb-4 sm:mb-6">
              {product.title}
            </h1>

            {/* Price */}
            <div className="hidden sm:flex items-center gap-3 mb-6">
              <span className="text-lg sm:text-2xl font-bold" style={{ color: TEAL }}>
                ₹{product.price}
              </span>
              <span className="line-through text-gray-400">
                ₹{product.originalPrice}
              </span>
            </div>

            {/* Icons */}
            <div className="flex gap-4 mb-6" style={{ color: "#000000" }}>
              <Heart />
              <Share2 />
              <ShoppingBag />
              <Star />
            </div>

            <div className="mb-6" ref={colorQtyWrapRef}>
              <div className="flex items-start" style={{ columnGap: BETWEEN_BLOCKS_GAP_PX }}>
                {/* Color */}
                <div className="inline-flex flex-col">
                  <p className="text-sm font-medium mb-2">Color</p>
                  <div
                    ref={colorsRowRef}
                    className={
                      qtyBesideColors ? "inline-flex gap-3" : "flex flex-wrap gap-3"
                    }
                  >
                    {product.colors.map((color) => (
                      <div key={color.name} className="flex flex-col items-center">
                        <button
                          onClick={() => setSelectedColor(color.name)}
                          className={`w-11 h-11 rounded-full border-2 ${selectedColor === color.name
                            ? "border-[#115E59]"
                            : "border-gray-200"
                            }`}
                          style={{ backgroundColor: color.hex }}
                        />
                        <span className="mt-1 text-xs text-slate-700">
                          {color.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quantity (beside colors only when colors fit on one line) */}
                {qtyBesideColors && (
                  <div className="shrink-0" ref={qtyBlockRef}>
                    <p className="text-sm font-medium mb-2">Quantity</p>
                    <div
                      className="flex items-center border-2 rounded-full w-fit h-11"
                      style={{ borderColor: TEAL_DARK }}
                    >
                      <button
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="h-11 w-11 flex items-center justify-center"
                        style={{ color: TEAL_DARK }}
                      >
                        <Minus size={18} />
                      </button>
                      <span className="px-4 font-bold tabular-nums leading-none">
                        {quantity}
                      </span>
                      <button
                        onClick={() => setQuantity(quantity + 1)}
                        className="h-11 w-11 flex items-center justify-center"
                        style={{ color: TEAL_DARK }}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quantity below all colors when colors wrap */}
              {!qtyBesideColors && (
                <div className="mt-6" ref={qtyBlockRef}>
                  <p className="text-sm font-medium mb-2">Quantity</p>
                  <div
                    className="flex items-center border-2 rounded-full w-fit h-11"
                    style={{ borderColor: TEAL_DARK }}
                  >
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="h-11 w-11 flex items-center justify-center"
                      style={{ color: TEAL_DARK }}
                    >
                      <Minus size={18} />
                    </button>
                    <span className="px-4 font-semibold tabular-nums leading-none">
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity(quantity + 1)}
                      className="h-11 w-11 flex items-center justify-center"
                      style={{ color: TEAL_DARK }}
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Size */}
            <div className="mb-6">
              <p className="text-sm font-medium mb-2">Size</p>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${selectedSize === size
                      ? "bg-[#C4B5D9] text-black"
                      : "bg-gray-100 text-slate-900"
                      }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div
              className="flex flex-col sm:flex-row gap-3 mb-8"
              style={{ ["--lavender" as any]: LAVENDER, ["--teal" as any]: TEAL }}
            >
              <button
                className="flex-1 bg-[var(--lavender)] text-black py-3 rounded-full font-bold transition-colors hover:brightness-[0.98]"
              >
                ADD TO CART
              </button>
              <button
                className="flex-1 bg-[var(--teal)] text-white py-3 rounded-full font-bold transition-colors hover:brightness-95"
              >
                BUY NOW
              </button>
            </div>

            {/* Product Details */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Product Details
              </h2>
              <ul className="list-disc pl-5 space-y-2 text-sm text-slate-800">
                {product.descriptionPoints.map((point) => (
                  <li key={point} className="leading-relaxed">
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </main>

      {/* FULL SCREEN VIEWER */}
      {isViewerOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm animate-in fade-in duration-300 flex flex-col"
          onClick={() => setIsViewerOpen(false)}
        >
          {/* Header */}
          <div
            className="flex justify-between items-center p-4 sm:p-6 text-white shrink-0 absolute top-0 w-full z-10 pointer-events-none"
          >
            <div className="w-10"></div>
            <div className="text-sm sm:text-base font-semibold tracking-widest bg-black/40 px-3 py-1 rounded-full backdrop-blur-md">
              {activeImage + 1} / {product.images.length}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setIsViewerOpen(false); }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition pointer-events-auto"
            >
              <X size={24} />
            </button>
          </div>

          {/* Main Content (Carousel) */}
          <div
            className="flex-1 relative flex items-center justify-center min-h-0 w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <Carousel setApi={setViewerApi} opts={{ loop: true, startIndex: activeImage }} className="w-full h-full flex items-center text-white">
              <CarouselContent className="h-full ml-0 items-center">
                {product.images.map((img, idx) => (
                  <CarouselItem key={idx} className="pl-0 basis-full flex items-center justify-center h-full relative">
                    <img
                      src={img}
                      alt={`Preview ${idx + 1}`}
                      className="max-w-full max-h-[85vh] w-auto h-auto object-contain select-none cursor-zoom-out hover:scale-[1.01] transition-transform duration-500"
                      draggable={false}
                      onClick={() => setIsViewerOpen(false)}
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>

            {/* Desktop Left / Right Controls */}
            <button
              className="hidden md:flex absolute left-4 w-12 h-12 bg-white/10 hover:bg-white/20 items-center justify-center rounded-full text-white backdrop-blur transition-all"
              onClick={(e) => { e.stopPropagation(); viewerApi?.scrollPrev(); }}
            >
              <ChevronLeft size={28} />
            </button>
            <button
              className="hidden md:flex absolute right-4 w-12 h-12 bg-white/10 hover:bg-white/20 items-center justify-center rounded-full text-white backdrop-blur transition-all"
              onClick={(e) => { e.stopPropagation(); viewerApi?.scrollNext(); }}
            >
              <ChevronRight size={28} />
            </button>
          </div>

          {/* Thumbnail Strip */}
          <div
            className="shrink-0 p-4 pb-6 sm:pb-8 flex justify-center w-full bg-gradient-to-t from-black/50 to-transparent"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              ref={thumbnailStripRef}
              className="flex gap-2 sm:gap-3 overflow-x-auto no-scrollbar scroll-smooth w-full max-w-3xl px-4 items-center"
            >
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveImage(idx);
                    viewerApi?.scrollTo(idx);
                    api?.scrollTo(idx);
                  }}
                  className={`relative shrink-0 h-16 w-16 sm:h-20 sm:w-20 rounded-lg overflow-hidden transition-all duration-300 bg-black/50`}
                  style={{
                    border: activeImage === idx ? '3px solid #0F766E' : '3px solid #D1D5DB',
                    opacity: activeImage === idx ? 1 : 0.6
                  }}
                >
                  <img src={img} alt="" className="w-full h-full object-cover pointer-events-none hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <Footer />

      {/* MOBILE STICKY BAR */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t p-3 safe-bottom flex gap-2">
        <button
          className="flex-1 py-3 rounded-full font-bold text-black"
          style={{ backgroundColor: LAVENDER }}
        >
          ADD TO CART
        </button>
        <button
          className="flex-1 py-3 rounded-full font-bold text-white"
          style={{ backgroundColor: TEAL }}
        >
          BUY NOW
        </button>
      </div>
    </div>
  );
}