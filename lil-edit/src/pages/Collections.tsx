import { Heart, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/layout/Navbar";
import RouteFallback from "@/components/RouteFallback";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import FeaturedCollectionsGrid from "@/components/collections/FeaturedCollectionsGrid";
import Footer from "@/components/layout/Footer";

import img1 from "@/assets/searchbar-frequent_searches/le-1.png";
import img2 from "@/assets/searchbar-frequent_searches/le-2.png";
import img3 from "@/assets/searchbar-frequent_searches/le-3.png";
import img4 from "@/assets/searchbar-frequent_searches/le-4.png";
import img5 from "@/assets/searchbar-frequent_searches/le-5.png";
import img6 from "@/assets/searchbar-frequent_searches/le-6.png";

const occasionCategories = [
  { id: "occ-1", name: "Birthday Party", gradient: "from-pink-200 to-rose-200", icon: "🎉" },
  { id: "occ-2", name: "Casual Wear", gradient: "from-blue-200 to-cyan-200", icon: "👟" },
  { id: "occ-3", name: "Festive Fits", gradient: "from-purple-200 to-indigo-200", icon: "✨" },
  { id: "occ-4", name: "Vacation Looks", gradient: "from-yellow-200 to-orange-200", icon: "🌴" },
  { id: "occ-5", name: "Winter Cozy", gradient: "from-blue-100 to-slate-200", icon: "🧣" },
  { id: "occ-6", name: "Everyday Basics", gradient: "from-stone-200 to-slate-200", icon: "👕" },
];

const galleryImages = [
  { id: "gal-1", image: img1, caption: "Sunset Vibes", price: "3200" },
  { id: "gal-2", image: img2, caption: "City Style", price: "4100" },
  { id: "gal-3", image: img3, caption: "Nature Explorer Into the Space of the Universe", price: "2800" },
  { id: "gal-4", image: img4, caption: "Party Ready", price: "5500" },
  { id: "gal-5", image: img5, caption: "Cozy Comfort", price: "3600" },
  { id: "gal-6", image: img6, caption: "Trendsetter", price: "4800" },
  { id: "gal-7", image: img3, caption: "Summer Glow", price: "3900" },
  { id: "gal-8", image: img1, caption: "Mini Chic", price: "2600" },
];

export default function Collections() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return <RouteFallback />;
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden w-full">
      {user ? <UserNavbar /> : <Navbar />}

      {/* Navbar offset spacer */}
      <div className="pt-[var(--navbar-height)]" />

      {/* HERO SECTION */}
      <section className="relative w-full bg-gradient-to-br from-purple-100 via-pink-100 to-blue-100 overflow-hidden py-32 sm:py-32 md:py-40 min-h-[50vh] sm:min-h-[40vh] flex flex-col justify-center">
        <div className="absolute inset-0 opacity-20 sm:opacity-30">
          <div className="absolute top-4 sm:top-10 left-4 sm:left-10 w-32 sm:w-40 h-32 sm:h-40 bg-pink-300 rounded-full blur-3xl"></div>
          <div className="absolute bottom-4 sm:bottom-10 right-4 sm:right-10 w-40 sm:w-56 h-40 sm:h-56 bg-blue-300 rounded-full blur-3xl"></div>
        </div>

        <div className="relative flex flex-col items-center justify-center text-center px-4 sm:px-6 z-10">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-3 sm:mb-5 leading-tight max-w-4xl">
            Curated Collections
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-gray-700 mb-6 sm:mb-10 max-w-2xl px-2">
            For Every Little Personality — Fashion-Forward Pieces Designed for Comfort and Style
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto justify-center">
            <Button className="bg-gray-900 hover:bg-gray-800 text-white px-6 sm:px-8 h-11 sm:h-12 rounded-full font-semibold flex items-center justify-center gap-2 transition-colors duration-200">
              Shop New Arrivals
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              className="border-gray-900 text-gray-900 hover:bg-gray-100 px-6 sm:px-8 h-11 sm:h-12 rounded-full font-semibold transition-colors duration-200"
            >Explore
            </Button>
          </div>
        </div>
      </section>

      {/* MAIN CONTENT */}
      <main className="w-full py-6 sm:py-12 md:py-16">
        {/* FEATURED COLLECTIONS & SHOP BY OCCASION */}
        <div className="px-4 sm:px-8 md:px-12 lg:px-16">
          <div className="max-w-5xl mx-auto space-y-10 sm:space-y-12 md:space-y-16">
            {/* FEATURED COLLECTIONS GRID */}
            <FeaturedCollectionsGrid />

            {/* SHOP BY OCCASION */}
            <section>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-6 sm:mb-8">
                Shop by Occasion
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 md:gap-3 lg:gap-4">
                {occasionCategories.map((occasion) => (
                  <div
                    key={occasion.id}
                    className={`group relative overflow-hidden rounded-xl sm:rounded-2xl h-40 sm:h-48 md:h-56 lg:h-48 cursor-pointer bg-gradient-to-br ${occasion.gradient} shadow-md hover:shadow-lg transition-all duration-300`}
                  >
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3 sm:p-4 z-10">
                      <div className="text-4xl sm:text-5xl md:text-5xl lg:text-4xl mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                        {occasion.icon}
                      </div>
                      <h3 className="text-sm sm:text-base md:text-base lg:text-sm font-bold text-gray-900 line-clamp-2">
                        {occasion.name}
                      </h3>
                    </div>

                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-all duration-300" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* SEASON HIGHLIGHT BANNER - FULL WIDTH */}
        <section className="w-full py-12 sm:py-14 md:py-16">
          <div className="relative overflow-hidden bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 py-32 sm:py-36 md:py-40 px-4 sm:px-8 md:px-12 lg:px-16 flex items-center justify-center text-center">
            <div className="absolute inset-0 opacity-15 sm:opacity-20">
              <div className="absolute top-0 left-0 w-64 sm:w-96 h-64 sm:h-96 bg-white rounded-full blur-3xl"></div>
            </div>

            <div className="relative z-10 max-w-3xl">
              <span className="inline-block text-xs sm:text-sm font-bold text-gray-700 mb-2 sm:mb-3 md:mb-4 bg-white/70 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full">
                Limited Edition
              </span>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-2 sm:mb-3 md:mb-4">
                Spring/Summer '26
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-gray-800 mb-5 sm:mb-6 md:mb-8">
                Designed for comfort, crafted for style. Discover our latest collection.
              </p>
              <Button className="bg-gray-900 hover:bg-gray-800 text-white px-6 sm:px-8 h-10 sm:h-11 md:h-12 rounded-full font-semibold text-sm sm:text-base transition-colors duration-200">
                Shop Now
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </section>

        {/* STYLED BY OUR COMMUNITY & NEWSLETTER */}
        <div className="px-4 sm:px-8 md:px-12 lg:px-16">
          <div className="max-w-5xl mx-auto space-y-10 sm:space-y-12 md:space-y-16">
            {/* STYLED BY OUR COMMUNITY */}
            <section>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-6 sm:mb-8">
                Styled by Our Community
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {galleryImages.map((item) => (
                  <div
                    key={item.id}
                    className="group bg-card p-2 md:p-1.5 rounded-2xl shadow-sm border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all"
                  >
                    <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-[4/5] mb-2 md:mb-1.5">
                      <img
                        src={item.image}
                        alt={item.caption}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <button className="absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-muted-foreground hover:text-primary transition-all">
                        <Heart className="w-3.5 h-3.5" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                        <button className="w-full py-1.5 bg-white/90 backdrop-blur text-foreground rounded-lg font-medium text-[10px] md:text-xs hover:bg-[#0F766E] hover:text-white transition-colors shadow-sm">
                          Add to Cart
                        </button>
                      </div>
                    </div>
                    <div className="px-1 pb-0.5 flex justify-between items-start gap-2">
                      <h3 className="font-display text-xs md:text-sm font-medium text-foreground leading-snug">{item.caption}</h3>
                      <p className="font-body text-xs font-semibold text-[#0F766E] shrink-0">₹{item.price}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* NEWSLETTER CTA */}
            <section>
              <div className="relative overflow-hidden rounded-xl sm:rounded-2xl md:rounded-3xl bg-gradient-to-br from-gray-900 to-gray-800 px-4 sm:px-8 md:px-12 lg:px-16 py-10 sm:py-14 md:py-16 text-center text-white">
                <div className="absolute top-0 right-0 w-64 sm:w-96 h-64 sm:h-96 bg-purple-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="relative z-10">
                  <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-2 sm:mb-3 md:mb-4">
                    Stay in Style
                  </h2>
                  <p className="text-xs sm:text-sm md:text-base opacity-90 mb-5 sm:mb-6 md:mb-8 max-w-2xl mx-auto">
                    Get exclusive access to new collections, special offers, and style tips delivered to your inbox.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 max-w-md mx-auto">
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      className="px-4 py-2.5 sm:py-3 text-xs sm:text-sm rounded-lg sm:rounded-full bg-white/20 border border-white/30 text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white transition-all duration-200"
                    />
                    <Button className="bg-white text-gray-900 hover:bg-gray-100 px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-full font-semibold text-xs sm:text-sm flex-shrink-0 transition-colors duration-200">
                      Subscribe
                    </Button>
                  </div>

                  <p className="text-[10px] sm:text-xs opacity-75 mt-3 sm:mt-4">
                    We respect your privacy. Unsubscribe anytime.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div >
  );
}
