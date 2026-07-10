import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, Sparkles, ArrowRight } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { buildPdpPath } from "@/lib/pdpUrl";
import { fetchNewArrivals, type NewArrivalProduct } from "@/services/searchService";
import {
  Carousel, CarouselContent, CarouselItem, type CarouselApi,
} from "@/components/ui/carousel";

type SortKey = "newest" | "price-asc" | "price-desc";
const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest First",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bucket a product's age into a drop-timeline section. */
function dropBucket(createdAt: string, now: number): { key: string; label: string; blurb: string; order: number } {
  const age = now - new Date(createdAt).getTime();
  if (age < 7 * DAY_MS)  return { key: "this-week", label: "Dropped This Week", blurb: "Hot off the press — nobody's kid has these yet.", order: 0 };
  if (age < 14 * DAY_MS) return { key: "last-week", label: "Last Week's Drop",  blurb: "Still fresh, already turning heads.", order: 1 };
  if (age < 30 * DAY_MS) return { key: "this-month", label: "Earlier This Month", blurb: "Recent favourites finding their fans.", order: 2 };
  return { key: "catalog", label: "From the Collection", blurb: "The rest of the latest line-up.", order: 3 };
}

const TICKER_WORDS = ["Just Landed", "New Drop", "Fresh Styles", "Limited Stock", "Be First", "The Lil Edit"];

