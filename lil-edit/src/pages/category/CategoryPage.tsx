import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Heart, Loader2, PackageSearch, SlidersHorizontal, X } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import QuickAddButton from "@/components/home/QuickAddButton";
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
import {
  fetchCategoryProducts,
  fetchCategoryCounts,
  activeFilterCount,
  EMPTY_FACETS,
  type CategoryCounts,
  type CategoryProduct,
  type CategoryFacets,
  type CategorySort,
  type FacetValue,
  type SizeFacetValue,
} from "@/services/categoryService";
import { useCategoryFilters, type ListGroup } from "./useCategoryFilters";
import { CATEGORIES, categoryBySlug, paletteFor, pagePaletteFor } from "./categories";

/**
 * One category's listing page (/collections/<category-slug>).
 *
 * ── What this page is ───────────────────────────────────────────────────────
 * Categories are the taxonomy, so this is a permanent browse rather than a feed:
 * no spotlight rotation, no drop timeline, no "Just In" badges. That framing
 * belongs to the collection pages, where recency is the story; here every piece
 * is equally in the category, so the ordering is one the shopper picked.
 *
 * ── What a card is ──────────────────────────────────────────────────────────
 * A COLOURWAY, not a product. A kurta cut in three colours fills three cards,
 * each with its own photograph, sku, stock and PDP. Colour is one of the two
 * things a shopper is actually choosing between in a category (the other is the
 * garment), and a colour that only appears when you hover a 12px dot is a colour
 * most shoppers never see. Every count on the page follows that unit — the
 * placard, the toolbar, the age rail and the tiles all count colourways, which is
 * why they say "pieces".
 *
 * ── The one idea the design is built on ─────────────────────────────────────
 * Age is the organising fact of children's clothing. A parent does not arrive
 * knowing a size code; they know their child is four. So age is not a checkbox
 * in a drawer here — it is the AGE RAIL directly under the placard, drawn as a
 * tailor's tape: a hairline with the bands notched along it, in order, each
 * carrying how many pieces it holds. Picking an age is picking a notch. It gets
 * that treatment because the ordering is real information (the bands are a
 * continuous scale a child moves along), which is exactly what a plain chip row
 * throws away. Everything else — colour, occasion, price — is an unordered set
 * and stays in the drawer where it belongs.
 *
 * ── Why the four pages look different without four stylesheets ──────────────
 * Every colour on this page derives from the ONE hex on the category (its
 * `field`): paletteFor() dresses the type printed on the placard, and
 * pagePaletteFor() dresses the page under it — hairlines, ink, and the tint that
 * marks a selection. Out of two functions and four hex values, Ethnic Wear runs
 * warm and Casual Wear cool. A fifth category would arrive fully dressed the
 * moment its hex joins the list.
 *
 * The PAPER is not part of that: these pages are white like the rest of the
 * storefront. What is tinted is what sits on the white, which is enough for a
 * category to have a temperature without the background changing colour.
 *
 * The variables are namespaced (--cat-*) deliberately: the app already defines a
 * global --accent that Tailwind resolves as hsl(var(--accent)), and shadowing it
 * would feed a hex into hsl() and break every accent-styled child, the navbar
 * included.
 *
 * ── Who does the work ───────────────────────────────────────────────────────
 * Search downloads its whole result set and filters it in the browser; a
 * category is open-ended, so this page holds only a window of it (PAGE_SIZE at a
 * time, "Load more" for the rest) and hands filtering, sorting and paging to the
 * backend. Doing it locally would make "Price: Low to High" mean "cheapest of
 * the 24 already downloaded", and the drawer would only ever offer the options
 * present in that window. So every response carries three counts — `total` (the
 * category), `matched` (after filters) and the rows — plus `facets` describing
 * every filter the whole category can offer, each with its size. All of them
 * count colourways, because that is what a card is.
 *
 * Filter state lives in the URL (see useCategoryFilters), because a filtered
 * listing is something shoppers send each other and something the Back button
 * has to restore when they return from a product.
 */

const SORT_LABELS: Record<CategorySort, string> = {
  newest: "Newest First",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
  discount: "Biggest Saving",
};

/** How many cards a page of the listing holds. */
const PAGE_SIZE = 24;

/** ₹5,498 rather than ₹5498 — Indian grouping, since that is what the store prices in. */
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

interface ListingState {
  rows: CategoryProduct[];
  /** The whole category, un-filtered — the placard's numeral. */
  total: number;
  /** What the filters left — the toolbar's count. */
  matched: number;
  hasMore: boolean;
  facets: CategoryFacets;
}

