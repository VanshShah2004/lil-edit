import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart,
  ShoppingBag,
  Trash2,
  Share2,
  ChevronRight,
  ArrowRight,
  Info,
  Star,
  Plus,
  Minus
} from "lucide-react";
import { FaTrashAlt } from "react-icons/fa";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

// Mock Images - using existing assets from the project
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
    discount: "15% OFF",
    image: img1,
    secondaryImage: img2,
    sizes: ["2-3Y", "4-5Y"],
    inStock: true,
    lowStock: true,
    addedDate: "2024-05-01",
    category: "Ethnic Wear"
  },
  {
    id: "w2",
    name: "Floral Ruffle Party Dress",
    brand: "Petit Bloom",
    price: 3200,
    originalPrice: 3200,
    discount: null,
    image: img3,
    secondaryImage: img4,
    sizes: ["12-18M", "18-24M", "2-3Y"],
    inStock: true,
    lowStock: false,
    addedDate: "2024-05-05",
    category: "Dresses"
  },
  {
    id: "w3",
    name: "Classic Linen Shirt & Shorts Set",
    brand: "The Lil Edit Co.",
    price: 2800,
    originalPrice: 3500,
    discount: "20% OFF",
    image: img5,
    secondaryImage: img6,
    sizes: ["3-4Y"],
    inStock: true,
    lowStock: true,
    addedDate: "2024-05-07",
    category: "Casuals"
  },
  {
    id: "w4",
    name: "Velvet Bow Headband",
    brand: "Lil Accessories",
    price: 850,
    originalPrice: 1200,
    discount: "Price Dropped",
    image: img6,
    secondaryImage: img1,
    sizes: ["One Size"],
    inStock: true,
    lowStock: false,
    addedDate: "2024-05-08",
    category: "Accessories"
  }
];

const recentlyViewedMock = [
  { id: "rv1", name: "Glitter Party Shoes", price: 1800, image: img2 },
  { id: "rv2", name: "Cotton Candy Romper", price: 1500, image: img4 },
  { id: "rv3", name: "Sunray Straw Hat", price: 950, image: img1 },
  { id: "rv4", name: "Denim Overall Set", price: 2400, image: img3 },
  { id: "rv5", name: "Tulle Fairy Skirt", price: 1200, image: img5 },
];

