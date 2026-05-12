import { useMemo, useState } from "react";
import { Heart, Minus, Plus, Share2, ShoppingBag, Star } from "lucide-react";
import type { Product } from "@/types/product";

interface ProductPreviewViewProps {
  product: Product;
  previewMode?: boolean;
  compact?: boolean;
  forceMobileLayout?: boolean;
}

const ProductPreviewView = ({
  product,
  previewMode = false,
  compact = false,
  forceMobileLayout = false,
}: ProductPreviewViewProps) => {
  const [activeImage, setActiveImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState(product.sizes[0] ?? "");
  const [selectedColor, setSelectedColor] = useState(product.colors[0]?.name ?? "");
  const [quantity, setQuantity] = useState(1);

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

  const images = product.images.length > 0 ? product.images : ["https://placehold.co/600x750?text=No+Image"];
  const mobileOnly = forceMobileLayout;

  return (
    <div className={`${compact ? "p-3" : "p-0"} ${mobileOnly ? "pt-3 px-3" : ""} bg-white`}>
      <div className={`flex ${compact || mobileOnly ? "flex-col gap-5" : "flex-col md:flex-row gap-8 md:gap-12"}`}>
        <div className={`w-full ${mobileOnly ? "block pt-1" : "md:hidden"}`}>
          <p className="text-[10px] leading-[1.35] font-bold uppercase tracking-[0.2em] text-primary mb-2">{product.brand}</p>
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
                  onClick={() => setActiveImage(idx)}
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
              <img
                src={images[activeImage]}
                alt={product.title}
                className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
              />
              {discountPercent > 0 && (
                <div className="absolute top-3 right-3 bg-red-500 text-white px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  -{discountPercent}%
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`w-full ${compact || mobileOnly ? "" : "md:w-[45%]"}`}>
          <p className={`${mobileOnly ? "hidden" : "hidden md:block"} text-[10px] leading-[1.35] font-bold uppercase tracking-[0.2em] text-primary mb-2`}>{product.brand}</p>
          <h1 className={`${mobileOnly ? "hidden" : "hidden md:block"} ${compact ? "text-lg" : "text-2xl"} font-semibold text-slate-900 leading-snug mb-3`}>
            {product.title}
          </h1>

          <div className="flex items-center gap-3 mb-4">
            <span className={`${compact ? "text-xl" : "text-2xl"} font-bold text-[#0B5B55]`}>₹{product.price}</span>
            {product.originalPrice > 0 && <span className="line-through text-gray-400">₹{product.originalPrice}</span>}
            {discountPercent > 0 && <span className="text-xs font-semibold text-red-500">{discountPercent}% OFF</span>}
          </div>

          {flags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {flags.map((flag) => (
                <span key={flag} className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary">
                  {flag}
                </span>
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
            <p className="text-sm font-medium mb-2">Color</p>
            <div className="flex flex-wrap gap-3">
              {product.colors.map((color) => (
                <button key={color.name} onClick={() => setSelectedColor(color.name)} className="flex flex-col items-center">
                  <span
                    className={`w-9 h-9 rounded-full border-2 ${selectedColor === color.name ? "border-[#115E59]" : "border-gray-200"}`}
                    style={{ backgroundColor: color.hex }}
                  />
                  <span className="mt-1 text-[10px] text-slate-700">{color.name}</span>
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
    </div>
  );
};

export default ProductPreviewView;
