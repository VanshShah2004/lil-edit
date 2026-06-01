import { ArrowUpRight } from "lucide-react";
import img1 from "@/assets/searchbar-frequent_searches/le-1.png";
import img2 from "@/assets/searchbar-frequent_searches/le-2.png";
import img3 from "@/assets/searchbar-frequent_searches/le-3.png";
import img4 from "@/assets/searchbar-frequent_searches/le-4.png";
import img5 from "@/assets/searchbar-frequent_searches/le-5.png";
import img6 from "@/assets/searchbar-frequent_searches/le-6.png";

interface FrequentSearchesProps {
  onSelect: (term: string) => void;
}

const dummySearches = [
  { id: 1, name: "Lehenga Sets", image: img1 },
  { id: 2, name: "Kurtis", image: img2 },
  { id: 3, name: "Shararas & Palazzos", image: img3 },
  { id: 4, name: "Jackets", image: img4 },
  { id: 5, name: "Kurtas & Pajamas", image: img5 },
  { id: 6, name: "Blazers & Tuxedos", image: img6 },
];

export default function FrequentSearches({ onSelect }: FrequentSearchesProps) {
  return (
    <section className="pt-6 pb-3 px-4 sm:px-6 md:px-8 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold tracking-wider text-teal-700 uppercase">
          Popular Choices
        </h3>
      </div>

      {/* Mobile & Desktop: Grid */}
      <div className="grid grid-flow-col grid-rows-3 lg:grid-flow-row lg:grid-cols-3 lg:grid-rows-2 gap-2 sm:gap-3 pb-2 md:pb-0">
        {dummySearches.map((item) => (
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
            <span className="flex-1 text-sm sm:text-base font-semibold text-foreground/80 group-hover:text-teal-700 transition-colors">
              {item.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
