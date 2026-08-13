import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import SectionHeading from "./SectionHeading";
import { SUB_COLLECTIONS, type SubCollection } from "./subCollections";
import { useCuratedSection, metaStr } from "@/hooks/useCuratedSection";
import type { ResolvedItem, ResolvedEditorialItem } from "@/lib/curationApi";
import {
  fetchNewArrivals, fetchCollectionCounts,
  type NewArrivalProduct, type CollectionCounts, type CollectionWearTypes,
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

// Is the page actually being looked at? Drives the carousel's autoplay pause.
//
// document.hidden covers a backgrounded tab or a fully occluded window. Losing
// window focus (switching to another app while the browser stays visible) only
// counts at the top level: inside the Spotlight's live-preview iframe the parent
// editor always holds focus, so honouring it there would freeze that pane's
// carousel for good. The iframe still sees the real tab's visibility.
function pageIsAway(): boolean {
  const focusMatters = window.self === window.top;
  return document.hidden || (focusMatters && !document.hasFocus());
}

/**
 * "Browse Collections" — the placard carousel plus the gradient tile rows.
 *
 * The section's own heading and blurb are curated (Spotlight → "Edit heading"),
 * falling back to the copy shipped here. Everything INSIDE a placard — its label,
 * blurb, icon and gradient — is still fixed in code (SUB_COLLECTIONS above).
 *
 * Two things per placard are curated, both optional: its IMAGE and its LINK. The
 * Spotlight editor shows one card per sub-collection; opening a card offers an
 * image upload and a product dropdown for the link — no free-text URL — so a
 * placard can only ever point at a real published product or, left empty, at its
 * own collection listing.
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
export default function BrowseCollections({
  previewItems,
  previewTitle,
  previewSubtitle,
}: {
  previewItems?: ResolvedItem[];
  previewTitle?: string | null;
  previewSubtitle?: string | null;
}) {
  const preview = previewItems !== undefined;
  // One real product per sub-collection, keyed by route, as the image fallback.
  // Girls/Boys/Trending need their own calls — the arrivals payload carries
  // occasion and isTrending, but not gender, so it can't be split client-side.
  const [previews, setPreviews] = useState<Record<string, NewArrivalProduct>>({});
  // Style counts per collection. Its own request (and own catch) so a counts
  // failure never costs the strip its imagery, or vice-versa.
  const [counts, setCounts] = useState<CollectionCounts | null>(null);
  // Which wear types each collection spans, from the same response. Server-derived
  // off the whole catalog rather than the preview products, so a collection holding
  // one lone Accessories piece still names it.
  const [wearTypes, setWearTypes] = useState<CollectionWearTypes | null>(null);

  // Only the curated tiles are overridden in the admin preview — the fallback
  // products and counts still load live, so the pane shows the strip in context.
  const {
    editorials: fetchedTiles,
    title: fetchedTitle,
    subtitle: fetchedSubtitle,
  } = useCuratedSection("collections_browse", { skip: preview });
  const tiles = preview ? onlyEditorials(previewItems) : fetchedTiles;

  // Heading and blurb come from the section record, edited via the Spotlight's
  // "Edit heading". The shipped copy is the fallback, so an unseeded section, a
  // cleared field or a failed fetch still renders the strip exactly as before.
  const heading = (preview ? previewTitle : fetchedTitle) ?? "Browse Collections";
  const blurb = (preview ? previewSubtitle : fetchedSubtitle) ?? "Every edit we stock, one tap away.";

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
        setWearTypes(data?.wearTypes ?? null);
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
  // Only the picture and the sub-heading are curatable. The placard's name is the
  // label the side menu and the mini tiles use for the same link, and its route is
  // the collection it fronts — both stay fixed in SUB_COLLECTIONS.
  const curatedSubtitle = (key: string): string => tileFor(key)?.subtitle || "";

  return (
    <section>
      <SectionHeading label={heading} blurb={blurb} />

      <div className="mb-6 sm:mb-8">
        <CollectionsPlacardCarousel
          previews={previews}
          counts={counts}
          curatedImage={curatedImage}
          curatedSubtitle={curatedSubtitle}
          wearTypes={wearTypes}
        />
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
  previews, counts, curatedImage, curatedSubtitle, wearTypes,
}: {
  previews: Record<string, NewArrivalProduct>;
  counts: CollectionCounts | null;
  curatedImage: (key: string) => string;
  curatedSubtitle: (key: string) => string;
  wearTypes: CollectionWearTypes | null;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [activeIndex, setActiveIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  // True whenever the page isn't actually being looked at. Lazy initial read covers
  // mounting into an already-hidden tab (a background-loaded page).
  const [away, setAway] = useState(pageIsAway);

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

  // Autoplay must stop while the page is away, not just look stopped. A hidden tab
  // still runs setInterval (throttled), but the rAF driving Embla's animation is
  // frozen — so scrollNext() kept queueing targets that couldn't animate, and coming
  // back replayed the whole backlog at once as a jarring skid across several
  // placards. Pausing on visibility/focus means you return to the slide you left on
  // and the next advance is a normal, animated one 3s later.
  useEffect(() => {
    const sync = () => {
      const next = pageIsAway();
      console.log(`[BrowseCollections] carousel ${next ? "paused — page away" : "resumed — page back"}`);
      setAway(next);
    };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
    };
  }, []);

  useEffect(() => {
    if (!api || hovered || dragging || away) return;
    const id = setInterval(() => api.scrollNext(), 3000);
    return () => clearInterval(id);
  }, [api, hovered, dragging, away]);

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
            // Every wear type the collection holds, most common first. Falls back to
            // the preview product's own category if the server didn't send the list
            // (older backend, or a degraded counts response), so the row never empties.
            const wears = wearTypes?.[countKey] ?? [];
            const wearLabel = wears.length > 0 ? wears.join(", ") : p?.category ?? "";
            // Admin's picture wins; otherwise the collection's newest product.
            const image = curatedImage(key) || p?.image || "";
            // Admin's sub-heading wins; otherwise the words this placard ships with.
            // The name and the route are never curated — see curatedSubtitle's note.
            const subheading = curatedSubtitle(key) || blurb;
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

                      {/* Text side — spacing is grouped rather than uniform, so the
                          column reads as two blocks instead of five evenly-spaced
                          lines: the eyebrow hugs the name it labels, the sub-heading
                          follows close behind, then a wider break sets the meta row
                          and CTA apart as the card's footer. Every row still reserves
                          its height, so all slides line up regardless of copy length. */}
                      <div className="relative flex flex-col justify-center p-5 sm:p-7 md:p-8">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white/25 rounded-full blur-3xl" />
                        <span className="inline-flex w-fit items-center gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-gray-800">
                          <Icon className="w-3.5 h-3.5" />
                          Collection
                        </span>
                        <h2 className="mt-1.5 text-xl sm:text-2xl md:text-3xl font-bold leading-tight text-gray-900 line-clamp-1">{label}</h2>
                        {/* min-h holds two lines' worth whether or not the copy fills
                            them, so the footer below sits at the same height on every
                            slide instead of riding up under a one-line sub-heading. */}
                        <p className="mt-2 text-xs sm:text-sm leading-relaxed text-gray-700 max-w-md line-clamp-2 min-h-[39px] sm:min-h-[46px]">{subheading}</p>
                        {/* The count and bullet hold the left as fixed items (shrink-0);
                            the wear types take the rest and wrap INSIDE their own column
                            (min-w-0 is what lets a flex item shrink below its content and
                            break), so a long list starts on the count's line and its
                            continuation sits under the wear types rather than back under
                            "N styles". items-start keeps the count on the first line.
                            min-h reserves that second line on mobile (where the narrow
                            card actually wraps) and one line from sm up (where the full
                            list fits across), so the CTA below sits at the same height on
                            every slide instead of jumping as the requests land, and
                            line-clamp-2 caps the growth so it can never overrun the fixed
                            md:h-72 card. */}
                        <div className="mt-4 flex items-start gap-2 min-h-[2rem] sm:min-h-[1.25rem] text-xs sm:text-sm text-gray-600">
                          {styles && <span className="font-semibold text-gray-800 shrink-0">{styles}</span>}
                          {styles && wearLabel && <span className="text-gray-400 shrink-0">•</span>}
                          {wearLabel && <span className="min-w-0 line-clamp-2" title={wearLabel}>{wearLabel}</span>}
                        </div>
                        {/* Stacked mobile layout puts the CTA at the bottom of
                            a full-width block, so it reads better tucked to the
                            right edge. From md up the text sits in its own
                            column beside the image and the pill goes back to
                            leading the left margin with the copy. */}
                        <div className="mt-2.5 sm:mt-3 flex justify-end md:justify-start">
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
