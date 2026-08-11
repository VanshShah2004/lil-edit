import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Heart, Star, TrendingUp, PartyPopper, ArrowRight, type LucideIcon } from "lucide-react";
import SectionHeading from "./SectionHeading";
import { useCuratedSection } from "@/hooks/useCuratedSection";
import type { ResolvedItem, ResolvedProductItem } from "@/lib/curationApi";
import {
  fetchNewArrivals, fetchCollectionCounts,
  type NewArrivalProduct, type CollectionCounts,
} from "@/services/searchService";
import {
  Carousel, CarouselContent, CarouselItem, type CarouselApi,
} from "@/components/ui/carousel";

// Every collection listing the storefront has. Icons match the ones the side
// menu uses for these same links (components/home/UserNavbar), so the two
// navigations agree on what each collection looks like. countKey maps the
// entry onto its field in the /collection-counts payload.
interface SubCollection {
  to: string;
  countKey: keyof CollectionCounts;
  label: string;
  blurb: string;
  icon: LucideIcon;
  gradient: string;
}

const SUB_COLLECTIONS: SubCollection[] = [
  { to: "/collections/new-arrivals", countKey: "newArrivals", label: "New Arrivals", blurb: "Fresh drops landing every week",   icon: Sparkles,    gradient: "from-emerald-100 to-teal-200" },
  { to: "/collections/girls",        countKey: "girls",       label: "Girls",        blurb: "Twirly dresses for little trendsetters", icon: Heart,       gradient: "from-pink-100 to-rose-200" },
  { to: "/collections/boys",         countKey: "boys",        label: "Boys",         blurb: "Everyday fits built for adventure", icon: Star,        gradient: "from-blue-100 to-cyan-200" },
  { to: "/collections/trending",     countKey: "trending",    label: "Trending",     blurb: "The pieces everyone's loving now",  icon: TrendingUp,  gradient: "from-amber-100 to-orange-200" },
  { to: "/collections/occasion",     countKey: "occasion",    label: "By Occasion",  blurb: "Outfits dressed up for celebrations", icon: PartyPopper, gradient: "from-purple-100 to-indigo-200" },
];

// "12 styles" / "1 style" — null (fetch failed or field missing) renders nothing
// at all rather than a misleading "0 styles".
function stylesLabel(count: number | null | undefined): string | null {
  if (count === null || count === undefined) return null;
  return `${count} ${count === 1 ? "style" : "styles"}`;
}

const onlyProducts = (items: ResolvedItem[]) =>
  items.filter((i): i is ResolvedProductItem => i.kind === "product");

/**
 * "Browse the Collections" — the placard carousel plus the gradient tile rows.
 *
 * Labels, blurbs and routes are fixed in code (SUB_COLLECTIONS above): the only
 * curated part is each placard's IMAGE, and it is curated by PICKING A PRODUCT —
 * the admin chooses a catalog product per slot and the placard wears its photo.
 * There is no title/link/upload form, so a placard can never drift away from the
 * collection it routes into.
 *
 * collections_browse holds up to five product picks matched BY POSITION to
 * SUB_COLLECTIONS, and an image resolves in this order:
 *
 *   picked product's photo  →  newest product in that collection  →  gradient + icon
 *
 * So an unfilled slot (or an entirely empty section) leaves the strip exactly as
 * it was before curation existed. Unlike other product sections this one is NOT
 * topped up with random catalog products — see NO_FALLBACK_SECTIONS in
 * backend/routes/curation.ts — because a random product behind "Girls" would be
 * worse than the collection's own newest piece.
 */
