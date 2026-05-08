import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (val: string) => void;
  onClose: () => void;
  autoFocus?: boolean;
}

export default function SearchBar({ value, onChange, onClose, autoFocus = false }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      // Small timeout to allow panel animation to start
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  return (
    <div className="sticky top-0 z-10 bg-background pt-4 pb-4 px-3 sm:px-4 md:px-8 border-b border-border/60">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-teal-600 transition-colors">
            <Search className="w-5 h-5" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search products, categories, or trends..."
            className="w-full bg-secondary/50 border border-border/50 rounded-full py-3 pl-12 pr-10 text-base md:text-lg focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 focus:bg-background transition-all placeholder:text-muted-foreground/70"
          />
          {value && (
            <button
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <div className="bg-secondary p-1 rounded-full">
                <X className="w-4 h-4" />
              </div>
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-2 -mr-2 text-foreground/80 hover:text-foreground"
          aria-label="Close search"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
