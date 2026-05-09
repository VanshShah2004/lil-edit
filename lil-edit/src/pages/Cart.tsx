import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Heart,
  Minus,
  Plus,
  ArrowRight,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
// Mock data – replace with API/cart context later
const mockCartItems = [
  {
    id: "c1",
    title: "Lilac Embroidered Georgette Lehenga Set",
    price: 3500,
    originalPrice: 4200,
    image: img1,
    size: "2-3 Years",
    color: { name: "White", hex: "#FFFFFF" },
    quantity: 1,
    availability: "Only 2 left",
    tags: ["Trending this week", "Most loved by parents"],
  },
  {
    id: "c2",
    title: "Mint Green Ruffle Trim Party Dress",
    price: 2999,
    originalPrice: 3599,
    image: img2,
    size: "1-2 Years",
    color: { name: "Black", hex: "#000000" },
    quantity: 2,
    availability: "5 in stock",
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
];

export default function Cart() {
  const [cartItems, setCartItems] = useState(mockCartItems);

  const updateQuantity = (id: string, delta: number) => {
    setCartItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
            ...item,
            quantity: Math.max(1, item.quantity + delta),
          }
          : item
      )
    );
  };

  const removeItem = (id: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
  };

  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const deliveryFee = subtotal > 5000 ? 0 : 199;
  const discount = 0;
  const total = subtotal + deliveryFee - discount;

  const freeShippingRemaining = Math.max(0, 5000 - subtotal);

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

          <span className="text-gray-800 font-medium">
            Your Bag
          </span>

          <ChevronRight className="w-4 h-4 mx-1" />

          <span className="text-gray-500">
            Shipping
          </span>

          <ChevronRight className="w-4 h-4 mx-1" />

          <span className="text-gray-500">
            Payment
          </span>
        </div>
      </div>

      {/* Main Content */}
      <main className="page-container flex-1 flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-10 pb-12 px-3 sm:px-6">
        {/* LEFT SIDE */}
        <section className="flex-1 lg:w-[66%] space-y-4 sm:space-y-6">
          {/* Cart Heading */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900">
                Shopping Bag
              </h1>

              <p className="text-sm text-gray-500 mt-1">
                {cartItems.length} items in your cart
              </p>
            </div>
          </div>

          {/* CART ITEMS */}
          {cartItems.map((item) => (
            <Card
              key={item.id}
              className="bg-white border border-gray-200 border-l-8 border-l-[#0F766E] rounded-lg sm:rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 min-h-[120px] sm:min-h-[140px] md:min-h-[160px]"
            >
              <CardContent className="p-2.5 sm:p-3 md:p-4 flex flex-row gap-2.5 sm:gap-3 md:gap-4 h-full">
                {/* IMAGE */}
                <div className="w-20 sm:w-24 md:w-32 flex-shrink-0 relative group">
                  <div className="aspect-[3/4] sm:aspect-[3/4] md:aspect-[4/5] overflow-hidden rounded-lg sm:rounded-lg bg-gray-100">
                    <img
                      src={item.image}
                      alt={item.title}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src =
                          "/fallback-product.webp";
                      }}
                      className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>

                  {/* Wishlist */}
                  <button
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-md shadow-sm hover:bg-white transition"
                  >
                    <Heart size={14} className="text-gray-700" />
                  </button>
                </div>

                {/* DETAILS */}
                <div className="flex-1 flex flex-col min-w-0 justify-between py-0">
                  {/* Top Section - Title & Availability */}
                  <div>
                    <h2 className="text-xs sm:text-sm md:text-base font-semibold text-gray-900 leading-tight line-clamp-2">
                      {item.title}
                    </h2>
                    <p className="text-xs md:text-sm text-[#0F766E] mt-0.5 md:mt-1 font-medium line-clamp-1">
                      {item.availability}
                    </p>
                  </div>

                  {/* Tags - Only show first tag on mobile */}
                  {item.tags.length > 0 && (
                    <div className="flex gap-0.5">
                      <Badge
                        variant="secondary"
                        className="bg-gradient-to-r from-[#F5F3FF] to-[#E0F2FE] text-gray-800 border-0 text-xs px-1.5 py-0.5 whitespace-nowrap"
                      >
                        {item.tags[0]}
                      </Badge>
                    </div>
                  )}

                  {/* Middle Section - Color & Size - Inline */}
                  <div className="flex items-center gap-1.5 sm:gap-2 mt-1">
                    <button
                      className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 rounded-full border-2 border-gray-300 shadow-sm flex-shrink-0"
                      title="Color"
                      style={{
                        backgroundColor: item.color.hex,
                      }}
                    />
                    <span className="text-xs md:text-sm font-medium px-2 md:px-2.5 py-0.5 bg-gray-100 rounded whitespace-nowrap">
                      {item.size}
                    </span>
                  </div>

                  {/* Bottom Row - Qty, Price, Actions */}
                  <div className="space-y-0.5 mt-auto">
                    {/* Quantity & Price */}
                    <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                      <div className="flex items-center gap-0.5 sm:gap-1">
                        <span className="text-xs font-medium text-gray-600 hidden sm:block">Qty:</span>
                        <div className="flex items-center border border-gray-300 rounded-full overflow-hidden bg-white">
                          <button
                            onClick={() =>
                              updateQuantity(item.id, -1)
                            }
                            className="px-1 sm:px-1.5 md:px-2 py-0.5 md:py-1 hover:bg-gray-100 transition"
                          >
                            <Minus size={9} className="sm:hidden" />
                            <Minus size={10} className="hidden sm:block" />
                          </button>
                          <span className="px-1 sm:px-1.5 md:px-2.5 text-xs md:text-sm font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateQuantity(item.id, 1)
                            }
                            className="px-1 sm:px-1.5 md:px-2 py-0.5 md:py-1 hover:bg-gray-100 transition"
                          >
                            <Plus size={9} className="sm:hidden" />
                            <Plus size={10} className="hidden sm:block" />
                          </button>
                        </div>
                      </div>

                      {/* Price */}
                      <div className="flex flex-col items-end">
                        <span
                          className="text-sm sm:text-base md:text-lg font-bold"
                          style={{ color: "#0F766E" }}
                        >
                          ₹{item.price * item.quantity}
                        </span>
                        <span className="text-xs line-through text-gray-400">
                          ₹{item.originalPrice * item.quantity}
                        </span>
                      </div>
                    </div>

                    {/* ACTIONS */}
                    <div className="flex gap-1 sm:gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full text-xs h-6 sm:h-7 md:h-8 px-2 sm:px-2.5 md:px-3 hover:border-[#0F766E] hover:text-[#0F766E]"
                        onClick={() => removeItem(item.id)}
                      >
                        Remove
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full text-xs h-6 sm:h-7 md:h-8 px-2 sm:px-2.5 md:px-3 hover:bg-[#E6FFFA] hover:text-[#0F766E]"
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* FREE SHIPPING */}
          {freeShippingRemaining > 0 && (
            <div className="p-3 sm:p-4 bg-gradient-to-r from-[#E6FFFA] to-[#F0FDF4] rounded-xl border border-[#0F766E]/10">
              <p className="text-xs sm:text-sm font-medium text-gray-800">
                You're ₹{freeShippingRemaining} away from free shipping!
              </p>
              <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0F766E] rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      (subtotal / 5000) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
        </section>

        {/* RIGHT SIDE */}
        <aside className="w-full lg:w-[34%] self-start lg:sticky lg:top-6">
          <Card className="bg-purple-200/70 backdrop-blur-sm border border-purple-300 shadow-lg rounded-2xl lg:rounded-3xl p-3 sm:p-5 lg:p-6 space-y-4 sm:space-y-5">
            <h3 className="text-xl sm:text-2xl font-semibold text-gray-900">
              Order Summary
            </h3>

            {/* Summary Rows */}
            <div className="space-y-3 sm:space-y-4 text-sm sm:text-base">
              <div className="flex justify-between">
                <span className="text-gray-600">
                  Subtotal
                </span>
                <span className="font-medium">
                  ₹{subtotal}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">
                  Delivery
                </span>
                <span className="font-medium">
                  {deliveryFee === 0
                    ? "Free"
                    : `₹${deliveryFee}`}
                </span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-₹{discount}</span>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t pt-3 sm:pt-4 flex justify-between items-center">
              <span className="text-base sm:text-lg font-semibold">
                Total
              </span>
              <span className="text-xl sm:text-2xl font-bold text-[#0F766E]">
                ₹{total}
              </span>
            </div>
            {/* Coupon */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Input
                placeholder="Enter coupon"
                className="flex-1 h-10 sm:h-11 rounded-full text-sm"
              />
              <Button className="bg-[#0F766E] hover:bg-[#0C5D53] text-white rounded-full px-4 sm:px-6 h-10 sm:h-11 text-sm sm:text-base">
                Apply
              </Button>
            </div>
            {/* Checkout */}
            <Button className="w-full bg-[#0F766E] hover:bg-[#0C5D53] text-white py-3 sm:py-4 rounded-full font-semibold text-sm sm:text-base transition-colors">
              Secure Checkout
            </Button>

            {/* Trust Indicators */}
            <div className="grid grid-cols-3 gap-2 pt-1 sm:pt-2">
              <div className="bg-[#FAF9F7] rounded-lg sm:rounded-xl py-2 sm:py-3 text-center text-xs font-medium text-gray-700">
                Easy Returns
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

      {/* RECOMMENDATIONS */}
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
          opts={{
            loop: true,
            align: "start",
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-3 sm:-ml-4">
            {recommendedProducts.map((p) => (
              <CarouselItem
                key={p.id}
                className="pl-3 sm:pl-4 basis-[50%] xs:basis-[55%] sm:basis-[40%] md:basis-[32%] lg:basis-[25%] xl:basis-[22%]"
              >
                <div className="group bg-white p-2 md:p-1.5 rounded-2xl shadow-sm border border-gray-200 hover:shadow-lg hover:-translate-y-0.5 transition-all h-full">
                  {/* IMAGE */}
                  <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-[4/5] mb-2 md:mb-1.5">
                    <img
                      src={p.image}
                      alt={p.title}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src =
                          "/fallback-product.webp";
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
}