export default function BrowseCollections({ previewItems }: { previewItems?: ResolvedItem[] }) {
  const preview = previewItems !== undefined;
  // One real product per sub-collection, keyed by route, as the image fallback.
  // Girls/Boys/Trending need their own calls — the arrivals payload carries
  // occasion and isTrending, but not gender, so it can't be split client-side.
  const [previews, setPreviews] = useState<Record<string, NewArrivalProduct>>({});
  // Style counts per collection. Its own request (and own catch) so a counts
  // failure never costs the strip its imagery, or vice-versa.
  const [counts, setCounts] = useState<CollectionCounts | null>(null);

  // Only the curated picks are overridden in the admin preview — the fallback
  // products and counts still load live, so the pane shows the strip in context.
  const { products: fetchedPicks } = useCuratedSection("collections_browse", { skip: preview });
  const picks = preview ? onlyProducts(previewItems) : fetchedPicks;

  useEffect(() => {
    const ctrl = new AbortController();
    console.log("[BrowseCollections] fetching sub-collection preview products");

    Promise.all([
      fetchNewArrivals(12, ctrl.signal),
      fetchNewArrivals(12, ctrl.signal, "girls"),
      fetchNewArrivals(12, ctrl.signal, "boys"),
      fetchNewArrivals(12, ctrl.signal, undefined, true),
    ])
      .then(([all, girls, boys, trending]) => {
        const occasion = all.find((p) => {
          const o = (p.occasion ?? "").trim();
          return o !== "" && o.toLowerCase() !== "general wear";
        });

        const next: Record<string, NewArrivalProduct> = {};
        const put = (route: string, product?: NewArrivalProduct) => { if (product) next[route] = product; };
        put("/collections/new-arrivals", all[0]);
        put("/collections/girls", girls[0]);
        put("/collections/boys", boys[0]);
        put("/collections/trending", trending[0]);
        put("/collections/occasion", occasion ?? all[1]);

        console.log("[BrowseCollections] preview products resolved for", Object.keys(next).length, "collections");
        setPreviews(next);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") {
          console.log("[BrowseCollections] preview fetch aborted");
          return;
        }
        console.error("[BrowseCollections] preview fetch failed:", err);
      });

    fetchCollectionCounts(ctrl.signal)
      .then((data) => {
        console.log("[BrowseCollections] collection counts resolved:", data);
        setCounts(data);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") {
          console.log("[BrowseCollections] counts fetch aborted");
          return;
        }
        console.error("[BrowseCollections] counts fetch failed:", err);
      });

    return () => ctrl.abort();
  }, []);

  // Photo of the product picked for a collection, by its slot in SUB_COLLECTIONS.
  // Empty string (no pick, or a pick whose product lost its image) is treated as
  // "not set" so it falls through to the collection's own newest product.
  const curatedImage = (index: number): string => picks[index]?.image || "";

  return (
    <section>
      <SectionHeading
        label="Browse the Collections"
        blurb="Every edit we stock, one tap away."
      />

      <div className="mb-6 sm:mb-8">
        <CollectionsPlacardCarousel previews={previews} counts={counts} curatedImage={curatedImage} />
      </div>

      <div className="space-y-1.5 sm:space-y-2">
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <CollectionTile {...SUB_COLLECTIONS[1]} counts={counts} heightClass="h-28 sm:h-36" />
          <CollectionTile {...SUB_COLLECTIONS[2]} counts={counts} heightClass="h-28 sm:h-36" />
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          <CollectionTile {...SUB_COLLECTIONS[0]} counts={counts} />
          <CollectionTile {...SUB_COLLECTIONS[3]} counts={counts} />
          <CollectionTile {...SUB_COLLECTIONS[4]} counts={counts} />
        </div>
      </div>
    </section>
  );
}

