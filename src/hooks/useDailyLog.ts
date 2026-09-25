import { useCallback, useEffect, useRef, useState } from "react";
import { addMealItem as dbAddMealItem, ensureDailyLog as dbEnsureDailyLog, getMealItems, removeMealItem as dbRemoveMealItem } from "@/src/lib/db";
import { DailyLog, MealItem, MealType } from "@/src/types";
import { toLocalDateString } from "@/src/lib/nutrition";

export function useDailyLog(userId: string | null, date = new Date()) {
  const dateString = toLocalDateString(date);
  const [log, setLog] = useState<DailyLog | null>(null);
  const [items, setItems] = useState<MealItem[]>([]);
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
    [log, userId, dateString, refresh]
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

  return { log, items, loading, refresh, addMealItem, removeMealItem };
}