import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import SectionHeading from "./SectionHeading";
import { SUB_COLLECTIONS, type SubCollection } from "./subCollections";
import { useCuratedSection, metaStr } from "@/hooks/useCuratedSection";
import type { ResolvedItem, ResolvedEditorialItem } from "@/lib/curationApi";
import {
  fetchNewArrivals, fetchCollectionCounts,
  type NewArrivalProduct, type CollectionCounts,
} from "@/services/searchService";
import {
  Carousel, CarouselContent, CarouselItem, type CarouselApi,
} from "@/components/ui/carousel";

// "12 styles" / "1 style" — null (fetch failed or field missing) renders nothing
// at all rather than a misleading "0 styles".
function stylesLabel(count: number | null | undefined): string | null {
  if (count === null || count === undefined) return null;
  return `${count} ${count === 1 ? "style" : "styles"}`;
}

const onlyEditorials = (items: ResolvedItem[]) =>
  items.filter((i): i is ResolvedEditorialItem => i.kind === "editorial");

/**
 * "Browse the Collections" — the placard carousel plus the gradient tile rows.
 *
 * Labels, blurbs, icons and gradients are fixed in code (SUB_COLLECTIONS above).
 * Two things per placard are curated, both optional: its IMAGE and its LINK. The
 * Spotlight editor offers an image upload and a product dropdown for the link —
 * no free-text URL — so a placard can only ever point at a real published product
 * or, left empty, at its own collection listing.
 *
 * collections_browse holds at most one tile per sub-collection. Each tile NAMES
 * its placard in meta.collection (a SUB_COLLECTIONS key), so row order carries no
 * meaning and reordering the list can never re-point a picture. Both fields fall
 * back independently:
 *
 *   image:  tile image  →  newest product in that collection  →  gradient + icon
 *   link:   tile link   →  that collection's own /collections/… route
 *
 * So an uncurated collection (or an entirely empty section) leaves the strip
 * exactly as it was before curation existed. The tile rows below the carousel are
 * never curated — they always route into their collection.
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

  // Only the curated tiles are overridden in the admin preview — the fallback
  // products and counts still load live, so the pane shows the strip in context.
  const { editorials: fetchedTiles } = useCuratedSection("collections_browse", { skip: preview });
  const tiles = preview ? onlyEditorials(previewItems) : fetchedTiles;

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

  // The tile curating a given placard, found by the collection it names. The
  // editor allows only one tile per collection, but a stale duplicate (an older
  // draft, or a hand-edited row) would otherwise render unpredictably — first
  // match wins, matching the order the admin list shows them in.
  const tileFor = (key: string): ResolvedEditorialItem | undefined =>
    tiles.find((t) => metaStr(t.meta, "collection") === key);

  // Empty string / undefined is treated as "not set" throughout, so each field
  // falls through to its own default independently of the other.
  const curatedImage = (key: string): string => tileFor(key)?.image || "";
  const curatedLink = (key: string): string => tileFor(key)?.link || "";

  return (
    <section>
      <SectionHeading
        label="Browse the Collections"
        blurb="Every edit we stock, one tap away."
      />

      <div className="mb-6 sm:mb-8">
        <CollectionsPlacardCarousel previews={previews} counts={counts} curatedImage={curatedImage} curatedLink={curatedLink} />
      </div>

      <div className="space-y-1.5 sm:space-y-2">
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <CollectionTile collection={SUB_COLLECTIONS[1]} counts={counts} heightClass="h-28 sm:h-36" />
          <CollectionTile collection={SUB_COLLECTIONS[2]} counts={counts} heightClass="h-28 sm:h-36" />
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          <CollectionTile collection={SUB_COLLECTIONS[0]} counts={counts} />
          <CollectionTile collection={SUB_COLLECTIONS[3]} counts={counts} />
          <CollectionTile collection={SUB_COLLECTIONS[4]} counts={counts} />
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
  previews, counts, curatedImage, curatedLink,
}: {
  previews: Record<string, NewArrivalProduct>;
  counts: CollectionCounts | null;
  curatedImage: (key: string) => string;
  curatedLink: (key: string) => string;
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
          {SUB_COLLECTIONS.map(({ key, to, countKey, label, blurb, icon: Icon, gradient }) => {
            const p = previews[to];
            const styles = stylesLabel(counts?.[countKey]);
            // Admin's picture wins; otherwise the collection's newest product.
            const image = curatedImage(key) || p?.image || "";
            // Admin's product link wins; otherwise the collection's own listing.
            const href = curatedLink(key) || to;
            return (
              <CarouselItem key={to} className="pl-0">
                <div className="h-full px-0.5">
                  {/* A real anchor, not a click handler: keyboard focus,
                      middle-click and open-in-new-tab all work. Embla's own
                      capture-phase click guard preventDefaults the event after
                      a drag, so dragging the carousel never navigates. */}
                  <Link
                    to={href}
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
  collection: { to, countKey, label, icon: Icon, gradient },
  counts,
  heightClass = "h-40 sm:h-52",
}: { collection: SubCollection; counts: CollectionCounts | null; heightClass?: string }) {
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
