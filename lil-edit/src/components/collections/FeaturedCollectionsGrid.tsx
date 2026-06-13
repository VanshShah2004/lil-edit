import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCuratedSection } from "@/hooks/useCuratedSection";
import type { ResolvedItem, ResolvedEditorialItem } from "@/lib/curationApi";

import img1 from "@/assets/searchbar-frequent_searches/le-1.png";
import img2 from "@/assets/searchbar-frequent_searches/le-2.png";
import img3 from "@/assets/searchbar-frequent_searches/le-3.png";
import img4 from "@/assets/searchbar-frequent_searches/le-4.png";
import img5 from "@/assets/searchbar-frequent_searches/le-5.png";
import img6 from "@/assets/searchbar-frequent_searches/le-6.png";

interface FeaturedCard {
  id: string;
  name: string;
  description: string;
  image: string;
  badge: string | null;
  link?: string | null;
}

// Local content shown until the curation engine returns tiles.
const FALLBACK: FeaturedCard[] = [
  { id: "col-1", name: "Summer Escape", description: "Vibrant & Adventurous", image: img1, badge: "New" },
  { id: "col-2", name: "Tiny Trendsetters", description: "Chic & Playful", image: img2, badge: "Trending" },
  { id: "col-3", name: "Cozy Classics", description: "Timeless Comfort", image: img3, badge: null },
  { id: "col-4", name: "Playdate Essentials", description: "Edgy & Distinctive", image: img4, badge: "Best Seller" },
  { id: "col-5", name: "Party Picks", description: "Elegant Celebrations", image: img5, badge: null },
  { id: "col-6", name: "Mini Streetwear", description: "Contemporary urban styles for mini fashionistas", image: img6, badge: "New" },
];

export default function FeaturedCollectionsGrid({ previewItems }: { previewItems?: ResolvedItem[] }) {
  const preview = previewItems !== undefined;
  const navigate = useNavigate();
  const { editorials: fetchedEditorials } = useCuratedSection("collections_featured", { skip: preview });
  const editorials = preview
    ? previewItems.filter((i): i is ResolvedEditorialItem => i.kind === "editorial")
    : fetchedEditorials;

  const go = (link?: string | null) => {
    if (!link) return;
    if (/^https?:\/\//i.test(link)) window.location.assign(link);
    else navigate(link);
  };

  const curated: FeaturedCard[] = editorials.map((it) => ({
    id: it.id,
    name: it.title ?? "",
    description: it.subtitle ?? "",
    image: it.image ?? "",
    badge: it.badge,
    link: it.link,
  }));
  // The mosaic always shows 6 cards (the index-based spans assume it): admin tiles
  // first, remaining slots topped up from the local mocks.
  const featured = [...curated, ...FALLBACK.slice(0, Math.max(0, 6 - curated.length))].slice(0, 6);
  console.log(`[FeaturedCollectionsGrid] curated=${curated.length} → rendering ${featured.length} (mock fill=${featured.length - Math.min(curated.length, 6)})`);

  return (
    <section>
      <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-6 sm:mb-8">
        Featured Collections
      </h2>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-2 md:gap-3 lg:gap-4 auto-rows-[180px] sm:auto-rows-[200px] lg:auto-rows-[220px] grid-flow-row-dense">
        {featured.map((collection, index) => {
          let spanClass = "";

          if (index === 0) {
            spanClass = "col-span-2 row-span-1 lg:col-span-2 lg:row-span-2";
          } else if (index === 1) {
            spanClass = "col-span-1 row-span-1 lg:col-span-1 lg:row-span-2";
          } else if (index === 2) {
            spanClass = "col-span-1 row-span-1 lg:col-span-1 lg:row-span-2";
          } else if (index === 3) {
            spanClass = "col-span-1 row-span-1 lg:col-span-1 lg:row-span-1";
          } else if (index === 4) {
            spanClass = "col-span-1 row-span-1 lg:col-span-1 lg:row-span-1";
          } else if (index === 5) {
            spanClass = "col-span-2 row-span-1 lg:col-span-2 lg:row-span-1";
          }

          return (
            <div
              key={collection.id}
              onClick={() => go(collection.link)}
              className={`${spanClass} group relative overflow-hidden rounded-xl sm:rounded-2xl bg-gray-100 cursor-pointer transition-all duration-500 h-full min-h-[180px]`}
            >
              {/* Image */}
              <img
                src={collection.image}
                alt={collection.name}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-all duration-300" />

              {/* Overlay Content */}
              <div className="absolute inset-0 flex flex-col justify-between p-3 sm:p-5 md:p-6">
                {/* Badge */}
                {collection.badge && (
                  <div className="self-start">
                    <Badge
                      className="text-[9px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-white border-0"
                      style={{ backgroundColor: "hsl(268, 45%, 65%)" }}
                    >
                      {collection.badge}
                    </Badge>
                  </div>
                )}

                {/* Bottom Content */}
                <div className="text-white space-y-2 sm:space-y-3">
                  <div>
                    <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold mb-0.5 sm:mb-1 line-clamp-2">
                      {collection.name}
                    </h3>
                    <p className="text-xs sm:text-sm opacity-90 line-clamp-2">
                      {collection.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-end pt-1 sm:pt-2">
                    <button className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
