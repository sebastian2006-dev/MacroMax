import { useCallback, useEffect, useRef, useState } from "react";
import { addMealItem as dbAddMealItem, ensureDailyLog as dbEnsureDailyLog, getMealItems, removeMealItem as dbRemoveMealItem } from "@/src/lib/db";
import { DailyLog, MealItem, MealType } from "@/src/types";
import { toLocalDateString } from "@/src/lib/nutrition";

export function useDailyLog(userId: string | null, date = new Date()) {
  const dateString = toLocalDateString(date);
  const [log, setLog] = useState<DailyLog | null>(null);
  const [items, setItems] = useState<MealItem[]>([]);
  const [loading, setLoading] = useState(false);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLog(null);
      setItems([]);
      return;
    }

    if (!hasLoadedRef.current) {
      setLoading(true);
    }

    try {
      const dailyLog = await dbEnsureDailyLog(dateString);
      if (!dailyLog) {
        return;
      }

      const mealItems = await getMealItems(dailyLog.id);
      hasLoadedRef.current = true;
      setLog(dailyLog);
      setItems(mealItems);
    } finally {
      setLoading(false);
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
