import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ChevronRight,
  Heart,
  Lock,
  Minus,
  Plus,
  ShoppingCart,
  Sparkles,
  ShieldCheck,
  Award,
  Truck,
  Wallet,
} from "lucide-react";
import StatCard from "@/components/StatCard";
import { FaTrashAlt } from "react-icons/fa";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import Footer from "@/components/layout/Footer";

import QuickViewDrawer, { type QuickViewProduct } from "@/components/product/QuickViewDrawer";
import type { CartItem } from "@/lib/cartApi";
import { computeCartTotals } from "@/lib/pricing";
import { useRecommendations } from "@/hooks/useRecommendations";

const abbreviateSize = (size: string) =>
  size.replace(/months?/gi, "M").replace(/years?/gi, "Y").trim();

const BADGE_PRIORITY = ["newarrival", "trending", "bestseller", "featured"];
const sortBadges = (badges: string[]) => {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  return [...badges].sort((a, b) => {
    const ai = BADGE_PRIORITY.findIndex((p) => norm(a).includes(p));
    const bi = BADGE_PRIORITY.findIndex((p) => norm(b).includes(p));
    return (ai === -1 ? -1 : ai) - (bi === -1 ? -1 : bi);
  });
};

function CartSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((n) => (
        <Card
          key={n}
          className="bg-white border border-gray-300 rounded-xl overflow-hidden shadow-md ring-1 ring-black/5"
        >
          <CardContent className="p-4 flex gap-4">
            <Skeleton className="w-32 flex-shrink-0 aspect-[4/5] rounded-lg" />
            <div className="flex-1 space-y-3 py-1">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/3 rounded" />
              <Skeleton className="h-3 w-1/4 rounded" />
              <div className="flex justify-between items-center pt-2">
                <Skeleton className="h-8 w-24 rounded-full" />
                <Skeleton className="h-6 w-16 rounded" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Cart() {
  const { user, loading: authLoading } = useAuth();
  const { cartItems, loading: cartLoading, updateQuantity, updateSize, updateColor, removeItem } = useCart();

  const [selectedProduct, setSelectedProduct] = useState<QuickViewProduct | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const navigate = useNavigate();

  // Shared pricing math (Checkout + backend use the same rule); deliveryFee keeps its
  // local name for the JSX below.
  const { subtotal, originalTotal, totalSavings, shippingFee: deliveryFee, discount, total, freeShippingRemaining } =
    computeCartTotals(cartItems);

  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 3);
  const deliveryStr = `${deliveryDate.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}, 6:00 PM`;

  // "You May Also Like" — anchored to the first item in the bag.
  const recAnchor = cartItems[0]
    ? { slug: cartItems[0].slug, categorySlug: cartItems[0].categorySlug, price: cartItems[0].price }
    : null;
  const { recommendations, loading: recsLoading } = useRecommendations(recAnchor);

  const handleQuantityChange = (itemId: string, currentQty: number, delta: number) => {
    const next = Math.max(1, currentQty + delta);
    void updateQuantity(itemId, next);
  };

  const openQuickView = (item: CartItem) => {
    setSelectedProduct({
      source: "cart",
      id: item.id,
      sku: item.sku,
      slug: item.slug,
      categorySlug: item.categorySlug,
      title: item.title,
      price: item.price,
      originalPrice: item.originalPrice,
      image: item.image,
      images: item.images,
      color: item.color,
      badges: item.badges,
      tags: item.tags,
      quantity: item.quantity,
      size: item.size,
      availability: item.availability,
    });
    setQuickViewOpen(true);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col text-gray-900 overflow-x-hidden">
      {user ? <UserNavbar /> : <Navbar />}

      <main
        className="flex-1 flex flex-col w-full pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)]"
      >
        {/* Breadcrumb */}
        <div className="page-container px-4 sm:px-6 pt-3 pb-2 mt-1.5">
          <div className="flex flex-wrap items-center text-base text-gray-500 gap-1 mb-3">
            <Link to="/" className="hover:underline">
              Home
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-800 font-medium">Your Bag</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-500">Shipping</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-500">Payment</span>
          </div>
        </div>

        {/* Main Content */}
        <main className="page-container flex-1 flex flex-col gap-4 sm:gap-6 pb-12 px-3 sm:px-6">
          {/* Heading — full width above the columns so the order summary lines up
              with the stat cards (not the heading) on desktop. */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900">
                <span className="inline-flex items-center gap-2 leading-none">
                  Shopping Bag
                  <ShoppingCart size={26} className="text-primary translate-y-px" fill="currentColor" />
                </span>
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {cartLoading
                  ? "Loading your cart…"
                  : "Your little favorites are almost ready for their new home ✨"}
              </p>
            </div>
          </div>

          {/* Two-column row — left items + right order summary */}
          <div className="flex flex-col lg:flex-row gap-10 sm:gap-6 lg:gap-10">
          {/* LEFT SIDE */}
          <section className="flex-1 lg:w-[66%] space-y-4 sm:space-y-6">

            {/* Summary stat cards */}
            {!cartLoading && user && cartItems.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-6">
                <StatCard
                  icon={<ShoppingCart className="w-5 h-5 text-white" fill="currentColor" />}
                  value={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
                  label="Items in bag"
                  accent="bg-brand-teal"
                />
                <StatCard
                  icon={<Wallet className="w-5 h-5 text-white" />}
                  value={`₹${total - deliveryFee}`}
                  label="Bag total"
                  accent="bg-[#B19CD9]"
                />
              </div>
            )}

            {/* Section divider */}
            <hr className="border-t border-foreground/50 mb-8" />

            {/* Loading skeleton */}
            {cartLoading && <CartSkeleton />}

            {/* Not logged in */}
            {!cartLoading && !user && (
              <div className="w-full py-16 sm:py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
                <div className="text-center px-4">
                  <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">
                    Log in to see your cart
                  </p>
                  <p className="text-sm text-gray-500 mb-6">
                    Sign in to access saved items and check out.
                  </p>
                  <Link to="/login">
                    <Button className="bg-brand-teal hover:bg-[#0C5D53] text-white rounded-full px-8 h-11">
                      Log In
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Empty cart */}
            {!cartLoading && user && cartItems.length === 0 && (
              <div className="w-full py-16 sm:py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
                <div className="text-center px-4">
                  <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">
                    Your cart is empty
                  </p>
                  <p className="text-sm text-gray-500 mb-6">
                    Add items to your cart to get started!
                  </p>
                  <Link to="/dashboard">
                    <Button className="bg-brand-teal hover:bg-[#0C5D53] text-white rounded-full px-8 h-11">
                      Continue Shopping
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Cart items */}
            {!cartLoading && (
              <div className="space-y-4 sm:space-y-6">
              {cartItems.map((item, idx) => (
                <Card
                  key={item.id}
                  className={`bg-white border border-gray-400 border-l-8 border-l-brand-teal rounded-lg sm:rounded-xl overflow-hidden shadow-lg ring-1 ring-black/10 hover:shadow-xl hover:ring-black/10 transition-all duration-300 min-h-[160px] md:min-h-[140px] ${idx === 0 ? 'mt-8' : ''}`}
                >
                  <CardContent
                    className="py-3 pr-4 pl-2 sm:p-2.5 md:p-3 flex flex-col gap-1.5 relative cursor-pointer"
                    onClick={() => openQuickView(item)}
                  >
                    {/* IMAGE + DETAILS row */}
                    <div className="flex flex-row gap-3 sm:gap-3 md:gap-4 flex-1">
                    {/* IMAGE */}
                    <div className="w-28 sm:w-28 md:w-36 flex-shrink-0 self-stretch">
                      <div className="relative group h-full">
                        <div className="h-full min-h-[125px] md:min-h-[105px] overflow-hidden rounded-lg bg-gray-100">
                          <img
                            src={item.image}
                            alt={item.title}
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.src = "/fallback-product.webp";
                            }}
                            className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                          />
                        </div>
                        <button
                          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white shadow-sm hover:bg-gray-50 transition"
                          aria-label="Quick view"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ShoppingCart size={14} className="text-primary" fill="currentColor" />
                        </button>
                      </div>
                    </div>

                    {/* DETAILS */}
                    <div className="flex-1 flex flex-col min-w-0 py-0 gap-2">
                      <div className="pr-8 sm:pr-10 md:pr-12">
                        <h2 className="text-xl sm:text-xl md:text-2xl font-bold text-gray-900 leading-tight line-clamp-2">
                          {item.title}
                        </h2>
                        <p className="text-xs sm:text-sm mt-0.5 font-medium line-clamp-1 text-brand-teal">
                          The Lil Edit · {item.availability || "In Stock"}
                        </p>
                      </div>

                      {item.badges.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {sortBadges(item.badges).slice(0, 2).map((tag, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="bg-gradient-to-r from-purple-50 to-indigo-50 text-indigo-800 border border-indigo-100 text-xs sm:text-[11px] px-2 py-0.5 whitespace-nowrap rounded-md font-medium shadow-sm"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Color + Size */}
                      <div className="flex items-center gap-2 sm:gap-2.5 mt-1">
                        {item.colors && item.colors.length > 0 ? (
                          <Select
                            value={item.sku}
                            onValueChange={(val) => { void updateColor(item.id, val); }}
                          >
                            <SelectTrigger
                              onClick={(e) => e.stopPropagation()}
                              className="h-7 text-xs font-medium border-gray-300 rounded-full px-2.5 w-auto gap-1.5 focus:ring-brand-teal"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {item.colors.map((c) => (
                                <SelectItem key={c.sku} value={c.sku} className="text-xs">
                                  <span className="flex items-center gap-2">
                                    <span
                                      className="w-4 h-4 rounded-full border border-gray-300 shadow-sm flex-shrink-0"
                                      style={{ backgroundColor: c.hex }}
                                    />
                                    {c.name || "Color"}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : item.color.hex ? (
                          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700 whitespace-nowrap">
                            <span
                              className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-gray-300 shadow-sm flex-shrink-0"
                              style={{ backgroundColor: item.color.hex }}
                            />
                            {item.color.name || "Color"}
                          </span>
                        ) : null}
                        {(item.colors?.length > 0 || item.color.hex) && (item.size || item.sizes?.length > 0) && (
                          <span className="text-3xl text-primary leading-none">·</span>
                        )}
                        {item.sizes && item.sizes.length > 0 ? (
                          <Select
                            value={item.size || ""}
                            onValueChange={(val) => { void updateSize(item.id, val); }}
                          >
                            <SelectTrigger
                              onClick={(e) => e.stopPropagation()}
                              className="h-7 text-xs font-medium border-gray-300 rounded-full px-2.5 w-auto gap-1 focus:ring-brand-teal"
                            >
                              <span className="truncate">
                                {item.size ? abbreviateSize(item.size) : <span className="text-gray-400">Size</span>}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {item.sizes.map((s) => (
                                <SelectItem key={s} value={s} className="text-xs">
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : item.size ? (
                          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                            {item.size}
                          </span>
                        ) : null}
                      </div>

                      {/* Qty + Final Price + Original Price */}
                      <div className="flex flex-col gap-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center border border-gray-300 rounded-full overflow-hidden bg-white w-fit">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuantityChange(item.id, item.quantity, -1);
                              }}
                              className="px-2 sm:px-1.5 md:px-2 py-1 hover:bg-gray-100 transition"
                            >
                              <Minus size={11} className="sm:hidden" />
                              <Minus size={10} className="hidden sm:block" />
                            </button>
                            <span className="px-1 sm:px-1.5 md:px-2.5 text-sm font-semibold">
                              {item.quantity}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuantityChange(item.id, item.quantity, 1);
                              }}
                              className="px-2 sm:px-1.5 md:px-2 py-1 hover:bg-gray-100 transition"
                            >
                              <Plus size={11} className="sm:hidden" />
                              <Plus size={10} className="hidden sm:block" />
                            </button>
                          </div>
                          <span className="text-lg sm:text-xl md:text-2xl font-bold shrink-0 text-brand-teal">
                            ₹{item.price * item.quantity}
                          </span>
                        </div>
                        <div className="flex justify-end -mt-1">
                          <span className="text-xs line-through text-gray-400">₹{item.originalPrice * item.quantity}</span>
                        </div>
                      </div>

                      {/* Delivery */}
                      <span className="flex items-center gap-1 text-[10px] sm:text-xs text-gray-400 font-medium mt-1">
                        <Truck size={11} className="text-brand-teal flex-shrink-0" />
                        Delivery by {deliveryStr}
                      </span>
                    </div>
                    </div>{/* end image+details row */}

                    {/* DELETE */}
                    <div className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeItem(item.id);
                        }}
                        className="p-1.5 rounded-full text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove item"
                      >
                        <FaTrashAlt size={16} />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              </div>
            )}

            {/* Free shipping progress */}
            {!cartLoading && cartItems.length > 0 && freeShippingRemaining > 0 && (
              <div className="p-3 sm:p-4 bg-gradient-to-r from-[#E6FFFA] to-[#F0FDF4] rounded-xl border border-brand-teal/10">
                <p className="text-xs sm:text-sm font-medium text-gray-800">
                  You're ₹{freeShippingRemaining} away from free shipping!
                </p>
                <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-teal rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min((subtotal / 5000) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </section>

          {/* RIGHT SIDE — Order Summary */}
          <aside className="w-full lg:w-[34%] self-start lg:sticky lg:top-6">
            <Card className="bg-[hsl(268_45%_87%)] backdrop-blur-sm border border-[hsl(268_45%_77%)] shadow-lg rounded-2xl lg:rounded-3xl p-3 sm:p-5 lg:p-6 space-y-4 sm:space-y-5">
              <h3 className="text-xl sm:text-2xl font-semibold text-gray-900">
                Order Summary
              </h3>

              <div className="space-y-3 sm:space-y-4 text-sm sm:text-base">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">₹{subtotal}</span>
                </div>
                {totalSavings > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Without discount</span>
                    <span className="line-through text-gray-400">₹{originalTotal}</span>
                  </div>
                )}
                {totalSavings > 0 && (
                  <div className="flex justify-between text-green-600 font-medium">
                    <span>You save</span>
                    <span>-₹{totalSavings}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery</span>
                  <span className="font-medium">
                    {deliveryFee === 0 ? (subtotal > 0 ? "Free" : "—") : `₹${deliveryFee}`}
                  </span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-₹{discount}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-purple-300 pt-3 sm:pt-4 flex justify-between items-center">
                <span className="text-base sm:text-lg font-semibold">Total</span>
                <span className="text-xl sm:text-2xl font-bold text-brand-teal">
                  ₹{total}
                </span>
              </div>

              <div className="flex flex-row gap-2">
                <Input
                  placeholder="Enter coupon code"
                  className="flex-1 h-11 rounded-full text-sm"
                />
                <Button className="bg-brand-teal hover:bg-[#0C5D53] text-white rounded-full px-5 h-11 text-sm font-semibold shrink-0 transition-colors">
                  Apply
                </Button>
              </div>

              <Button
                onClick={() => {
                  if (!user) { toast.error("Please log in to checkout"); return; }
                  navigate("/checkout");
                }}
                className="w-full bg-brand-teal hover:bg-[#0C5D53] text-white py-3 sm:py-4 rounded-full font-semibold text-sm sm:text-base transition-colors flex items-center justify-center gap-2"
                disabled={cartItems.length === 0}
              >
                <Lock size={14} />
                Secure Checkout
              </Button>

              <div className="grid grid-cols-3 gap-2 pt-1 sm:pt-2">
                <div className="bg-[#FAF9F7] rounded-lg sm:rounded-xl py-2 sm:py-3 flex flex-col items-center gap-1 text-xs font-medium text-gray-700">
                  <Sparkles size={14} className="text-purple-500" />
                  Classy Styles
                </div>
                <div className="bg-[#FAF9F7] rounded-lg sm:rounded-xl py-2 sm:py-3 flex flex-col items-center gap-1 text-xs font-medium text-gray-700">
                  <ShieldCheck size={14} className="text-brand-teal" />
                  Safe Payments
                </div>
                <div className="bg-[#FAF9F7] rounded-lg sm:rounded-xl py-2 sm:py-3 flex flex-col items-center gap-1 text-xs font-medium text-gray-700">
                  <Award size={14} className="text-amber-500" />
                  Premium Quality
                </div>
              </div>
            </Card>
          </aside>
          </div>
        </main>

        {/* RECOMMENDATIONS — PDP-style grid, from the live recommendation engine */}
        {(recsLoading || recommendations.length > 0) && (
        <section className="mt-14 sm:mt-20 bg-[#E8DDF7] pt-6 sm:pt-10 pb-14">
          <div className="page-container px-3 sm:px-6">
            <div className="flex items-end justify-between mb-6 sm:mb-8">
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
                  You May Also Like
                </h2>
                <p className="text-sm text-gray-500 mt-1">Similar styles you'll love</p>
              </div>
              <Link
                to="/collections"
                className="hidden sm:block text-sm font-semibold text-brand-teal hover:underline"
              >
                View All
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
              {/* Loading skeleton */}
              {recsLoading && recommendations.length === 0 &&
                [...Array(5)].map((_, idx) => (
                  <div
                    key={`rec-skeleton-${idx}`}
                    className={`bg-card p-2 md:p-1.5 rounded-2xl shadow-sm border border-border animate-pulse ${idx >= 4 ? "max-sm:hidden" : ""}`}
                  >
                    <div className="aspect-[3/4] sm:aspect-[4/5] md:aspect-[5/6] rounded-xl bg-gray-200 mb-2 md:mb-1.5" />
                    <div className="px-1 pb-0.5 space-y-2">
                      <div className="h-3 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 rounded w-1/3" />
                    </div>
                  </div>
                ))}

              {/* Loaded recommendations */}
              {recommendations.map((p, idx) => (
                <div
                  key={`${p.slug}-${p.sku}`}
                  className={`group bg-card p-2 md:p-1.5 rounded-2xl shadow-sm border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all ${idx >= 4 ? "max-sm:hidden" : ""}`}
                >
                  <div className="relative rounded-xl overflow-hidden aspect-[3/4] sm:aspect-[4/5] md:aspect-[5/6] mb-2 md:mb-1.5">
                    <img
                      src={p.image}
                      alt={p.title}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = "/fallback-product.webp";
                      }}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    />
                    <button className="absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-muted-foreground hover:text-primary transition-all">
                      <Heart className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                      <Link
                        to={`/collections/${p.categorySlug}/product/${p.slug}$${p.sku}`}
                        className="w-full py-1.5 bg-white/90 backdrop-blur text-slate-900 rounded-lg font-medium text-[10px] md:text-xs hover:bg-brand-teal hover:text-white transition-colors shadow-sm block text-center"
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                  <div className="px-1 pb-0.5 flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <h3 className="font-display text-xs md:text-sm font-medium text-slate-900 leading-snug line-clamp-2">
                        {p.title}
                      </h3>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-body text-xs font-semibold text-brand-teal">₹{p.price}</p>
                      {p.originalPrice > p.price && (
                        <p className="text-[10px] text-gray-400 line-through">₹{p.originalPrice}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        )}
      </main>

      <Footer />

      <QuickViewDrawer
        open={quickViewOpen}
        product={selectedProduct}
        onClose={() => setQuickViewOpen(false)}
      />
    </div>
  );
}
