import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { ChevronRight, Heart, SearchX } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { buildPdpPath } from "@/lib/pdpUrl";
import { searchProducts, type SearchProduct } from "@/services/searchService";

export default function SearchResults() {
  const [params] = useSearchParams();
  const query = (params.get("q") ?? "").trim();

  const { user } = useAuth();
  const navigate = useNavigate();
  const { isWishlisted, addToWishlist, removeFromWishlist, wishlistItems } = useWishlist();

  const [products, setProducts] = useState<SearchProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query) {
      console.log("[SearchResults] empty query — nothing to fetch");
      setProducts([]);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    console.log("[SearchResults] searching for:", query);
    setLoading(true);

    searchProducts(query, abortRef.current.signal)
      .then((res) => {
        console.log("[SearchResults] received", res.products.length, "results for:", query);
        setProducts(res.products);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") {
          console.log("[SearchResults] request aborted for:", query);
          return;
        }
        console.error("[SearchResults] search failed:", err);
        setProducts([]);
      })
      .finally(() => setLoading(false));

    return () => abortRef.current?.abort();
  }, [query]);

  const toggleWishlist = (p: SearchProduct) => {
    const existing = wishlistItems.find((i) => i.slug === p.slug && i.sku === p.sku);
    if (existing) void removeFromWishlist(existing.id);
    else void addToWishlist(p.slug, p.sku);
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden w-full flex flex-col">
      {user ? <UserNavbar /> : <Navbar />}

      {/* BREADCRUMB */}
      <div className="w-full px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto flex items-center text-xs sm:text-sm text-gray-600 gap-1.5 sm:gap-2">
          <Link to="/" className="hover:text-gray-900 transition-colors">
            Home
          </Link>
          <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="text-gray-900 font-medium">Search</span>
        </div>
      </div>

      <main className="flex-1 w-full px-4 sm:px-6 md:px-8 pb-16">
        <div className="max-w-7xl mx-auto">
          {/* HEADING */}
          <div className="mb-6 sm:mb-8">
            <h1 className="font-display text-2xl sm:text-3xl font-black text-foreground">
              {query ? (
                <>Results for <span className="text-[#0F766E]">"{query}"</span></>
              ) : (
                "Search"
              )}
            </h1>
            {!loading && query && (
              <p className="mt-1 text-sm text-gray-600">
                {products.length} {products.length === 1 ? "product" : "products"} found
              </p>
            )}
          </div>

          {/* LOADING */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="bg-card p-2 rounded-2xl border border-border animate-pulse">
                  <div className="aspect-[3/4] md:aspect-[4/5] rounded-xl bg-secondary mb-2" />
                  <div className="h-3.5 bg-secondary rounded w-3/4 mb-1.5" />
                  <div className="h-3 bg-secondary rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : !query ? (
            <EmptyState
              title="What are you looking for?"
              subtitle="Use the search bar to find products, categories, and more."
            />
          ) : products.length === 0 ? (
            <EmptyState
              title={`No results for "${query}"`}
              subtitle="Try a different spelling or a broader term."
              onBrowse={() => navigate("/collections")}
            />
          ) : (
            /* RESULTS GRID */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {products.map((p) => {
                const wishlisted = isWishlisted(p.slug, p.sku);
                const onSale = p.originalPrice > p.price;
                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(buildPdpPath(p.categorySlug, p.slug, p.sku))}
                    className="group bg-card p-2 md:p-1.5 rounded-2xl shadow-sm border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
                  >
                    <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-[4/5] mb-2 md:mb-1.5 bg-secondary">
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full bg-secondary" />
                      )}
                      {p.badges[0] && (
                        <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/90 text-[#0F766E] shadow-sm">
                          {p.badges[0]}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleWishlist(p); }}
                        className="absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-muted-foreground hover:text-primary transition-all"
                        aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
                      >
                        <Heart className="w-3.5 h-3.5" fill={wishlisted ? "currentColor" : "none"} />
                      </button>
                    </div>
                    <div className="px-1 pb-0.5">
                      <h3 className="font-display text-xs md:text-sm font-medium text-foreground leading-snug line-clamp-2">
                        {p.title}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="font-body text-xs font-semibold text-[#0F766E]">₹{p.price}</p>
                        {onSale && (
                          <p className="font-body text-[10px] text-muted-foreground line-through">₹{p.originalPrice}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

function EmptyState({
  title,
  subtitle,
  onBrowse,
}: {
  title: string;
  subtitle: string;
  onBrowse?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 sm:py-28">
      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-5">
        <SearchX className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-lg sm:text-xl font-bold text-foreground mb-1.5">{title}</h2>
      <p className="text-sm text-gray-600 max-w-sm">{subtitle}</p>
      {onBrowse && (
        <button
          onClick={onBrowse}
          className="mt-6 px-6 h-11 rounded-full bg-gray-900 hover:bg-gray-800 text-white font-semibold text-sm transition-colors"
        >
          Browse Collections
        </button>
      )}
    </div>
  );
}
