import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, PackageSearch } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import QuickAddButton from "@/components/home/QuickAddButton";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { buildPdpPath } from "@/lib/pdpUrl";
import { fetchCategoryProducts, type CategoryProduct } from "@/services/categoryService";
import { categoryBySlug, CATEGORY_TRIM, CATEGORY_CREAM } from "./categories";

/**
 * One category's listing page (/collections/<category-slug>).
 *
 * Categories are the taxonomy, so this is a permanent browse rather than a feed:
 * no spotlight rotation, no drop timeline, no "Just In" badges. That framing
 * belongs to the collection pages (ArrivalsPage), where recency is the story;
 * here every piece is equally in the category, so the cards are uniform and the
 * only ordering offered is one the shopper picked.
 *
 * The LISTING deliberately mirrors pages/SearchResults — the storefront's other
 * "here is a list of products" surface — rather than inventing its own look:
 * same page chrome, same toolbar, same card, same grid and skeleton. The one
 * addition is the hover QuickAdd from the home page's Trending strip, which sits
 * inside the card's hover state and so leaves the resting grid identical.
 *
 * Above it sits the PLACARD, and that is the one place the page speaks for
 * itself: printed on a deep jewel ground — maroon, plum, forest, indigo, the
 * dyes this catalogue is full of — carrying cream type, a gold rule and the
 * category's size as a gold numeral. Gold is the zari/gota trim of Indian
 * kidswear and is shared by all four, so the categories read as one set in four
 * colourways. A bandhani dot grid at very low opacity keeps the ground from
 * going flat.
 *
 * The placard carries NO product imagery, deliberately: several of these
 * categories hold one or two products, so cover art would reprint the whole
 * category directly above the grid that lists it. The count is the only live
 * data on it, which also means all four print at the same size whether the
 * category holds one style or fifty.
 *
 * The CSS variables are namespaced (--cat-*) deliberately: the app already
 * defines a global --accent that Tailwind resolves as hsl(var(--accent)), and
 * shadowing it would feed a hex into hsl() and break every accent-styled child,
 * the navbar included.
 */

type SortKey = "newest" | "price-asc" | "price-desc";
const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest First",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
};

