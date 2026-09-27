/**
 * Chart series builder for the Analytics screen.
 *
 * Two problems the old inline `buildWeeklyData` / `buildMonthlyData` caused:
 *
 * 1. TREND VISIBILITY. Six weekly SUMS were plotted, so one extra meal only
 *    nudged one bucket inside a 0–15,000 kcal range and the current (partial)
 *    week always sat far below the completed ones. The line read as a flat
 *    plateau no matter how much food was logged. The short view now buckets by
 *    DAY, so every meal raises its own point immediately; the long view buckets
 *    by month.
 * 2. Y-AXIS CEILING. react-native-chart-kit scales the axis to exactly the
 *    tallest value (`calcScaler` → max − min), which pins the peak to the top
 *    edge of the plot and leaves no room to read where a value sits. We compute
 *    our own ceiling with headroom and hand it to the chart via `fromNumber`.
 *
 * Everything here is pure and time-injectable so it can be unit-tested without
 * a device (see test/trendSeries.test.ts).
 */

import { toLocalDateString } from "@/src/lib/nutrition";
import { DailyLog } from "@/src/types";

/** Which window a series covers. */
export type TrendRange = "days" | "months";

export type TrendMetric = "calories" | "protein" | "carbs" | "fats";

export interface TrendTotals {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface TrendPoint extends TrendTotals {
  /** Stable identity: `YYYY-MM-DD` for days, `YYYY-MM` for months. */
  key: string;
  /** Short axis label (`9/22` for days, `Sep` for months). */
  label: string;
  /** Today, or the month we are currently in. */
  isCurrent: boolean;
}

export interface TrendWindow {
  range: TrendRange;
  /** Oldest → newest, ending on the current day/month. */
  points: TrendPoint[];
  /** Sum over the whole window. */
  totals: TrendTotals;
  /** Mean per point (zeros when the window has no points). */
  average: TrendTotals;
}

/** Points in the short (per-day) view. */
export const TREND_DAY_COUNT = 7;
/** Points in the long (per-month) view. */
export const TREND_MONTH_COUNT = 3;

/** Number of equal bands the Y axis is divided into (4 labels, 0 … max). */
export const AXIS_SEGMENTS = 3;
/** How much clear space the tallest point keeps below the ceiling: 15%. */
export const AXIS_HEADROOM = 0.15;

/**
 * Coarsest axis step per metric. Also the floor for an empty window, so a chart
 * with nothing logged still renders a sane 0…3×minStep axis instead of a
 * degenerate 0…1 one.
 */
export const AXIS_MIN_STEP: Record<TrendMetric, number> = {
  calories: 100,
  protein: 10,
  carbs: 10,
  fats: 10,
};

function emptyTotals(): TrendTotals {
  return { calories: 0, protein: 0, carbs: 0, fats: 0 };
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function summarize(points: TrendPoint[]): { totals: TrendTotals; average: TrendTotals } {
  const totals = emptyTotals();
  for (const point of points) {
    totals.calories += point.calories;
    totals.protein += point.protein;
    totals.carbs += point.carbs;
    totals.fats += point.fats;
  }

  if (points.length === 0) return { totals, average: emptyTotals() };

  return {
    totals,
    average: {
      calories: Math.round(totals.calories / points.length),
      protein: Math.round(totals.protein / points.length),
      carbs: Math.round(totals.carbs / points.length),
      fats: Math.round(totals.fats / points.length),
    },
  };
}

/**
 * One point per day, oldest first, ending on `today`. Days with nothing logged
 * are kept as zeros — the gaps are part of the trend and dropping them would
 * make the axis labels ambiguous.
 */
export function buildDailyWindow(
  logs: Pick<DailyLog, "log_date" | "total_calories" | "total_protein" | "total_carbs" | "total_fats">[],
  days = TREND_DAY_COUNT,
  today: Date = new Date()
): TrendWindow {
  const span = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : TREND_DAY_COUNT;
  const anchor = startOfDay(today);
  const points: TrendPoint[] = [];
  const byKey = new Map<string, TrendPoint>();

  for (let offset = span - 1; offset >= 0; offset--) {
    const date = startOfDay(anchor);
    date.setDate(date.getDate() - offset);
    const point: TrendPoint = {
      key: toLocalDateString(date),
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      isCurrent: offset === 0,
      ...emptyTotals(),
    };
    points.push(point);
    byKey.set(point.key, point);
  }

  for (const log of logs) {
    const point = byKey.get(log.log_date);
    if (!point) continue;
    point.calories += log.total_calories;
    point.protein += log.total_protein;
    point.carbs += log.total_carbs;
    point.fats += log.total_fats;
  }

  return { range: "days", points, ...summarize(points) };
}

/** One point per calendar month, oldest first, ending on the current month. */
export function buildMonthlyWindow(
  logs: Pick<DailyLog, "log_date" | "total_calories" | "total_protein" | "total_carbs" | "total_fats">[],
  months = TREND_MONTH_COUNT,
  today: Date = new Date()
): TrendWindow {
  const span = Number.isFinite(months) ? Math.max(1, Math.floor(months)) : TREND_MONTH_COUNT;
  const points: TrendPoint[] = [];
  const byKey = new Map<string, TrendPoint>();

  for (let offset = span - 1; offset >= 0; offset--) {
    const date = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    const point: TrendPoint = {
      key: monthKey(date),
      label: date.toLocaleString("en", { month: "short" }),
      isCurrent: offset === 0,
      ...emptyTotals(),
    };
    points.push(point);
    byKey.set(point.key, point);
  }

  for (const log of logs) {
    // `log_date` is `YYYY-MM-DD`, so its first 7 characters are the month key.
    const point = byKey.get(log.log_date.slice(0, 7));
    if (!point) continue;
    point.calories += log.total_calories;
    point.protein += log.total_protein;
    point.carbs += log.total_carbs;
    point.fats += log.total_fats;
  }

  return { range: "months", points, ...summarize(points) };
}

const NICE_STEP_MULTIPLIERS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10];

/** Smallest "nice" number ≥ raw: 1/1.5/2/2.5/3/4/5/6/7.5/10 × 10ⁿ. */
export function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  for (const multiplier of NICE_STEP_MULTIPLIERS) {
    const step = multiplier * magnitude;
    // Tiny tolerance so a floating-point hair below `raw` still counts as
    // "big enough" (7.5 × 100 must satisfy 750).
    if (step >= raw - 1e-9) return Number(step.toPrecision(12));
  }
  return Number((10 * magnitude).toPrecision(12));
}

