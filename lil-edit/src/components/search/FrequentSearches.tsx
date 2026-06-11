import { useCuratedSection } from "@/hooks/useCuratedSection";
import type { ResolvedItem, ResolvedProductItem } from "@/lib/curationApi";

interface FrequentSearchesProps {
  onSelect: (term: string) => void;
  previewItems?: ResolvedItem[];
}

interface Choice {
  id: string;
  name: string;
  image: string;
}

export default function FrequentSearches({ onSelect, previewItems }: FrequentSearchesProps) {
  const preview = previewItems !== undefined;
  const { products: fetchedProducts } = useCuratedSection("search_popular", { skip: preview });
  const products = preview
    ? previewItems.filter((i): i is ResolvedProductItem => i.kind === "product")
    : fetchedProducts;

  const curated: Choice[] = products.map((p) => ({
    id: p.id,
    name: p.title,
    image: p.image ?? "",
  }));
  // No local mock fill for product sections: the backend already tops product
  // sections up with real catalog items, so empty here means curation is
  // unavailable — hide the block rather than show placeholder choices.
  const choices = curated;

  if (choices.length === 0) {
    console.log("[FrequentSearches] no products — section hidden");
    return null;
  }

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
            <span className="flex-1 text-sm sm:text-base font-semibold text-foreground/80 group-hover:text-teal-700 transition-colors line-clamp-2">
              {item.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
