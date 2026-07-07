import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Heart, SearchX, Search, SlidersHorizontal, X } from "lucide-react";
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
import { useSearchSuggestions } from "@/hooks/useSearchSuggestions";
import SuggestionsDropdown from "@/components/search/SuggestionsDropdown";
import { useRecommendations, type RecommendationAnchor, type RecommendedProduct } from "@/hooks/useRecommendations";
import { useCuratedSection } from "@/hooks/useCuratedSection";

const POPULAR_TERMS = ["Lehenga", "Dress", "Girls", "Boys", "Festive", "Co-ord Set"];

type SortKey = "relevance" | "price-asc" | "price-desc";
const SORT_LABELS: Record<SortKey, string> = {
  relevance: "Relevance",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
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

  // "You May Also Like" — anchored to the top result. Over-fetch, then drop any
  // product whose slug already appears in the results so the section only ever
  // surfaces things NOT already on the page.
  const recAnchor: RecommendationAnchor | null = products[0]
    ? { slug: products[0].slug, categorySlug: products[0].categorySlug, price: products[0].price }
    : null;
  const { recommendations, loading: recsLoading } = useRecommendations(recAnchor, 24);
  const resultSlugs = useMemo(() => new Set(products.map((p) => p.slug)), [products]);
  const filteredRecs = useMemo(
    () => recommendations.filter((r) => !resultSlugs.has(r.slug)).slice(0, 5),
    [recommendations, resultSlugs],
  );

  // No-results fallback — the recommendation engine needs a product anchor, which
  // we don't have when nothing matched. Fall back to the curated "Recommended For
  // You" section so the page still surfaces something to explore.
  const noResults = !!query && !loading && products.length === 0;
  const { products: curatedProducts } = useCuratedSection("home_recommended", { skip: !noResults });
  const fallbackRecs: RecommendedProduct[] = useMemo(
    () =>
      curatedProducts.slice(0, 5).map((p) => ({
        title: p.title,
        slug: p.slug,
        categorySlug: p.categorySlug,
        price: p.price,
        originalPrice: p.originalPrice,
        image: p.image ?? "",
        sku: p.sku,
        badges: p.badges,
      })),
    [curatedProducts],
  );

  return (
    <div className="min-h-screen bg-white flex flex-col text-gray-900 overflow-x-hidden">
      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1 w-full pt-[calc(var(--navbar-height)+15px)] sm:pt-[calc(var(--navbar-height)+15px)]">
        <div className="page-container px-4 sm:px-6 pt-1 sm:pt-2 pb-14">
          {/* CENTERED, PRE-FILLED SEARCH BAR (remounts per query to reset its draft) */}
          <SearchField key={query} initial={query} onSubmit={goSearch} />

          {/* BODY */}
          <div className="mt-5 sm:mt-7">
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
        </div>

        {/* YOU MAY ALSO LIKE — alongside real results (excluding what's shown),
            or the curated fallback when nothing matched */}
        {!loading && products.length > 0 && (recsLoading || filteredRecs.length > 0) && (
          <RecommendationsSection recs={filteredRecs} loading={recsLoading} />
        )}
        {noResults && fallbackRecs.length > 0 && (
          <RecommendationsSection recs={fallbackRecs} loading={false} />
        )}
      </main>

      <Footer />
    </div>
  );
}

// ─── You may also like ──────────────────────────────────────────────────────
function RecommendationsSection({ recs, loading }: { recs: RecommendedProduct[]; loading: boolean }) {
  const navigate = useNavigate();
  return (
    <section className="mt-10 bg-[#E8DDF7] pt-6 sm:pt-10 pb-14">
      <div className="page-container px-3 sm:px-6">
        <div className="flex items-end justify-between mb-6 sm:mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">You May Also Like</h2>
            <p className="text-sm text-gray-500 mt-1">Similar styles you'll love</p>
          </div>
          <Link to="/collections" className="hidden sm:block text-sm font-semibold text-brand-teal hover:underline">
            View All
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
          {/* Loading skeleton */}
          {loading && recs.length === 0 &&
            [...Array(5)].map((_, idx) => (
              <div
                key={`rec-skeleton-${idx}`}
                className={`bg-white p-2 md:p-1.5 rounded-2xl shadow-sm border border-gray-200 animate-pulse ${idx >= 4 ? "max-sm:hidden" : ""}`}
              >
                <div className="aspect-[3/4] sm:aspect-[4/5] md:aspect-[5/6] rounded-xl bg-gray-200 mb-2 md:mb-1.5" />
                <div className="px-1 pb-0.5 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                </div>
              </div>
            ))}

          {/* Loaded recommendations */}
          {recs.map((p, idx) => (
            <div
              key={`${p.slug}-${p.sku}`}
              onClick={() => navigate(buildPdpPath(p.categorySlug, p.slug, p.sku))}
              className={`group bg-white p-2 md:p-1.5 rounded-2xl shadow-sm border border-gray-200 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer ${idx >= 4 ? "max-sm:hidden" : ""}`}
            >
              <div className="relative rounded-xl overflow-hidden aspect-[3/4] sm:aspect-[4/5] md:aspect-[5/6] mb-2 md:mb-1.5 bg-gray-100">
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.title}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100" />
                )}
                {p.badges?.[0] && (
                  <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/90 text-brand-teal shadow-sm">
                    {p.badges[0]}
                  </span>
                )}
              </div>
              <div className="px-1 pb-0.5 flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs md:text-sm font-medium text-slate-900 leading-snug line-clamp-2">{p.title}</h3>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs md:text-sm font-semibold text-brand-teal">₹{p.price}</p>
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
  );
}