/** Tallest finite value, ignoring gaps/negatives. NaN and Infinity are skipped. */
export function peakOf(values: number[]): number {
  return values.reduce<number>(
    (peak, value) => (Number.isFinite(value) && value > peak ? value : peak),
    0
  );
}

/**
 * Explicit Y ceiling for the chart: the smallest value that
 * - divides into `AXIS_SEGMENTS` equal (nicely rounded) bands,
 * - keeps at least `AXIS_HEADROOM` of clear space above the tallest value, and
 * - is never smaller than a real value (the peak must not be clipped).
 *
 * Fed to react-native-chart-kit as `fromNumber`, which is the only supported
 * way to pin its auto-scaled axis.
 */
export function computeAxisMax(values: number[], minStep = 1): number {
  const peak = peakOf(values);
  const floor = Number.isFinite(minStep) && minStep > 0 ? minStep : 1;
  const target = peak * (1 + AXIS_HEADROOM);
  const step = niceStep(Math.max(floor, target / AXIS_SEGMENTS));
  const bands = Math.max(1, Math.ceil(target / (step * AXIS_SEGMENTS)));
  return step * AXIS_SEGMENTS * bands;
}

/** Axis numbers: short enough for the 48px label gutter ("12k" not "12000"). */
export function formatAxisValue(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 10_000) return `${Math.round(rounded / 1000)}k`;
  return String(rounded);
}

/** `formatYLabel` adapter — chart-kit hands us the label as a string. */
export function formatAxisTick(label: string): string {
  const value = Number.parseFloat(label);
  return Number.isFinite(value) ? formatAxisValue(value) : label;
}
