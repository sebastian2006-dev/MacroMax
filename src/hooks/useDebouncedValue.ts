import { useEffect, useMemo, useState } from "react";
import { createDebouncer, DEFAULT_DEBOUNCE_MS } from "@/src/lib/debounce";

/**
 * Debounce a fast-changing value.
 *
 * `useDebouncedValue(query, 350)` returns a copy of `query` that only updates
 * once the value has held still for `delayMs`. Typing "chicken" therefore
 * triggers exactly ONE downstream effect (the search pipeline) after the user
 * stops typing — not one per keystroke. The pending timer is cancelled on
 * cleanup, so the trailing value is always the latest one and nothing fires
 * after unmount.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = DEFAULT_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  const debouncer = useMemo(() => createDebouncer<[T]>(setDebounced, delayMs), [delayMs]);

  useEffect(() => {
    debouncer.call(value);
  }, [debouncer, value]);

  useEffect(() => () => debouncer.cancel(), [debouncer]);

  return debounced;
}
