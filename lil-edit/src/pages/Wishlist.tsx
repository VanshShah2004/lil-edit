import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  ShoppingBag,
  Heart,
  ArrowRight,
} from "lucide-react";
import { FaTrashAlt } from "react-icons/fa";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

import img1 from "@/assets/searchbar-frequent_searches/le-1.png";
import img2 from "@/assets/searchbar-frequent_searches/le-2.png";
import img3 from "@/assets/searchbar-frequent_searches/le-3.png";
import img4 from "@/assets/searchbar-frequent_searches/le-4.png";
import img5 from "@/assets/searchbar-frequent_searches/le-5.png";
import img6 from "@/assets/searchbar-frequent_searches/le-6.png";

const wishlistItemsMock = [
  {
    id: "w1",
    name: "Embroidered Silk Lehenga",
    brand: "Heritage Kids",
    price: 4500,
    originalPrice: 5200,
    image: img1,
    size: "2-3Y",
    color: { name: "Lilac", hex: "#C8A4D4" },
    quantity: 1,
    inStock: true,
    tags: ["Price Dropped!", "Most Loved"],
  },
  {
    id: "w2",
    name: "Floral Ruffle Party Dress",
    brand: "Petit Bloom",
    price: 3200,
    originalPrice: 3200,
    image: img3,
    size: "18-24M",
    color: { name: "Mint", hex: "#A8D5BA" },
    quantity: 1,
    inStock: true,
    tags: ["Trending this week"],
  },
  {
    id: "w3",
    name: "Classic Linen Shirt & Shorts Set",
    brand: "The Lil Edit Co.",
    price: 2800,
    originalPrice: 3500,
    image: img5,
    size: "3-4Y",
    color: { name: "White", hex: "#FFFFFF" },
    quantity: 1,
    inStock: true,
    tags: ["20% OFF"],
  },
  {
    id: "w4",
    name: "Velvet Bow Headband",
    brand: "Lil Accessories",
    price: 850,
    originalPrice: 1200,
    image: img6,
    size: "One Size",
    color: { name: "Black", hex: "#1A1A1A" },
    quantity: 1,
    inStock: false,
    tags: [],
  },
];

const recommendedProducts = [
  {
    id: "rec-1",
    title: "Blush Pink Net Indo-Western Gown",
    price: 5200,
    originalPrice: 6000,
    image: img3,
  },
  {
    id: "rec-2",
    title: "Royal Blue Embroidered Party Set",
    price: 4899,
    originalPrice: 5600,
    image: img4,
  },
  {
    id: "rec-3",
    title: "Peach Floral Princess Dress",
    price: 3999,
    originalPrice: 4700,
    image: img5,
  },
  {
    id: "rec-4",
    title: "Ivory Ethnic Festive Wear",
    price: 5799,
    originalPrice: 6500,
    image: img6,
  },
  {
    id: "rec-5",
    title: "Golden Silk Lehenga Collection",
    price: 6200,
    originalPrice: 7500,
    image: img1,
  },
];

