import { useCallback, useEffect, useRef, useState } from "react";
import {
  addMealItem as dbAddMealItem,
  ensureDailyLog as dbEnsureDailyLog,
  getMealItems,
  isDayLocked,
  removeMealItem as dbRemoveMealItem,
} from "@/src/lib/db";
import { DailyLog, MealItem, MealType } from "@/src/types";
import { toLocalDateString } from "@/src/lib/nutrition";

export function useDailyLog(userId: string | null, date = new Date()) {
  const dateString = toLocalDateString(date);
  const [log, setLog] = useState<DailyLog | null>(null);
  const [items, setItems] = useState<MealItem[]>([]);
  /**
   * Whether this date's log is locked ("Lock & Complete Day"). null = not yet
   * known (bootstrapped from the same refresh that loads the items).
   */
  const [locked, setLocked] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  // Tracks the most recently REQUESTED date. A refresh whose dateString no
  // longer matches this ref by the time it resolves is stale — its response
  // arrived for a date the user has since navigated away from — and must be
  // dropped. Without this guard, rapidly tapping day chips (e.g. landing on
  // "Today" right after tapping through a couple of days) lets an older,
  // slower response resolve AFTER a newer one and overwrite it: the header/
  // WeekStrip show "Today" selected while `items`/totals silently render an
  // earlier day's data — the calendar-vs-graph "glitch".
  const latestRequestedDate = useRef(dateString);
  // Guards a fetch actually in flight, independent of React's render timing,
  // so loading state is accurate on every date switch — not just the first.
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    latestRequestedDate.current = dateString;
    const requestId = ++requestIdRef.current;

    if (!userId) {
      setLog(null);
      setItems([]);
      setLocked(null);
      return;
    }

    setLoading(true);

    try {
      const dailyLog = await dbEnsureDailyLog(dateString);

      // Stale check #1: a newer refresh has started since this one began.
      if (requestId !== requestIdRef.current) {
        return;
      }

      if (!dailyLog) {
        return;
      }

      const mealItems = await getMealItems(dailyLog.id);

      // Stale check #2: re-check after the second await too.
      if (requestId !== requestIdRef.current) {
        return;
      }

      // Lock state rides along with the same refresh — no extra query path,
      // no extra loading states. (A failure here must never blank the log,
      // so it degrades to "unlocked".)
      try {
        const lockTimestamp = await isDayLocked(dateString);
        if (requestId !== requestIdRef.current) {
          return;
        }
        setLocked(lockTimestamp !== null);
      } catch {
        if (requestId === requestIdRef.current) {
          setLocked(false);
        }
      }

      setLog(dailyLog);
      setItems(mealItems);
    } finally {
      // Only the most recent request is allowed to clear the loading flag,
      // so a slow stale response can't flip loading back off after a newer
      // request already showed its own state.
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [userId, dateString]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addMealItem = useCallback(
    async (input: {
      meal_type: MealType;
      item_name: string;
      serving_size: string;
      calories: number;
      protein: number;
      carbs: number;
      fats: number;
    }) => {
      if (locked) {
        return false; // Locked days refuse writes (also enforced in the data layer).
      }

      let dailyLog = log;
      if (!dailyLog && userId) {
        dailyLog = await dbEnsureDailyLog(dateString);
      }

      if (!dailyLog) {
        return false;
      }

      const created = await dbAddMealItem(dailyLog.id, input);
      if (!created) {
        return false;
      }

      await refresh();
      return true;
    },
    [log, locked, userId, dateString, refresh]
  );

  const removeMealItem = useCallback(
    async (mealItemId: string) => {
      const ok = await dbRemoveMealItem(mealItemId);
      if (!ok) {
        return false;
      }

      await refresh();
      return true;
    },
    [refresh]
  );

  return { log, items, locked, loading, refresh, addMealItem, removeMealItem };
}