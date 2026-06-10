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

export default function CollageGrid({ previewItems }: { previewItems?: ResolvedItem[] }) {
  const preview = previewItems !== undefined;
  const navigate = useNavigate();
  const { items: fetchedItems } = useCuratedSection("search_discover", { skip: preview });
  const items = preview ? previewItems : fetchedItems;

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
  const tiles = curated.length > 0 ? curated : FALLBACK;

  return (
    <section className="pt-2 pb-3 px-4 sm:px-6 md:px-8 border-t border-border/50 animate-fade-in" style={{ animationDelay: "100ms" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold tracking-wider text-teal-700 uppercase">
          Discover More
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 auto-rows-[60px] sm:auto-rows-[80px] md:auto-rows-[110px]">
        {tiles.map((item) => (
          <button
            key={item.key}
            onClick={item.onClick}
            className={`group relative rounded-xl sm:rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-600/50 ${item.span}`}
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
              <span className="text-[10px] sm:text-xs font-semibold tracking-wider text-white/90 uppercase mb-0.5 sm:mb-1 drop-shadow-md">
                {item.subtitle}
              </span>
              <h4 className="text-sm sm:text-lg md:text-xl font-bold text-white leading-tight drop-shadow-md group-hover:-translate-y-1 transition-transform duration-300">
                {item.title}
              </h4>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
