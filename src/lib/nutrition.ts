import { DailyLog, GoalTargets, LowIntakeAlert, Macros, MealItem, MealType } from "@/src/types";

export const EMPTY_MACROS: Macros = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fats: 0,
};

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fats: a.fats + b.fats,
  };
}

export function scaleMacros(macros: Macros, quantityGrams: number): Macros {
  const factor = quantityGrams / 100;
  return {
    calories: macros.calories * factor,
    protein: macros.protein * factor,
    carbs: macros.carbs * factor,
    fats: macros.fats * factor,
  };
}

export function calculateTotals(items: Pick<MealItem, "calories" | "protein" | "carbs" | "fats">[]): Macros {
  return items.reduce<Macros>(addMacros, EMPTY_MACROS);
}

export function getGoalTargets(profile: {
  target_calories: number;
  target_protein: number;
  target_carbs: number | null;
  target_fats: number | null;
}): GoalTargets {
  // 0 / null means "not configured" — dashboards must not render empty goals.
  return {
    calories: profile.target_calories ?? 0,
    protein: profile.target_protein ?? 0,
    carbs: profile.target_carbs ?? 0,
    fats: profile.target_fats ?? 0,
  };
}

export function getLowIntakeAlerts(current: Macros, targets: GoalTargets): LowIntakeAlert[] {
  const checks: { key: keyof Macros; label: string; current: number; target: number }[] = [
    { key: "calories", label: "Calories", current: current.calories, target: targets.calories },
    { key: "protein", label: "Protein", current: current.protein, target: targets.protein },
    { key: "carbs", label: "Carbs", current: current.carbs, target: targets.carbs },
    { key: "fats", label: "Fats", current: current.fats, target: targets.fats },
  ];

  return checks
    .filter((item) => item.target > 0 && item.current < item.target * 0.5)
    .map((item) => {
      const percent = Math.round((item.current / item.target) * 100);
      return {
        key: item.key,
        label: item.label,
        current: item.current,
        target: item.target,
        percent,
        message: `${item.label} is at ${percent}% of your daily goal. Consider adding a nutrient-dense meal.`,
      };
    });
}

export function groupMealItemsByType(items: MealItem[]): Record<MealType, MealItem[]> {
  const grouped: Record<MealType, MealItem[]> = {
    Breakfast: [],
    Lunch: [],
    Dinner: [],
    "Snacks/Extra": [],
  };

  for (const item of items) {
    if (grouped[item.meal_type]) {
      grouped[item.meal_type].push(item);
    }
  }

  return grouped;
}

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDateNDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toLocalDateString(date);
}

/** Monday-based start of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function calculateRollingAverages(logs: DailyLog[], windowSize = 7): (DailyLog & { rolling_calories: number; rolling_protein: number })[] {
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  return sorted.map((log, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const window = sorted.slice(start, index + 1);
    const rolling = window.reduce<Macros>(
      (acc, log) =>
        addMacros(acc, {
          calories: log.total_calories,
          protein: log.total_protein,
          carbs: log.total_carbs,
          fats: log.total_fats,
        }),
      EMPTY_MACROS
    );
    const count = window.length;
    return {
      ...log,
      rolling_calories: Math.round(rolling.calories / count),
      rolling_protein: Math.round(rolling.protein / count),
    };
  });
}
