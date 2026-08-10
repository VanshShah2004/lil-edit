import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import SearchBar from "./SearchBar";
import FrequentSearches from "./FrequentSearches";
import CollageGrid from "./CollageGrid";
import CategoriesList from "./CategoriesList";
import SuggestionsDropdown from "./SuggestionsDropdown";
import { useSearchSuggestions } from "@/hooks/useSearchSuggestions";

interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchPanel({ isOpen, onClose }: SearchPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { suggestions, loading } = useSearchSuggestions(searchTerm);
  const hasQuery = searchTerm.trim().length >= 1;

  // Go to the full search results page for a term, then close the panel.
  const submitSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    console.log("[SearchPanel] submit search →", trimmed);
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    onClose();
  }, [navigate, onClose]);

  // Clear state when panel closes so re-opening starts fresh.
  useEffect(() => {
    if (isOpen) {
      console.log("[SearchPanel] opened");
    } else {
      console.log("[SearchPanel] closed — resetting state");
      // Reset the query so a re-open starts fresh.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchTerm("");
    }
  }, [isOpen]);

  // Body-scroll lock + Escape to close + close on any click/tap outside the panel
  // (incl. the navbar, profile icon, and mega menu, which the backdrop doesn't
  // cover on mobile since the panel sits below the navbar).
  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const handleOutsidePointer = (e: MouseEvent | TouchEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        console.log("[SearchPanel] outside pointer — closing");
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleOutsidePointer);
    document.addEventListener("touchstart", handleOutsidePointer);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleOutsidePointer);
      document.removeEventListener("touchstart", handleOutsidePointer);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

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
        {/* Pinned search input */}
        <div className="shrink-0 z-10 bg-background border-b border-border/60">
          <SearchBar
            value={searchTerm}
            onChange={(val) => setSearchTerm(val)}
            onClose={onClose}
            autoFocus={true}
          />
        </div>

        {/* Single scroll region — suggestions on top while searching, then the
            rest of the search panel always below */}
        {/* `pb-safe` used to sit here, but no `safe` spacing key is defined in the
            Tailwind config, so it never generated a rule. Spelled out as an arbitrary
            value it actually applies now that viewport-fit=cover makes env() non-zero. */}
        <div className="flex-1 overflow-y-auto no-scrollbar pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {hasQuery && (
            <SuggestionsDropdown
              suggestions={suggestions}
              loading={loading}
              query={searchTerm}
              onClose={onClose}
              onSubmit={submitSearch}
            />
          )}
          <FrequentSearches onSelect={submitSearch} />
          <CollageGrid />
          <CategoriesList />
        </div>
      </div>
    </div>,
    document.body
  );
}
