import { DailyLog, GoalTargets, LimitAlert, LowIntakeAlert, Macros, MealItem, MealType } from "@/src/types";

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

/**
 * Safe fallback daily goals, used ONLY for display (dashboard rings).
 *
 * A ring needs a denominator: with an unset goal the ratio is 0/0 → NaN, the
 * fill renders empty and the caption degrades to "Goal not set" even though the
 * user has logged food. These defaults give every ring a valid percentage
 * until the user sets their own targets in Profile.
 */
export const DEFAULT_GOAL_TARGETS: GoalTargets = {
  calories: 2000,
  protein: 140,
  carbs: 250,
  fats: 70,
};

/**
 * Parse the four onboarding/settings goal fields (raw text) into profile
 * targets. Pure and shared by the onboarding goals step and the Settings
 * screen, so both behave identically.
 *
 * Rules:
 *  - blank / non-numeric / <= 0 → 0 (= "not configured"; alerts and default
 *    goal resolution key off 0, so this is the "leave it unset" value);
 *  - decimals are floored to whole numbers (the DB columns are INTEGER);
 *  - values are clamped to sane ceilings — a fat-fingered 20000 kcal or a
 *    999999 g protein goal would poison every percentage in the app;
 *  - calories are clamped to 100–10000 and grams to 1–1000 when present.
 */
export function parseGoalInputs(raw: {
  calories: string;
  protein: string;
  carbs: string;
  fats: string;
}): { target_calories: number; target_protein: number; target_carbs: number; target_fats: number } {
  const parse = (value: string, max: number): number => {
    const trimmed = value.trim();
    if (trimmed === "") return 0;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.min(parsed, max);
  };

  return {
    target_calories: parse(raw.calories, 10_000),
    target_protein: parse(raw.protein, 1_000),
    target_carbs: parse(raw.carbs, 1_000),
    target_fats: parse(raw.fats, 1_000),
  };
}

export type ResolvedGoalTargets = {
  targets: GoalTargets;
  /** True per macro when the profile had no value and the default is in use. */
  usingDefault: Record<keyof GoalTargets, boolean>;
};

/**
 * Display goals with per-macro fallbacks.
 *
 * `getGoalTargets` intentionally reports 0 for "not configured" because the
 * alert helpers key off that (0 = don't nag). Rings cannot work that way, so
 * this resolver layers DEFAULT_GOAL_TARGETS on top and reports which macros
 * borrowed a default, letting the UI say so instead of silently inventing a
 * target the user never chose.
 */
export function resolveGoalTargets(profile: {
  target_calories: number;
  target_protein: number;
  target_carbs: number | null;
  target_fats: number | null;
}): ResolvedGoalTargets {
  const configured = getGoalTargets(profile);
  const targets: GoalTargets = { ...configured };
  const usingDefault: Record<keyof GoalTargets, boolean> = {
    calories: false,
    protein: false,
    carbs: false,
    fats: false,
  };

  for (const key of Object.keys(targets) as (keyof GoalTargets)[]) {
    // Catches 0, negatives and NaN alike.
    if (!(configured[key] > 0)) {
      targets[key] = DEFAULT_GOAL_TARGETS[key];
      usingDefault[key] = true;
    }
  }

  return { targets, usingDefault };
}

/**
 * Nudges for macros the user is trying to REACH. Fats is deliberately absent:
 * it is an upper limit, not a goal, so falling short of it is never a problem
 * worth flagging (getLimitAlerts covers the opposite check).
 */
export function getLowIntakeAlerts(current: Macros, targets: GoalTargets): LowIntakeAlert[] {
  const checks: { key: keyof Macros; label: string; current: number; target: number }[] = [
    { key: "calories", label: "Calories", current: current.calories, target: targets.calories },
    { key: "protein", label: "Protein", current: current.protein, target: targets.protein },
    { key: "carbs", label: "Carbs", current: current.carbs, target: targets.carbs },
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

/**
 * Warnings for macros the user tracks as an upper LIMIT rather than a goal.
 * Fires only when the limit is actually set (> 0) and exceeded, so staying
 * under a fat limit stays completely silent — which is the point of a limit.
 */
export function getLimitAlerts(current: Macros, targets: GoalTargets): LimitAlert[] {
  const limits: { key: keyof Macros; label: string; current: number; limit: number }[] = [
    { key: "fats", label: "Fats", current: current.fats, limit: targets.fats },
  ];

  return limits
    .filter((item) => item.limit > 0 && item.current > item.limit)
    .map((item) => {
      const over = item.current - item.limit;
      return {
        key: item.key,
        label: item.label,
        current: item.current,
        limit: item.limit,
        over,
        // Deliberately not capped at 100 — "140%" is the useful reading here.
        percent: Math.round((item.current / item.limit) * 100),
        message: `You are ${Math.round(over)} g over your daily ${item.label.toLowerCase()} limit of ${Math.round(item.limit)} g.`,
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