export default function CategoryPage({ slug }: { slug: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const category = categoryBySlug(slug);

  const [products, setProducts] = useState<CategoryProduct[] | null>(null);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<SortKey>("newest");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    console.log("[CategoryPage] fetching category", slug);

    fetchCategoryProducts(slug, ctrl.signal)
      .then((listing) => {
        console.log("[CategoryPage] received", listing.products.length, "of", listing.total, "for", slug);
        setProducts(listing.products);
        setTotal(listing.total);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") {
          console.log("[CategoryPage] request aborted");
          return;
        }
        console.error("[CategoryPage] fetch failed:", err);
        setProducts([]);
        setTotal(0);
      });

    return () => ctrl.abort();
  }, [slug]);

  const loading = products === null;

  // "newest" is the backend's own order, so it needs no client-side pass.
  const sorted = useMemo(() => {
    if (!products) return [];
    switch (sort) {
      case "price-asc":  return [...products].sort((a, b) => a.price - b.price);
      case "price-desc": return [...products].sort((a, b) => b.price - a.price);
      default:           return products;
    }
  }, [products, sort]);

  const label = category?.label ?? "Category";
  const field = category?.field ?? "#2A2233";

  return (
    <div
      className="min-h-screen bg-white flex flex-col text-gray-900 overflow-x-hidden"
      style={{ ["--cat-field" as string]: field, ["--cat-trim" as string]: CATEGORY_TRIM }}
    >
      <style>{`
        @keyframes cat-rise  { from { opacity: 0; transform: translateY(0.6rem); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cat-sweep { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .cat-rise  { animation: cat-rise 0.7s cubic-bezier(0.16,1,0.3,1) both; }
        .cat-sweep { animation: cat-sweep 0.8s cubic-bezier(0.16,1,0.3,1) 0.25s both; transform-origin: left; }
        @media (prefers-reduced-motion: reduce) {
          .cat-rise, .cat-sweep { animation: none; }
        }
      `}</style>

      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1 w-full pt-[calc(var(--navbar-height)+15px)]">
        <div className="page-container px-4 sm:px-6 pt-1 sm:pt-2 pb-14">

          <CategoryPlacard
            label={label}
            blurb={category?.blurb}
            total={total}
            loading={loading}
          />

          {loading ? (
            <ResultsSkeleton />
          ) : sorted.length === 0 ? (
            <EmptyState label={label} onBrowse={() => navigate("/collections")} />
          ) : (
            <>
              {/* TOOLBAR: count · sort — same shape as the search page's. */}
              <div className="flex items-center justify-between gap-2 mb-6">
                <p className="text-xs sm:text-sm text-gray-700 truncate">
                  {sorted.length === total
                    ? `${total} ${total === 1 ? "product" : "products"}`
                    : `${sorted.length} of ${total} products`}
                </p>

                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  <SelectTrigger className="h-9 w-[185px] sm:w-[205px] justify-between gap-1.5 bg-white border-gray-400 rounded-md text-xs sm:text-sm font-medium text-gray-700 shrink-0">
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

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {sorted.map((p) => (
                  <ProductCard key={p.sku} product={p} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

// ─── The placard — the category printed on its own colour ────────────────────
function CategoryPlacard({
  label, blurb, total, loading,
}: {
  label: string;
  blurb?: string;
  total: number;
  loading: boolean;
}) {
  // The last word goes italic. Playfair's italic is the most characterful thing
  // in the brand's type, and giving it a fixed home means the treatment survives
  // a one-word name ("Accessories") without a special case. Weight 500 because
  // only 400/500 italics are loaded — 700 would synthesise a faux bold.
  const words = label.split(" ");
  const lead = words.slice(0, -1).join(" ");
  const tail = words[words.length - 1];

  return (
    <section
      className="relative mb-8 sm:mb-10 overflow-hidden rounded-[1.25rem] sm:rounded-[1.75rem]"
      style={{ backgroundColor: "var(--cat-field)" }}
    >
      {/* Bandhani — a dot grid at very low opacity, so the ground reads as dyed
          cloth rather than a flat fill. Purely a surface, never content. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.13) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* The count is the only thing on the right, so the plate never depends on
          how much stock exists — a category holding one product and one holding
          fifty print identically. items-end sets the numeral on the same baseline
          as the standfirst. */}
      <div className="relative flex flex-col gap-8 p-7 sm:p-10 lg:flex-row lg:items-end lg:justify-between lg:gap-14 lg:p-14">

        <div className="min-w-0">
          <span
            className="cat-rise block font-body text-[10px] sm:text-[11px] font-medium uppercase"
            style={{ letterSpacing: "0.3em", color: "var(--cat-trim)" }}
          >
            Category
          </span>

          <h1
            className="cat-rise font-display mt-3.5"
            style={{
              // Caps high enough that the name still fills its half of a 1280px
              // container — at a 5rem cap the two ends of the placard drifted
              // apart on desktop and left a void down the middle.
              fontSize: "clamp(2.5rem, 7.5vw, 7rem)",
              lineHeight: 0.9,
              letterSpacing: "-0.03em",
              fontWeight: 700,
              color: CATEGORY_CREAM,
              animationDelay: "0.05s",
            }}
          >
            {lead && <>{lead} </>}
            <em style={{ fontStyle: "italic", fontWeight: 500 }}>{tail}</em>
          </h1>

          <div
            className="cat-sweep mt-5"
            style={{ height: "2px", width: "clamp(3.5rem, 12vw, 6rem)", background: "var(--cat-trim)" }}
          />

          {blurb && (
            /* No reserved height: every blurb is one short line of the same shape,
               so the four placards already come out level and a two-line reserve
               would just leave a gap under the copy. The clamp stays as a guard for
               the narrowest phones, where a line can still wrap. */
            <p
              className="cat-rise font-body mt-5 max-w-[44ch] text-[13px] sm:text-[15px] leading-relaxed line-clamp-2"
              style={{ color: "rgba(250,246,240,0.78)", animationDelay: "0.12s" }}
            >
              {blurb}
            </p>
          )}
        </div>

        {/* The size of the category, set as an edition numeral — the counterweight
            to the name, and the one piece of live data on the plate. */}
        <p
          className="cat-rise flex shrink-0 items-baseline gap-3 lg:flex-col lg:items-end lg:gap-2"
          style={{ animationDelay: "0.18s" }}
        >
          <span
            className="font-display block"
            // leading MUST stay >= 1. Below that the line box is shorter than the
            // digits themselves, and once this stacks (lg:flex-col) the numeral
            // spills over the "styles" label underneath it.
            style={{ fontSize: "clamp(3rem, 8vw, 6.5rem)", lineHeight: 1, fontWeight: 700, color: "var(--cat-trim)" }}
          >
            {loading ? "—" : total}
          </span>
          <span
            className="font-body text-[10px] font-medium uppercase"
            style={{ letterSpacing: "0.24em", color: "rgba(250,246,240,0.72)" }}
          >
            {total === 1 ? "style" : "styles"}
          </span>
        </p>
      </div>
    </section>
  );
}

// ─── Card — the search page's card, plus Trending's hover QuickAdd ───────────
// Resting appearance is deliberately identical to pages/SearchResults' grid card
// so a product looks the same wherever the storefront lists it. Two things this
// adds, because a category listing has to handle stock a search result never
// shows: the sold-out veil, and a keyboard-reachable card.
function ProductCard({ product: p }: { product: CategoryProduct }) {
  const navigate = useNavigate();
  const { isWishlisted, addToWishlist, removeFromWishlist, wishlistItems } = useWishlist();
  const wishlisted = isWishlisted(p.slug, p.sku);
  const onSale = p.originalPrice > p.price;
  const href = buildPdpPath(p.categorySlug, p.slug, p.sku);

  const toggleWishlist = () => {
    const existing = wishlistItems.find((i) => i.slug === p.slug && i.sku === p.sku);
    if (existing) void removeFromWishlist(existing.id);
    else void addToWishlist(p.slug, p.sku);
  };

  return (
    <div
      onClick={() => navigate(href)}
      // A div rather than an anchor, matching the search page: the card holds a
      // heart and the QuickAdd popover, and nesting those in an <a> is invalid.
      // role/tabIndex/Enter keep it reachable without one.
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") navigate(href); }}
      aria-label={p.title}
      className="group bg-white p-2 md:p-1.5 rounded-2xl shadow-md border border-gray-400 hover:shadow-xl hover:border-gray-500 hover:-translate-y-0.5 transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal"
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
          onClick={(e) => { e.stopPropagation(); toggleWishlist(); }}
          className={`absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-all shadow-sm ${
            wishlisted ? "text-primary" : "text-gray-600 hover:text-brand-teal"
          }`}
          aria-label={wishlisted ? `Remove ${p.title} from wishlist` : `Save ${p.title} to wishlist`}
        >
          <Heart className="w-3.5 h-3.5" fill={wishlisted ? "currentColor" : "none"} />
        </button>

        {p.inStock ? (
          <div
            className="hidden md:block absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <QuickAddButton product={{ slug: p.slug, sku: p.sku }} />
          </div>
        ) : (
          <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px] flex items-center justify-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-800 bg-white px-3 py-1 rounded-full shadow">
              Out of Stock
            </span>
          </div>
        )}
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
}

function EmptyState({ label, onBrowse }: { label: string; onBrowse: () => void }) {
  return (
    <div className="w-full py-14 sm:py-20 flex flex-col items-center justify-center text-center bg-white border border-gray-400 rounded-xl px-4 shadow-md">
      <PackageSearch size={44} className="text-primary mb-4 opacity-40" />
      <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-1.5">
        No {label.toLowerCase()} yet
      </p>
      <p className="text-sm text-gray-500 max-w-sm mb-6">
        Nothing is stocked in this category right now. New pieces land most weeks.
      </p>
      <button
        onClick={onBrowse}
        className="text-sm font-medium text-primary underline underline-offset-2"
      >
        Browse all collections
      </button>
    </div>
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