export default function NewArrivals() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [products, setProducts] = useState<NewArrivalProduct[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    console.log("[NewArrivals] fetching new arrivals");

    fetchNewArrivals(48, ctrl.signal)
      .then((rows) => {
        console.log("[NewArrivals] received", rows.length, "products");
        setProducts(rows);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") {
          console.log("[NewArrivals] request aborted");
          return;
        }
        console.error("[NewArrivals] fetch failed:", err);
        setProducts([]);
      });

    return () => ctrl.abort();
  }, []);

  const loading = products === null;

  return (
    <div className="min-h-screen bg-white flex flex-col text-gray-900 overflow-x-hidden">
      {/* Page-local keyframes: ticker scroll + card entrance */}
      <style>{`
        @keyframes na-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes na-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .na-rise { animation: na-rise 0.5s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .na-rise { animation: none; }
          .na-ticker-track { animation: none !important; }
        }
      `}</style>

      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1 w-full pt-[var(--navbar-height)]">
        {/* HERO */}
        <section className="relative w-full bg-gradient-to-br from-amber-100 via-rose-100 to-purple-200 overflow-hidden">
          <div className="absolute inset-0 opacity-40 sm:opacity-50">
            <div className="absolute -top-10 left-1/4 w-72 h-72 bg-rose-300 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-16 right-1/5 w-80 h-80 bg-purple-300 rounded-full blur-3xl"></div>
            <div className="absolute top-1/3 -left-10 w-56 h-56 bg-amber-300 rounded-full blur-3xl"></div>
          </div>
          <div className="relative z-10 flex flex-col items-center text-center px-4 sm:px-6 py-28 md:py-32">
            <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-brand-teal mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              The Latest Drop
            </span>
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold leading-none mb-4 text-gray-900">
              New<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0C5D53] via-[#7B5AB5] to-emerald-700"> Arrivals</span>
            </h1>
            <p className="text-sm sm:text-base text-gray-700 max-w-xl">
              Newest styles land here first. Blink and someone else's little one is wearing them.
            </p>
          </div>

          {/* SCROLLING TICKER */}
          <div className="relative z-10 border-t border-gray-400 bg-white/60 overflow-hidden py-2.5 shadow-sm">
            <div
              className="na-ticker-track flex w-max whitespace-nowrap"
              style={{ animation: "na-ticker 22s linear infinite" }}
            >
              {[0, 1].map((copy) => (
                <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
                  {TICKER_WORDS.concat(TICKER_WORDS).map((w, i) => (
                    <span key={`${copy}-${i}`} className="flex items-center text-[11px] sm:text-xs font-bold uppercase tracking-[0.25em] text-gray-500">
                      <span className="px-4 sm:px-6">{w}</span>
                      <span className="text-brand-teal">✦</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BODY */}
        <div className="page-container px-4 sm:px-6 pt-5 sm:pt-6 pb-14">
          {loading ? (
            <GridSkeleton />
          ) : products.length === 0 ? (
            <div className="w-full py-14 sm:py-20 flex flex-col items-center justify-center text-center bg-white border border-gray-400 rounded-xl px-4 shadow-md">
              <Sparkles size={48} className="text-primary mb-4 opacity-40" />
              <p className="text-lg sm:text-xl font-semibold text-gray-800 mb-1.5">Nothing new just yet</p>
              <p className="text-sm text-gray-500 max-w-sm mb-6">
                Fresh styles are on their way. Explore our collections while you wait.
              </p>
              <button
                onClick={() => navigate("/collections")}
                className="text-sm font-medium text-primary underline underline-offset-2"
              >
                Browse all collections
              </button>
            </div>
          ) : (
            <ArrivalsView products={products} />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

// ─── Spotlight + drop-timeline sections ──────────────────────────────────────
function ArrivalsView({ products }: { products: NewArrivalProduct[] }) {
  const [sort, setSort] = useState<SortKey>("newest");
  const now = Date.now();

  // Newest product gets the full-width spotlight; only in "newest" order,
  // where "the latest piece" is actually the story being told.
  const spotlightItems = sort === "newest" ? products.slice(0, 5) : [];
  const rest = spotlightItems.length ? products.slice(spotlightItems.length) : products;

  const sorted = useMemo(() => {
    switch (sort) {
      case "price-asc":  return [...rest].sort((a, b) => a.price - b.price);
      case "price-desc": return [...rest].sort((a, b) => b.price - a.price);
      default:           return rest; // newest = backend order
    }
  }, [rest, sort]);

  // Group into drop-timeline sections (newest order only — a price sort is a
  // flat grid, timeline headings would just be noise there).
  const sections = useMemo(() => {
    if (sort !== "newest") return null;
    const map = new Map<string, { key: string; label: string; blurb: string; order: number; items: NewArrivalProduct[] }>();
    for (const p of sorted) {
      const b = dropBucket(p.createdAt, now);
      const existing = map.get(b.key);
      if (existing) existing.items.push(p);
      else map.set(b.key, { key: b.key, label: b.label, blurb: b.blurb, order: b.order, items: [p] });
    }
    // "From the Collection" is the long tail — cap it at 12 cards.
    const catalog = map.get("catalog");
    if (catalog) catalog.items = catalog.items.slice(0, 12);
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [sorted, sort, now]);

  return (
    <>
      {/* TOOLBAR: count · sort */}
      <div className="flex items-center justify-between gap-2 mb-6">
        <p className="text-xs sm:text-sm text-gray-700 truncate">
          {products.length} {products.length === 1 ? "new style" : "new styles"}
        </p>

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

      {/* SPOTLIGHT — top 5 newest pieces, auto-rotating editorial card */}
      {spotlightItems.length > 0 && <SpotlightCarousel products={spotlightItems} />}

      {sections ? (
        sections.map((section, si) =>
          section.key === "catalog" ? (
            /* FROM THE COLLECTION — the long tail renders as a bento collage
               (same mosaic language as the search page's Discover grid) */
            <section key={section.label} className="mt-10 sm:mt-14">
              <div className="flex items-end justify-between gap-3 mb-1">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{section.label}</h2>
                  <span className="text-xs font-semibold text-gray-400">{section.items.length}</span>
                </div>
                <Link
                  to="/collections"
                  className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-brand-teal hover:underline shrink-0"
                >
                  View All
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mb-5">{section.blurb}</p>
              <CollageBento products={section.items} />
            </section>
          ) : (
            <section key={section.label} className={si === 0 && spotlightItems.length === 0 ? "" : "mt-10 sm:mt-14"}>
              <div className="flex items-baseline gap-3 mb-1">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{section.label}</h2>
                <span className="text-xs font-semibold text-gray-400">{section.items.length}</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mb-5">{section.blurb}</p>
              <DropGrid products={section.items} now={now} />
            </section>
          ),
        )
      ) : (
        <DropGrid products={sorted} now={now} />
      )}
    </>
  );
}

// ─── Draggable spotlight slider — same embla engine as the PDP gallery ───────
// Swipe/drag with native momentum physics, seamless loop, auto-advance every
// 5s (paused on hover and while dragging). Embla also swallows the click
// that follows a drag, so a drag-release never opens the PDP by accident.
function SpotlightCarousel({ products }: { products: NewArrivalProduct[] }) {
  const [api, setApi] = useState<CarouselApi>();
  const [activeIndex, setActiveIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setActiveIndex(api.selectedScrollSnap());
    const onDown = () => setDragging(true);
    const onSettle = () => setDragging(false);
    onSelect();
    api.on("select", onSelect);
    api.on("pointerDown", onDown);
    api.on("settle", onSettle);
    return () => {
      api.off("select", onSelect);
      api.off("pointerDown", onDown);
      api.off("settle", onSettle);
    };
  }, [api]);

  useEffect(() => {
    if (!api || hovered || dragging || products.length < 2) return;
    const id = setInterval(() => api.scrollNext(), 5000);
    return () => clearInterval(id);
  }, [api, hovered, dragging, products.length]);

  return (
    <div
      className="relative mb-10 sm:mb-14 select-none"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Carousel
        setApi={setApi}
        opts={{ loop: true, duration: 30 }}
        className="cursor-grab active:cursor-grabbing"
      >
        <CarouselContent className="ml-0">
          {products.map((p) => (
            <CarouselItem key={p.sku} className="pl-0">
              <div className="h-full px-0.5">
                <SpotlightCard product={p} />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {/* Dots */}
      {products.length > 1 && (
        <div className="mt-3 flex justify-center items-center gap-1.5 z-10 md:mt-0 md:absolute md:bottom-3 md:left-1/2 md:-translate-x-1/2 md:justify-start">
          {products.map((p, i) => (
            <button
              key={p.sku}
              onClick={(e) => { e.stopPropagation(); api?.scrollTo(i); }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIndex ? "w-5 bg-gray-900" : "w-1.5 bg-gray-400 hover:bg-gray-600"
              }`}
              aria-label={`Show ${p.title}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Full-width spotlight for the newest product ─────────────────────────────
function SpotlightCard({ product: p }: { product: NewArrivalProduct }) {
  const navigate = useNavigate();
  const { addToWishlist, removeFromWishlist, wishlistItems } = useWishlist();
  const wishlisted = wishlistItems.some((i) => i.sku === p.sku);
  const onSale = p.originalPrice > p.price;

  return (
    <div
      onClick={() => navigate(buildPdpPath(p.categorySlug, p.slug, p.sku))}
      className="group relative h-full rounded-3xl overflow-hidden bg-gradient-to-br from-amber-100 via-rose-100 to-purple-200 text-gray-900 border border-gray-400 cursor-pointer shadow-lg hover:shadow-xl hover:border-gray-500 transition-all"
    >
      <div className="grid h-full grid-rows-[auto_1fr] md:grid-rows-1 md:grid-cols-[2fr_3fr] md:h-[24rem]">
        {/* Image side */}
        <div className="relative aspect-[4/3] md:aspect-auto md:h-full overflow-hidden">
          {p.image ? (
            <img
              src={p.image}
              alt={p.title}
              onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
              className="w-full h-full object-cover object-center group-hover:scale-[1.04] transition-transform duration-700"
            />
          ) : (
            <div className="w-full h-full bg-gray-100" />
          )}
        </div>

        {/* Text side — every row has a reserved height so all slides line up
            at the exact same positions regardless of title/badge length */}
        <div className="relative flex flex-col justify-center gap-3 sm:gap-4 p-6 sm:p-10">
          <div className="absolute top-0 right-0 w-48 h-48 bg-purple-200/40 rounded-full blur-3xl" />
          <span className="inline-flex w-fit items-center gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-brand-teal">
            <Sparkles className="w-3.5 h-3.5" />
            Newest In Store
          </span>
          <h2 className="text-2xl sm:text-4xl font-bold leading-tight text-gray-900 line-clamp-2 h-[2.5em]">{p.title}</h2>
          <div className="flex flex-nowrap overflow-hidden items-center gap-3 text-base sm:text-lg text-gray-500 h-8">
            <span>{p.category}</span>
            {p.color?.name && (
              <span className="text-gray-900 font-extrabold text-xl sm:text-2xl leading-none">·</span>
            )}
            {p.color?.name && (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: p.color.hex }} />
                {p.color.name}
              </span>
            )}
            {p.badges.slice(0, 2).map((b) => (
              <span
                key={b}
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/90 text-brand-teal border border-gray-300 shadow-sm"
              >
                {b}
              </span>
            ))}
          </div>
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:gap-4 mt-1 sm:mt-2">
            <span className="flex items-baseline gap-2 md:mr-auto">
              <span className="text-2xl sm:text-3xl font-bold text-brand-teal">₹{p.price}</span>
              {onSale && <span className="text-sm text-gray-400 line-through">₹{p.originalPrice}</span>}
            </span>
            <span className="flex items-center gap-3 self-end md:self-auto">
            <span className="inline-flex items-center gap-2 bg-gray-900 text-white px-5 sm:px-6 h-10 sm:h-11 rounded-full font-semibold text-sm group-hover:bg-gray-800 transition-colors">
              See It First
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const existing = wishlistItems.find((i) => i.sku === p.sku);
                if (existing) void removeFromWishlist(existing.id);
                else void addToWishlist(p.slug, p.sku);
              }}
              className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-gray-400 bg-white shadow-sm flex items-center justify-center transition-colors hover:bg-gray-50 ${
                wishlisted ? "text-primary" : "text-gray-600 hover:text-brand-teal"
              }`}
              aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
            >
              <Heart className="w-5 h-5" fill={wishlisted ? "currentColor" : "none"} />
            </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Mixed-size grid — every 7th card goes big (2×2) for an editorial rhythm ─
function DropGrid({ products, now }: { products: NewArrivalProduct[]; now: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 [grid-auto-flow:dense]">
      {products.map((p, idx) => (
        <ArrivalCard key={p.sku} product={p} now={now} big={idx % 7 === 3} delayMs={Math.min(idx, 8) * 60} />
      ))}
    </div>
  );
}

// ─── Bento collage for "From the Collection" ─────────────────────────────────
// Same mosaic language as the search page's CollageGrid: hand-tuned row spans
// on an auto-rows grid (sm+), a swipeable strip with a peek of the next tile
// on mobile, image-fill tiles with a gradient overlay and price + title.
// Rows are 90–120px tall, so the shortest tile (span-2) is still ~230px —
// enough for a product shot to read instead of a sliver of fabric.
const BENTO_SPANS = [
  "row-span-3",
  "row-span-2",
  "row-span-3",
  "row-span-4",
  "row-span-2",
  "row-span-3",
  "row-span-2",
  "row-span-3",
  "row-span-2",
];

function CollageBento({ products }: { products: NewArrivalProduct[] }) {
  const navigate = useNavigate();
  const { addToWishlist, removeFromWishlist, wishlistItems } = useWishlist();

  return (
    <div className="grid grid-cols-2 gap-2.5 auto-rows-[90px] sm:grid-cols-3 sm:gap-3 sm:auto-rows-[100px] md:auto-rows-[120px] [grid-auto-flow:dense]">
      {products.map((p, idx) => {
        const wishlisted = wishlistItems.some((i) => i.sku === p.sku);
        const onSale = p.originalPrice > p.price;
        return (
          <div
            key={p.sku}
            onClick={() => navigate(buildPdpPath(p.categorySlug, p.slug, p.sku))}
            className={`group relative rounded-xl sm:rounded-2xl overflow-hidden border border-gray-400 shadow-md hover:shadow-xl hover:border-gray-500 transition-all cursor-pointer ${BENTO_SPANS[idx % BENTO_SPANS.length]}`}
          >
            {p.image ? (
              <img
                src={p.image}
                alt={p.title}
                loading="lazy"
                onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
              />
            ) : (
              <div className="absolute inset-0 bg-gray-200" />
            )}

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

            {/* Wishlist */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                const existing = wishlistItems.find((i) => i.sku === p.sku);
                if (existing) void removeFromWishlist(existing.id);
                else void addToWishlist(p.slug, p.sku);
              }}
              className={`absolute top-2 right-2 w-7 h-7 bg-white/85 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-all shadow-sm z-10 ${
                wishlisted ? "text-primary" : "text-gray-600 hover:text-brand-teal"
              }`}
              aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
            >
              <Heart className="w-3.5 h-3.5" fill={wishlisted ? "currentColor" : "none"} />
            </button>

            {/* Text content */}
            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 flex flex-col items-start justify-end">
              <span className="text-[9px] sm:text-[11px] font-semibold tracking-wider text-white/90 uppercase mb-0.5 sm:mb-1 drop-shadow-md">
                ₹{p.price}
                {onSale && <span className="ml-1.5 line-through text-white/50">₹{p.originalPrice}</span>}
              </span>
              <h4 className="text-xs sm:text-sm md:text-base font-bold text-white leading-tight drop-shadow-md line-clamp-2 group-hover:-translate-y-1 transition-transform duration-300">
                {p.title}
              </h4>
            </div>

            {!p.inStock && (
              <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px] flex items-center justify-center z-10">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-800 bg-white px-3 py-1 rounded-full shadow">
                  Out of Stock
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ArrivalCard({
  product: p, now, big, delayMs,
}: {
  product: NewArrivalProduct;
  now: number;
  big: boolean;
  delayMs: number;
}) {
  const navigate = useNavigate();
  const { addToWishlist, removeFromWishlist, wishlistItems } = useWishlist();
  const wishlisted = wishlistItems.some((i) => i.sku === p.sku);
  const onSale = p.originalPrice > p.price;
  const fresh = now - new Date(p.createdAt).getTime() < 7 * DAY_MS;

  return (
    <div
      onClick={() => navigate(buildPdpPath(p.categorySlug, p.slug, p.sku))}
      style={{ animationDelay: `${delayMs}ms` }}
      className={`na-rise group relative rounded-2xl overflow-hidden bg-gray-100 border border-gray-400 cursor-pointer shadow-md hover:shadow-xl hover:border-gray-500 transition-all ${
        big ? "col-span-2 row-span-2" : ""
      }`}
    >
      {/* Image fills the whole card; info sits on a gradient overlay */}
      <div className={big ? "aspect-square" : "aspect-[3/4]"}>
        {p.image ? (
          <img
            src={p.image}
            alt={p.title}
            loading="lazy"
            onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full bg-gray-200" />
        )}
      </div>

      {/* Top row: freshness stamp + wishlist */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between">
        <div className="flex flex-col gap-1.5 items-start">
          {fresh && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand-teal text-white shadow-sm">
              Just In
            </span>
          )}
          {p.badges[0] && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/90 text-brand-teal shadow-sm">
              {p.badges[0]}
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const existing = wishlistItems.find((i) => i.sku === p.sku);
            if (existing) void removeFromWishlist(existing.id);
            else void addToWishlist(p.slug, p.sku);
          }}
          className={`w-7 h-7 bg-white/85 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-all shadow-sm ${
            wishlisted ? "text-primary" : "text-gray-600 hover:text-brand-teal"
          }`}
          aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
        >
          <Heart className="w-3.5 h-3.5" fill={wishlisted ? "currentColor" : "none"} />
        </button>
      </div>

      {/* Bottom overlay: title/price always visible on a soft gradient */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent pt-10 pb-2.5 px-3 text-white">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <h3 className={`font-medium leading-snug line-clamp-2 ${big ? "text-sm sm:text-base" : "text-xs sm:text-sm"}`}>
              {p.title}
            </h3>
            {p.color?.name && (
              <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/70">
                <span className="w-2.5 h-2.5 rounded-full border border-white/50 flex-shrink-0" style={{ backgroundColor: p.color.hex }} />
                <span className="truncate">{p.color.name}</span>
              </span>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className={`font-semibold ${big ? "text-sm sm:text-base" : "text-xs sm:text-sm"}`}>₹{p.price}</p>
            {onSale && <p className="text-[10px] text-white/50 line-through">₹{p.originalPrice}</p>}
          </div>
        </div>

        {/* Hover reveal: slide-up view pill (desktop) */}
        <div className="hidden md:block max-h-0 opacity-0 group-hover:max-h-12 group-hover:opacity-100 group-hover:mt-2 transition-all duration-300 overflow-hidden">
          <span className="inline-flex items-center gap-1.5 bg-white text-gray-900 text-xs font-semibold px-3.5 py-1.5 rounded-full">
            View Piece <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>

      {!p.inStock && (
        <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px] flex items-center justify-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-800 bg-white px-3 py-1 rounded-full shadow">
            Out of Stock
          </span>
        </div>
      )}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={`rounded-2xl bg-gray-200 border border-gray-400 shadow-md animate-pulse ${i === 3 ? "col-span-2 row-span-2 aspect-square" : "aspect-[3/4]"}`}
        />
      ))}
    </div>
  );
}