// ─── Centered search field (with live autosuggestions) ──────────────────────
function SearchField({ initial, onSubmit }: { initial: string; onSubmit: (term: string) => void }) {
  const [draft, setDraft] = useState(initial);
  // Suggestions open only when the value is altered (typed into) — not on a
  // plain focus of the pre-filled query; close on submit, selection, Escape,
  // or a click outside the field.
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { suggestions, loading } = useSearchSuggestions(draft);
  const hasQuery = draft.trim().length >= 1;

  // Close the dropdown on any click/tap outside the field wrapper.
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  const submit = (term: string) => {
    setOpen(false);
    onSubmit(term);
  };

  return (
    <div ref={wrapRef} className="relative mx-auto w-full max-w-2xl">
      <form onSubmit={(e) => { e.preventDefault(); submit(draft); }}>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setOpen(true); }}
            placeholder="Search products, categories, or trends..."
            className="w-full bg-white border border-gray-700 rounded-md py-2 pl-11 pr-28 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-all placeholder:text-gray-400"
          />
          <div className="absolute inset-y-0 right-1.5 flex items-center gap-1">
            {draft && (
              <button
                type="button"
                onClick={() => { setDraft(""); setOpen(false); }}
                className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="px-4 h-8 rounded-md bg-brand-teal hover:bg-[#0C5D53] text-white font-bold text-sm transition-colors"
            >
              Search
            </button>
          </div>
        </div>
      </form>

      {/* Live suggestions dropdown — appears as the field is altered */}
      {open && hasQuery && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-[70vh] overflow-y-auto no-scrollbar">
          <SuggestionsDropdown
            suggestions={suggestions}
            loading={loading}
            query={draft}
            onClose={() => setOpen(false)}
            onSubmit={submit}
          />
        </div>
      )}
    </div>
  );
}

