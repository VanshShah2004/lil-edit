import { useNavigate } from "react-router-dom";
import SectionHeading from "./SectionHeading";
import { useCuratedSection, pdpUrlFor } from "@/hooks/useCuratedSection";
import type { ResolvedItem } from "@/lib/curationApi";

interface Tile {
  key: string;
  /** Small uppercase line above the caption: a product's live price, or a tile's own sub-caption. */
  eyebrow: string;
  caption: string;
  image: string;
  /** Absent only on a photo tile the admin left without a link. */
  onClick?: () => void;
}

// Hand-tuned row spans, the same mosaic rhythm the arrivals page uses for its
// "From the Collection" tail. Rows are 90–120px so the shortest tile still reads
// as a garment rather than a sliver of fabric. Applied POSITIONALLY, so an item
// lands in whatever shape its slot has — the editor has no span control. The
// cycle repeats if the section is ever raised past eight items.
const BENTO_SPANS = [
  "row-span-3", "row-span-2", "row-span-3", "row-span-4",
  "row-span-2", "row-span-3", "row-span-2", "row-span-3",
];

/**
 * "Styled by Our Community" — the bento mosaic that closes the Collections page.
 *
 * Curated through the Spotlight (collections_gallery). Two kinds of tile reach it:
 *
 *   • real catalog PRODUCTS — live image, title and price, opening that product's
 *     PDP. This is what the section shows BY DEFAULT: while nothing is curated the
 *     backend fills every slot with random published products (the section is
 *     item_type 'mixed', see resolveItems in backend/routes/curation.ts), reshuffled
 *     once per cache window so the mosaic isn't the same eight pieces forever.
 *   • photo TILES the admin uploaded — a community shot with its own caption,
 *     sub-caption and link. Adding these is the only thing the Spotlight offers
 *     here; the catalog picker is deliberately off (TILES_ONLY in pages/admin/
 *     Spotlight), because products are what this section falls back to, not
 *     something an admin should be hand-picking into a community strip.
 *
 * There is deliberately NO local mock content. Everything on screen is real: if
 * curation is unavailable (request failed, section disabled, or the migration not
 * yet applied) the mosaic renders nothing at all rather than placeholder art, and
 * the Collections page simply closes on the newsletter block instead.
 *
 * The section's heading and blurb are curated too ("Edit heading"), falling back
 * to the copy shipped here.
 */
export default function CommunityGallery({
  previewItems,
  previewTitle,
  previewSubtitle,
}: {
  previewItems?: ResolvedItem[];
  previewTitle?: string | null;
  previewSubtitle?: string | null;
}) {
  const preview = previewItems !== undefined;
  const navigate = useNavigate();
  const {
    items: fetchedItems,
    title: fetchedTitle,
    subtitle: fetchedSubtitle,
  } = useCuratedSection("collections_gallery", { skip: preview });

  const items = preview ? previewItems : fetchedItems;
  const heading = (preview ? previewTitle : fetchedTitle) ?? "Styled by Our Community";
  const blurb = (preview ? previewSubtitle : fetchedSubtitle) ?? "Real looks, worn by real little people.";

  const go = (link: string) => {
    if (/^https?:\/\//i.test(link)) window.location.assign(link);
    else navigate(link);
  };

  const tiles: Tile[] = items
    // A tile here IS a picture, so anything that resolved without one is dropped
    // rather than rendered as a blank slot.
    .filter((it) => !!it.image)
    .map((it): Tile =>
      it.kind === "editorial"
        ? {
            key: it.id,
            eyebrow: it.subtitle ?? "",
            caption: it.title ?? "",
            image: it.image as string,
            onClick: it.link ? () => go(it.link as string) : undefined,
          }
        : {
            key: it.id,
            eyebrow: `₹${it.price}`,
            caption: it.title,
            image: it.image as string,
            onClick: () => navigate(pdpUrlFor(it)),
          },
    );

  console.log(`[CommunityGallery] ${items.length} item(s) → rendering ${tiles.length} tile(s)`);

  // Nothing real to show — render no heading either, rather than an empty grid
  // under a title. Also covers the first paint, before the fetch settles.
  if (tiles.length === 0) return null;

  return (
    <section>
      <SectionHeading label={heading} count={tiles.length} blurb={blurb} />

      <div className="grid grid-cols-2 gap-2.5 auto-rows-[90px] sm:grid-cols-3 sm:gap-3 sm:auto-rows-[100px] md:auto-rows-[120px] [grid-auto-flow:dense]">
        {tiles.map((item, idx) => (
          <figure
            key={item.key}
            className={`group relative rounded-xl sm:rounded-2xl overflow-hidden border border-gray-400 shadow-md hover:shadow-xl hover:border-gray-500 transition-all ${BENTO_SPANS[idx % BENTO_SPANS.length]}`}
          >
            <img
              src={item.image}
              alt={item.caption}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

            <figcaption className="absolute inset-x-0 bottom-0 p-3 sm:p-4 flex flex-col items-start justify-end">
              <span className="text-[9px] sm:text-[11px] font-semibold tracking-wider text-white/90 uppercase mb-0.5 sm:mb-1 drop-shadow-md">
                {item.eyebrow}
              </span>
              <h3 className="text-xs sm:text-sm md:text-base font-bold text-white leading-tight drop-shadow-md line-clamp-2 group-hover:-translate-y-1 transition-transform duration-300">
                {item.caption}
              </h3>
            </figcaption>

            {/* A tile that goes somewhere gets a transparent hit layer over the
                whole picture, rather than the figure itself becoming a control:
                figcaption is only valid inside a figure, and only a tile with a
                destination should sit in the tab order. */}
            {item.onClick && (
              <button
                type="button"
                onClick={item.onClick}
                aria-label={item.caption ? `Open ${item.caption}` : "Open this look"}
                className="absolute inset-0 z-10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white/70"
              />
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}
