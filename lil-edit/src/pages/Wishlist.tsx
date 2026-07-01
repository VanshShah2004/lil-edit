import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  ShoppingBag,
  Heart,
  Sparkles,
  ShieldCheck,
  Award,
  Share2,
  PackageCheck,
} from "lucide-react";
import StatCard from "@/components/StatCard";
import { FaTrashAlt } from "react-icons/fa";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import { useWishlist } from "@/contexts/WishlistContext";
import Footer from "@/components/layout/Footer";

import QuickViewDrawer, { type QuickViewProduct } from "@/components/product/QuickViewDrawer";
import type { WishlistItem } from "@/lib/wishlistApi";
import { useRecommendations, type RecommendationAnchor } from "@/hooks/useRecommendations";
import { useCart } from "@/contexts/CartContext";
import { fetchOrders } from "@/lib/ordersApi";

const BADGE_PRIORITY = ["newarrival", "trending", "bestseller", "featured"];
const sortBadges = (badges: string[]) => {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  return [...badges].sort((a, b) => {
    const ai = BADGE_PRIORITY.findIndex((p) => norm(a).includes(p));
    const bi = BADGE_PRIORITY.findIndex((p) => norm(b).includes(p));
    return (ai === -1 ? -1 : ai) - (bi === -1 ? -1 : bi);
  });
};

function WishlistSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="bg-white border border-gray-300 border-l-8 border-l-primary rounded-xl overflow-hidden shadow-md ring-1 ring-black/5 animate-pulse"
        >
          <div className="p-4 flex gap-4 min-h-[200px]">
            <div className="w-28 flex-shrink-0 bg-gray-200 rounded-lg" />
            <div className="flex-1 space-y-3 py-2">
              <div className="h-5 bg-gray-200 rounded w-3/4" />
              <div className="h-4 bg-gray-200 rounded w-1/3" />
              <div className="flex gap-2 mt-4">
                <div className="h-6 bg-gray-200 rounded-full w-20" />
                <div className="h-6 bg-gray-200 rounded-full w-20" />
              </div>
              <div className="mt-auto flex gap-2 pt-4">
                <div className="h-9 bg-gray-200 rounded-full flex-1" />
                <div className="h-9 bg-gray-200 rounded-full flex-1" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const WishlistPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [movingAll, setMovingAll] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<QuickViewProduct | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const {
    wishlistItems,
    loading: wishlistLoading,
    isWishlisted,
    addToWishlist,
    removeFromWishlist,
    moveToCart,
    moveAllToCart,
  } = useWishlist();

  const { cartItems, loading: cartLoading } = useCart();
  const [fallbackAnchor, setFallbackAnchor] = useState<RecommendationAnchor | null>(null);

  const handleMoveToCart = async (id: string) => {
    setMovingId(id);
    try {
      await moveToCart(id);
    } finally {
      setMovingId(null);
    }
  };

  // Direct "Buy Now": straight to checkout with just this item (cart untouched,
  // wishlist entry kept). The backend re-prices from {slug, sku, size, quantity};
  // the rest is display-only. Mirrors the QuickView drawer's Buy Now.
  const handleBuyNow = (item: WishlistItem) => {
    console.log(`[WishlistPage] buy now  slug=${item.slug}  sku=${item.sku}`);
    navigate("/checkout", {
      state: {
        mode: "direct",
        item: {
          product_slug: item.slug,
          sku: item.sku,
          size: "",
          quantity: 1,
          title: item.title,
          price: item.price,
          originalPrice: item.originalPrice,
          image: item.image,
          colorName: item.color?.name ?? "",
        },
      },
    });
  };

  const handleMoveAllToCart = async () => {
    setMovingAll(true);
    try {
      await moveAllToCart();
    } finally {
      setMovingAll(false);
    }
  };

  const openQuickView = (item: WishlistItem) => {
    setSelectedProduct({
      source: "wishlist",
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
      brand: item.brand,
      inStock: item.inStock,
    });
    setQuickViewOpen(true);
  };

  const tabs = [
    { id: "all",        label: "All",        count: wishlistItems.length },
    { id: "trending",   label: "Trending",   count: wishlistItems.filter((i) => i.tags.some((t) => t.toLowerCase().includes("trend"))).length },
    { id: "discounted", label: "Discounted", count: wishlistItems.filter((i) => i.originalPrice > i.price).length },
    { id: "instock",    label: "In Stock",   count: wishlistItems.filter((i) => i.inStock).length },
  ];

  const filteredItems = wishlistItems.filter((item) => {
    if (activeTab === "trending")   return item.tags.some((t) => t.toLowerCase().includes("trend"));
    if (activeTab === "discounted") return item.originalPrice > item.price;
    if (activeTab === "instock")    return item.inStock;
    return true;
  });

  const totalValue = filteredItems.reduce((sum, item) => sum + item.price, 0);
  const inStockCount = wishlistItems.filter((i) => i.inStock).length;

  // When the wishlist is empty, derive a rec anchor from cart then order history.
  const firstCartSlug = cartItems[0]?.slug ?? "";
  const firstCartCategorySlug = cartItems[0]?.categorySlug ?? "";
  const firstCartPrice = cartItems[0]?.price;
  useEffect(() => {
    if (wishlistLoading || wishlistItems.length > 0 || !user) {
      setFallbackAnchor(null);
      return;
    }
    if (cartLoading) return;
    if (firstCartSlug) {
      setFallbackAnchor({ slug: firstCartSlug, categorySlug: firstCartCategorySlug, price: firstCartPrice });
      return;
    }
    let active = true;
    void (async () => {
      try {
        const orders = await fetchOrders();
        const firstItem = orders[0]?.items?.[0];
        if (active && firstItem) {
          setFallbackAnchor({ slug: firstItem.productSlug, categorySlug: firstItem.categorySlug, price: firstItem.unitPrice });
          return;
        }
      } catch {
        console.error("[Wishlist] fallback anchor: orders fetch failed");
      }
      if (active) setFallbackAnchor(null);
    })();
    return () => { active = false; };
  }, [wishlistLoading, wishlistItems.length, cartLoading, firstCartSlug, firstCartCategorySlug, firstCartPrice, user]);

  // "You May Also Like" — anchored to the first saved item; falls back to cart or
  // order history when the wishlist is empty so the section always has something to show.
  const recAnchor: RecommendationAnchor | null = wishlistItems[0]
    ? { slug: wishlistItems[0].slug, categorySlug: wishlistItems[0].categorySlug, price: wishlistItems[0].price }
    : fallbackAnchor;
  const { recommendations, loading: recsLoading } = useRecommendations(recAnchor);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col text-gray-900 overflow-x-hidden">
      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1 flex flex-col w-full pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)]">
        {/* Breadcrumb */}
        <div className="page-container px-4 sm:px-6 pt-3 pb-2 mt-1.5">
          <div className="flex flex-wrap items-center text-base text-gray-500 gap-1 mb-3">
            <Link to="/" className="hover:underline">Home</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-800 font-medium">Your Wishlist</span>
          </div>
        </div>

        {/* Main Content */}
        <main className="page-container flex-1 flex flex-col gap-4 sm:gap-6 pb-12 px-3 sm:px-6">
          {/* Heading — full width above the columns so the order summary lines up
              with the stat cards (not the heading) on desktop. */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 flex items-center gap-2">
                Your Wishlist
                <Heart className="w-6 h-6 sm:w-7 sm:h-7 text-primary" fill="hsl(268 45% 65%)" />
              </h1>
              <p className="text-sm text-gray-500 mt-1">Save it today, love it forever ✨</p>
            </div>
          </div>

          {/* Two-column row — left items + right order summary */}
          <div className="flex flex-col lg:flex-row gap-10 sm:gap-6 lg:gap-10">
          {/* LEFT SIDE */}
          <section className="flex-1 lg:w-[66%] space-y-4 sm:space-y-6">

            {/* Summary stat cards */}
            {!wishlistLoading && user && wishlistItems.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-6">
                <StatCard
                  icon={<Heart className="w-5 h-5 text-white" fill="currentColor" />}
                  value={wishlistItems.length}
                  label="Items saved"
                  accent="bg-[#B19CD9]"
                />
                <StatCard
                  icon={<PackageCheck className="w-5 h-5 text-white" />}
                  value={inStockCount}
                  label="In stock"
                  accent="bg-emerald-500"
                />
              </div>
            )}

            {/* Section divider */}
            <hr className="border-t border-foreground/50 mb-8" />

            {/* FILTER TABS — baseline is an inset shadow (not a border) so the
                active tab can paint a white bottom border over it and read as
                "open"/connected to the panel below. A real border-b would sit
                outside the overflow-x clip and be impossible to cover. */}
            <div className="flex items-end gap-1 overflow-x-auto no-scrollbar pt-2 shadow-[inset_0_-2px_0_0_hsl(var(--foreground)_/_0.5)]">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 rounded-t-xl font-medium transition-colors border-foreground/50 relative whitespace-nowrap ${
                    activeTab === tab.id
                      ? "border-[2px] px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-white text-primary border-b-white z-10"
                      : "border-[1.5px] px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm bg-gray-200/60 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full font-semibold transition-colors ${
                      activeTab === tab.id
                        ? "bg-primary/10 text-primary"
                        : "bg-white/60 text-gray-500"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* ITEMS */}
            {wishlistLoading ? (
              <WishlistSkeleton />
            ) : !user ? (
              <div className="w-full py-16 sm:py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
                <Heart size={48} className="text-primary mb-4 opacity-40" />
                <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">Save items you love</p>
                <p className="text-sm text-gray-500 mb-6">Log in to view and manage your wishlist.</p>
                <Link to="/login" className="text-sm font-medium text-primary underline underline-offset-2">
                  Log in
                </Link>
              </div>
            ) : wishlistItems.length === 0 ? (
              <div className="w-full py-16 sm:py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
                <Heart size={48} className="text-primary mb-4 opacity-40" />
                <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">Your wishlist is empty</p>
                <p className="text-sm text-gray-500 mb-6">Browse our collection and save your favourites!</p>
                <Link to="/dashboard" className="text-sm font-medium text-primary underline underline-offset-2">
                  Start shopping
                </Link>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="w-full py-16 sm:py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
                <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">No items in this category</p>
                <p className="text-sm text-gray-500 mb-6">Try a different filter or add more items!</p>
                <button
                  onClick={() => setActiveTab("all")}
                  className="text-sm font-medium text-primary underline underline-offset-2"
                >
                  View all saved items
                </button>
              </div>
            ) : (
              filteredItems.map((item, idx) => (
                <Card
                  key={item.id}
                  className={`bg-white border border-gray-400 border-l-8 border-l-primary rounded-lg sm:rounded-xl overflow-hidden shadow-lg ring-1 ring-black/10 hover:shadow-xl hover:ring-black/10 transition-all duration-300 min-h-[160px] md:min-h-[140px] ${idx === 0 ? 'mt-8' : ''}`}
                >
                  <CardContent
                    className="py-3 pr-4 pl-2 sm:p-2.5 md:p-3 flex flex-col gap-2.5 relative cursor-pointer"
                    onClick={() => openQuickView(item)}
                  >
                    {/* IMAGE + DETAILS row */}
                    <div className="flex flex-row gap-3 sm:gap-3 md:gap-4 flex-1">
                      {/* IMAGE */}
                      <div className="w-28 sm:w-28 md:w-36 flex-shrink-0 self-stretch">
                        <div className="relative group h-full">
                          <div className="block h-full">
                            <div className="h-full min-h-[125px] md:min-h-[105px] overflow-hidden rounded-lg bg-gray-100">
                              <img
                                src={item.image}
                                alt={item.title}
                                loading="lazy"
                                onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                                className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                              />
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFromWishlist(item.id); }}
                            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white shadow-sm hover:bg-gray-50 transition"
                            title="Remove from wishlist"
                          >
                            <Heart size={14} className="text-primary" fill="hsl(268 45% 65%)" />
                          </button>
                        </div>
                      </div>

                      {/* DETAILS */}
                      <div className="flex-1 flex flex-col min-w-0 py-0">
                        <div className="pr-8 sm:pr-10 md:pr-12">
                          <h2 className="text-xl sm:text-xl md:text-2xl font-bold text-gray-900 leading-tight line-clamp-2">
                            {item.title}
                          </h2>
                          <p className="text-xs sm:text-sm mt-0.5 font-medium line-clamp-1 text-brand-teal">
                            {item.brand} · {item.inStock ? "In Stock" : "Out of Stock"}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1.5 mt-2 sm:mt-1.5 min-h-[24px]">
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

                        {/* Spacer: pushes color to image bottom, min 10px gap */}
                        <div className="flex-1 min-h-[10px]" />

                        {/* Color + Price */}
                        <div className="flex flex-col gap-0">
                          {/* Color | Final Price — always same row */}
                          <div className="flex items-center justify-between gap-2">
                            {item.color.hex && (
                              <span className="flex items-center gap-1.5 text-sm sm:text-base font-medium text-gray-700 whitespace-nowrap">
                                <span
                                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 border-gray-300 shadow-sm flex-shrink-0"
                                  style={{ backgroundColor: item.color.hex }}
                                />
                                {item.color.name || "Color"}
                              </span>
                            )}
                            <span className="text-lg sm:text-xl md:text-2xl font-bold shrink-0 text-brand-teal">
                              ₹{item.price}
                            </span>
                          </div>
                          {/* Original Price — right-aligned below */}
                          {item.originalPrice > item.price && (
                            <div className="flex justify-end -mt-1">
                              <span className="text-xs line-through text-gray-400">₹{item.originalPrice}</span>
                            </div>
                          )}
                        </div>

                        {/* Cart it + Buy Now */}
                        <div className="flex gap-2 sm:gap-2.5 mt-2">
                          <Button
                            onClick={(e) => { e.stopPropagation(); void handleMoveToCart(item.id); }}
                            size="sm"
                            disabled={!item.inStock || movingId === item.id}
                            className="h-9 sm:h-10 flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs sm:text-sm font-bold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-1.5"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>{movingId === item.id ? "Moving…" : "Cart it"}</span>
                          </Button>
                          <Button
                            onClick={(e) => { e.stopPropagation(); handleBuyNow(item); }}
                            size="sm"
                            disabled={!item.inStock}
                            className="h-9 sm:h-10 flex-1 bg-brand-teal hover:bg-brand-teal/90 text-white rounded-lg text-xs sm:text-sm font-bold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center"
                          >
                            Buy Now
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* SHARE + DELETE */}
                    <div className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 flex flex-row gap-1">
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-full text-gray-500 hover:text-brand-teal hover:bg-teal-50 transition-colors"
                        title="Share"
                      >
                        <Share2 size={16} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFromWishlist(item.id); }}
                        className="p-1.5 rounded-full text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove from wishlist"
                      >
                        <FaTrashAlt size={16} />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </section>

          {/* RIGHT SIDE — Summary sidebar */}
          <aside className="w-full lg:w-[34%] self-start lg:sticky lg:top-6">
            <Card className="bg-[hsl(268_45%_87%)] backdrop-blur-sm border border-[hsl(268_45%_77%)] shadow-lg rounded-2xl lg:rounded-3xl p-3 sm:p-5 lg:p-6 space-y-4 sm:space-y-5">
              <h3 className="text-xl sm:text-2xl font-semibold text-gray-900">Wishlist Summary</h3>
              <div className="space-y-3 sm:space-y-4 text-sm sm:text-base">
                <div className="flex justify-between">
                  <span className="text-gray-600">Items Saved</span>
                  <span className="font-medium">{wishlistItems.length}</span>
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
              <div className="border-t border-gray-400 pt-3 sm:pt-4 flex justify-between items-center">
                <span className="text-base sm:text-lg font-semibold">Payable</span>
                <span className="text-xl sm:text-2xl font-bold text-brand-teal">₹{totalValue}</span>
              </div>
              <Button
                onClick={() => void handleMoveAllToCart()}
                disabled={movingAll || inStockCount === 0}
                className="w-full bg-brand-teal hover:bg-[#0C5D53] text-white py-3 sm:py-4 rounded-lg font-semibold text-sm sm:text-base transition-colors gap-2 disabled:opacity-50"
              >
                <ShoppingBag className="w-4 h-4" />
                {movingAll ? "Moving…" : "Move All to Cart"}
              </Button>
              <Link to="/dashboard" className="block mt-4 sm:mt-6">
                <Button
                  variant="outline"
                  className="w-full border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg py-3 sm:py-4 font-medium text-sm sm:text-base"
                >
                  Continue Shopping
                </Button>
              </Link>
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
                <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">You May Also Like</h2>
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
                      onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    />
                    <button
                      onClick={() => void addToWishlist(p.slug, p.sku)}
                      className="absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center transition-all"
                      title={isWishlisted(p.slug, p.sku) ? "Already in wishlist" : "Add to wishlist"}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${isWishlisted(p.slug, p.sku) ? "text-primary" : "text-muted-foreground"}`}
                        fill={isWishlisted(p.slug, p.sku) ? "currentColor" : "none"}
                      />
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
                      <h3 className="font-display text-xs md:text-sm font-medium text-slate-900 leading-snug line-clamp-2">{p.title}</h3>
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
        hideBuyNow
      />
    </div>
  );
};

export default WishlistPage;
