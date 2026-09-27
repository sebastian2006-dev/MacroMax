import { useCallback, useEffect, useRef, useState } from "react";
import { getLoggedDatesInRange } from "@/src/lib/db";
import { toLocalDateString } from "@/src/lib/nutrition";

/**
 * Which dates in `weekDates` have at least one logged meal item, as a Set of
 * toLocalDateString strings for O(1) lookup from WeekStrip's render loop.
 *
 * `weekDates` is expected to be a memoized 7-date array (Monday..Sunday) —
 * both index.tsx and log.tsx already build it with useMemo(..., []), so this
 * hook effectively only fetches once per screen mount, the same way the rest
 * of the week strip data does.
 */
export function useWeekLoggedDates(userId: string | null, weekDates: Date[]) {
    const [loggedDates, setLoggedDates] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const requestIdRef = useRef(0);

    const startDate = weekDates.length > 0 ? toLocalDateString(weekDates[0]) : null;
    const endDate =
        weekDates.length > 0 ? toLocalDateString(weekDates[weekDates.length - 1]) : null;

    const refresh = useCallback(async () => {
        if (!userId || !startDate || !endDate) {
            setLoggedDates(new Set());
            return;
        }

        const requestId = ++requestIdRef.current;
        setLoading(true);

        try {
            const dates = await getLoggedDatesInRange(startDate, endDate);

            // Same staleness guard as useDailyLog — a slower fetch from a
            // previous mount/param set shouldn't clobber a newer one.
            if (requestId !== requestIdRef.current) {
                return;
            }

            setLoggedDates(new Set(dates));
        } finally {
            if (requestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, [userId, startDate, endDate]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return { loggedDates, loading, refresh };
}