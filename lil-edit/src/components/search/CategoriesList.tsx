import { ChevronRight } from "lucide-react";

const categories = [
  { name: "New Arrivals", href: "#" },
  { name: "Boys", href: "#" },
  { name: "Girls", href: "#" },
  { name: "Trending", href: "#" },
  { name: "By Occasion", href: "#" },
];

export default function CategoriesList() {
  return (
    <section className="pt-2 pb-6 px-4 sm:px-6 md:px-8 border-t border-border/50 animate-fade-in" style={{ animationDelay: "200ms" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold tracking-wider text-teal-700 uppercase">
          Categories
        </h3>
      </div>
      <div className="flex flex-col gap-2">
        {categories.map((category) => (
          <button
            key={category.name}
            className="group flex items-center justify-between p-3 rounded-xl border border-border bg-secondary/40 shadow-sm hover:border-teal-600/40 hover:bg-teal-50/60 hover:shadow-md transition-all text-left"
          >
            <span className="text-base font-semibold text-foreground/80 group-hover:text-teal-700 transition-colors">
              {category.name}
            </span>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-teal-700 transition-colors" />
          </button>
        ))}
      </div>
    </section>
  );
}