// One big placard per collection — near-identical layout to the New Arrivals
// spotlight card (pages/arrivals/ArrivalsPage SpotlightCard): image on one
// side, copy + CTA on the other, gradient bleeding through behind the text.
// Same embla engine + auto-advance/loop pattern too, just a 3s interval
// (vs. the arrivals page's 5s) since there's no drag-to-inspect motivation
// here — it's a route into a collection, not a product.
function CollectionsPlacardCarousel({
  previews, counts, curatedImage,
}: {
  previews: Record<string, NewArrivalProduct>;
  counts: CollectionCounts | null;
  curatedImage: (index: number) => string;
}) {
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
    if (!api || hovered || dragging) return;
    const id = setInterval(() => api.scrollNext(), 3000);
    return () => clearInterval(id);
  }, [api, hovered, dragging]);

  return (
    <div
      className="relative select-none"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Carousel
        setApi={setApi}
        opts={{ loop: true, duration: 30 }}
        className="cursor-grab active:cursor-grabbing"
      >
        <CarouselContent className="ml-0">
          {SUB_COLLECTIONS.map(({ to, countKey, label, blurb, icon: Icon, gradient }, index) => {
            const p = previews[to];
            const styles = stylesLabel(counts?.[countKey]);
            // Admin's picture wins; otherwise the collection's newest product.
            const image = curatedImage(index) || p?.image || "";
            return (
              <CarouselItem key={to} className="pl-0">
                <div className="h-full px-0.5">
                  {/* A real anchor, not a click handler: keyboard focus,
                      middle-click and open-in-new-tab all work. Embla's own
                      capture-phase click guard preventDefaults the event after
                      a drag, so dragging the carousel never navigates. */}
                  <Link
                    to={to}
                    className={`group relative block h-full rounded-3xl overflow-hidden bg-gradient-to-br ${gradient} text-gray-900 border border-gray-400 cursor-pointer hover:border-gray-500 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2`}
                  >
                    <div className="grid h-full grid-rows-[auto_1fr] md:grid-rows-1 md:grid-cols-[2fr_3fr] md:h-72">
                      {/* Image side */}
                      <div className="relative aspect-[4/3] md:aspect-auto md:h-full overflow-hidden">
                        {image ? (
                          <img
                            src={image}
                            alt={label}
                            onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                            className="w-full h-full object-cover object-center group-hover:scale-[1.04] transition-transform duration-700"
                          />
                        ) : (
                          <div className="w-full h-full bg-white/30 grid place-items-center">
                            <Icon className="w-12 h-12 text-gray-900/40" />
                          </div>
                        )}
                      </div>

                      {/* Text side — every row has a reserved height so all
                          slides line up regardless of copy length */}
                      <div className="relative flex flex-col justify-center gap-2 sm:gap-3 p-5 sm:p-7 md:p-8">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white/25 rounded-full blur-3xl" />
                        <span className="inline-flex w-fit items-center gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-gray-800">
                          <Icon className="w-3.5 h-3.5" />
                          Collection
                        </span>
                        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold leading-tight text-gray-900 line-clamp-1">{label}</h2>
                        <p className="text-xs sm:text-sm text-gray-700 max-w-md line-clamp-2">{blurb}</p>
                        {/* Meta row keeps its height even while the count and
                            preview are still in flight, so the CTA below never
                            jumps as the two requests land. */}
                        <div className="flex flex-nowrap overflow-hidden items-center gap-2 min-h-[1.125rem] sm:min-h-[1.25rem] text-xs sm:text-sm text-gray-600">
                          {styles && <span className="font-semibold text-gray-800 shrink-0">{styles}</span>}
                          {styles && p?.category && <span className="text-gray-400 shrink-0">•</span>}
                          {p?.category && <span className="truncate">{p.category}</span>}
                        </div>
                        {/* Stacked mobile layout puts the CTA at the bottom of
                            a full-width block, so it reads better tucked to the
                            right edge. From md up the text sits in its own
                            column beside the image and the pill goes back to
                            leading the left margin with the copy. */}
                        <div className="mt-0.5 sm:mt-1 flex justify-end md:justify-start">
                          <span className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 sm:px-5 h-9 sm:h-10 rounded-full font-semibold text-xs sm:text-sm group-hover:bg-gray-800 transition-colors">
                            Explore
                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>

      {/* Dots */}
      <div className="mt-3 flex justify-center items-center gap-1.5">
        {SUB_COLLECTIONS.map((c, i) => (
          <button
            key={c.to}
            onClick={(e) => { e.stopPropagation(); api?.scrollTo(i); }}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === activeIndex ? "w-5 bg-gray-900" : "w-1.5 bg-gray-400 hover:bg-gray-600"
            }`}
            aria-label={`Show ${c.label}`}
          />
        ))}
      </div>
    </div>
  );
}

// Single gradient tile in the rows below the placard carousel — colour + icon
// only, no product image (curated pictures are a placard-only feature).
function CollectionTile({
  to, countKey, label, icon: Icon, gradient, counts, heightClass = "h-40 sm:h-52",
}: SubCollection & { counts: CollectionCounts | null; heightClass?: string }) {
  const styles = stylesLabel(counts?.[countKey]);

  return (
    <Link
      to={to}
      className={`group relative overflow-hidden rounded-2xl ${heightClass} border border-gray-400 shadow-md hover:shadow-xl hover:border-gray-500 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 bg-gradient-to-br ${gradient}`}
    >
      <div className="absolute inset-0 flex flex-col justify-center items-center text-center p-3 sm:p-4">
        <span className="w-9 h-9 rounded-full grid place-items-center mb-2 shadow-sm transition-transform duration-300 group-hover:scale-110 bg-white/70 text-gray-800">
          <Icon className="w-[18px] h-[18px]" />
        </span>
        <h3 className="text-sm sm:text-base font-bold leading-tight text-gray-900">
          {label}
        </h3>
        {styles && (
          <span className="mt-1 text-[10px] sm:text-xs font-semibold text-gray-700">
            {styles}
          </span>
        )}
      </div>
    </Link>
  );
}
