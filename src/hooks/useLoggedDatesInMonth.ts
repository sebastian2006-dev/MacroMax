import { useCallback, useEffect, useRef, useState } from "react";
import { getLoggedDatesInRange } from "@/src/lib/db";
import { monthRange } from "@/src/lib/monthGrid";

/**
 * Which dates in `anchor`'s month have at least one logged meal item, as a Set
 * of `toLocalDateString` strings for O(1) lookup.
 *
 * Scope note: this replaces the old week-scoped hook. The month is a SUPERSET
 * of every week the calendar can display, so one query now feeds both the
 * 7-day strip's logged dots and the expanded month grid's — the screen costs
 * one range read instead of two, and the two views can never disagree about
 * whether a day is logged.
 *
 * `anchor` must be a stable value (the screens pass a memoized date), or every
 * render re-reads the month.
 */
export function useLoggedDatesInMonth(userId: string | null, anchor: Date) {
  const [loggedDates, setLoggedDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  // Primitive deps: a new Date object for the same month must not re-query.
  const range = monthRange(anchor);
  const startDate = range.start;
  const endDate = range.end;

  const refresh = useCallback(async () => {
    if (!userId || !startDate || !endDate) {
      setLoggedDates(new Set());
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const dates = await getLoggedDatesInRange(startDate, endDate);

      // Same staleness guard as useDailyLog — a slower fetch from a previous
      // mount/month shouldn't clobber a newer one.
      if (requestId !== requestIdRef.current) {
        return;
      }

      setLoggedDates(new Set(dates));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
    // startDate/endDate are plain strings, so an equal-range render is a no-op.
  }, [userId, startDate, endDate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loggedDates, loading, refresh };
}
