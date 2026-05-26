import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  ShoppingBag,
  Heart,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Award,
  Share2,
  Eye,
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
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import { useWishlist } from "@/contexts/WishlistContext";
import Footer from "@/components/layout/Footer";

import img1 from "@/assets/searchbar-frequent_searches/le-1.png";
import img3 from "@/assets/searchbar-frequent_searches/le-3.png";
import img4 from "@/assets/searchbar-frequent_searches/le-4.png";
import img5 from "@/assets/searchbar-frequent_searches/le-5.png";
import img6 from "@/assets/searchbar-frequent_searches/le-6.png";

const recommendedProducts = [
  {
    id: "r1",
    title: "Blush Pink Net Indo-Western Gown",
    slug: "blush-pink-net-indo-western-gown",
    categorySlug: "party-wear",
    price: 5200,
    originalPrice: 6000,
    image: img3,
    sku: "LIL-REC1",
  },
  {
    id: "r2",
    title: "Royal Blue Embroidered Party Set",
    slug: "royal-blue-embroidered-party-set",
    categorySlug: "party-wear",
    price: 4899,
    originalPrice: 5600,
    image: img4,
    sku: "LIL-REC2",
  },
  {
    id: "r3",
    title: "Peach Floral Princess Dress",
    slug: "peach-floral-princess-dress",
    categorySlug: "party-wear",
    price: 3999,
    originalPrice: 4700,
    image: img5,
    sku: "LIL-REC3",
  },
  {
    id: "r4",
    title: "Ivory Ethnic Festive Wear",
    slug: "ivory-ethnic-festive-wear",
    categorySlug: "kids-ethnic-wear",
    price: 5799,
    originalPrice: 6500,
    image: img6,
    sku: "LIL-REC4",
  },
  {
    id: "r5",
    title: "Golden Silk Lehenga Collection",
    slug: "golden-silk-lehenga-collection",
    categorySlug: "kids-ethnic-wear",
    price: 6200,
    originalPrice: 7500,
    image: img1,
    sku: "LIL-REC5",
  },
];

function WishlistSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="bg-white border border-gray-200 border-l-8 border-l-primary rounded-xl overflow-hidden shadow-sm animate-pulse"
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
  const [activeTab, setActiveTab] = useState("all");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [movingAll, setMovingAll] = useState(false);
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

  const handleMoveToCart = async (id: string) => {
    setMovingId(id);
    try {
      await moveToCart(id);
    } finally {
      setMovingId(null);
    }
  };

  const handleMoveAllToCart = async () => {
    setMovingAll(true);
    try {
      await moveAllToCart();
    } finally {
      setMovingAll(false);
    }
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

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col text-gray-900 overflow-x-hidden">
      {user ? <UserNavbar /> : <Navbar />}

      <main style={{ paddingTop: 'calc(var(--navbar-height) + 15px)' }} className="flex-1 flex flex-col w-full">
        {/* Breadcrumb */}
        <div className="page-container px-4 sm:px-6 py-4">
          <div className="flex flex-wrap items-center text-xs sm:text-sm text-gray-600 gap-y-2">
            <Link to="/" className="hover:underline">Home</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <span className="text-gray-800 font-medium">Your Wishlist</span>
          </div>
        </div>

        {/* Main Content */}
        <main className="page-container flex-1 flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-10 pb-12 px-3 sm:px-6">
          {/* LEFT SIDE */}
          <section className="flex-1 lg:w-[66%] space-y-4 sm:space-y-6">
            {/* Heading */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 flex items-center gap-2">
                  Your Wishlist
                  <Heart className="w-6 h-6 sm:w-7 sm:h-7 text-primary" fill="hsl(268 45% 65%)" />
                </h1>
                <p className="text-sm text-gray-500 mt-1">{wishlistItems.length} items saved</p>
              </div>
            </div>

            {/* FILTER TABS */}
            <div className="flex items-end gap-1 border-b border-gray-200 overflow-x-auto no-scrollbar pt-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 sm:px-5 sm:py-2.5 rounded-t-xl text-xs sm:text-sm font-medium transition-colors border border-b-0 relative top-[1px] whitespace-nowrap ${
                    activeTab === tab.id
                      ? "bg-white text-primary border-gray-200 z-10"
                      : "bg-gray-200/60 text-gray-500 border-transparent hover:bg-gray-200 hover:text-gray-700"
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
                  {activeTab === tab.id && (
                    <div className="absolute -bottom-[2px] left-0 right-0 h-[3px] bg-white" />
                  )}
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
              filteredItems.map((item) => (
                <Card
                  key={item.id}
                  className="bg-white border border-gray-200 border-l-8 border-l-primary rounded-lg sm:rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 min-h-[55px] sm:min-h-[75px] md:min-h-[90px]"
                >
                  <CardContent className="py-3 pr-4 pl-2 sm:p-2.5 md:p-3 flex flex-col gap-2.5 relative">
                    {/* IMAGE + DETAILS row */}
                    <div className="flex flex-row gap-3 sm:gap-3 md:gap-4 flex-1">
                      {/* IMAGE */}
                      <div className="w-28 sm:w-28 md:w-36 flex-shrink-0 self-stretch">
                        <div className="relative group h-full">
                          <Link to={`/collections/${item.categorySlug}/product/${item.slug}$${item.sku}`} className="block h-full">
                            <div className="h-full min-h-[150px] sm:min-h-[165px] md:min-h-[185px] overflow-hidden rounded-lg bg-gray-100">
                              <img
                                src={item.image}
                                alt={item.title}
                                loading="lazy"
                                onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                                className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                              />
                            </div>
                          </Link>
                          <button
                            onClick={() => removeFromWishlist(item.id)}
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
                          <Link to={`/collections/${item.categorySlug}/product/${item.slug}$${item.sku}`}>
                            <h2 className="text-xl sm:text-xl md:text-2xl font-bold text-gray-900 leading-tight line-clamp-2 hover:text-primary transition-colors">
                              {item.title}
                            </h2>
                          </Link>
                          <p className="text-xs sm:text-sm mt-0.5 font-medium line-clamp-1" style={{ color: "#0F766E" }}>
                            {item.brand} · {item.inStock ? "In Stock" : "Out of Stock"}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1.5 mt-2 sm:mt-1.5 min-h-[24px]">
                          {item.tags.slice(0, 2).map((tag, idx) => (
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
                            <span className="text-lg sm:text-xl md:text-2xl font-bold shrink-0" style={{ color: "#0F766E" }}>
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
                      </div>
                    </div>

                    {/* BOTTOM ROW: Quick View + Cart it + Buy Now */}
                    <div className="flex items-center gap-3 sm:gap-3 md:gap-4">
                      <button className="w-28 sm:w-28 md:w-36 flex-shrink-0 flex items-center justify-center gap-1 px-2 py-1 rounded-sm bg-gray-100 hover:bg-[#0F766E] hover:text-white text-gray-700 text-[10px] font-medium transition-colors">
                        <Eye size={11} />
                        Quick View
                      </button>
                      <div className="flex gap-2 sm:gap-2.5 flex-1 min-w-0">
                        <Button
                          onClick={() => void handleMoveToCart(item.id)}
                          size="sm"
                          disabled={!item.inStock || movingId === item.id}
                          className="h-9 sm:h-10 flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full text-xs sm:text-sm font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-1.5"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>{movingId === item.id ? "Moving…" : "Cart it"}</span>
                        </Button>
                        <Button
                          onClick={() => {}}
                          size="sm"
                          className="h-9 sm:h-10 flex-1 bg-teal-600 hover:bg-teal-700 text-white rounded-full text-xs sm:text-sm font-bold shadow-sm whitespace-nowrap flex items-center justify-center"
                        >
                          Buy Now
                        </Button>
                      </div>
                    </div>

                    {/* SHARE + DELETE */}
                    <div className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 flex flex-row gap-1">
                      <button
                        className="p-1.5 rounded-full text-gray-500 hover:text-[#0F766E] hover:bg-teal-50 transition-colors"
                        title="Share"
                      >
                        <Share2 size={16} />
                      </button>
                      <button
                        onClick={() => removeFromWishlist(item.id)}
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
              <div className="border-t pt-3 sm:pt-4 flex justify-between items-center">
                <span className="text-base sm:text-lg font-semibold">Payable</span>
                <span className="text-xl sm:text-2xl font-bold text-[#0F766E]">₹{totalValue}</span>
              </div>
              <Button
                onClick={() => void handleMoveAllToCart()}
                disabled={movingAll || inStockCount === 0}
                className="w-full bg-[#0F766E] hover:bg-[#0C5D53] text-white py-3 sm:py-4 rounded-full font-semibold text-sm sm:text-base transition-colors gap-2 disabled:opacity-50"
              >
                <ShoppingBag className="w-4 h-4" />
                {movingAll ? "Moving…" : "Move All to Cart"}
              </Button>
              <Link to="/dashboard" className="block mt-4 sm:mt-6">
                <Button
                  variant="outline"
                  className="w-full border-gray-300 hover:bg-gray-50 text-gray-700 rounded-full py-3 sm:py-4 font-medium text-sm sm:text-base"
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
                  <ShieldCheck size={14} className="text-[#0F766E]" />
                  Safe Payments
                </div>
                <div className="bg-[#FAF9F7] rounded-lg sm:rounded-xl py-2 sm:py-3 flex flex-col items-center gap-1 text-xs font-medium text-gray-700">
                  <Award size={14} className="text-amber-500" />
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
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">You May Also Like</h2>
              <Link
                to="/"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 text-gray-900 hover:bg-[#0F766E] hover:text-white transition-all duration-300 shrink-0"
              >
                <ArrowRight className="w-6 h-6" />
              </Link>
            </div>
          </div>
          <Carousel opts={{ loop: false, align: "start" }} className="w-full">
            <CarouselContent className="-ml-3 sm:-ml-4 flex-wrap sm:flex-nowrap">
              {recommendedProducts.map((p, index) => (
                <CarouselItem
                  key={p.id}
                  className={`pl-3 sm:pl-4 basis-1/2 sm:basis-[45%] md:basis-[32%] lg:basis-[20%] xl:basis-[20%] ${index === 4 ? "hidden md:block" : ""}`}
                >
                  <div className="group bg-white p-2 md:p-1.5 rounded-2xl shadow-sm border border-gray-200 hover:shadow-lg hover:-translate-y-0.5 transition-all h-full">
                    <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-[4/5] mb-2 md:mb-1.5">
                      <img
                        src={p.image}
                        alt={p.title}
                        loading="lazy"
                        onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                      />
                      <button
                        onClick={() => void addToWishlist(p.slug, p.sku)}
                        className="absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-600 hover:text-[#0F766E] hover:bg-white transition-all shadow-sm"
                        title={isWishlisted(p.slug, p.sku) ? "Already in wishlist" : "Add to wishlist"}
                      >
                        <Heart
                          className="w-3.5 h-3.5"
                          fill={isWishlisted(p.slug, p.sku) ? "currentColor" : "none"}
                        />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                        <Link
                          to={`/collections/${p.categorySlug}/product/${p.slug}`}
                          className="w-full py-1.5 bg-white/90 backdrop-blur text-gray-900 rounded-lg font-medium text-[10px] md:text-xs hover:bg-[#0F766E] hover:text-white transition-colors shadow-sm block text-center"
                        >
                          View Details
                        </Link>
                      </div>
                    </div>
                    <div className="px-1 pb-0.5 flex justify-between items-start gap-2">
                      <h3 className="text-xs md:text-sm font-medium text-gray-900 leading-snug line-clamp-2">{p.title}</h3>
                      <p className="text-xs font-semibold text-[#0F766E] shrink-0">₹{p.price}</p>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default WishlistPage;
