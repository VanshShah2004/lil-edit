import { useEffect, useState } from "react";
import { useCuratedSection } from "@/hooks/useCuratedSection";
import type { ResolvedItem, ResolvedProductItem } from "@/lib/curationApi";
import img1 from "@/assets/searchbar-frequent_searches/le-1.png";
import img2 from "@/assets/searchbar-frequent_searches/le-2.png";
import img3 from "@/assets/searchbar-frequent_searches/le-3.png";
import img4 from "@/assets/searchbar-frequent_searches/le-4.png";
import img5 from "@/assets/searchbar-frequent_searches/le-5.png";
import img6 from "@/assets/searchbar-frequent_searches/le-6.png";

interface FrequentSearchesProps {
  onSelect: (term: string) => void;
  previewItems?: ResolvedItem[];
}

interface Choice {
  id: string;
  name: string;
  image: string;
}

// Local content shown only as a last resort — if curation is slow or
// unavailable — so this block never lags behind "Discover More" (which has its
// own instant fallback). The asset folder is named for exactly this section.
const FALLBACK: Choice[] = [
  { id: "fb-1", name: "Festive Wear", image: img1 },
  { id: "fb-2", name: "Party Dresses", image: img2 },
  { id: "fb-3", name: "Boys Kurta", image: img3 },
  { id: "fb-4", name: "Girls Lehenga", image: img4 },
  { id: "fb-5", name: "Co-ord Sets", image: img5 },
  { id: "fb-6", name: "Ethnic Wear", image: img6 },
];

// How long to keep showing the skeleton before giving up and rendering FALLBACK,
// so a hung request never leaves an endless skeleton.
const FALLBACK_DELAY_MS = 2500;

export default function FrequentSearches({ onSelect, previewItems }: FrequentSearchesProps) {
  const preview = previewItems !== undefined;
  const { products: fetchedProducts, ready } = useCuratedSection("search_popular", { skip: preview });
  const products = preview
    ? previewItems.filter((i): i is ResolvedProductItem => i.kind === "product")
    : fetchedProducts;

  const curated: Choice[] = products.map((p) => ({
    id: p.id,
    name: p.title,
    image: p.image ?? "",
  }));
  const hasCurated = curated.length > 0;

  // Once the skeleton has shown for FALLBACK_DELAY_MS without data arriving, flip
  // to FALLBACK. A settled fetch (`ready`), real data, or preview mode all skip
  // the wait — the timer only matters while a request is genuinely in flight.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (preview || ready || hasCurated) return;
    const t = setTimeout(() => {
      console.log("[FrequentSearches] curation slow — showing fallback choices");
      setTimedOut(true);
    }, FALLBACK_DELAY_MS);
    return () => clearTimeout(t);
  }, [preview, ready, hasCurated]);

  // Real curated data always wins. While the fetch is still in flight (and the
  // grace period hasn't elapsed) show a skeleton; after that — or once a settled
  // fetch came back empty — fall back to local content.
  const settled = preview || ready;
  const showSkeleton = !hasCurated && !settled && !timedOut;

  if (showSkeleton) {
    console.log("[FrequentSearches] curation loading — showing skeleton");
    return (
      <section className="pt-6 pb-3 px-4 sm:px-6 md:px-8 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold tracking-wider text-teal-700 uppercase">
            Popular Choices
          </h3>
        </div>
        <div className="grid grid-flow-col grid-rows-3 lg:grid-flow-row lg:grid-cols-3 lg:grid-rows-2 gap-2 sm:gap-3 pb-2 md:pb-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 pr-2 sm:pr-4 rounded-xl border border-border bg-secondary/40"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-secondary animate-pulse shrink-0" />
              <div className="flex-1 h-3 sm:h-3.5 rounded bg-secondary animate-pulse" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // In preview mode an empty section just hides — the admin console feeds its own
  // draft items and shouldn't see storefront mock content.
  if (preview && !hasCurated) {
    console.log("[FrequentSearches] preview with no products — section hidden");
    return null;
  }

  const choices = hasCurated ? curated : FALLBACK;
  if (!hasCurated) console.log("[FrequentSearches] rendering fallback choices");

  return (
    <section className="pt-6 pb-3 px-4 sm:px-6 md:px-8 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold tracking-wider text-teal-700 uppercase">
          Popular Choices
        </h3>
      </div>

      {/* Mobile & Desktop: Grid */}
      <div className="grid grid-flow-col grid-rows-3 lg:grid-flow-row lg:grid-cols-3 lg:grid-rows-2 gap-2 sm:gap-3 pb-2 md:pb-0">
        {choices.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.name)}
            className="group flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 pr-2 sm:pr-4 rounded-xl border border-border bg-secondary/40 shadow-sm hover:border-teal-600/40 hover:bg-teal-50/60 hover:shadow-md transition-all text-left w-full"
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden shrink-0 bg-secondary">
              <img
                src={item.image}
                alt={item.name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
            </div>
            <span className="flex-1 text-xs sm:text-sm font-semibold text-foreground/80 group-hover:text-teal-700 transition-colors line-clamp-2">
              {item.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
