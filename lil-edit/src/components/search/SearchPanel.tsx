import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import SearchBar from "./SearchBar";
import FrequentSearches from "./FrequentSearches";
import CollageGrid from "./CollageGrid";
import CategoriesList from "./CategoriesList";

interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchPanel({ isOpen, onClose }: SearchPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Lock body scroll and handle ESC key
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  // Handle click outside to close
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed bottom-0 left-0 right-0 top-[var(--navbar-height,5rem)] md:inset-0 md:top-0 z-[100] flex justify-end bg-black/40 animate-fade-in transition-opacity"
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
    >
      {/* 
        Desktop: slide in from right (w-full max-w-md or lg)
        Mobile: fade and slide up slightly (w-full h-full)
      */}
      <div
        ref={panelRef}
        className="w-full h-full md:w-[480px] lg:w-[540px] bg-background shadow-2xl flex flex-col md:animate-slide-in-right animate-slide-up-fade overflow-hidden border-l border-border/50"
      >
        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          onClose={onClose}
          autoFocus={true}
        />
        
        <div className="flex-1 overflow-y-auto no-scrollbar pb-safe">
          <FrequentSearches onSelect={(term) => setSearchTerm(term)} />
          <CollageGrid />
          <CategoriesList />
          
          {/* If there was real search results, we would render them here instead of FrequentSearches when searchTerm is not empty */}
        </div>
      </div>
    </div>,
    document.body
  );
}