// ─── Results + toolbar + filters ────────────────────────────────────────────
function ResultsView({ products }: { products: SearchProduct[] }) {
  const navigate = useNavigate();
  const { addToWishlist, removeFromWishlist, wishlistItems } = useWishlist();

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
    const existing = wishlistItems.find((i) => i.sku === p.sku);
    if (existing) void removeFromWishlist(existing.id);
    else void addToWishlist(p.slug, p.sku);
  };

  const chipClass = (active: boolean) =>
    `px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
      active
        ? "bg-brand-teal border-brand-teal text-white"
        : "border-gray-300 bg-white text-gray-700 hover:border-brand-teal hover:text-brand-teal"
    }`;

  return (
    <>
      {/* TOOLBAR: count · filters · sort */}
      <div className="flex items-center justify-between gap-2 mb-6">
        <p className="text-xs sm:text-sm text-gray-700 truncate">
          {visible.length === products.length
            ? `${products.length} ${products.length === 1 ? "product" : "products"}`
            : `${visible.length} of ${products.length} products`}
        </p>

        <div className="flex items-center gap-2 shrink-0">
          {/* FILTERS */}
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <button className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md border border-gray-400 bg-white text-xs sm:text-sm font-medium text-gray-700 hover:border-brand-teal hover:text-brand-teal transition-colors">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
                {activeCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-teal text-white text-[10px] font-bold">
                    {activeCount}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 bg-white">
              <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-200">
                <SheetTitle className="text-xl font-semibold text-gray-900">Filters</SheetTitle>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
                {categories.length > 0 && (
                  <FilterGroup label="Category">
                    <div className="space-y-2.5">
                      {categories.map((c) => (
                        <label key={c.slug} className="flex items-center gap-2.5 cursor-pointer group">
                          <Checkbox checked={catSel.has(c.slug)} onCheckedChange={() => toggleSet(setCatSel, c.slug)} />
                          <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">{c.label}</span>
                        </label>
                      ))}
                    </div>
                  </FilterGroup>
                )}

                {priceBuckets.length > 0 && (
                  <FilterGroup label="Price">
                    <div className="flex flex-wrap gap-2">
                      {priceBuckets.map((b) => (
                        <button key={b.id} onClick={() => setPriceBucket(priceBucket === b.id ? null : b.id)} className={chipClass(priceBucket === b.id)}>
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </FilterGroup>
                )}

                {badges.length > 0 && (
                  <FilterGroup label="Collections">
                    <div className="flex flex-wrap gap-2">
                      {badges.map((b) => (
                        <button key={b} onClick={() => toggleSet(setBadgeSel, b)} className={chipClass(badgeSel.has(b))}>
                          {b}
                        </button>
                      ))}
                    </div>
                  </FilterGroup>
                )}

                {hasSale && (
                  <FilterGroup label="Offers">
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <Checkbox checked={onSaleOnly} onCheckedChange={(v) => setOnSaleOnly(!!v)} />
                      <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">On sale only</span>
                    </label>
                  </FilterGroup>
                )}
              </div>

              <SheetFooter className="px-6 py-4 border-t border-gray-200 flex-row gap-3">
                <button
                  onClick={clearFilters}
                  disabled={activeCount === 0}
                  className="flex-1 h-11 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                >
                  Clear all
                </button>
                <SheetClose asChild>
                  <button className="flex-1 h-11 rounded-full bg-brand-teal hover:bg-[#0C5D53] text-white text-sm font-bold transition-colors">
                    Show {visible.length} {visible.length === 1 ? "result" : "results"}
                  </button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          {/* SORT */}
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-9 w-[185px] sm:w-[205px] justify-between gap-1.5 bg-white border-gray-400 rounded-md text-xs sm:text-sm font-medium text-gray-700">
              <span className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="text-gray-500 shrink-0">Sort&nbsp;:&nbsp;</span>
                <span className="flex-1 text-center min-w-0">
                  <SelectValue />
                </span>
              </span>
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
          <button onClick={clearFilters} className="text-xs font-semibold text-brand-teal hover:underline ml-1">
            Clear all
          </button>
        </div>
      )}

      {/* GRID */}
      {visible.length === 0 ? (
        <div className="w-full py-16 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
          <p className="text-base font-semibold text-gray-800 mb-1">No products match these filters</p>
          <button onClick={clearFilters} className="text-sm font-medium text-primary underline underline-offset-2">
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {visible.map((p) => {
            const wishlisted = wishlistItems.some((i) => i.sku === p.sku);
            const onSale = p.originalPrice > p.price;
            return (
              <div
                key={p.sku}
                onClick={() => navigate(buildPdpPath(p.categorySlug, p.slug, p.sku))}
                className="group bg-white p-2 md:p-1.5 rounded-2xl shadow-md border border-gray-400 hover:shadow-xl hover:border-gray-500 hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-[4/5] mb-2 md:mb-1.5 bg-gray-100">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.title}
                      loading="lazy"
                      onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100" />
                  )}
                  {p.badges[0] && (
                    <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/90 text-brand-teal shadow-sm">
                      {p.badges[0]}
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleWishlist(p); }}
                    className={`absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-all shadow-sm ${
                      wishlisted ? "text-primary" : "text-gray-600 hover:text-brand-teal"
                    }`}
                    aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
                  >
                    <Heart className="w-3.5 h-3.5" fill={wishlisted ? "currentColor" : "none"} />
                  </button>
                </div>
                <div className="px-1 pb-0.5 flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="text-xs md:text-sm font-medium text-gray-900 leading-snug line-clamp-2">
                      {p.title}
                    </h3>
                    {p.color?.name && (
                      <span className="mt-1 flex items-center gap-1.5 text-[10px] md:text-xs text-gray-500">
                        <span
                          className="w-3 h-3 rounded-full border border-gray-300 shadow-sm flex-shrink-0"
                          style={{ backgroundColor: p.color.hex }}
                        />
                        <span className="truncate">{p.color.name}</span>
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs md:text-sm font-semibold text-brand-teal">₹{p.price}</p>
                    {onSale && (
                      <p className="text-[10px] text-gray-400 line-through">₹{p.originalPrice}</p>
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
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">{label}</p>
      {children}
    </div>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-brand-teal/10 text-brand-teal text-xs font-semibold">
      {label}
      <button onClick={onRemove} className="p-0.5 rounded-full hover:bg-brand-teal/20 transition-colors" aria-label={`Remove ${label}`}>
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="bg-white p-2 md:p-1.5 rounded-2xl border border-gray-300 shadow-md animate-pulse">
          <div className="aspect-[3/4] md:aspect-[4/5] rounded-xl bg-gray-200 mb-2 md:mb-1.5" />
          <div className="px-1 pb-0.5 space-y-1.5">
            <div className="h-3.5 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-200 rounded w-1/3" />
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
    <div className="w-full py-14 sm:py-20 flex flex-col items-center justify-center text-center bg-white border border-gray-200 rounded-xl px-4">
      <SearchX size={48} className="text-primary mb-4 opacity-40" />
      <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-1.5">{title}</p>
      <p className="text-sm text-gray-500 max-w-sm mb-6">{subtitle}</p>

      <div className="flex flex-wrap items-center justify-center gap-2 max-w-md">
        {POPULAR_TERMS.map((term) => (
          <button
            key={term}
            onClick={() => onSearch(term)}
            className="px-4 py-1.5 rounded-full border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:border-brand-teal hover:text-brand-teal transition-colors"
          >
            {term}
          </button>
        ))}
      </div>

      {onBrowse && (
        <button onClick={onBrowse} className="mt-6 text-sm font-medium text-primary underline underline-offset-2">
          Browse all collections
        </button>
      )}
    </div>
  );
}
