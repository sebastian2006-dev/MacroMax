/**
 * Month-grid maths for the collapsible dashboard calendar.
 *
 * Pure and dependency-free (apart from the date helpers already in
 * `nutrition.ts`) so the layout can be unit-tested without a renderer: the
 * calendar's whole reason for existing is that expanding it must NEVER disturb
 * the cards below, and that guarantee rests on the grid having a fixed,
 * computed size — 6 rows of 7 cells for every month, including a 28-day
 * February. A variable row count would make the expanded card change height
 * depending on the month, which is exactly the kind of layout surprise that
 * used to let the rings overlap the calendar.
 */

import { addDays, startOfWeek, toLocalDateString } from "./nutrition";

/** Monday-first column initials, matching `startOfWeek` (Monday) in nutrition.ts. */
export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/** Monday-first full names, for accessibility labels. */
export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/**
 * Always 6 rows: a month spans 28-31 days and can start on any weekday, so it
 * touches 4 (Feb starting Monday in a non-leap year), 5 or 6 Monday-first
 * weeks. Padding every month to six rows keeps the expanded card's height
 * identical in January and February — no reflow, no jump, no overlap.
 */
export const MONTH_GRID_ROWS = 6;
export const MONTH_GRID_CELLS = MONTH_GRID_ROWS * 7;

// ---------------------------------------------------------------------------
// Grid geometry
//
// The expanded month is laid out with plain arithmetic — no flex, no
// measurement — so its size is known BEFORE it renders. That is what keeps it
// from ever measuring to zero or growing an extra row and sliding into the
// dashboard's rings.
// ---------------------------------------------------------------------------

/** Page gutter, matching the screens' 16dp screen padding. */
export const PAGE_INSET = 16;
/** The month card's own p-4. */
export const CARD_INSET = 16;
/** Gap between day cells, horizontally and between rows. */
export const GRID_GAP = 4;
/** Row height: fits a capped day number plus the logged dot at 150% font scale. */
export const GRID_CELL_HEIGHT = 46;
/** Smallest readable cell — the grid never squeezes a day below this. */
export const MIN_CELL_WIDTH = 28;

/** Height of the M T W T F S S header row above the grid. */
export const WEEKDAY_ROW_HEIGHT = 18;

/** Size of the "this day is logged" marker under a day number. */
export const LOGGED_DOT_SIZE = 5;

export interface MonthGridMetrics {
  /** Width of one day cell, always a whole number of pixels. */
  cellWidth: number;
  cellHeight: number;
  gap: number;
  /** Width of all seven columns including the gaps between them. */
  gridWidth: number;
  /** Height of the fixed six rows including the gaps between them. */
  gridHeight: number;
  /** Inner width the grid was fitted into (window − page gutters − card padding). */
  available: number;
}

/**
 * Fit a 7×6 day grid into the window.
 *
 * Flooring the cell width keeps whole pixels (a fractional cell rounds up and
 * can push the last column out of the card), and the rows are a fixed height,
 * so `gridWidth` is always ≤ `available` and `gridHeight` never varies.
 */
export function monthGridMetrics(windowWidth: number): MonthGridMetrics {
  const available = Math.max(0, windowWidth - PAGE_INSET * 2 - CARD_INSET * 2);
  const cellWidth = Math.max(
    MIN_CELL_WIDTH,
    Math.floor((available - GRID_GAP * 6) / 7)
  );
  return {
    cellWidth,
    cellHeight: GRID_CELL_HEIGHT,
    gap: GRID_GAP,
    gridWidth: cellWidth * 7 + GRID_GAP * 6,
    gridHeight: MONTH_GRID_ROWS * GRID_CELL_HEIGHT + (MONTH_GRID_ROWS - 1) * GRID_GAP,
    available,
  };
}

export interface MonthCell {
  /** Local midnight of this cell. */
  date: Date;
  /** `toLocalDateString` key — the same identity the logs use. */
  dateString: string;
  dayOfMonth: number;
  /** False for the leading/trailing days borrowed from the neighbouring months. */
  inMonth: boolean;
  /** 0 = Monday … 6 = Sunday. */
  weekdayIndex: number;
}

/** Local midnight on the 1st of `date`'s month. */
export function startOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

/** Local midnight on the last day of `date`'s month. */
export function endOfMonth(date: Date): Date {
  const result = startOfMonth(date);
  result.setMonth(result.getMonth() + 1);
  result.setDate(0);
  return result;
}

/**
 * Inclusive `YYYY-MM-DD` range covering the whole month of `date` — the one
 * query the calendar (and the week strip above it) reads logged days from.
 */
export function monthRange(date: Date): { start: string; end: string } {
  return {
    start: toLocalDateString(startOfMonth(date)),
    end: toLocalDateString(endOfMonth(date)),
  };
}

/** True when both dates fall on the same local calendar day. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return toLocalDateString(a) === toLocalDateString(b);
}

/** The Monday-first week containing `date` (7 local midnights). */
export function weekOf(date: Date): Date[] {
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/**
 * The fixed 42-cell grid for `anchor`'s month: Monday-first, starting at the
 * Monday on or before the 1st. Leading and trailing cells belong to the
 * neighbouring months and carry `inMonth: false` so the UI can dim them.
 */
export function buildMonthGrid(anchor: Date): MonthCell[] {
  const first = startOfMonth(anchor);
  const gridStart = startOfWeek(first);
  const month = first.getMonth();

  return Array.from({ length: MONTH_GRID_CELLS }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date,
      dateString: toLocalDateString(date),
      dayOfMonth: date.getDate(),
      inMonth: date.getMonth() === month,
      weekdayIndex: (date.getDay() + 6) % 7, // JS: 0 = Sunday → Monday-first
    };
  });
}

/** "October 2026" — the calendar's subtitle. */
export function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Monday-first index for a `Date.getDay()` value (0 = Sunday). The weekday
 * chips are stored Monday-first, so every Sunday-relative conversion in the
 * calendar goes through here instead of repeating the `(day + 6) % 7` dance.
 */
export function mondayFirstIndex(day: number): number {
  return (day + 6) % 7;
}
