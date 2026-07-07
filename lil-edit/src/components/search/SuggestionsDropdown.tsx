import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingBag,
  LayoutGrid,
  PartyPopper,
  TrendingUp,
  Palette,
  Layers,
  Shirt,
  Hash,
  Award,
  Users,
  type LucideIcon,
} from "lucide-react";
import { buildPdpPath } from "@/lib/pdpUrl";
import type { Suggestion, SuggestionType } from "@/services/searchService";

type Tab = "all" | "products" | "suggestions";

interface Props {
  suggestions: Suggestion[];
  loading: boolean;
  query: string;
  onClose: () => void;
  // Navigate to the full search results page for a term (metadata chip, or
  // Enter with no product highlighted).
  onSubmit: (term: string) => void;
}

// Icon + section label for each suggestion type, used to give every result a
// distinguishing visual cue (group header in "Suggestions", chip icon in "All").
const TYPE_CONFIG: Record<SuggestionType, { label: string; icon: LucideIcon }> = {
  product:  { label: "Products",      icon: ShoppingBag },
  category: { label: "Categories",    icon: LayoutGrid },
  occasion: { label: "Occasions",     icon: PartyPopper },
  trend:    { label: "Trending",      icon: TrendingUp },
  color:    { label: "Colors",        icon: Palette },
  fabric:   { label: "Fabrics",       icon: Layers },
  fit:      { label: "Styles & Fits", icon: Shirt },
  tag:      { label: "Tags",          icon: Hash },
  badge:    { label: "Badges",        icon: Award },
  keyword:  { label: "For You",       icon: Users },
};

// Render order for grouped metadata sections — most useful filters first.
const META_TYPE_ORDER: SuggestionType[] = ["category", "occasion", "trend", "color", "fabric", "fit", "keyword", "tag", "badge"];

// Swatch colors for "color" suggestions, keyed by the lexicon's canonical label (lowercased).
const COLOR_SWATCH: Record<string, string> = {
  red: "#ef4444",
  maroon: "#7f1d1d",
  pink: "#ec4899",
  blue: "#3b82f6",
  teal: "#14b8a6",
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  peach: "#ffb88c",
  purple: "#a855f7",
  white: "#ffffff",
  black: "#27272a",
  grey: "#9ca3af",
  gray: "#9ca3af",
  gold: "#d4af37",
  silver: "#c0c0c0",
  beige: "#e8dcc8",
  pastel: "linear-gradient(135deg, #fbcfe8, #bfdbfe, #fef9c3)",
  multicolor: "linear-gradient(135deg, #ef4444, #eab308, #22c55e, #3b82f6, #a855f7)",
};

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

// Buckets metadata suggestions by type, in META_TYPE_ORDER, preserving each
// type's existing (score-sorted) order.
function groupMetaItems(items: Suggestion[]): Array<{ type: SuggestionType; items: Suggestion[] }> {
  const byType = new Map<SuggestionType, Suggestion[]>();
  for (const item of items) {
    const arr = byType.get(item.type);
    if (arr) arr.push(item);
    else byType.set(item.type, [item]);
  }
  return META_TYPE_ORDER
    .filter((t) => byType.has(t))
    .map((t) => ({ type: t, items: byType.get(t)! }));
}

