import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Heart,
  ShoppingBag,
  Star,
  Share2,
  Minus,
  Plus
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import product_images from "@/assets/products";

const LAVENDER = "#C4B5D9";
const TEAL = "#0F766E";
const TEAL_DARK = "#115E59";
const SWATCH_SIZE_PX = 44; // w-11 (matches qty pill height)
const SWATCH_GAP_PX = 12; // gap-3
const BETWEEN_BLOCKS_GAP_PX = SWATCH_GAP_PX * 4; // 4x swatch gap

// MOCK DATA
const product = {
  title: "Stunning Criss-Cross Back Knot Top And Crushed Sheen Lehenga",
  price: 4999,
  originalPrice: 6500,
  images: [
    product_images["product-12345"]["lil-edit-product-1234-1.png"],
    product_images["product-12345"]["lil-edit-product-1234-2.png"],
    product_images["product-12345"]["lil-edit-product-1234-3.png"],
    product_images["product-12345"]["lil-edit-product-1234-4.png"],
  ],
  sizes: ["6-12 Months", "1-2 Years", "2-3 Years", "3-4 Years"],
  colors: [
    { name: "White", hex: "#FFFFFF" },
    {name: "Black", hex: "#00000F"},
  ],
};

export default function ProductDetail() {
  const [activeImage, setActiveImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState(product.sizes[0]);
  const [selectedColor, setSelectedColor] = useState(product.colors[0].name);
  const [quantity, setQuantity] = useState(1);
  const [qtyBesideColors, setQtyBesideColors] = useState(true);

  const colorQtyWrapRef = useRef<HTMLDivElement | null>(null);
  const qtyBlockRef = useRef<HTMLDivElement | null>(null);

  const colorsOneLineWidthPx = useMemo(() => {
    const n = product.colors.length;
    if (n <= 0) return 0;
    return n * SWATCH_SIZE_PX + Math.max(0, n - 1) * SWATCH_GAP_PX;
  }, []);

  useLayoutEffect(() => {
    const el = colorQtyWrapRef.current;
    const qtyEl = qtyBlockRef.current;
    if (!el || !qtyEl) return;

    const compute = () => {
      const wrapWidth = el.clientWidth;
      const qtyWidth = qtyEl.offsetWidth;
      const fits =
        colorsOneLineWidthPx + BETWEEN_BLOCKS_GAP_PX + qtyWidth <= wrapWidth;
      setQtyBesideColors(fits);
    };

    compute();

    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    ro.observe(qtyEl);
    return () => ro.disconnect();
  }, [colorsOneLineWidthPx]);

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col">
      <Navbar />

      {/* Breadcrumb */}
      <div className="page-container py-3 sm:py-4 text-sm text-gray-500">
        <Link to="/">Home</Link> <ChevronRight className="inline w-4 h-4 mx-1" />
        <span className="text-gray-800">{product.title}</span>
      </div>

      <main className="page-container w-full pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:pb-16">
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">

          {/* LEFT - IMAGES (60%) */}
          <div className="w-full lg:w-[60%] flex flex-col lg:flex-row gap-5">

            {/* Thumbnails */}
            <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto lg:max-h-[600px]">
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImage(idx)}
                  className={`w-20 h-28 lg:w-24 lg:h-32 rounded-xl overflow-hidden shrink-0 ${
                    activeImage === idx
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

            {/* Main Image */}
            <div className="flex-1 flex justify-center items-center">
              <div className="w-full max-w-[520px] aspect-[4/5] bg-white rounded-2xl overflow-hidden shadow-md">
                <img
                  src={product.images[activeImage]}
                  alt={product.title}
                  className="w-full h-full object-cover hover:scale-105 transition duration-500"
                />
              </div>
            </div>
          </div>

          {/* RIGHT - DETAILS (40%) */}
          <div className="w-full lg:w-[40%]">

            {/* Title */}
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-semibold text-slate-900 leading-snug mb-4 sm:mb-6">
              {product.title}
            </h1>

            {/* Price */}
            <div className="flex items-center gap-3 mb-6">
              <span className="text-3xl font-bold" style={{ color: TEAL }}>
                ₹{product.price}
              </span>
              <span className="line-through text-gray-400">
                ₹{product.originalPrice}
              </span>
            </div>

            <div className="mb-6" ref={colorQtyWrapRef}>
              <div className="flex items-start gap-[48px]">
                {/* Color */}
                <div className="inline-flex flex-col">
                  <p className="text-sm font-medium mb-2">Color</p>
                  <div
                    className={qtyBesideColors ? "flex gap-3" : "flex flex-wrap gap-3"}
                    style={qtyBesideColors ? { width: colorsOneLineWidthPx } : undefined}
                  >
                    {product.colors.map((color) => (
                      <button
                        key={color.name}
                        onClick={() => setSelectedColor(color.name)}
                        className={`w-11 h-11 rounded-full border-2 ${
                          selectedColor === color.name
                            ? "border-[#115E59]"
                            : "border-gray-200"
                        }`}
                        style={{ backgroundColor: color.hex }}
                      />
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
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                      selectedSize === size
                        ? "bg-[#C4B5D9] text-black"
                        : "bg-gray-100 text-slate-900"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity moved next to Color */}

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

            {/* Icons */}
            <div className="flex gap-4" style={{ color: TEAL_DARK }}>
              <Heart />
              <Share2 />
              <ShoppingBag />
              <Star />
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* MOBILE STICKY BAR */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t p-3 safe-bottom flex gap-2">
        <button
          className="flex-1 border py-3 rounded-full font-bold"
          style={{ borderColor: "#000000", color: "#000000", backgroundColor: "#FFFFFF" }}
        >
          ADD
        </button>
        <button
          className="flex-1 py-3 rounded-full font-bold text-slate-900"
          style={{ backgroundColor: LAVENDER }}
        >
          BUY NOW
        </button>
      </div>
    </div>
  );
}