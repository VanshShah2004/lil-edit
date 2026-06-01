import { useState, useEffect, useRef } from "react";
import { fetchSuggestions, type Suggestion } from "@/services/searchService";

export function useSearchSuggestions(query: string) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 1) {
      console.log("[useSearchSuggestions] query too short — skipped:", JSON.stringify(trimmed));
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      // Cancel any in-flight request before starting a new one.
      if (abortRef.current) {
        console.log("[useSearchSuggestions] aborting previous request for:", trimmed);
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      console.log("[useSearchSuggestions] fetching suggestions for:", trimmed);
      setLoading(true);
      try {
        const results = await fetchSuggestions(trimmed, abortRef.current.signal);
        console.log("[useSearchSuggestions] received", results.length, "suggestions for:", trimmed);
        setSuggestions(results);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          console.log("[useSearchSuggestions] request aborted for:", trimmed);
        } else {
          console.error("[useSearchSuggestions] fetch failed:", err);
          setSuggestions([]);
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  // Abort on unmount so stale responses never update state.
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  return { suggestions, loading };
}
