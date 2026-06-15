import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { ChevronRight, Heart, SearchX, Search, SlidersHorizontal, X } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { buildPdpPath } from "@/lib/pdpUrl";
import { searchProducts, type SearchProduct } from "@/services/searchService";

const POPULAR_TERMS = ["Lehenga", "Dress", "Girls", "Boys", "Festive", "Co-ord Set"];

type SortKey = "relevance" | "price-asc" | "price-desc" | "name-asc";
const SORT_LABELS: Record<SortKey, string> = {
  relevance: "Relevance",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
  "name-asc": "Name: A to Z",
};

interface PriceBucket { id: string; label: string; test: (p: SearchProduct) => boolean; }
const PRICE_BUCKETS: PriceBucket[] = [
  { id: "lt1500",    label: "Under ₹1,500",    test: (p) => p.price < 1500 },
  { id: "1500-3000", label: "₹1,500 – ₹3,000", test: (p) => p.price >= 1500 && p.price < 3000 },
  { id: "3000-5000", label: "₹3,000 – ₹5,000", test: (p) => p.price >= 3000 && p.price < 5000 },
  { id: "gt5000",    label: "Over ₹5,000",     test: (p) => p.price >= 5000 },
];

export default function SearchResults() {
  const [params] = useSearchParams();
  const query = (params.get("q") ?? "").trim();

  const { user } = useAuth();
  const navigate = useNavigate();

  // Store results tagged with the query they belong to. `loading`/`products` are
  // derived from this, so the fetch effect only calls setState inside its async
  // callbacks (never synchronously in the effect body).
  const [result, setResult] = useState<{ q: string; products: SearchProduct[] }>({ q: "", products: [] });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { window.scrollTo(0, 0); }, [query]);

  useEffect(() => {
    if (!query) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    console.log("[SearchResults] searching for:", query);

    searchProducts(query, ctrl.signal)
      .then((res) => {
        console.log("[SearchResults] received", res.products.length, "results for:", query);
        setResult({ q: query, products: res.products });
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") {
          console.log("[SearchResults] request aborted for:", query);
          return;
        }
        console.error("[SearchResults] search failed:", err);
        setResult({ q: query, products: [] });
      });

    return () => ctrl.abort();
  }, [query]);

  // Loading whenever there's a query we don't yet have settled results for.
  const loading = !!query && result.q !== query;
  const products = result.q === query ? result.products : [];

  const goSearch = (term: string) => {
    const t = term.trim();
    if (t) navigate(`/search?q=${encodeURIComponent(t)}`);
  };

  return (
    <div className="min-h-screen flex flex-col font-body selection:bg-primary/20">
      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1 pt-[150px] md:pt-[112px] pb-16">
        <div className="page-container">
          {/* BREADCRUMB */}
          <nav className="flex items-center text-xs sm:text-sm text-muted-foreground gap-1.5 sm:gap-2 mb-6">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-foreground font-medium">Search</span>
          </nav>

          {/* CENTERED, PRE-FILLED SEARCH BAR (remounts per query to reset its draft) */}
          <SearchField key={query} initial={query} onSubmit={goSearch} />

          {/* CONTEXT LINE */}
          <div className="text-center mt-4 mb-7 sm:mb-8">
            <p className="text-xs sm:text-sm font-black tracking-[0.2em] uppercase text-[#0F766E] mb-1">
              Search Results
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-black text-foreground leading-tight">
              {query ? (
                <>Showing results for <span className="text-[#0F766E]">“{query}”</span></>
              ) : (
                "Search the edit"
              )}
            </h1>
          </div>

          {/* BODY */}
          {loading ? (
            <ResultsSkeleton />
          ) : !query ? (
            <EmptyState
              title="What are you looking for?"
              subtitle="Search for products, categories, fabrics, colours and more."
              onSearch={goSearch}
            />
          ) : products.length === 0 ? (
            <EmptyState
              title={`No results for “${query}”`}
              subtitle="Try a different spelling or a broader term — or explore one of these."
              onSearch={goSearch}
              onBrowse={() => navigate("/collections")}
            />
          ) : (
            /* keyed by query → sort/filter state resets on a new search */
            <ResultsView key={query} products={products} />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

// ─── Centered search field ──────────────────────────────────────────────────
function SearchField({ initial, onSubmit }: { initial: string; onSubmit: (term: string) => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(draft); }}
      className="mx-auto w-full max-w-2xl"
    >
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-[#0F766E] transition-colors">
          <Search className="w-5 h-5" />
        </div>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search products, categories, or trends..."
          className="w-full bg-card border border-border rounded-full py-3.5 pl-12 pr-32 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]/30 focus:border-[#0F766E] transition-all placeholder:text-muted-foreground/70"
        />
        <div className="absolute inset-y-0 right-1.5 flex items-center gap-1">
          {draft && (
            <button
              type="button"
              onClick={() => setDraft("")}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="submit"
            className="px-5 h-10 rounded-full bg-[#0F766E] hover:bg-[#0c5f58] text-white font-semibold text-sm transition-colors"
          >
            Search
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Results + toolbar + filters ────────────────────────────────────────────
function ResultsView({ products }: { products: SearchProduct[] }) {
  const navigate = useNavigate();
  const { isWishlisted, addToWishlist, removeFromWishlist, wishlistItems } = useWishlist();

  const [sort, setSort] = useState<SortKey>("relevance");
  const [catSel, setCatSel] = useState<Set<string>>(new Set());
  const [badgeSel, setBadgeSel] = useState<Set<string>>(new Set());
  const [priceBucket, setPriceBucket] = useState<string | null>(null);
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const categories = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) if (p.categorySlug) m.set(p.categorySlug, p.category);
    return [...m.entries()].map(([slug, label]) => ({ slug, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);

  const badges = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) for (const b of p.badges) if (b) s.add(b);
    return [...s].sort();
  }, [products]);

  const priceBuckets = useMemo(
    () => PRICE_BUCKETS.filter((b) => products.some((p) => b.test(p))),
    [products],
  );

  const hasSale = useMemo(() => products.some((p) => p.originalPrice > p.price), [products]);

  const visible = useMemo(() => {
    const bucket = priceBucket ? PRICE_BUCKETS.find((b) => b.id === priceBucket) : null;
    const list = products.filter((p) => {
      if (catSel.size && !catSel.has(p.categorySlug)) return false;
      if (badgeSel.size && !p.badges.some((b) => badgeSel.has(b))) return false;
      if (onSaleOnly && !(p.originalPrice > p.price)) return false;
      if (bucket && !bucket.test(p)) return false;
      return true;
    });
    switch (sort) {
      case "price-asc":  return [...list].sort((a, b) => a.price - b.price);
      case "price-desc": return [...list].sort((a, b) => b.price - a.price);
      case "name-asc":   return [...list].sort((a, b) => a.title.localeCompare(b.title));
      default:           return list; // relevance = backend order
    }
  }, [products, catSel, badgeSel, onSaleOnly, priceBucket, sort]);

  const activeCount = catSel.size + badgeSel.size + (priceBucket ? 1 : 0) + (onSaleOnly ? 1 : 0);

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, val: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val); else next.add(val);
      return next;
    });

  const clearFilters = () => {
    setCatSel(new Set()); setBadgeSel(new Set()); setPriceBucket(null); setOnSaleOnly(false);
  };

  const toggleWishlist = (p: SearchProduct) => {
    const existing = wishlistItems.find((i) => i.slug === p.slug && i.sku === p.sku);
    if (existing) void removeFromWishlist(existing.id);
    else void addToWishlist(p.slug, p.sku);
  };

  return (
    <>
      {/* TOOLBAR: count · filters · sort */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <p className="text-sm text-muted-foreground">
          {visible.length === products.length
            ? `${products.length} ${products.length === 1 ? "product" : "products"}`
            : `${visible.length} of ${products.length} products`}
        </p>

        <div className="flex items-center gap-2">
          {/* FILTERS */}
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <button className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-border bg-card text-sm font-medium text-foreground hover:border-[#0F766E]/40 hover:text-[#0F766E] transition-colors">
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                {activeCount > 0 && (
                  <span className="ml-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-[#0F766E] text-white text-xs font-bold">
                    {activeCount}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
              <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
                <SheetTitle className="font-display text-xl font-black">Filters</SheetTitle>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
                {categories.length > 0 && (
                  <FilterGroup label="Category">
                    <div className="space-y-2.5">
                      {categories.map((c) => (
                        <label key={c.slug} className="flex items-center gap-2.5 cursor-pointer group">
                          <Checkbox checked={catSel.has(c.slug)} onCheckedChange={() => toggleSet(setCatSel, c.slug)} />
                          <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">{c.label}</span>
                        </label>
                      ))}
                    </div>
                  </FilterGroup>
                )}

                {priceBuckets.length > 0 && (
                  <FilterGroup label="Price">
                    <div className="flex flex-wrap gap-2">
                      {priceBuckets.map((b) => {
                        const active = priceBucket === b.id;
                        return (
                          <button
                            key={b.id}
                            onClick={() => setPriceBucket(active ? null : b.id)}
                            className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                              active
                                ? "bg-[#0F766E] border-[#0F766E] text-white"
                                : "border-border bg-card text-foreground/80 hover:border-[#0F766E]/40 hover:text-[#0F766E]"
                            }`}
                          >
                            {b.label}
                          </button>
                        );
                      })}
                    </div>
                  </FilterGroup>
                )}

                {badges.length > 0 && (
                  <FilterGroup label="Collections">
                    <div className="flex flex-wrap gap-2">
                      {badges.map((b) => {
                        const active = badgeSel.has(b);
                        return (
                          <button
                            key={b}
                            onClick={() => toggleSet(setBadgeSel, b)}
                            className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                              active
                                ? "bg-[#0F766E] border-[#0F766E] text-white"
                                : "border-border bg-card text-foreground/80 hover:border-[#0F766E]/40 hover:text-[#0F766E]"
                            }`}
                          >
                            {b}
                          </button>
                        );
                      })}
                    </div>
                  </FilterGroup>
                )}

                {hasSale && (
                  <FilterGroup label="Offers">
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <Checkbox checked={onSaleOnly} onCheckedChange={(v) => setOnSaleOnly(!!v)} />
                      <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">On sale only</span>
                    </label>
                  </FilterGroup>
                )}
              </div>

              <SheetFooter className="px-6 py-4 border-t border-border flex-row gap-3">
                <button
                  onClick={clearFilters}
                  disabled={activeCount === 0}
                  className="flex-1 h-11 rounded-full border border-border text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                >
                  Clear all
                </button>
                <SheetClose asChild>
                  <button className="flex-1 h-11 rounded-full bg-[#0F766E] hover:bg-[#0c5f58] text-white text-sm font-semibold transition-colors">
                    Show {visible.length} {visible.length === 1 ? "result" : "results"}
                  </button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          {/* SORT */}
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-10 w-[170px] bg-card rounded-md">
              <span className="text-muted-foreground mr-1 hidden sm:inline">Sort:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ACTIVE FILTER CHIPS */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {[...catSel].map((slug) => (
            <ActiveChip key={`c-${slug}`} label={categories.find((c) => c.slug === slug)?.label ?? slug} onRemove={() => toggleSet(setCatSel, slug)} />
          ))}
          {priceBucket && (
            <ActiveChip label={PRICE_BUCKETS.find((b) => b.id === priceBucket)?.label ?? "Price"} onRemove={() => setPriceBucket(null)} />
          )}
          {[...badgeSel].map((b) => (
            <ActiveChip key={`b-${b}`} label={b} onRemove={() => toggleSet(setBadgeSel, b)} />
          ))}
          {onSaleOnly && <ActiveChip label="On sale" onRemove={() => setOnSaleOnly(false)} />}
          <button onClick={clearFilters} className="text-xs font-semibold text-[#0F766E] hover:underline ml-1">
            Clear all
          </button>
        </div>
      )}

      {/* GRID */}
      {visible.length === 0 ? (
        <div className="text-center py-16 sm:py-20">
          <p className="text-foreground font-medium mb-1">No products match these filters</p>
          <button onClick={clearFilters} className="text-sm font-semibold text-[#0F766E] hover:underline">
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {visible.map((p) => {
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
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <p className="font-body text-xs md:text-sm font-semibold text-[#0F766E]">₹{p.price}</p>
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
    </>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">{label}</p>
      {children}
    </div>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-[#0F766E]/10 text-[#0F766E] text-xs font-semibold">
      {label}
      <button onClick={onRemove} className="p-0.5 rounded-full hover:bg-[#0F766E]/20 transition-colors" aria-label={`Remove ${label}`}>
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="bg-card p-2 md:p-1.5 rounded-2xl border border-border shadow-sm">
          <div className="aspect-[3/4] md:aspect-[4/5] rounded-xl bg-secondary animate-pulse mb-2 md:mb-1.5" />
          <div className="px-1 pb-0.5 space-y-1.5">
            <div className="h-3.5 bg-secondary rounded animate-pulse w-3/4" />
            <div className="h-3 bg-secondary rounded animate-pulse w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title, subtitle, onSearch, onBrowse,
}: {
  title: string;
  subtitle: string;
  onSearch: (term: string) => void;
  onBrowse?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 sm:py-24">
      <div className="w-16 h-16 rounded-full bg-[#0F766E]/10 flex items-center justify-center mb-5">
        <SearchX className="w-8 h-8 text-[#0F766E]" />
      </div>
      <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground mb-1.5">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-sm">{subtitle}</p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 max-w-md">
        {POPULAR_TERMS.map((term) => (
          <button
            key={term}
            onClick={() => onSearch(term)}
            className="px-4 py-1.5 rounded-full border border-border bg-card text-sm font-medium text-foreground/80 hover:border-[#0F766E]/40 hover:bg-[#0F766E]/5 hover:text-[#0F766E] transition-colors"
          >
            {term}
          </button>
        ))}
      </div>

      {onBrowse && (
        <button
          onClick={onBrowse}
          className="mt-7 px-6 h-11 rounded-full bg-[#0F766E] hover:bg-[#0c5f58] text-white font-semibold text-sm transition-colors shadow-sm"
        >
          Browse Collections
        </button>
      )}
    </div>
  );
}