const WishlistPage = () => {
  const [items, setItems] = useState(wishlistItemsMock);
  const [filter, setFilter] = useState("all");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const filteredItems = items.filter(item => {
    if (filter === "all") return true;
    if (filter === "available") return item.inStock;
    if (filter === "pricedrop") return item.discount && item.discount.toLowerCase().includes("drop");
    return true;
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] flex flex-col font-body selection:bg-primary/20 selection:text-primary">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-16 pb-12 overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-accent/30 rounded-full blur-3xl opacity-50" />
          <div className="absolute top-1/2 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-3xl opacity-40" />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-secondary/20 rounded-full blur-3xl opacity-30" />

          {/* Fashion-style line accents */}
          <div className="absolute top-20 right-[10%] w-px h-32 bg-primary/20 hidden lg:block" />
          <div className="absolute top-40 right-[8%] w-12 h-px bg-primary/20 hidden lg:block" />
        </div>

        <div className="page-container relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <span className="inline-block px-3 py-1 mb-4 text-[10px] uppercase tracking-[0.2em] text-primary font-semibold bg-primary/5 rounded-full border border-primary/10">
              Personal Collection
            </span>
            <h1 className="text-4xl md:text-6xl font-display text-foreground mb-4">
              Your Wishlist
            </h1>
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <p className="text-lg md:text-xl font-light italic">
                Saved styles for your little one
              </p>
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-sm">
                {items.length}
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      <main className="page-container flex-1 pb-24">
        {items.length > 0 ? (
          <div className="flex flex-col lg:flex-row gap-12">
            {/* Wishlist Grid */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-8 border-b border-border/50 pb-4">
                <div className="flex gap-6">
                  <button
                    onClick={() => setFilter("all")}
                    className={`text-sm font-medium relative pb-4 transition-colors ${filter === "all" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    All Items
                    {filter === "all" && <motion.span layoutId="activeFilter" className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full" />}
                  </button>
                  <button
                    onClick={() => setFilter("available")}
                    className={`text-sm font-medium relative pb-4 transition-colors ${filter === "available" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Available Now
                    {filter === "available" && <motion.span layoutId="activeFilter" className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full" />}
                  </button>
                  <button
                    onClick={() => setFilter("pricedrop")}
                    className={`text-sm font-medium relative pb-4 transition-colors ${filter === "pricedrop" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Price Dropped
                    {filter === "pricedrop" && <motion.span layoutId="activeFilter" className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full" />}
                  </button>
                </div>

                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-2">
                  <Share2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Share Collection</span>
                </Button>
              </div>

              <motion.div
                className="space-y-6"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                key={filter}
              >
                <AnimatePresence mode="popLayout">
                  {filteredItems.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Card className="bg-white border border-gray-200 border-l-8 border-l-primary rounded-lg sm:rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 min-h-[120px] sm:min-h-[140px] md:min-h-[160px]">
                        <CardContent className="p-2.5 sm:p-3 md:p-4 flex flex-row gap-2.5 sm:gap-3 md:gap-4 h-full relative">
                          {/* IMAGE */}
                          <div className="w-20 sm:w-24 md:w-32 flex-shrink-0 relative group">
                            <div className="aspect-[3/4] sm:aspect-[3/4] md:aspect-[4/5] overflow-hidden rounded-lg sm:rounded-lg bg-gray-100">
                              <img
                                src={item.image}
                                alt={item.name}
                                loading="lazy"
                                className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                              />
                              <img 
                                src={item.secondaryImage} 
                                alt={`${item.name} alternate`}
                                className="absolute top-0 left-0 w-full h-full object-cover opacity-0 transition-all duration-500 group-hover:scale-105 group-hover:opacity-100"
                              />
                            </div>
                          </div>

                          {/* DETAILS */}
                          <div className="flex-1 flex flex-col min-w-0 justify-between py-0">
                            {/* Top Section - Title & Brand */}
                            <div className="pr-8 sm:pr-10 md:pr-12">
                              <h2 className="text-xs sm:text-sm md:text-base font-semibold text-gray-900 leading-tight line-clamp-2">
                                {item.name}
                              </h2>
                              <p className="text-xs md:text-sm text-primary mt-0.5 md:mt-1 font-medium line-clamp-1">
                                {item.brand} • {item.category}
                              </p>
                            </div>

                            {/* Tags/Badges */}
                            <div className="flex flex-wrap gap-1.5 mt-1 sm:mt-1.5">
                              {item.discount && (
                                <Badge
                                  variant="secondary"
                                  className="bg-gradient-to-r from-primary/10 to-accent/10 text-primary border border-primary/10 text-[10px] sm:text-[11px] px-2 py-0.5 whitespace-nowrap rounded-md font-medium shadow-sm"
                                >
                                  {item.discount}
                                </Badge>
                              )}
                              <Badge
                                variant="secondary"
                                className="bg-secondary text-secondary-foreground border border-border/50 text-[10px] sm:text-[11px] px-2 py-0.5 whitespace-nowrap rounded-md font-medium shadow-sm"
                              >
                                {item.inStock ? "Available" : "Out of Stock"}
                              </Badge>
                            </div>

                            {/* Bottom Section - Size, CTA, Price */}
                            <div className="flex flex-col mt-auto pt-1">
                              {/* Color & Size style layout */}
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                <span className="text-xs md:text-sm font-medium px-2 md:px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded whitespace-nowrap">
                                  Sizes: {item.sizes.join(", ")}
                                </span>
                              </div>

                              {/* Action & Price Row */}
                              <div className="flex items-center justify-between gap-1.5 sm:gap-2 mt-1">
                                <div className="flex items-center gap-2">
                                  <Button 
                                    size="sm" 
                                    className="h-8 sm:h-9 px-3 sm:px-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full text-[10px] sm:text-xs font-bold gap-1.5 shadow-sm"
                                  >
                                    <ShoppingBag className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Move to Cart</span>
                                    <span className="sm:hidden">Add</span>
                                  </Button>
                                </div>

                                {/* Price */}
                                <div className="flex flex-col items-end">
                                  <span className="text-sm sm:text-base md:text-lg font-bold text-primary">
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
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            </div>

            {/* Sticky Summary & Conversion Enhancements */}
            <aside className="w-full lg:w-80 space-y-8">
              <div className="sticky top-28 space-y-8">
                {/* Wishlist Summary Card */}
                <div className="bg-white rounded-3xl p-6 shadow-xl border border-border/40 relative overflow-hidden group">
                  <div className="absolute -top-12 -right-12 w-24 h-24 bg-primary/5 rounded-full group-hover:scale-150 transition-transform duration-700" />

                  <h3 className="text-xl font-display mb-6 flex items-center gap-2">
                    Collection Insight
                    <Star className="w-4 h-4 text-primary fill-primary" />
                  </h3>

                  <div className="space-y-4 mb-8">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Value</span>
                      <span className="font-semibold">₹{items.reduce((acc, item) => acc + item.price, 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Items on Sale</span>
                      <span className="text-primary font-semibold">{items.filter(i => i.discount).length} Items</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">In Stock</span>
                      <span className="text-green-600 font-semibold">{items.filter(i => i.inStock).length} Available</span>
                    </div>
                  </div>

                  <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-2xl py-7 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 group/btn">
                    Add All to Cart
                    <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                  </Button>

                  <div className="mt-6 flex items-center justify-center gap-4 border-t border-border/50 pt-6">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-all">
                            <Share2 className="w-4 h-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Share Wishlist</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <button className="flex-1 text-xs font-semibold text-primary hover:underline underline-offset-4">
                      Clear Wishlist
                    </button>
                  </div>
                </div>

                {/* Smart Feature: Price Dropped Alert */}
                <div className="bg-gradient-to-br from-accent/20 to-primary/5 rounded-3xl p-6 border border-accent/20">
                  <div className="flex gap-4 items-start mb-4">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-primary shadow-sm">
                      <Heart className="w-5 h-5 fill-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">Price Drop Alert</h4>
                      <p className="text-xs text-muted-foreground">Items in your wishlist just got cheaper!</p>
                    </div>
                  </div>
                  <Button variant="link" className="p-0 h-auto text-primary text-xs font-bold gap-1 group">
                    Shop Price Drops
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>

                {/* Back in Stock */}
                <div className="bg-cream rounded-3xl p-6 border border-latte/30">
                  <h4 className="font-display text-lg mb-3">Recently Restocked</h4>
                  <div className="space-y-3">
                    <div className="flex gap-3 items-center">
                      <div className="w-12 h-12 rounded-xl bg-white overflow-hidden shrink-0">
                        <img src={img4} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">Linen Party Suit</p>
                        <p className="text-[10px] text-muted-foreground">Limited Quantity</p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full bg-white">
                        <ShoppingBag className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        ) : (
          /* Empty Wishlist State */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="relative mb-12">
              <div className="w-48 h-48 md:w-64 md:h-64 bg-cream rounded-full absolute -top-4 -left-4 animate-pulse" />
              <div className="relative z-10 w-48 h-48 md:w-64 md:h-64 flex items-center justify-center">
                <div className="relative">
                  <Heart className="w-32 h-32 md:w-48 md:h-48 text-primary/20" strokeWidth={1} />
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5, type: "spring" }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <ShoppingBag className="w-16 h-16 md:w-24 md:h-24 text-primary" strokeWidth={1.5} />
                  </motion.div>
                </div>
              </div>
            </div>
            <h2 className="text-3xl md:text-4xl font-display text-foreground mb-4">
              Your wishlist is waiting for adorable finds.
            </h2>
            <p className="text-muted-foreground text-lg md:text-xl max-w-md mx-auto mb-10 font-light italic">
              Explore our curated collections and save styles you love for later.
            </p>
            <Link to="/dashboard">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-2xl px-12 py-7 text-lg shadow-xl shadow-primary/20">
                Explore Collection
              </Button>
            </Link>
          </motion.div>
        )}

        {/* Recently Viewed Carousel */}
        <section className="mt-32">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-3xl font-display mb-2">Recently Viewed</h2>
              <p className="text-muted-foreground italic">Styles you recently looked at</p>
            </div>
            <div className="flex gap-2">
              {/* Carousel controls handled by component */}
            </div>
          </div>

          <Carousel
            opts={{
              align: "start",
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-6">
              {recentlyViewedMock.map((product) => (
                <CarouselItem key={product.id} className="pl-6 basis-full sm:basis-1/2 md:basis-1/3 lg:basis-1/4 xl:basis-1/5">
                  <div className="group bg-white rounded-3xl overflow-hidden border border-border/30 hover:border-primary/20 transition-all duration-500 shadow-sm hover:shadow-xl">
                    <div className="aspect-[4/5] relative overflow-hidden">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                      <button className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 backdrop-blur-md flex items-center justify-center text-muted-foreground hover:text-primary transition-colors">
                        <Heart className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-4">
                      <h4 className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">{product.name}</h4>
                      <p className="text-primary font-bold mt-1">₹{product.price}</p>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <div className="hidden md:block">
              <CarouselPrevious className="-left-12 border-border/50" />
              <CarouselNext className="-right-12 border-border/50" />
            </div>
          </Carousel>
        </section>

        {/* Complete the Look Suggestion */}
        <section className="mt-32 bg-secondary/30 rounded-[3rem] p-8 md:p-16 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1/3 h-full bg-accent/10 -skew-x-12 transform translate-x-1/2" />

          <div className="relative z-10 flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1">
              <span className="text-[10px] uppercase tracking-widest text-primary font-bold mb-4 block">Curated Just For You</span>
              <h2 className="text-4xl md:text-5xl font-display mb-6 leading-tight">Complete the look with matching accessories</h2>
              <p className="text-muted-foreground text-lg mb-8 max-w-lg font-light">Our stylists have handpicked accessories that perfectly complement the items in your wishlist.</p>
              <Button variant="outline" className="rounded-2xl px-8 py-6 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-all">
                View Recommendations
              </Button>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="space-y-4 pt-8">
                <div className="aspect-square rounded-2xl bg-white shadow-lg overflow-hidden p-2 transform -rotate-3 hover:rotate-0 transition-transform">
                  <img src={img2} className="w-full h-full object-cover rounded-xl" />
                </div>
                <div className="aspect-[3/4] rounded-2xl bg-white shadow-lg overflow-hidden p-2 transform rotate-2 hover:rotate-0 transition-transform">
                  <img src={img6} className="w-full h-full object-cover rounded-xl" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="aspect-[3/4] rounded-2xl bg-white shadow-lg overflow-hidden p-2 transform rotate-3 hover:rotate-0 transition-transform">
                  <img src={img4} className="w-full h-full object-cover rounded-xl" />
                </div>
                <div className="aspect-square rounded-2xl bg-white shadow-lg overflow-hidden p-2 transform -rotate-2 hover:rotate-0 transition-transform">
                  <img src={img5} className="w-full h-full object-cover rounded-xl" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default WishlistPage;
