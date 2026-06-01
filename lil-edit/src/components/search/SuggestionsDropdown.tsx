import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { buildPdpPath } from "@/lib/pdpUrl";
import type { Suggestion, SuggestionType } from "@/services/searchService";

type Tab = "products" | "suggestions";

interface Props {
  suggestions: Suggestion[];
  loading: boolean;
  query: string;
  onClose: () => void;
  onSelectTerm: (term: string) => void;
}

const META_ICON: Record<SuggestionType, string> = {
  product:  "",
  occasion: "🎉",
  category: "📁",
};

export default function SuggestionsDropdown({ suggestions, loading, query, onClose, onSelectTerm }: Props) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("products");
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const productItems = suggestions.filter(s => s.type === "product");
  const visibleItems = activeTab === "products" ? productItems : suggestions;

  // Reset selection when tab or suggestions list changes.
  useEffect(() => { setSelectedIndex(-1); }, [activeTab, suggestions]);

  // Keep refs fresh so the keyboard handler never captures stale closure values.
  const visibleRef = useRef(visibleItems);
  const selectedRef = useRef(selectedIndex);
  const activeTabRef = useRef(activeTab);
  visibleRef.current = visibleItems;
  selectedRef.current = selectedIndex;
  activeTabRef.current = activeTab;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (visibleRef.current.length > 0)
            setSelectedIndex(prev => Math.min(prev + 1, visibleRef.current.length - 1));
          break;

        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, -1));
          break;

        case "Enter": {
          e.preventDefault();
          const s = visibleRef.current[selectedRef.current];
          if (!s) {
            console.log("[SuggestionsDropdown] Enter with no selection — no action");
            break;
          }
          if (activeTabRef.current === "products" && s.type === "product") {
            const path = buildPdpPath(s.categorySlug, s.slug, s.sku);
            console.log("[SuggestionsDropdown] Enter → navigating to product:", path, s.label);
            navigate(path);
            onClose();
          } else {
            console.log("[SuggestionsDropdown] Enter → autocomplete term:", s.label);
            onSelectTerm(s.label);
          }
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, onClose, onSelectTerm]);

  function handleSelect(s: Suggestion) {
    if (activeTab === "products" && s.type === "product") {
      console.log("[SuggestionsDropdown] click → product:", s.label);
      navigate(buildPdpPath(s.categorySlug, s.slug, s.sku));
      onClose();
    } else {
      console.log("[SuggestionsDropdown] click → autocomplete term:", s.label, `(${s.type})`);
      onSelectTerm(s.label);
    }
  }

  const isEmpty = visibleItems.length === 0;

  return (
    <div>
      {/* Tab toggle */}
      <div className="px-3 sm:px-4 md:px-8 pt-2 pb-2 flex gap-2 justify-center">
        {(["products", "suggestions"] as Tab[]).map(tab => {
          const count = tab === "products" ? productItems.length : suggestions.length;
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all border ${
                isActive
                  ? "bg-[#B19CD9] text-white border-[#B19CD9] shadow-sm"
                  : "bg-secondary/50 text-foreground/70 border-border hover:border-[#B19CD9]/50 hover:text-[#B19CD9]"
              }`}
            >
              <span className="capitalize">{tab}</span>
              {!loading && count > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  isActive ? "bg-white/25 text-white" : "bg-secondary text-muted-foreground"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading skeletons adapt to active tab size */}
      {loading ? (
        <div className="px-3 sm:px-4 md:px-8 pb-3 flex flex-col gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className={`flex items-center gap-4 animate-pulse ${activeTab === "products" ? "px-4 py-4" : "px-4 py-3"}`}>
              <div className={`${activeTab === "products" ? "w-20 h-20 rounded-2xl" : "w-10 h-10 rounded-xl"} bg-secondary shrink-0`} />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-secondary rounded w-3/4" />
                <div className="h-3.5 bg-secondary rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        <div className="px-3 sm:px-4 md:px-8 pb-4 pt-1">
          <p className="text-sm text-muted-foreground">
            No {activeTab} found for{" "}
            <span className="font-semibold text-foreground">"{query}"</span>
          </p>
        </div>
      ) : activeTab === "products" ? (
        /* Products tab — image cards */
        <div className="px-3 sm:px-4 md:px-8 pb-3 flex flex-col gap-2">
          {productItems.map((s, i) => (
            <button
              key={s.id}
              onClick={() => handleSelect(s)}
              className={`flex items-center gap-5 px-4 py-4 rounded-2xl text-left w-full transition-colors border ${
                i === selectedIndex
                  ? "bg-teal-50 border-teal-200"
                  : "border-transparent hover:bg-secondary"
              }`}
            >
              <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 bg-secondary">
                {s.image ? (
                  <img src={s.image} alt={s.label} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full bg-secondary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-foreground truncate">{s.label}</p>
                <p className="text-base text-muted-foreground">{s.sublabel}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* Suggestions tab — text autocomplete rows */
        <div className="px-3 sm:px-4 md:px-8 pb-3 flex flex-col gap-1">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              onClick={() => handleSelect(s)}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-xl text-left w-full transition-colors border ${
                i === selectedIndex
                  ? "bg-teal-50 border-teal-200"
                  : "border-transparent hover:bg-secondary"
              }`}
            >
              <div className="w-10 h-10 rounded-xl shrink-0 bg-secondary/60 flex items-center justify-center">
                {s.type === "product" ? (
                  <Search className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <span className="text-xl">{META_ICON[s.type]}</span>
                )}
              </div>
              <span className="flex-1 text-base font-semibold text-foreground truncate">{s.label}</span>
              {s.type !== "product" && (
                <span className="text-xs text-muted-foreground shrink-0">{s.sublabel}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
