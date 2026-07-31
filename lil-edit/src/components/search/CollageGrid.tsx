import { useNavigate } from "react-router-dom";
import { useCuratedSection, pdpUrlFor, metaStr } from "@/hooks/useCuratedSection";
import type { ResolvedItem } from "@/lib/curationApi";
import product_images from "@/assets/products";
import img1 from "@/assets/searchbar-frequent_searches/le-1.png";
import img2 from "@/assets/searchbar-frequent_searches/le-2.png";
import img3 from "@/assets/searchbar-frequent_searches/le-3.png";
import img4 from "@/assets/searchbar-frequent_searches/le-4.png";
import img5 from "@/assets/searchbar-frequent_searches/le-5.png";
import img6 from "@/assets/searchbar-frequent_searches/le-6.png";

interface Tile {
  key: string;
  title: string;
  subtitle: string;
  image: string;
  span: string;
  onClick?: () => void;
}

// Hand-tuned masonry spans, applied positionally to curated items (which don't
// carry a span of their own unless an editorial tile sets meta.span).
const SPANS = [
  "col-span-1 row-span-2",
  "col-span-1 row-span-1",
  "col-span-1 row-span-2",
  "col-span-1 row-span-3",
  "col-span-1 row-span-1",
  "col-span-1 row-span-1",
  "col-span-1 row-span-2",
  "col-span-1 row-span-2",
  "col-span-1 row-span-1",
];

// Local content shown until the curation engine returns items.
const FALLBACK: Tile[] = [
  { key: "1", title: "Festive", subtitle: "Top Picks", image: img1, span: SPANS[0] },
  { key: "2", title: "Trendy", subtitle: "New In", image: img2, span: SPANS[1] },
  { key: "3", title: "Boys", subtitle: "Must Haves", image: img3, span: SPANS[2] },
  { key: "4", title: "Girls", subtitle: "Collections", image: img4, span: SPANS[3] },
  { key: "5", title: "Winter", subtitle: "Warm", image: img5, span: SPANS[4] },
  { key: "6", title: "Summer", subtitle: "Cool", image: img6, span: SPANS[5] },
  { key: "7", title: "Party", subtitle: "Dresses", image: product_images["product-0001"]["lil-edit-product-0001-1-6.png"], span: SPANS[6] },
  { key: "8", title: "Casual", subtitle: "Everyday", image: product_images["product-0001"]["lil-edit-product-0001-1-7.png"], span: SPANS[7] },
  { key: "9", title: "Shoes", subtitle: "Step Up", image: product_images["product-0001"]["lil-edit-product-0001-1-4.png"], span: SPANS[8] },
];

export default function CollageGrid({
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
  const { items: fetchedItems, title: fetchedTitle, subtitle: fetchedSubtitle } = useCuratedSection("search_discover", { skip: preview });
  const items = preview ? previewItems : fetchedItems;
  const heading = (preview ? previewTitle : fetchedTitle) ?? "Discover More";
  const subheading = preview ? previewSubtitle : fetchedSubtitle;

  const go = (link?: string | null) => {
    if (!link) return;
    if (/^https?:\/\//i.test(link)) window.location.assign(link);
    else navigate(link);
  };

  const curated: Tile[] = items.map((it, idx) => {
    const span = SPANS[idx % SPANS.length];
    if (it.kind === "editorial") {
      return {
        key: it.id,
        title: it.title ?? "",
        subtitle: it.subtitle ?? "",
        image: it.image ?? "",
        span: metaStr(it.meta, "span") || span,
        onClick: it.link ? () => go(it.link) : undefined,
      };
    }
    return {
      key: it.id,
      title: it.title,
      subtitle: `₹${it.price}`,
      image: it.image ?? "",
      span,
      onClick: () => navigate(pdpUrlFor(it)),
    };
  });
  // The masonry always shows 9 tiles: curated items first (products or tiles),
  // remaining slots topped up from the local mocks. A filler's span is recomputed
  // for the position it actually lands in, keeping the hand-tuned mosaic rhythm.
  const fill = FALLBACK.slice(0, Math.max(0, 9 - curated.length)).map((t, i) => ({
    ...t,
    span: SPANS[(curated.length + i) % SPANS.length],
  }));
  const tiles = [...curated, ...fill].slice(0, 9);
  console.log(`[CollageGrid] curated=${curated.length} → rendering ${tiles.length} (mock fill=${tiles.length - Math.min(curated.length, 9)})`);

  return (
    <section className="pt-2 pb-3 px-4 sm:px-6 md:px-8 border-t border-border/50 animate-fade-in" style={{ animationDelay: "100ms" }}>
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-wider text-teal-700 uppercase">
            {heading}
          </h3>
        </div>
        {subheading && <p className="text-xs text-muted-foreground mt-0.5">{subheading}</p>}
      </div>

      {/* Mobile: swipeable carousel with a peek of the next tile (the 3-col masonry
          squeezed tiles tiny); sm+: the original masonry grid (span classes only
          apply once the container becomes a grid). */}
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 pb-2 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-3 sm:gap-3 sm:auto-rows-[80px] md:auto-rows-[110px]">
        {tiles.map((item) => (
          <button
            key={item.key}
            onClick={item.onClick}
            className={`group relative w-[44%] shrink-0 snap-start h-[200px] sm:w-auto sm:shrink sm:h-auto rounded-xl sm:rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-600/50 ${item.span}`}
          >
            <img
              src={item.image}
              alt={item.title}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            />
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

            {/* Text Content */}
            <div className="absolute inset-x-0 bottom-0 p-4 flex flex-col items-start justify-end h-full">
              <span className="text-[9px] sm:text-[11px] font-semibold tracking-wider text-white/90 uppercase mb-0.5 sm:mb-1 drop-shadow-md">
                {item.subtitle}
              </span>
              <h4 className="text-xs sm:text-base md:text-lg font-bold text-white leading-tight drop-shadow-md group-hover:-translate-y-1 transition-transform duration-300">
                {item.title}
              </h4>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
