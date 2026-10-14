/**
 * @file monthGrid.test.ts
 * Guards the month calendar's layout maths.
 *
 * Why this exists: expanding the calendar must never disturb the rings below
 * it, and that guarantee rests entirely on the grid being a FIXED 42 cells for
 * every month — a variable row count would make the card change height with
 * the month (the class of layout surprise that let the rings overlap the
 * calendar). These tests pin the grid shape, the Monday-first ordering and the
 * month ranges the logged-dates query reads.
 *
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  GRID_CELL_HEIGHT,
  GRID_GAP,
  MIN_CELL_WIDTH,
  MONTH_GRID_CELLS,
  MONTH_GRID_ROWS,
  buildMonthGrid,
  endOfMonth,
  isSameLocalDay,
  mondayFirstIndex,
  monthGridMetrics,
  monthLabel,
  monthRange,
  startOfMonth,
  weekOf,
} from "../src/lib/monthGrid";

/** Local-midnight date helper (month is 0-based, like Date). */
function localDate(year: number, month: number, day: number, hour = 0): Date {
  return new Date(year, month, day, hour, 0, 0, 0);
}

const MONTHS: [number, number][] = [];
for (let year = 2024; year <= 2027; year += 1) {
  for (let month = 0; month < 12; month += 1) {
    MONTHS.push([year, month]);
  }
}

describe("buildMonthGrid — fixed 42-cell shape", () => {
  it("always renders 6 rows of 7 cells, whatever the month", () => {
    assert.equal(MONTH_GRID_CELLS, 42);
    assert.equal(MONTH_GRID_ROWS, 6);
    for (const [year, month] of MONTHS) {
      const cells = buildMonthGrid(localDate(year, month, 15));
      assert.equal(cells.length, 42, `${year}-${month + 1} must be 42 cells`);
      assert.equal(cells.length % 7, 0);
    }
  });

  it("starts every grid on a Monday and ends it on a Sunday", () => {
    for (const [year, month] of MONTHS) {
      const cells = buildMonthGrid(localDate(year, month, 1));
      assert.equal(cells[0].date.getDay(), 1, `${year}-${month + 1} must start on Monday`);
      assert.equal(cells[41].date.getDay(), 0, `${year}-${month + 1} must end on Sunday`);
    }
  });

  it("keeps the days of the month contiguous, in order, with no duplicates", () => {
    for (const [year, month] of MONTHS) {
      const cells = buildMonthGrid(localDate(year, month, 10));
      const inMonth = cells.filter((cell) => cell.inMonth);
      const expectedDays = new Date(year, month + 1, 0).getDate();
      assert.equal(inMonth.length, expectedDays);
      assert.deepEqual(
        inMonth.map((cell) => cell.dayOfMonth),
        Array.from({ length: expectedDays }, (_, index) => index + 1),
      );
      const unique = new Set(cells.map((cell) => cell.dateString));
      assert.equal(unique.size, 42, "each cell is a distinct date");
    }
  });

  it("labels leading and trailing days as outside the month", () => {
    const cells = buildMonthGrid(localDate(2026, 9, 1)); // October 2026
    // 1 Oct 2026 is a Thursday, so the grid opens on Mon 28 Sep.
    assert.equal(cells[0].dateString, "2026-09-28");
    assert.equal(cells[0].inMonth, false);
    assert.equal(cells[3].dateString, "2026-10-01");
    assert.equal(cells[3].inMonth, true);
    assert.equal(cells[33].dateString, "2026-10-31");
    assert.equal(cells[33].inMonth, true);
    // 31 days from a Thursday leaves 3 leading and 8 trailing days.
    assert.equal(cells.slice(34).every((cell) => !cell.inMonth), true);
  });

  it("handles a 28-day February that starts on a Sunday", () => {
    const cells = buildMonthGrid(localDate(2026, 1, 1));
    // 1 Feb 2026 is a Sunday → the grid opens on Mon 26 Jan (6 leading cells).
    assert.equal(cells[0].dateString, "2026-01-26");
    assert.equal(cells[6].dateString, "2026-02-01");
    assert.equal(cells.filter((cell) => cell.inMonth).length, 28);
  });

  it("handles a leap February", () => {
    const cells = buildMonthGrid(localDate(2024, 1, 1));
    // 1 Feb 2024 is a Thursday → 3 leading cells (29-31 Jan), so the 29th
    // falls at index 3 + 28.
    assert.equal(cells[0].dateString, "2024-01-29");
    assert.equal(cells.filter((cell) => cell.inMonth).length, 29);
    assert.equal(cells[31].dateString, "2024-02-29");
    assert.equal(cells[31].inMonth, true);
    assert.equal(cells[32].dateString, "2024-03-01");
  });

  it("mirrors Date.getDay() into Monday-first indices", () => {
    const cells = buildMonthGrid(localDate(2026, 9, 1));
    for (const cell of cells) {
      assert.equal(cell.weekdayIndex, mondayFirstIndex(cell.date.getDay()));
      assert.ok(cell.weekdayIndex >= 0 && cell.weekdayIndex <= 6);
    }
  });
});

