import { useNavigate } from "react-router-dom";
import { buildPdpPath } from "@/lib/pdpUrl";
import type { Suggestion, SuggestionType } from "@/services/searchService";

interface Props {
  suggestions: Suggestion[];
  loading: boolean;
  query: string;
  selectedIndex: number;
  onClose: () => void;
  onSelectTerm: (term: string) => void;
}

const META_ICON: Record<SuggestionType, string> = {
  product:  "",
  occasion: "🎉",
  category: "📁",
};

export default function SuggestionsDropdown({
  suggestions,
  loading,
  query,
  selectedIndex,
  onClose,
  onSelectTerm,
}: Props) {
  const navigate = useNavigate();

  function handleSelect(s: Suggestion) {
    if (s.type === "product") {
      console.log("[SuggestionsDropdown] navigating to product:", s.label);
      navigate(buildPdpPath(s.categorySlug, s.slug, s.sku));
      onClose();
    } else {
      console.log("[SuggestionsDropdown] selecting metadata term:", s.label, `(${s.type})`);
      onSelectTerm(s.label);
    }
  }

  if (loading) {
    return (
      <div className="px-3 sm:px-4 md:px-8 pb-3 flex flex-col gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2 animate-pulse">
            <div className="w-10 h-10 rounded-lg bg-secondary shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-secondary rounded w-3/4" />
              <div className="h-3 bg-secondary rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="px-3 sm:px-4 md:px-8 pb-4 pt-1">
        <p className="text-sm text-muted-foreground">
          No products found for{" "}
          <span className="font-semibold text-foreground">"{query}"</span>
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 md:px-8 pb-3 flex flex-col gap-0.5">
      {suggestions.map((s, i) => (
        <button
          key={s.id}
          onClick={() => handleSelect(s)}
          className={`flex items-center gap-3 px-2 py-2 rounded-lg text-left w-full transition-colors border ${
            i === selectedIndex
              ? "bg-teal-50 border-teal-200"
              : "border-transparent hover:bg-secondary"
          }`}
        >
          {s.type === "product" ? (
            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-secondary">
              {s.image ? (
                <img
                  src={s.image}
                  alt={s.label}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-secondary" />
              )}
            </div>
          ) : (
            <div className="w-10 h-10 rounded-lg shrink-0 bg-secondary/60 flex items-center justify-center text-lg">
              {META_ICON[s.type]}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{s.label}</p>
            <p className="text-xs text-muted-foreground">{s.sublabel}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
