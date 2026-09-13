import { useCallback, useEffect, useRef, useState } from "react";
import { searchFoods } from "@/src/lib/api";
import { DEFAULT_DEBOUNCE_MS } from "@/src/lib/debounce";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import { SearchResult } from "@/src/types";

/** Ignore 1-character queries — they return noise and waste provider quota. */
const MIN_QUERY_LENGTH = 2;

/**
 * Debounced food search hook.
 *
 * Typing only ever updates `query`; the search pipeline runs on the DEBOUNCED
 * value, so it fires once after the user pauses (~350 ms) instead of on every
 * keystroke. While a new search is in flight the previous results stay on
 * screen (no list flicker); a stale request that resolves after a newer one
 * started is discarded via a request id.
 */
export function useFoodSearch(userId: string | null, debounceMs = DEFAULT_DEBOUNCE_MS) {
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
  }, []);

  const debouncedQuery = useDebouncedValue(query, debounceMs);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    const requestId = ++requestRef.current;

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);
    setLoading(true);

    void (async () => {
      try {
        const data = await searchFoods(trimmed, userId);
        if (!cancelled && requestRef.current === requestId) {
          setResults(data);
        }
      } catch (err) {
        if (!cancelled && requestRef.current === requestId) {
          setError(err instanceof Error ? err.message : "Search failed");
        }
      } finally {
        if (!cancelled && requestRef.current === requestId) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, userId]);

  return { query, setQuery, results, loading, error };
}