const WishlistPage = () => {
  const [items, setItems] = useState(wishlistItemsMock);

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const totalValue = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const inStockCount = items.filter((i) => i.inStock).length;

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col text-gray-900 overflow-x-hidden">
      <Navbar />

      {/* Breadcrumb */}
      <div className="page-container px-4 sm:px-6 py-4">
        <div className="flex flex-wrap items-center text-xs sm:text-sm text-gray-600 gap-y-2">
          <Link to="/" className="hover:underline">
            Home
          </Link>
          <ChevronRight className="w-4 h-4 mx-1" />
          <span className="text-gray-800 font-medium">Your Wishlist</span>
        </div>
      </div>

      {/* Main Content — two-column layout mirrors Cart */}
      <main className="page-container flex-1 flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-10 pb-12 px-3 sm:px-6">
        {/* LEFT SIDE */}
        <section className="flex-1 lg:w-[66%] space-y-4 sm:space-y-6">
          {/* Wishlist Heading */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900">
                Your Wishlist
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {items.length} items saved
              </p>
            </div>
          </div>

          {/* WISHLIST ITEMS */}
          {items.length === 0 ? (
            <div className="w-full py-16 sm:py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-lg sm:rounded-xl">
              <div className="text-center px-4">
                <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">
                  Your wishlist is empty
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  Start saving styles you love!
                </p>
                <Link to="/dashboard">
                  <Button className="bg-[#0F766E] hover:bg-[#0C5D53] text-white rounded-full px-6 sm:px-8 h-10 sm:h-11">
                    Explore Collections
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            items.map((item) => (
              <Card
                key={item.id}
                className="bg-white border border-gray-200 border-l-8 border-l-[#0F766E] rounded-lg sm:rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 min-h-[120px] sm:min-h-[140px] md:min-h-[160px]"
              >
                <CardContent className="p-2.5 sm:p-3 md:p-4 flex flex-row gap-2.5 sm:gap-3 md:gap-4 h-full relative">
                  {/* IMAGE */}
                  <div className="w-20 sm:w-24 md:w-32 flex-shrink-0 relative group">
                    <div className="aspect-[3/4] sm:aspect-[3/4] md:aspect-[4/5] overflow-hidden rounded-lg sm:rounded-lg bg-gray-100">
                      <img
                        src={item.image}
                        alt={item.name}
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.src = "/fallback-product.webp";
                        }}
                        className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>

                    {/* Heart overlay (mirrors Cart's wishlist button) */}
                    <button className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-md shadow-sm hover:bg-white transition">
                      <Heart size={14} className="text-[#0F766E]" fill="#0F766E" />
                    </button>
                  </div>

                  {/* DETAILS */}
                  <div className="flex-1 flex flex-col min-w-0 justify-between py-0">
                    {/* Top Section - Title & Brand */}
                    <div className="pr-8 sm:pr-10 md:pr-12">
                      <h2 className="text-xs sm:text-sm md:text-base font-semibold text-gray-900 leading-tight line-clamp-2">
                        {item.name}
                      </h2>
                      <p className="text-xs md:text-sm text-[#0F766E] mt-0.5 md:mt-1 font-medium line-clamp-1">
                        {item.brand} •{" "}
                        {item.inStock ? "In Stock" : "Out of Stock"}
                      </p>
                    </div>

                    {/* Tags */}
                    {item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1 sm:mt-1.5">
                        {item.tags.map((tag, idx) => (
                          <Badge
                            key={idx}
                            variant="secondary"
                            className="bg-gradient-to-r from-purple-50 to-indigo-50 text-indigo-800 border border-indigo-100 text-[10px] sm:text-[11px] px-2 py-0.5 whitespace-nowrap rounded-md font-medium shadow-sm"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Bottom Section - Color, Size, Action, Price — mirrors Cart exactly */}
                    <div className="flex flex-col mt-auto pt-1">
                      {/* Color & Size */}
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <button
                          className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 rounded-full border-2 border-gray-300 shadow-sm flex-shrink-0"
                          title={item.color.name}
                          style={{ backgroundColor: item.color.hex }}
                        />
                        <span className="text-xs md:text-sm font-medium px-2 md:px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded whitespace-nowrap">
                          Size: {item.size}
                        </span>
                      </div>

                      {/* Move to Cart & Price — same row as Cart's Qty & Price */}
                      <div className="flex items-center justify-between gap-1.5 sm:gap-2 mt-1">
                        <Button
                          size="sm"
                          disabled={!item.inStock}
                          className="h-8 sm:h-9 px-3 sm:px-4 bg-[#0F766E] hover:bg-[#0C5D53] text-white rounded-full text-[10px] sm:text-xs font-bold gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Move to Cart</span>
                          <span className="sm:hidden">Add</span>
                        </Button>

                        {/* Price */}
                        <div className="flex flex-col items-end">
                          <span
                            className="text-sm sm:text-base md:text-lg font-bold"
                            style={{ color: "#0F766E" }}
                          >
                            ₹{item.price}
                          </span>
                          {item.originalPrice > item.price && (
                            <span className="text-xs line-through text-gray-400">
                              ₹{item.originalPrice}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* DELETE BUTTON - TOP RIGHT */}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 text-gray-700 hover:text-red-600 transition-colors"
                    title="Remove from wishlist"
                  >
                    <FaTrashAlt size={18} />
                  </button>
                </CardContent>
              </Card>
            ))
          )}

        </section>

        {/* RIGHT SIDE — Wishlist Summary sidebar (mirrors Cart's Order Summary) */}
        <aside className="w-full lg:w-[34%] self-start lg:sticky lg:top-6">
          <Card className="bg-purple-200/70 backdrop-blur-sm border border-purple-300 shadow-lg rounded-2xl lg:rounded-3xl p-3 sm:p-5 lg:p-6 space-y-4 sm:space-y-5">
            <h3 className="text-xl sm:text-2xl font-semibold text-gray-900">
              Wishlist Summary
            </h3>

            {/* Summary Rows */}
            <div className="space-y-3 sm:space-y-4 text-sm sm:text-base">
              <div className="flex justify-between">
                <span className="text-gray-600">Items Saved</span>
                <span className="font-medium">{items.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">In Stock</span>
                <span className="font-medium">{inStockCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Value</span>
                <span className="font-medium">₹{totalValue}</span>
              </div>

            </div>

            {/* Divider */}
            <div className="border-t pt-3 sm:pt-4 flex justify-between items-center">
              <span className="text-base sm:text-lg font-semibold">
                Payable
              </span>
              <span className="text-xl sm:text-2xl font-bold text-[#0F766E]">
                ₹{totalValue}
              </span>
            </div>

            {/* Move All to Cart */}
            <Button className="w-full bg-[#0F766E] hover:bg-[#0C5D53] text-white py-3 sm:py-4 rounded-full font-semibold text-sm sm:text-base transition-colors gap-2">
              <ShoppingBag className="w-4 h-4" />
              Move All to Cart
            </Button>

            {/* Continue Shopping */}
            <Link to="/dashboard">
              <Button
                variant="outline"
                className="w-full border-gray-300 hover:bg-gray-50 text-gray-700 rounded-full py-3 sm:py-4 font-medium text-sm sm:text-base"
              >
                Continue Shopping
              </Button>
            </Link>

            {/* Trust Indicators */}
            <div className="grid grid-cols-3 gap-2 pt-1 sm:pt-2">
              <div className="bg-[#FAF9F7] rounded-lg sm:rounded-xl py-2 sm:py-3 text-center text-xs font-medium text-gray-700">
                Classy Styles
              </div>
              <div className="bg-[#FAF9F7] rounded-lg sm:rounded-xl py-2 sm:py-3 text-center text-xs font-medium text-gray-700">
                Safe Payments
              </div>
              <div className="bg-[#FAF9F7] rounded-lg sm:rounded-xl py-2 sm:py-3 text-center text-xs font-medium text-gray-700">
                Premium Quality
              </div>
            </div>
          </Card>
        </aside>
      </main>

      {/* RECOMMENDATIONS — identical pattern to Cart */}
      <section className="pt-6 sm:pt-10 pb-14 px-3 sm:px-6">
        <div className="mb-3 md:mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
              You May Also Like
            </h2>
            <Link
              to="/"
              className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 text-gray-900 hover:bg-[#0F766E] hover:text-white transition-all duration-300 shrink-0"
            >
              <ArrowRight className="w-6 h-6" />
            </Link>
          </div>
        </div>

        <Carousel
          opts={{ loop: false, align: "start" }}
          className="w-full"
        >
          <CarouselContent className="-ml-3 sm:-ml-4 flex-wrap sm:flex-nowrap">
            {recommendedProducts.map((p, index) => (
              <CarouselItem
                key={p.id}
                className={`pl-3 sm:pl-4 basis-1/2 sm:basis-[45%] md:basis-[32%] lg:basis-[20%] xl:basis-[20%] ${index === 4 ? "hidden md:block" : ""
                  }`}
              >
                <div className="group bg-white p-2 md:p-1.5 rounded-2xl shadow-sm border border-gray-200 hover:shadow-lg hover:-translate-y-0.5 transition-all h-full">
                  {/* IMAGE */}
                  <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-[4/5] mb-2 md:mb-1.5">
                    <img
                      src={p.image}
                      alt={p.title}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = "/fallback-product.webp";
                      }}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    />
                    <button className="absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-600 hover:text-[#0F766E] transition-all">
                      <Heart className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                      <Link
                        to={`/product/${p.id}`}
                        className="w-full py-1.5 bg-white/90 backdrop-blur text-gray-900 rounded-lg font-medium text-[10px] md:text-xs hover:bg-[#0F766E] hover:text-white transition-colors shadow-sm block text-center"
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                  {/* CONTENT */}
                  <div className="px-1 pb-0.5 flex justify-between items-start gap-2">
                    <h3 className="text-xs md:text-sm font-medium text-gray-900 leading-snug line-clamp-2">
                      {p.title}
                    </h3>
                    <p className="text-xs font-semibold text-[#0F766E] shrink-0">
                      ₹{p.price}
                    </p>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </section>

      <Footer />
    </div>
  );
};

export default WishlistPage;
