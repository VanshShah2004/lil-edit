import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildPdpPath } from "@/lib/pdpUrl";
import type { Suggestion } from "@/services/searchService";

type Tab = "all" | "products" | "suggestions";

interface Props {
  suggestions: Suggestion[];
  loading: boolean;
  query: string;
  onClose: () => void;
  onSelectTerm: (term: string) => void;
}

function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-teal-700 font-bold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function SuggestionsDropdown({ suggestions, loading, query, onClose, onSelectTerm }: Props) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const productItems = suggestions.filter(s => s.type === "product");
  const metaItems    = suggestions.filter(s => s.type !== "product");
  // Flat list used for keyboard nav / empty-state. "All" lists products first,
  // then suggestions — the same order they render in below.
  const visibleItems =
    activeTab === "products"      ? productItems
    : activeTab === "suggestions" ? metaItems
    : [...productItems, ...metaItems];

  // Reset selection when tab or suggestions list changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSelectedIndex(-1); }, [activeTab, suggestions]);

  // Keep refs fresh so the keyboard handler never captures stale closure values.
  // Written in an effect (after render) so refs are never mutated during render.
  const visibleRef = useRef(visibleItems);
  const selectedRef = useRef(selectedIndex);
  useEffect(() => {
    visibleRef.current = visibleItems;
    selectedRef.current = selectedIndex;
  });

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
          if (s.type === "product") {
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
    if (s.type === "product") {
      console.log("[SuggestionsDropdown] click → product:", s.label);
      navigate(buildPdpPath(s.categorySlug, s.slug, s.sku));
      onClose();
    } else {
      console.log("[SuggestionsDropdown] click → autocomplete term:", s.label, `(${s.type})`);
      onSelectTerm(s.label);
    }
  }

  // Image card for a product result. `i` is the index into `visibleItems` so the
  // keyboard highlight lines up across the mixed "All" tab.
  function renderProductCard(s: Suggestion, i: number) {
    return (
      <button
        key={s.id}
        onClick={() => handleSelect(s)}
        className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left w-full transition-colors border ${
          i === selectedIndex
            ? "bg-teal-50 border-teal-200"
            : "border-transparent hover:bg-secondary"
        }`}
      >
        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-secondary">
          {s.image ? (
            <img src={s.image} alt={s.label} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full bg-secondary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            <Highlighted text={s.label} query={query} />
          </p>
          <p className="text-xs text-muted-foreground">{s.sublabel}</p>
        </div>
      </button>
    );
  }

  // Text autocomplete row for a non-product (metadata) result.
  function renderMetaRow(s: Suggestion, i: number) {
    return (
      <button
        key={s.id}
        onClick={() => handleSelect(s)}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left w-full transition-colors border ${
          i === selectedIndex
            ? "bg-teal-50 border-teal-200"
            : "border-transparent hover:bg-secondary"
        }`}
      >
        <span className="flex-1 text-sm font-semibold text-foreground truncate">
          <Highlighted text={s.label} query={query} />
        </span>
        <span className="text-xs text-muted-foreground shrink-0">{s.sublabel}</span>
      </button>
    );
  }

  const sectionLabel = "px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
  const isEmpty = visibleItems.length === 0;

  return (
    <div>
      {/* Tab toggle */}
      <div className="px-3 sm:px-4 md:px-8 pt-2 pb-2 flex gap-2 justify-center">
        {(["all", "products", "suggestions"] as Tab[]).map(tab => {
          const count =
            tab === "products"      ? productItems.length
            : tab === "suggestions" ? metaItems.length
            : productItems.length + metaItems.length;
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-semibold transition-all border ${
                isActive
                  ? "bg-teal-700 text-white border-teal-700 shadow-sm"
                  : "bg-secondary/50 text-foreground/70 border-border hover:border-teal-700/50 hover:text-teal-700"
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
            <div key={i} className={`flex items-center gap-3 animate-pulse ${activeTab === "products" ? "px-3 py-2.5" : "px-3 py-2"}`}>
              {activeTab === "products" && <div className="w-14 h-14 rounded-lg bg-secondary shrink-0" />}
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
            No {activeTab === "all" ? "results" : activeTab} found for{" "}
            <span className="font-semibold text-foreground">"{query}"</span>
          </p>
        </div>
      ) : activeTab === "products" ? (
        /* Products tab — image cards */
        <div className="px-3 sm:px-4 md:px-8 pb-3 flex flex-col gap-1">
          {productItems.map((s, i) => renderProductCard(s, i))}
        </div>
      ) : activeTab === "suggestions" ? (
        /* Suggestions tab — text autocomplete rows (metadata only) */
        <div className="px-3 sm:px-4 md:px-8 pb-3 flex flex-col gap-1">
          {metaItems.map((s, i) => renderMetaRow(s, i))}
        </div>
      ) : (
        /* All tab — products first, then suggestions (indices match visibleItems) */
        <div className="px-3 sm:px-4 md:px-8 pb-3 flex flex-col gap-1">
          {productItems.length > 0 && (
            <>
              <p className={sectionLabel}>Products</p>
              {productItems.map((s, i) => renderProductCard(s, i))}
            </>
          )}
          {metaItems.length > 0 && (
            <>
              <p className={sectionLabel}>Suggestions</p>
              {metaItems.map((s, i) => renderMetaRow(s, productItems.length + i))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