export default function CategoryPage({ slug }: { slug: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const category = categoryBySlug(slug);
  const { filters, key: filterKey, setSort, toggle, setGroup, setFlag, clearAll } = useCategoryFilters();

  const [listing, setListing] = useState<ListingState | null>(null);
  // Two different loading states, because they look nothing alike on screen: the
  // FIRST load has no grid to show so it gets the skeleton, while a filter change
  // already has one and only dims it. Swapping a filled grid for a skeleton on
  // every tick of a checkbox reads as the page reloading.
  const [busy, setBusy] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  // Identifies the request the current rows belong to, so a "Load more" response
  // that arrives after the filters changed is dropped instead of appended.
  const requestRef = useRef("");

  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const token = `${slug}|${filterKey}`;
    requestRef.current = token;
    setBusy(true);
    console.log("[CategoryPage] fetching category", slug, "filters", filterKey);

    fetchCategoryProducts(slug, filters, ctrl.signal, PAGE_SIZE, 0)
      .then((res) => {
        console.log("[CategoryPage] received", res.products.length, "of", res.matched, "matched /", res.total, "total for", slug);
        setListing({
          rows: res.products,
          total: res.total,
          matched: res.matched,
          hasMore: res.hasMore,
          facets: res.facets,
        });
        setBusy(false);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") {
          console.log("[CategoryPage] request aborted");
          return;
        }
        console.error("[CategoryPage] fetch failed:", err);
        setListing({ rows: [], total: 0, matched: 0, hasMore: false, facets: EMPTY_FACETS });
        setBusy(false);
      });

    return () => ctrl.abort();
    // `filters` is derived from `filterKey`, so keying the effect on the string
    // keeps it from refiring on every render for an object that never changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, filterKey]);

  const loadMore = useCallback(() => {
    if (!listing || loadingMore || !listing.hasMore) return;
    const token = requestRef.current;
    const offset = listing.rows.length;
    setLoadingMore(true);
    console.log("[CategoryPage] loading more from offset", offset);

    fetchCategoryProducts(slug, filters, undefined, PAGE_SIZE, offset)
      .then((res) => {
        // The filters (or the category) moved on while this was in flight — the
        // rows it carries belong to a listing that is no longer on screen.
        if (requestRef.current !== token) {
          console.log("[CategoryPage] stale page dropped for offset", offset);
          return;
        }
        setListing((prev) => {
          if (!prev) return prev;
          // Dedupe on sku: the catalog can gain a product between two pages, which
          // would otherwise slide one row into both windows and duplicate a key.
          const seen = new Set(prev.rows.map((r) => r.sku));
          const fresh = res.products.filter((p) => !seen.has(p.sku));
          console.log("[CategoryPage] appended", fresh.length, "rows  hasMore:", res.hasMore);
          return { ...prev, rows: [...prev.rows, ...fresh], matched: res.matched, hasMore: res.hasMore };
        });
      })
      .catch((err) => {
        console.error("[CategoryPage] load more failed:", err);
      })
      .finally(() => setLoadingMore(false));
  }, [listing, loadingMore, slug, filters]);

  const label = category?.label ?? "Category";
  const field = category?.field ?? "#2A2233";
  const pal = paletteFor(field);
  const page = pagePaletteFor(field);

  const facets = listing?.facets ?? EMPTY_FACETS;
  const ages = facets.sizes.filter((s) => s.kind === "age");
  const activeCount = activeFilterCount(filters);
  const firstLoad = listing === null;
  const rows = listing?.rows ?? [];

  return (
    <div
      // overflow-x-CLIP, not hidden: `hidden` turns this wrapper into a scroll
      // container, and a sticky descendant then anchors to a scrollport that never
      // scrolls — which would silently stop the toolbar below from sticking.
      className="min-h-screen flex flex-col overflow-x-clip bg-white"
      style={{
        color: "var(--cat-ink)",
        ["--cat-field" as string]: field,
        ["--cat-text" as string]: pal.text,
        ["--cat-text-muted" as string]: pal.textMuted,
        ["--cat-trim" as string]: pal.trim,
        ["--cat-dots" as string]: pal.dots,
        ["--cat-dots-strong" as string]: pal.dotsStrong,
        ["--cat-edge" as string]: page.edge,
        ["--cat-ink" as string]: page.ink,
        ["--cat-ink-soft" as string]: page.inkSoft,
        ["--cat-halo" as string]: page.halo,
        ["--cat-mark" as string]: page.mark,
      }}
    >
      <style>{`
        @keyframes cat-rise  { from { opacity: 0; transform: translateY(0.6rem); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cat-sweep { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes cat-card  { from { opacity: 0; transform: translateY(0.75rem); } to { opacity: 1; transform: translateY(0); } }
        .cat-rise  { animation: cat-rise 0.7s cubic-bezier(0.16,1,0.3,1) both; }
        .cat-sweep { animation: cat-sweep 0.8s cubic-bezier(0.16,1,0.3,1) 0.25s both; transform-origin: left; }
        .cat-card  { animation: cat-card 0.5s cubic-bezier(0.16,1,0.3,1) both; }
        .cat-nums  { font-variant-numeric: tabular-nums; }

        /* A big numeral does NOT sit centred in its own line box: the box is
           built from the font's ascender and descender, and lining figures use
           neither — they stop at the cap line and never go below the baseline.
           So a numeral centred by flexbox is really the FONT'S box centred, and
           the digits ride high inside it by a couple of percent of the type size.
           At 4.5rem that is a visible few pixels, which is exactly the "bit off"
           you can see but can't measure.

           text-box trims the box down to the digits themselves (cap line to
           baseline), so centring the box centres what you can actually see.
           Where it isn't supported the same trim is approximated with negative
           margins — close enough that the fallback reads as level, and only the
           tail of browsers ever sees it. */
        .cat-figure {
          display: block;
          line-height: 1;
          text-box-trim: trim-both;
          text-box-edge: cap alphabetic;
          text-box: trim-both cap alphabetic;
        }
        @supports not (text-box-edge: cap alphabetic) {
          .cat-figure { margin-top: -0.19em; margin-bottom: -0.08em; }
        }

        /* Each "more categories" tile carries its own colour in --tile, so the
           hover border can be that category's rather than one shared accent.
           A rule rather than an inline style because :hover cannot be written
           into a style attribute. */
        /* The resting border is a plain grey set on the element (border-gray-400);
           this only owns the hover, where it swaps to that tile's own colour. */
        .cat-tile { transition: border-color 0.2s, transform 0.2s; }
        .cat-tile:hover { border-color: var(--tile); transform: translateY(-2px); }


        @media (prefers-reduced-motion: reduce) {
          .cat-rise, .cat-sweep, .cat-card { animation: none; }
        }
      `}</style>

      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1 w-full pt-[calc(var(--navbar-height)+15px)]">
        <div className="page-container px-4 sm:px-6 pt-1 sm:pt-2 pb-14">

          <CategoryPlacard
            label={label}
            blurb={category?.blurb}
            total={listing?.total ?? 0}
            loading={firstLoad}
            ageSpan={ageSpanLabel(ages)}
            priceFrom={facets.priceFrom}
          />

          {firstLoad ? (
            <ResultsSkeleton />
          ) : listing.total === 0 ? (
            <EmptyState label={label} onBrowse={() => navigate("/collections")} />
          ) : (
            <>
              {ages.length > 1 && (
                <AgeRail
                  ages={ages}
                  selected={filters.sizes}
                  onPick={(value) => toggle("sizes", value)}
                  // Drops the age bands only. Garment sizes live in the same
                  // `sizes` group but were picked in the drawer, and "All ages"
                  // has no business clearing them.
                  onClear={() => setGroup("sizes", filters.sizes.filter((v) => !ages.some((a) => a.value === v)))}
                />
              )}

              <Toolbar
                shown={rows.length}
                matched={listing.matched}
                total={listing.total}
                busy={busy}
                activeCount={activeCount}
                facets={facets}
                sort={filters.sort}
                onSort={setSort}
                isSelected={(group, value) => filters[group].includes(value)}
                onToggle={toggle}
                onSale={filters.onSale}
                inStockOnly={filters.inStockOnly}
                onFlag={setFlag}
                onClear={clearAll}
              />

              {activeCount > 0 && (
                <ActiveChips
                  facets={facets}
                  isSelected={(group, value) => filters[group].includes(value)}
                  groups={{
                    sizes: filters.sizes,
                    genders: filters.genders,
                    priceBuckets: filters.priceBuckets,
                    colors: filters.colors,
                    occasions: filters.occasions,
                    tags: filters.tags,
                    badges: filters.badges,
                  }}
                  onSale={filters.onSale}
                  inStockOnly={filters.inStockOnly}
                  onToggle={toggle}
                  onFlag={setFlag}
                  onClear={clearAll}
                />
              )}

              {rows.length === 0 ? (
                <FilteredEmptyState onClear={clearAll} />
              ) : (
                <>
                  {/* Dimmed rather than replaced while a filter change is in
                      flight — see the two loading states above. */}
                  <div
                    className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9 transition-opacity duration-200 ${
                      busy ? "opacity-40 pointer-events-none" : "opacity-100"
                    }`}
                  >
                    {rows.map((p, i) => (
                      <ProductCard key={p.sku} product={p} index={i} />
                    ))}
                  </div>

                  {listing.hasMore && (
                    <div className="mt-12 flex flex-col items-center gap-3">
                      <p className="cat-nums text-xs" style={{ color: "var(--cat-ink-soft)" }}>
                        {rows.length} of {listing.matched}
                      </p>
                      <button
                        onClick={loadMore}
                        disabled={loadingMore || busy}
                        className="inline-flex items-center justify-center gap-2 h-11 px-10 text-[13px] font-semibold uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
                        style={{ border: "1px solid var(--cat-mark)", color: "var(--cat-mark)" }}
                      >
                        {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                        {loadingMore ? "Loading" : "Load more"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Always rendered, including on an empty category — when a page has
              nothing on it, somewhere else to go is the most useful thing on it. */}
          <OtherCategories current={slug} />
        </div>
      </main>

      <Footer />
    </div>
  );
}

// ─── The placard — the category printed on its own colour ────────────────────
// Structured as a title page rather than a hero with a badge stuck to it: a
// masthead rule across the top carrying the plate's metadata, the name set large
// underneath, and the count as a colophon in the corner.
//
// What sits on the masthead is true and specific: the ages the category actually
// runs to, read off the size facets rather than written per category, so it can
// never claim a range the rail below it doesn't have. It earns the spot because
// a parent's first question about a rail of children's clothes is who it fits.
function CategoryPlacard({
  label, blurb, total, loading, ageSpan, priceFrom,
}: {
  label: string;
  blurb?: string;
  total: number;
  loading: boolean;
  /** e.g. "6 mo – 12 yrs". Empty while the facets load, or if the category has no age bands. */
  ageSpan: string;
  /** Cheapest piece in the category. 0 while loading, or if the category is empty. */
  priceFrom: number;
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
      className="relative mb-7 sm:mb-9 overflow-hidden rounded-[1.25rem] sm:rounded-[1.75rem]"
      style={{ backgroundColor: "var(--cat-field)" }}
    >
      {/* Bandhani — a dot grid at very low opacity, so the ground reads as dyed
          cloth rather than a flat fill. Purely a surface, never content. Tightens
          and strengthens below sm, where the plate is phone-width — see .bandhani
          in index.css. */}
      <div
        className="bandhani pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          ["--bandhani" as string]: "var(--cat-dots)",
          ["--bandhani-strong" as string]: "var(--cat-dots-strong)",
        }}
      />

      <div className="relative p-7 sm:p-10 lg:p-14">

        {/* MASTHEAD — the rule runs the full width of the plate and the labels
            sit on it, so the top of the page is a line rather than a stack of
            small text. */}
        <div className="cat-rise flex items-center gap-3 sm:gap-4">
          <Eyebrow>Category</Eyebrow>
          <span className="h-px flex-1" style={{ backgroundColor: "var(--cat-trim)", opacity: 0.3 }} />
          {ageSpan && <Eyebrow>{ageSpan}</Eyebrow>}
        </div>

        <div className="mt-10 flex flex-col gap-9 sm:mt-12 lg:flex-row lg:items-end lg:justify-between lg:gap-14">

          <div className="min-w-0">
            <h1
              className="cat-rise font-display"
              style={{
                // Caps high enough that the name still fills its half of a 1280px
                // container — at a 5rem cap the two ends of the placard drifted
                // apart on desktop and left a void down the middle.
                fontSize: "clamp(2.5rem, 7.5vw, 7rem)",
                lineHeight: 0.9,
                letterSpacing: "-0.03em",
                fontWeight: 700,
                color: "var(--cat-text)",
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
                style={{ color: "var(--cat-text-muted)", animationDelay: "0.12s" }}
              >
                {blurb}
              </p>
            )}
          </div>

          {/* COLOPHON — the size of the category, and the one piece of live data
              on the plate. It stays the UNFILTERED total on purpose: this is how
              big the category is, which doesn't change because a shopper picked
              an age.

              The numeral and its label are separated by a rule and centred by the
              box's own padding, so "centred" is a structural fact here rather than
              an optical judgement — see .cat-figure for why the numeral needed its
              leading trimmed before that could be true. */}
          {/* Stretches across the plate on a phone so the price can sit hard
              right, against the opposite margin from the box — the two ends of
              the line rather than two things huddled together. Back to
              content-width on desktop, where the price isn't rendered at all. */}
          <div
            className="cat-rise flex items-center justify-between gap-6 sm:gap-8 lg:w-auto lg:shrink-0 lg:justify-start lg:self-auto"
            style={{ animationDelay: "0.18s" }}
          >
            <p
              className="flex shrink-0 flex-col items-center px-8 py-5 lg:px-10 lg:py-6"
              style={{ border: "1px solid var(--cat-trim)" }}
            >
              <span
                className="cat-figure cat-nums font-display"
                style={{ fontSize: "clamp(2.75rem, 6vw, 4.5rem)", fontWeight: 700, color: "var(--cat-trim)" }}
              >
                {loading ? "—" : total}
              </span>
              <span
                className="my-3.5 h-px w-full"
                aria-hidden="true"
                style={{ backgroundColor: "var(--cat-trim)", opacity: 0.4 }}
              />
              <span
                className="font-body text-[10px] font-medium uppercase"
                // The trailing letter-space is subtracted back off the box, or the
                // word sits half a space left of the numeral above it.
                style={{ letterSpacing: "0.24em", marginRight: "-0.24em", color: "var(--cat-text-muted)" }}
              >
                {/* "Pieces", not "styles": the grid holds one card per colourway,
                    so this counts colourways too and the word has to mean what is
                    actually under it. A garment cut in three colours is three
                    pieces here — and three cards. */}
                {total === 1 ? "piece" : "pieces"}
              </span>
            </p>

            {/* PHONE ONLY. On a phone the plate is a small box with the rest of
                the row empty beside it, so the entry price fills it — the second
                thing a shopper wants to know after how many there are. It sits
                unboxed on purpose: two bordered plates side by side would read as
                a pair of equal marks, and this is a caption to the one beside it.

                Desktop already spends that width on the name, so it does not
                appear there. */}
            {priceFrom > 0 && (
              <p className="text-right lg:hidden">
                <span
                  className="block font-body text-[10px] font-medium uppercase"
                  // Right-aligned text plus letter-spacing leaves the trailing
                  // space hanging past the margin, so it comes back off here.
                  style={{ letterSpacing: "0.24em", marginRight: "-0.24em", color: "var(--cat-text-muted)" }}
                >
                  Starting from
                </span>
                <span
                  // Set in the body face, not the display serif: Playfair's rupee
                  // sign sits on a different optical line from its figures, so
                  // "₹3,500" came out visibly stepped. DM Sans draws the symbol
                  // and the digits to one line, which is all this needs to do.
                  className="cat-nums font-body mt-2 block"
                  style={{ fontSize: "clamp(1.25rem, 5vw, 1.6rem)", lineHeight: 1, fontWeight: 500, color: "var(--cat-text)" }}
                >
                  {rupees(priceFrom)}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The plate's small caps — one definition, so the masthead's ends match. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="shrink-0 font-body text-[10px] sm:text-[11px] font-medium uppercase"
      style={{ letterSpacing: "0.3em", marginRight: "-0.3em", color: "var(--cat-trim)" }}
    >
      {children}
    </span>
  );
}

/**
 * "6 mo – 12 yrs" — the span the category actually covers, taken from the START
 * of its youngest band and the END of its oldest. Read off the facets rather than
 * written per category, so it can never claim a range the rail below it doesn't
 * have.
 */
function ageSpanLabel(ages: SizeFacetValue[]): string {
  if (ages.length === 0) return "";
  const first = ages[0];
  const last = ages[ages.length - 1];
  const start = first.label.match(/\d+/)?.[0];
  const endDigits = last.label.match(/\d+/g);
  const end = endDigits?.[endDigits.length - 1];
  if (!start || !end) return "";

  const startUnit = ageUnit(first.label);
  const endUnit = ageUnit(last.label);
  // The unit is only printed twice when it actually changes across the span —
  // "6 mo – 12 yrs" needs both ends named, "1–12 yrs" does not.
  return startUnit && startUnit !== endUnit
    ? `${start} ${startUnit} – ${end} ${endUnit}`
    : `${start}–${end} ${endUnit}`;
}

// ─── The age rail — the signature ────────────────────────────────────────────
// A tailor's tape: one hairline with the category's age bands notched along it,
// youngest to oldest, each carrying how many pieces it holds.
//
// Age gets this and no other filter does, because age is the only one whose
// ORDER is information — the bands are a continuous scale a child moves along,
// and a shopper reads "my daughter is between these two notches" off it in a way
// no drawer of checkboxes can express. Colour and occasion are unordered sets;
// they stay in the drawer.
//
// It writes to the same `sizes` filter the drawer does, so the two can never
// disagree — the drawer simply doesn't offer the age bands, only the garment
// letters that have no natural order.
function AgeRail({
  ages, selected, onPick, onClear,
}: {
  ages: SizeFacetValue[];
  selected: string[];
  onPick: (value: string) => void;
  onClear: () => void;
}) {
  const anySelected = ages.some((a) => selected.includes(a.value));

  return (
    <section className="mb-6 sm:mb-8" aria-label="Shop by age">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <p
          className="font-body text-[10px] sm:text-[11px] font-semibold uppercase"
          style={{ letterSpacing: "0.24em", color: "var(--cat-ink-soft)" }}
        >
          Shop by age
        </p>
        {anySelected && (
          <button
            onClick={onClear}
            className="text-[11px] font-semibold uppercase tracking-[0.12em] transition-opacity hover:opacity-60"
            style={{ color: "var(--cat-mark)" }}
          >
            All ages
          </button>
        )}
      </div>

      {/* The tape. Scrolls horizontally on narrow screens rather than wrapping —
          a scale that wraps to a second line stops reading as a scale. */}
      <div
        className="no-scrollbar overflow-x-auto"
        style={{ borderTop: "1px solid var(--cat-edge)" }}
      >
        <div className="flex min-w-full">
          {ages.map((age) => {
            const on = selected.includes(age.value);
            return (
              <button
                key={age.value}
                onClick={() => onPick(age.value)}
                aria-pressed={on}
                className="group relative flex flex-1 shrink-0 flex-col items-center gap-1 px-3 pb-3 pt-0 transition-colors sm:px-4"
                style={{ minWidth: "4.25rem", backgroundColor: on ? "var(--cat-halo)" : "transparent" }}
              >
                {/* The notch, hanging off the rule above it. Longer when picked —
                    the way a tape's whole-unit marks run deeper than the rest. */}
                <span
                  aria-hidden="true"
                  className="block transition-all"
                  style={{
                    width: on ? "2px" : "1px",
                    height: on ? "14px" : "8px",
                    backgroundColor: on ? "var(--cat-mark)" : "var(--cat-edge)",
                  }}
                />
                <span
                  className="cat-nums font-display mt-1 whitespace-nowrap text-[17px] sm:text-[19px] leading-none transition-colors"
                  style={{ fontWeight: on ? 700 : 500, color: on ? "var(--cat-mark)" : "var(--cat-ink)" }}
                >
                  {ageFigure(age.label)}
                </span>
                <span
                  className="font-body text-[9px] uppercase leading-none tracking-[0.14em]"
                  style={{ color: "var(--cat-ink-soft)" }}
                >
                  {ageUnit(age.label)}
                </span>
                <span className="cat-nums font-body text-[10px] leading-none" style={{ color: "var(--cat-ink-soft)" }}>
                  {age.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * "3-4 Years" → "3–4" (with a real en dash) and "6-12 Months" → "6–12". The
 * numerals carry the scale, so they are set alone in the display face; the unit
 * is a caption underneath rather than repeated eleven times at full size.
 */
function ageFigure(label: string): string {
  const figures = label.replace(/years?|months?|yrs?|mos?/gi, "").trim();
  return (figures || label).replace(/\s*-\s*/g, "–");
}

function ageUnit(label: string): string {
  if (/month|mos?\b/i.test(label)) return "mo";
  if (/year|yrs?\b/i.test(label)) return "yrs";
  return "";
}

// ─── Toolbar: count · filters · sort ─────────────────────────────────────────
// Sticky under the navbar: a category can run to several screens of grid, and a
// shopper who has scrolled past the placard should not have to scroll back up to
// narrow or re-sort what they are looking at.
function Toolbar({
  shown, matched, total, busy, activeCount, facets, sort, onSort,
  isSelected, onToggle, onSale, inStockOnly, onFlag, onClear,
}: {
  shown: number;
  matched: number;
  total: number;
  busy: boolean;
  activeCount: number;
  facets: CategoryFacets;
  sort: CategorySort;
  onSort: (s: CategorySort) => void;
  isSelected: (group: ListGroup, value: string) => boolean;
  onToggle: (group: ListGroup, value: string) => void;
  onSale: boolean;
  inStockOnly: boolean;
  onFlag: (flag: "onSale" | "inStockOnly", on: boolean) => void;
  onClear: () => void;
}) {
  // "Biggest Saving" is only an ordering if something is discounted; on a
  // full-price category it would sort nothing and read as a broken option.
  const sortKeys = (Object.keys(SORT_LABELS) as CategorySort[])
    .filter((k) => k !== "discount" || facets.onSale > 0);

  return (
    <div
      className="sticky top-[var(--navbar-height)] z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-5 bg-white"
      // Opaque, not translucent: cards passing under the bar should disappear
      // cleanly rather than ghost through it.
      style={{ borderBottom: "1px solid var(--cat-edge)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="cat-nums text-xs sm:text-[13px] truncate" style={{ color: "var(--cat-ink-soft)" }}>
          {busy ? (
            "Updating…"
          ) : (
            <>
              <span className="font-semibold" style={{ color: "var(--cat-ink)" }}>
                {matched}
              </span>
              {matched === total ? " pieces" : ` of ${total} pieces`}
              {/* Only worth saying once the grid is a window onto something larger. */}
              {shown < matched && <span className="hidden sm:inline"> · showing {shown}</span>}
            </>
          )}
        </p>

        <div className="flex items-center gap-2 shrink-0">
          <FiltersSheet
            matched={matched}
            busy={busy}
            activeCount={activeCount}
            facets={facets}
            isSelected={isSelected}
            onToggle={onToggle}
            onSale={onSale}
            inStockOnly={inStockOnly}
            onFlag={onFlag}
            onClear={onClear}
          />

          <Select value={sort} onValueChange={(v) => onSort(v as CategorySort)}>
            <SelectTrigger
              className="h-9 w-[150px] sm:w-[200px] justify-between gap-1.5 rounded-none bg-transparent text-xs sm:text-[13px] font-medium shrink-0 focus:ring-0 focus:ring-offset-0"
              style={{ border: "1px solid var(--cat-edge)", color: "var(--cat-ink)" }}
            >
              <span className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="shrink-0 max-sm:hidden" style={{ color: "var(--cat-ink-soft)" }}>Sort&nbsp;:&nbsp;</span>
                <span className="flex-1 text-center min-w-0">
                  <SelectValue />
                </span>
              </span>
            </SelectTrigger>
            <SelectContent>
              {sortKeys.map((k) => (
                <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ─── Filter drawer ───────────────────────────────────────────────────────────
// Everything whose values have no natural order. Age is deliberately absent —
// the rail above owns it, and offering it twice would let the page contradict
// itself. Every group is driven by the facets the backend sent, so a category
// with no occasions simply has no Occasion group rather than an empty one, and
// each option carries its size, which is what stops a shopper assembling a
// combination that can only return nothing.
//
// Selections apply immediately rather than on an "Apply" press: the whole
// category is already in the backend's memory, so a round trip is cheap, and the
// footer's live count is only honest if the filters really are live.
function FiltersSheet({
  matched, busy, activeCount, facets, isSelected, onToggle, onSale, inStockOnly, onFlag, onClear,
}: {
  matched: number;
  busy: boolean;
  activeCount: number;
  facets: CategoryFacets;
  isSelected: (group: ListGroup, value: string) => boolean;
  onToggle: (group: ListGroup, value: string) => void;
  onSale: boolean;
  inStockOnly: boolean;
  onFlag: (flag: "onSale" | "inStockOnly", on: boolean) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  // The rail upstairs has the age bands; the drawer keeps what is left — garment
  // letters and one-offs like "Free Size", which have no order to draw.
  const otherSizes = facets.sizes.filter((s) => s.kind !== "age");

  const chipClass = (active: boolean) =>
    `px-3.5 py-1.5 text-[13px] font-medium transition-colors ${active ? "" : "hover:opacity-70"}`;

  const chipStyle = (active: boolean) => ({
    border: `1px solid ${active ? "var(--cat-mark)" : "var(--cat-edge)"}`,
    backgroundColor: active ? "var(--cat-mark)" : "transparent",
    color: active ? "#fff" : "var(--cat-ink)",
  });

  const chipGroup = (group: ListGroup, values: FacetValue[]) => (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => {
        const active = isSelected(group, v.value);
        return (
          <button key={v.value} onClick={() => onToggle(group, v.value)} className={chipClass(active)} style={chipStyle(active)}>
            {v.label}
            <span className="cat-nums ml-1.5 opacity-60">{v.count}</span>
          </button>
        );
      })}
    </div>
  );

  const checkGroup = (group: ListGroup, values: FacetValue[]) => (
    <div className="space-y-2.5">
      {values.map((v) => (
        <label key={v.value} className="flex items-center gap-2.5 cursor-pointer group">
          <Checkbox checked={isSelected(group, v.value)} onCheckedChange={() => onToggle(group, v.value)} />
          <span className="text-sm" style={{ color: "var(--cat-ink)" }}>{v.label}</span>
          <span className="cat-nums text-xs" style={{ color: "var(--cat-ink-soft)" }}>{v.count}</span>
        </label>
      ))}
    </div>
  );

  // The In-stock toggle is always offered, so the drawer is never literally
  // empty — but a drawer holding nothing BUT that toggle isn't worth opening.
  const nothingToFilter =
    otherSizes.length === 0 && facets.genders.length === 0 && facets.priceBuckets.length === 0 &&
    facets.colors.length === 0 && facets.occasions.length === 0 && facets.tags.length === 0 &&
    facets.badges.length === 0 && facets.onSale === 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          disabled={nothingToFilter}
          className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 text-xs sm:text-[13px] font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ border: "1px solid var(--cat-edge)", color: "var(--cat-ink)" }}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {activeCount > 0 && (
            <span
              className="cat-nums inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: "var(--cat-mark)" }}
            >
              {activeCount}
            </span>
          )}
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 bg-white">
        <SheetHeader className="px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--cat-edge)" }}>
          <SheetTitle className="font-display text-2xl" style={{ color: "var(--cat-ink)" }}>Filters</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-7">
          {facets.genders.length > 0 && (
            <FilterGroup label="For">
              {chipGroup("genders", facets.genders)}
              <p className="mt-2 text-[11px]" style={{ color: "var(--cat-ink-soft)" }}>
                Unisex styles appear under both.
              </p>
            </FilterGroup>
          )}

          {facets.priceBuckets.length > 0 && <FilterGroup label="Price">{chipGroup("priceBuckets", facets.priceBuckets)}</FilterGroup>}

          {facets.colors.length > 0 && (
            <FilterGroup label="Colour">
              <div className="flex flex-wrap gap-2">
                {facets.colors.map((c) => {
                  const active = isSelected("colors", c.value);
                  return (
                    <button
                      key={c.value}
                      onClick={() => onToggle("colors", c.value)}
                      className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-70"
                      style={chipStyle(active)}
                    >
                      <span
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: c.hex, border: "1px solid rgba(0,0,0,0.15)" }}
                      />
                      {c.label}
                      <span className="cat-nums opacity-60">{c.count}</span>
                    </button>
                  );
                })}
              </div>
            </FilterGroup>
          )}

          {facets.occasions.length > 0 && <FilterGroup label="Occasion">{checkGroup("occasions", facets.occasions)}</FilterGroup>}
          {otherSizes.length > 0 && <FilterGroup label="Other sizes">{chipGroup("sizes", otherSizes)}</FilterGroup>}
          {facets.badges.length > 0 && <FilterGroup label="Collections">{chipGroup("badges", facets.badges)}</FilterGroup>}
          {facets.tags.length > 0 && <FilterGroup label="Style">{chipGroup("tags", facets.tags)}</FilterGroup>}

          <FilterGroup label="Availability">
            <div className="space-y-2.5">
              {facets.onSale > 0 && (
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <Checkbox checked={onSale} onCheckedChange={(v) => onFlag("onSale", !!v)} />
                  <span className="text-sm" style={{ color: "var(--cat-ink)" }}>On sale only</span>
                  <span className="cat-nums text-xs" style={{ color: "var(--cat-ink-soft)" }}>{facets.onSale}</span>
                </label>
              )}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox checked={inStockOnly} onCheckedChange={(v) => onFlag("inStockOnly", !!v)} />
                <span className="text-sm" style={{ color: "var(--cat-ink)" }}>In stock only</span>
                <span className="cat-nums text-xs" style={{ color: "var(--cat-ink-soft)" }}>{facets.inStock}</span>
              </label>
            </div>
          </FilterGroup>
        </div>

        <SheetFooter className="px-6 py-4 flex-row gap-3" style={{ borderTop: "1px solid var(--cat-edge)" }}>
          <button
            onClick={onClear}
            disabled={activeCount === 0}
            className="flex-1 h-11 text-[13px] font-semibold uppercase tracking-[0.12em] transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{ border: "1px solid var(--cat-edge)", color: "var(--cat-ink)" }}
          >
            Clear all
          </button>
          <SheetClose asChild>
            <button
              className="flex-1 h-11 text-[13px] font-semibold uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--cat-mark)" }}
            >
              {busy ? "Updating…" : `Show ${matched}`}
            </button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="font-body text-[10px] font-semibold uppercase mb-3"
        style={{ letterSpacing: "0.2em", color: "var(--cat-ink-soft)" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

// ─── Active filter chips ─────────────────────────────────────────────────────
// What is currently narrowing the grid, spelled out and individually removable.
// Without this the only record of a filter is a number on a closed drawer, and a
// shopper looking at four pieces out of forty has no way to see why.
function ActiveChips({
  facets, groups, isSelected, onSale, inStockOnly, onToggle, onFlag, onClear,
}: {
  facets: CategoryFacets;
  groups: Record<ListGroup, string[]>;
  isSelected: (group: ListGroup, value: string) => boolean;
  onSale: boolean;
  inStockOnly: boolean;
  onToggle: (group: ListGroup, value: string) => void;
  onFlag: (flag: "onSale" | "inStockOnly", on: boolean) => void;
  onClear: () => void;
}) {
  // The facets carry the spelling ("3-4 Years"); the URL only carries the wire
  // value ("3-4 years"). Fall back to the raw value so a filter set by hand in the
  // URL still shows a chip that can be taken off.
  const labelFor = (group: ListGroup, value: string): string => {
    const list = facets[FACET_KEY[group]] as FacetValue[];
    return list.find((f) => f.value === value)?.label ?? value;
  };

  const order: ListGroup[] = ["sizes", "genders", "priceBuckets", "colors", "occasions", "badges", "tags"];

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      {order.flatMap((group) =>
        groups[group].filter((v) => isSelected(group, v)).map((value) => (
          <ActiveChip
            key={`${group}-${value}`}
            label={labelFor(group, value)}
            onRemove={() => onToggle(group, value)}
          />
        )),
      )}
      {onSale && <ActiveChip label="On sale" onRemove={() => onFlag("onSale", false)} />}
      {inStockOnly && <ActiveChip label="In stock" onRemove={() => onFlag("inStockOnly", false)} />}
      <button
        onClick={onClear}
        className="ml-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition-opacity hover:opacity-60"
        style={{ color: "var(--cat-mark)" }}
      >
        Clear all
      </button>
    </div>
  );
}

/** Which key on CategoryFacets holds each filter group's options. */
const FACET_KEY: Record<ListGroup, keyof CategoryFacets> = {
  genders: "genders",
  occasions: "occasions",
  tags: "tags",
  sizes: "sizes",
  colors: "colors",
  badges: "badges",
  priceBuckets: "priceBuckets",
};

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      onClick={onRemove}
      className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 text-[11px] font-medium transition-opacity hover:opacity-70"
      style={{ border: "1px solid var(--cat-edge)", backgroundColor: "var(--cat-halo)", color: "var(--cat-ink)" }}
      aria-label={`Remove filter ${label}`}
    >
      {label}
      <X className="w-3 h-3" />
    </button>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
// Borderless and shadowless at rest — the picture is the card, and forty framed
// boxes on a tinted page is forty frames competing with the clothes inside them.
// The frame arrives on hover, along with the QuickAdd.
//
// ONE CARD IS ONE COLOURWAY. A kurta cut in three colours is three cards, each
// showing its own photograph. It was one card carrying swatches that swapped the
// picture on hover, and that buried two thirds of the shop: a colour only exists
// to a shopper once they have seen it, and a swatch is not a garment. Scanning a
// grid is how a category gets shopped, so every colourway is in the grid to be
// scanned. It also makes the colour filter honest (see passesFilters on the
// server), and it is what the search results page has always done.
//
// Everything below therefore addresses THIS colourway: its sku opens its own PDP,
// the heart saves it — the server stores a variant sku as given, and only
// rewrites a base sku — the QuickAdd adds it, and "Sold out" is about this colour
// rather than about whether any colour of the garment is left.
function ProductCard({ product: p, index }: { product: CategoryProduct; index: number }) {
  const navigate = useNavigate();
  const { isWishlisted, addToWishlist, removeFromWishlist, wishlistItems } = useWishlist();

  const sku = p.sku;
  const onSale = p.originalPrice > p.price;
  const href = buildPdpPath(p.categorySlug, p.slug, sku);
  const colorName = p.color?.name?.trim() ?? "";
  // Two colourways of one garment carry the same title, so the colour is what
  // tells the cards apart — in the accessible name as much as on screen.
  const cardLabel = colorName ? `${p.title} in ${colorName}` : p.title;

  const wishlisted = isWishlisted(p.slug, sku);

  const toggleWishlist = () => {
    const existing = wishlistItems.find((i) => i.slug === p.slug && i.sku === sku);
    if (existing) void removeFromWishlist(existing.id);
    else void addToWishlist(p.slug, sku);
  };

  return (
    <div
      onClick={() => navigate(href)}
      // A div rather than an anchor: the card holds a heart and the QuickAdd
      // popover, and nesting those in an <a> is invalid. role/tabIndex/Enter keep
      // it reachable without one.
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") navigate(href); }}
      aria-label={cardLabel}
      className="cat-card group cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
      style={{
        outlineColor: "var(--cat-mark)",
        // Capped so the last card of a full page still lands within half a
        // second — a stagger that runs the length of the grid is a wait.
        animationDelay: `${Math.min(index, 11) * 45}ms`,
      }}
    >
      <div
        className="relative overflow-hidden aspect-[4/5] transition-shadow duration-300 group-hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.45)]"
        style={{ backgroundColor: "var(--cat-halo)" }}
      >
        {p.image ? (
          <img
            src={p.image}
            alt={cardLabel}
            loading="lazy"
            onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
            className={`w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.04] ${
              p.inStock ? "" : "grayscale-[0.55]"
            }`}
          />
        ) : (
          <div className="w-full h-full" style={{ backgroundColor: "var(--cat-halo)" }} />
        )}

        {p.badges[0] && (
          <span
            className="absolute top-0 left-0 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white"
            style={{ backgroundColor: "var(--cat-mark)" }}
          >
            {p.badges[0]}
          </span>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); toggleWishlist(); }}
          className="absolute top-2 right-2 w-8 h-8 bg-white/85 backdrop-blur-sm rounded-full flex items-center justify-center transition-all hover:bg-white"
          style={{ color: wishlisted ? "var(--cat-mark)" : "var(--cat-ink-soft)" }}
          aria-label={wishlisted ? `Remove ${cardLabel} from wishlist` : `Save ${cardLabel} to wishlist`}
        >
          <Heart className="w-4 h-4" fill={wishlisted ? "currentColor" : "none"} />
        </button>

        {p.inStock ? (
          <div
            className="hidden md:block absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <QuickAddButton product={{ slug: p.slug, sku }} />
          </div>
        ) : (
          /* A band, not a veil: the picture is already desaturated, so the label
             only has to say the word — covering the whole photograph to say it
             hides the thing the shopper is deciding about. */
          <span
            className="absolute bottom-0 left-0 right-0 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ backgroundColor: "rgba(0,0,0,0.62)" }}
          >
            Sold out
          </span>
        )}
      </div>

      <div className="pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-body text-[13px] sm:text-sm leading-snug line-clamp-2" style={{ color: "var(--cat-ink)" }}>
            {p.title}
          </h3>
          <p className="cat-nums shrink-0 text-[13px] sm:text-sm font-semibold" style={{ color: "var(--cat-ink)" }}>
            {rupees(p.price)}
          </p>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-3">
          {/* The colour, named and swatched. It carries more weight than its size
              suggests: it is the only thing telling two cards of the same garment
              apart, so it is set as a line of text and not a bare dot — a shopper
              can read "Mustard" but can only guess at a 12px circle, and the pair
              survives both a colour-blind reader and a badly lit photograph. */}
          {colorName ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className="w-3 h-3 shrink-0 rounded-full"
                style={{ backgroundColor: p.color.hex, border: "1px solid rgba(0,0,0,0.18)" }}
              />
              <span className="truncate text-[11px]" style={{ color: "var(--cat-ink-soft)" }}>
                {colorName}
              </span>
            </span>
          ) : (
            <span />
          )}

          {onSale && (
            <span className="cat-nums flex shrink-0 items-baseline gap-1.5 text-[11px]">
              <span className="line-through" style={{ color: "var(--cat-ink-soft)" }}>{rupees(p.originalPrice)}</span>
              <span className="font-semibold" style={{ color: "var(--cat-mark)" }}>−{p.discountPct}%</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── The other three categories ──────────────────────────────────────────────
// These pages have no entry point anywhere else in the storefront by design —
// they are not in the nav, the Browse Collections strip or the Spotlight — so
// without this a shopper who lands on one has no way to reach the other three.
//
// The tiles used to be small copies of the placard: each printed on its own deep
// ground, bandhani texture and all, with cream type over it. That looked like the
// set but read badly — a name and a count in pale type over a dot pattern is the
// worst surface on the page for small text, and three saturated blocks closed a
// white page with a thud.
//
// So they are plain now: dark type on white, ordinary sentence case, and each
// category's colour reduced to a single bar down the left edge and the border it
// takes on hover. The set still reads as a set, because the colours are still the
// four grounds — they have just stopped competing with the words in front of them.
function OtherCategories({ current }: { current: string }) {
  const others = CATEGORIES.filter((c) => c.slug !== current);

  // One request for all four sizes, rather than three listing requests this would
  // throw away everything but the count from. Counts are what turn these from
  // three links into three decisions.
  const [counts, setCounts] = useState<CategoryCounts | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchCategoryCounts(ctrl.signal)
      .then(setCounts)
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        console.error("[CategoryPage] category counts failed:", err);
        setCounts({});
      });
    return () => ctrl.abort();
  }, []);

  if (others.length === 0) return null;

  return (
    <section className="mt-16 sm:mt-20">
      <hr className="border-0 border-t" style={{ borderColor: "var(--cat-edge)" }} />
      <p
        className="font-body text-[10px] sm:text-[11px] font-semibold uppercase mb-5 pt-10"
        style={{ letterSpacing: "0.24em", color: "var(--cat-ink-soft)" }}
      >
        More categories
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {others.map((c) => {
          const count = counts?.[c.slug];
          return (
            <Link
              key={c.slug}
              to={`/collections/${c.slug}`}
              className="cat-tile group flex items-stretch gap-4 border border-gray-400 bg-white pr-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ ["--tile" as string]: c.field, outlineColor: c.field }}
            >
              {/* The whole of the category's colour on this tile: one bar, full
                  height, nothing printed on top of it. */}
              <span aria-hidden="true" className="w-1.5 shrink-0" style={{ backgroundColor: c.field }} />

              <span className="min-w-0 flex-1 py-4">
                <span
                  className="font-display block text-lg sm:text-xl"
                  style={{ color: "var(--cat-ink)", fontWeight: 600, letterSpacing: "-0.01em" }}
                >
                  {c.label}
                </span>
                {/* Sentence case at 13px, not tracked-out micro-caps: this is a
                    number someone reads, not a label. An em dash holds the line
                    while the counts are in flight so three tiles don't jump when
                    they land. */}
                <span className="cat-nums mt-0.5 block font-body text-[13px]" style={{ color: "var(--cat-ink-soft)" }}>
                  {counts === null ? "—" : `${count ?? 0} ${count === 1 ? "piece" : "pieces"}`}
                </span>
              </span>

              <ArrowRight
                className="h-4 w-4 shrink-0 self-center transition-transform group-hover:translate-x-1"
                style={{ color: "var(--cat-ink-soft)" }}
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** The category itself is empty — nothing is stocked under it at all. */
function EmptyState({ label, onBrowse }: { label: string; onBrowse: () => void }) {
  return (
    <div
      className="w-full py-16 sm:py-24 flex flex-col items-center justify-center text-center px-4"
      style={{ border: "1px solid var(--cat-edge)" }}
    >
      <PackageSearch size={40} className="mb-5 opacity-30" style={{ color: "var(--cat-mark)" }} />
      <p className="font-display text-2xl sm:text-3xl mb-2" style={{ color: "var(--cat-ink)" }}>
        No {label.toLowerCase()} yet
      </p>
      <p className="text-sm max-w-sm mb-7" style={{ color: "var(--cat-ink-soft)" }}>
        Nothing is stocked in this category right now. New pieces land most weeks.
      </p>
      <button
        onClick={onBrowse}
        className="h-11 px-8 text-[13px] font-semibold uppercase tracking-[0.14em] text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: "var(--cat-mark)" }}
      >
        Browse collections
      </button>
    </div>
  );
}

/** The category has stock, but the filters left none of it — a different dead end
 *  with a different way out: undo the filters rather than leave the page. */
function FilteredEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div
      className="w-full py-16 flex flex-col items-center justify-center text-center px-4"
      style={{ border: "1px solid var(--cat-edge)" }}
    >
      <p className="font-display text-xl sm:text-2xl mb-2" style={{ color: "var(--cat-ink)" }}>
        Nothing matches these filters
      </p>
      <p className="text-sm mb-6" style={{ color: "var(--cat-ink-soft)" }}>
        Try removing one to widen the search.
      </p>
      <button
        onClick={onClear}
        className="h-10 px-7 text-[12px] font-semibold uppercase tracking-[0.14em] transition-opacity hover:opacity-70"
        style={{ border: "1px solid var(--cat-mark)", color: "var(--cat-mark)" }}
      >
        Clear all filters
      </button>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[4/5]" style={{ backgroundColor: "var(--cat-halo)" }} />
          <div className="pt-3 space-y-2">
            <div className="h-3 w-3/4" style={{ backgroundColor: "var(--cat-halo)" }} />
            <div className="h-3 w-1/3" style={{ backgroundColor: "var(--cat-halo)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