export default function SuggestionsDropdown({ suggestions, loading, query, onClose, onSubmit }: Props) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const productItems = suggestions.filter(s => s.type === "product");
  const metaItems    = suggestions.filter(s => s.type !== "product");
  const groupedMeta  = groupMetaItems(metaItems);
  const groupedMetaFlat = groupedMeta.flatMap(g => g.items);
  // "All" tab leads with a compact 2x2 grid of top product matches; the rest
  // live in the Products tab.
  const topProducts = productItems.slice(0, 4);

  // Flat list used for keyboard nav / empty-state. Order must match the render
  // order for the active tab so arrow-key highlighting lines up visually.
  const visibleItems =
    activeTab === "products"    ? productItems
    : activeTab === "suggestions" ? groupedMetaFlat
    : [...topProducts, ...groupedMetaFlat];


  // Reset selection when tab or suggestions list changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSelectedIndex(-1); }, [activeTab, suggestions]);

  // Keep refs fresh so the keyboard handler never captures stale closure values.
  // Written in an effect (after render) so refs are never mutated during render.
  const visibleRef = useRef(visibleItems);
  const selectedRef = useRef(selectedIndex);
  const queryRef = useRef(query);
  useEffect(() => {
    visibleRef.current = visibleItems;
    selectedRef.current = selectedIndex;
    queryRef.current = query;
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
            // Nothing highlighted → search the raw query text.
            console.log("[SuggestionsDropdown] Enter with no selection → search:", queryRef.current);
            if (queryRef.current.trim()) onSubmit(queryRef.current.trim());
            break;
          }
          if (s.type === "product") {
            const path = buildPdpPath(s.categorySlug, s.slug, s.sku);
            console.log("[SuggestionsDropdown] Enter → navigating to product:", path, s.label);
            navigate(path);
            onClose();
          } else {
            console.log("[SuggestionsDropdown] Enter → search term:", s.label);
            onSubmit(s.label);
          }
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, onClose, onSubmit]);

  function handleSelect(s: Suggestion) {
    if (s.type === "product") {
      console.log("[SuggestionsDropdown] click → product:", s.label);
      navigate(buildPdpPath(s.categorySlug, s.slug, s.sku));
      onClose();
    } else {
      console.log("[SuggestionsDropdown] click → search term:", s.label, `(${s.type})`);
      onSubmit(s.label);
    }
  }

  // Image card for a product result, laid out for a 2-column grid. `i` is the
  // index into `visibleItems` so the keyboard highlight lines up correctly.
  function renderProductCard(s: Suggestion, i: number) {
    const isSelected = i === selectedIndex;
    return (
      <button
        key={s.id}
        onClick={() => handleSelect(s)}
        className={`flex flex-col rounded-xl text-left overflow-hidden border transition-colors ${
          isSelected
            ? "border-teal-400 ring-2 ring-teal-200 bg-teal-50/40"
            : "border-border/60 hover:border-teal-600/40 hover:bg-secondary/30"
        }`}
      >
        <div className="aspect-square w-full bg-secondary overflow-hidden">
          {s.image ? (
            <img src={s.image} alt={s.label} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full bg-secondary" />
          )}
        </div>
        <div className="px-2 py-1.5">
          <p className="text-sm font-semibold text-foreground truncate">
            <Highlighted text={s.label} query={query} />
          </p>
          <p className="text-xs text-muted-foreground truncate">{s.sublabel}</p>
        </div>
      </button>
    );
  }

  // Chip for a non-product (metadata) result — icon (or color swatch) + label
  // on top, small all-caps type tag underneath.
  function renderMetaChip(s: Suggestion, i: number) {
    const isSelected = i === selectedIndex;
    const { label: typeLabel, icon: Icon } = TYPE_CONFIG[s.type];
    return (
      <button
        key={s.id}
        onClick={() => handleSelect(s)}
        className={`flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-2xl border transition-colors max-w-full ${
          isSelected
            ? "bg-teal-50 border-teal-300 text-teal-800"
            : "border-border bg-secondary/40 text-foreground/80 hover:border-teal-600/40 hover:bg-teal-50/60"
        }`}
      >
        <span className="flex items-center gap-1.5 max-w-full">
          {s.type === "color" ? (
            <span
              className="w-3.5 h-3.5 rounded-full border border-border/60 shrink-0"
              style={{ background: COLOR_SWATCH[s.label.toLowerCase()] ?? "#d1d5db" }}
            />
          ) : (
            <Icon className="w-3.5 h-3.5 shrink-0 text-teal-700/70" />
          )}
          <span className="truncate text-sm font-medium"><Highlighted text={s.label} query={query} /></span>
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70 pl-5">
          {typeLabel}
        </span>
      </button>
    );
  }

  const sectionLabel = "px-3 sm:px-4 md:px-8 pt-2 pb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
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

      {/* Loading skeletons adapt to active tab */}
      {loading ? (
        <div className="px-3 sm:px-4 md:px-8 pb-3">
          {activeTab !== "suggestions" && (
            <div className={`grid grid-cols-2 gap-2 sm:gap-3 animate-pulse ${activeTab === "all" ? "mb-4" : ""}`}>
              {[0, 1, 2, 3].map(i => (
                <div key={i}>
                  <div className="aspect-square rounded-xl bg-secondary mb-1.5" />
                  <div className="h-3.5 bg-secondary rounded w-3/4 mb-1" />
                  <div className="h-3 bg-secondary rounded w-1/2" />
                </div>
              ))}
            </div>
          )}
          {activeTab !== "products" && (
            <div className="flex flex-wrap gap-2 animate-pulse">
              {[68, 84, 56, 96, 72, 60].map((w, i) => (
                <div key={i} className="h-7 bg-secondary rounded-full" style={{ width: `${w}px` }} />
              ))}
            </div>
          )}
        </div>
      ) : isEmpty ? (
        <div className="px-3 sm:px-4 md:px-8 pb-4 pt-1">
          <p className="text-sm text-muted-foreground">
            No {activeTab === "all" ? "results" : activeTab} found for{" "}
            <span className="font-semibold text-foreground">"{query}"</span>
          </p>
        </div>
      ) : activeTab === "products" ? (
        /* Products tab — 2-column image grid */
        <div className="px-3 sm:px-4 md:px-8 pb-3 grid grid-cols-2 gap-2 sm:gap-3">
          {productItems.map((s, i) => renderProductCard(s, i))}
        </div>
      ) : activeTab === "suggestions" ? (
        /* Suggestions tab — metadata chips clustered by type, each labeled individually */
        <div className="px-3 sm:px-4 md:px-8 pb-3 pt-1 flex flex-wrap gap-2">
          {groupedMetaFlat.map((s, i) => renderMetaChip(s, i))}
        </div>
      ) : (
        /* All tab — best-match products up top, then grouped suggestion chips */
        <div className="pb-1">
          {topProducts.length > 0 && (
            <div>
              <p className={sectionLabel}>
                <ShoppingBag className="w-3 h-3" />
                Best Matches
              </p>
              <div className="px-3 sm:px-4 md:px-8 pb-2.5 grid grid-cols-2 gap-2 sm:gap-3">
                {topProducts.map((s, i) => renderProductCard(s, i))}
              </div>
            </div>
          )}
          {groupedMetaFlat.length > 0 && (
            <div className="px-3 sm:px-4 md:px-8 pb-2.5 pt-1 flex flex-wrap gap-2">
              {groupedMetaFlat.map((s, i) => renderMetaChip(s, topProducts.length + i))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
