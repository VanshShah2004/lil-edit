import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import SearchBar from "./SearchBar";
import FrequentSearches from "./FrequentSearches";
import CollageGrid from "./CollageGrid";
import CategoriesList from "./CategoriesList";
import SuggestionsDropdown from "./SuggestionsDropdown";
import { useSearchSuggestions } from "@/hooks/useSearchSuggestions";
import { buildPdpPath } from "@/lib/pdpUrl";

interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchPanel({ isOpen, onClose }: SearchPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { suggestions, loading } = useSearchSuggestions(searchTerm);
  const hasQuery = searchTerm.trim().length >= 2;

  // Reset keyboard selection whenever the suggestion list changes.
  useEffect(() => {
    setSelectedIndex(-1);
  }, [suggestions]);

  // Clear state when panel closes so re-opening starts fresh.
  useEffect(() => {
    if (isOpen) {
      console.log("[SearchPanel] opened");
    } else {
      console.log("[SearchPanel] closed — resetting state");
      setSearchTerm("");
      setSelectedIndex(-1);
    }
  }, [isOpen]);

  // Body-scroll lock + keyboard navigation.
  // Refs let the handler always see the latest suggestions/selectedIndex without
  // re-subscribing the listener on every arrow-key press.
  const suggestionsRef = useRef(suggestions);
  const selectedIndexRef = useRef(selectedIndex);
  suggestionsRef.current = suggestions;
  selectedIndexRef.current = selectedIndex;

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;

        case "ArrowDown":
          e.preventDefault();
          if (suggestionsRef.current.length > 0) {
            setSelectedIndex((prev) =>
              Math.min(prev + 1, suggestionsRef.current.length - 1)
            );
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, -1));
          break;

        case "Enter": {
          e.preventDefault();
          const idx = selectedIndexRef.current;
          const s = suggestionsRef.current[idx];
          if (!s) {
            console.log("[SearchPanel] Enter with no selection — no action");
            break;
          }
          if (s.type === "product") {
            const path = buildPdpPath(s.categorySlug, s.slug, s.sku);
            console.log("[SearchPanel] Enter → navigating to product:", path, s.label);
            navigate(path);
            onClose();
          } else {
            console.log("[SearchPanel] Enter → selecting metadata term:", s.label, `(${s.type})`);
            setSearchTerm(s.label);
            setSelectedIndex(-1);
          }
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose, navigate]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed bottom-0 left-0 right-0 top-[var(--navbar-height,5rem)] md:inset-0 md:top-0 z-[100] flex justify-end bg-black/40 animate-fade-in transition-opacity"
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
    >
      <div
        ref={panelRef}
        className="w-full h-full md:w-[480px] lg:w-[540px] bg-background shadow-2xl flex flex-col md:animate-slide-in-right animate-slide-up-fade overflow-hidden border-l border-border/50"
      >
        {/* Unified sticky header: search input + inline suggestions */}
        <div className="sticky top-0 z-10 bg-background border-b border-border/60">
          <SearchBar
            value={searchTerm}
            onChange={(val) => {
              setSearchTerm(val);
              setSelectedIndex(-1);
            }}
            onClose={onClose}
            autoFocus={true}
          />
          {hasQuery && (
            <SuggestionsDropdown
              suggestions={suggestions}
              loading={loading}
              query={searchTerm}
              selectedIndex={selectedIndex}
              onClose={onClose}
              onSelectTerm={(term) => {
                console.log("[SearchPanel] metadata suggestion clicked → setting term:", term);
                setSearchTerm(term);
                setSelectedIndex(-1);
              }}
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar pb-safe">
          <FrequentSearches onSelect={(term) => setSearchTerm(term)} />
          <CollageGrid />
          <CategoriesList />
        </div>
      </div>
    </div>,
    document.body
  );
}
