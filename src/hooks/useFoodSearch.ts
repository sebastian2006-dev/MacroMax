import { useCallback, useEffect, useRef, useState } from "react";
import { searchFoods } from "@/src/lib/api";
import { SearchResult } from "@/src/types";

/**
 * Debounced food search hook.
 *
 * The heavy lifting lives behind a debounce so the macro engine and result
 * list never re-render per keystroke. While a new search is in flight the
 * previous results stay on screen (no list flicker); a stale request that
 * resolves after a newer one started is discarded via a request id.
 */
export function useFoodSearch(userId: string | null, debounceMs = 250) {
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    const requestId = ++requestRef.current;

    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setError(null);
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchFoods(trimmed, userId);
        if (requestRef.current === requestId) {
          setResults(data);
        }
      } catch (err) {
        if (requestRef.current === requestId) {
          setError(err instanceof Error ? err.message : "Search failed");
        }
      } finally {
        if (requestRef.current === requestId) {
          setLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [query, userId, debounceMs]);

  return { query, setQuery, results, loading, error };
}