describe("monthRange / startOfMonth / endOfMonth", () => {
  it("covers exactly the days of the month, in YYYY-MM-DD form", () => {
    assert.deepEqual(monthRange(localDate(2026, 9, 14)), {
      start: "2026-10-01",
      end: "2026-10-31",
    });
    assert.deepEqual(monthRange(localDate(2026, 1, 3)), {
      start: "2026-02-01",
      end: "2026-02-28",
    });
    assert.deepEqual(monthRange(localDate(2024, 1, 3)), {
      start: "2024-02-01",
      end: "2024-02-29",
    });
  });

  it("is unaffected by the time of day it is called with", () => {
    assert.equal(monthRange(localDate(2026, 11, 31, 23)).start, "2026-12-01");
    assert.equal(monthRange(localDate(2026, 11, 31, 23)).end, "2026-12-31");
  });

  it("normalises to local midnight", () => {
    const start = startOfMonth(localDate(2026, 9, 14, 18));
    const end = endOfMonth(localDate(2026, 9, 14, 18));
    assert.deepEqual([start.getHours(), start.getMinutes(), start.getSeconds()], [0, 0, 0]);
    assert.equal(start.getDate(), 1);
    assert.deepEqual([end.getHours(), end.getMinutes(), end.getSeconds()], [0, 0, 0]);
    assert.equal(end.getDate(), 31);
  });

  it("labels the month for the calendar header", () => {
    assert.equal(monthLabel(localDate(2026, 9, 14)), "October 2026");
    assert.equal(monthLabel(localDate(2026, 0, 1)), "January 2026");
  });
});

// The expanded calendar is the one dashboard element that can grow by ~300dp
// at a tap, so its geometry is asserted rather than eyeballed: it must FIT the
// card on every phone width and be the SAME height in every month.
describe("monthGridMetrics — the no-collision layout contract", () => {
  const REAL_PHONE_WIDTHS = [320, 360, 375, 390, 412, 480, 600, 800, 1024];

  it("fits the card's inner width on every real phone size", () => {
    for (const width of REAL_PHONE_WIDTHS) {
      const metrics = monthGridMetrics(width);
      assert.ok(
        metrics.gridWidth <= metrics.available,
        `width=${width}: grid ${metrics.gridWidth} must fit in ${metrics.available}`,
      );
      assert.ok(metrics.cellWidth >= MIN_CELL_WIDTH);
      assert.ok(Number.isInteger(metrics.cellWidth), "cells are whole pixels");
    }
  });

  it("subtracts the page gutters AND the card padding", () => {
    assert.equal(monthGridMetrics(360).available, 360 - 16 * 2 - 16 * 2);
  });

  it("uses the space it has (the fit is tight, not accidentally narrow)", () => {
    for (const width of REAL_PHONE_WIDTHS) {
      const metrics = monthGridMetrics(width);
      assert.ok(
        metrics.available - metrics.gridWidth < 7,
        `width=${width}: ${metrics.available - metrics.gridWidth}px of slack would leave a visible right gap`,
      );
    }
  });

  it("keeps the expanded grid a FIXED height, whatever the window or month", () => {
    const expected = MONTH_GRID_ROWS * GRID_CELL_HEIGHT + (MONTH_GRID_ROWS - 1) * GRID_GAP;
    for (const width of REAL_PHONE_WIDTHS) {
      assert.equal(monthGridMetrics(width).gridHeight, expected);
    }
  });

  it("never squeezes a day below the readable minimum on an absurdly narrow window", () => {
    const metrics = monthGridMetrics(200);
    assert.equal(metrics.cellWidth, MIN_CELL_WIDTH);
  });

  it("reports the gap and row height the component draws with", () => {
    const metrics = monthGridMetrics(390);
    assert.equal(metrics.gap, GRID_GAP);
    assert.equal(metrics.cellHeight, GRID_CELL_HEIGHT);
    assert.equal(metrics.gridWidth, metrics.cellWidth * 7 + GRID_GAP * 6);
  });
});

describe("weekOf / isSameLocalDay", () => {
  it("returns the Monday-first week containing the given day", () => {
    const week = weekOf(localDate(2026, 9, 14)); // Wednesday
    assert.equal(week.length, 7);
    assert.equal(week[0].getDay(), 1);
    assert.equal(week[6].getDay(), 0);
    assert.equal(week[0].getDate(), 12);
    assert.equal(week[6].getDate(), 18);
  });

  it("returns the same week for a Monday and the Sunday that closes it", () => {
    const monday = weekOf(localDate(2026, 9, 12));
    const sunday = weekOf(localDate(2026, 9, 18));
    assert.deepEqual(
      monday.map((date) => date.getDate()),
      sunday.map((date) => date.getDate()),
    );
  });

  it("compares calendar days, not timestamps", () => {
    assert.equal(isSameLocalDay(localDate(2026, 9, 14, 0), localDate(2026, 9, 14, 23)), true);
    assert.equal(isSameLocalDay(localDate(2026, 9, 14), localDate(2026, 9, 15)), false);
  });
});
