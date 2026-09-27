/**
 * @file trendSeries.test.ts
 * Unit tests for the REAL src/lib/trendSeries.ts module — the bucketing and
 * axis-scaling math behind the Analytics charts.
 *
 * These pin the two things that were wrong before:
 *  - the short view must bucket by DAY, so logging food moves its own point
 *    instead of being averaged away inside a weekly sum;
 *  - the Y ceiling must sit above the tallest value with headroom, so values
 *    are never pinned to the top edge of the plot.
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AXIS_HEADROOM,
  AXIS_MIN_STEP,
  AXIS_SEGMENTS,
  buildDailyWindow,
  buildMonthlyWindow,
  computeAxisMax,
  formatAxisTick,
  formatAxisValue,
  niceStep,
  peakOf,
  TREND_DAY_COUNT,
  TREND_MONTH_COUNT,
} from "../src/lib/trendSeries";

/** Sep 22 2026 — fixed so the tests never depend on the wall clock. */
const TODAY = new Date(2026, 8, 22);

function log(log_date: string, calories: number, protein = 0, carbs = 0, fats = 0) {
  return {
    log_date,
    total_calories: calories,
    total_protein: protein,
    total_carbs: carbs,
    total_fats: fats,
  };
}

function at<T>(items: T[], index: number): T {
  return items[index];
}

// ── peakOf ───────────────────────────────────────────────────────────────────
describe("peakOf()", () => {
  it("returns the tallest value", () => assert.equal(peakOf([0, 5, 12, 3]), 12));

  it("ignores NaN and Infinity", () =>
    assert.equal(peakOf([1, Number.NaN, 9, Number.POSITIVE_INFINITY, -4]), 9));

  it("returns 0 for an empty list and for all-negative values", () => {
    assert.equal(peakOf([]), 0);
    assert.equal(peakOf([-10, -2]), 0);
  });
});

// ── niceStep ─────────────────────────────────────────────────────────────────
describe("niceStep()", () => {
  it("rounds up to a readable step", () => {
    assert.equal(niceStep(575), 600);
    assert.equal(niceStep(920), 1000);
    assert.equal(niceStep(76.7), 100);
    assert.equal(niceStep(1), 1);
  });

  it("never returns something smaller than the raw value", () => {
    for (const raw of [1, 7, 12.5, 99, 101, 640, 2500, 7667, 13417]) {
      assert.ok(niceStep(raw) >= raw, `niceStep(${raw}) < ${raw}`);
    }
  });

  it("falls back to 1 for zero, negative and non-finite input", () => {
    assert.equal(niceStep(0), 1);
    assert.equal(niceStep(-5), 1);
    assert.equal(niceStep(Number.NaN), 1);
    assert.equal(niceStep(Number.POSITIVE_INFINITY), 1);
  });
});

// ── computeAxisMax ───────────────────────────────────────────────────────────
describe("computeAxisMax()", () => {
  it("leaves headroom above the peak instead of clipping it", () => {
    // The core complaint: chart-kit scaled the axis to exactly the peak, so the
    // line sat flush against the top of the plot.
    const week = [1800, 2100, 1950, 2400, 1600, 2200, 900];
    const axisMax = computeAxisMax(week, AXIS_MIN_STEP.calories);
    assert.equal(axisMax, 3000);
    assert.ok(peakOf(week) / axisMax <= 1 / (1 + AXIS_HEADROOM));
  });

  it("never returns a ceiling below any plotted value", () => {
    for (const peak of [1, 9, 50, 140, 250, 999, 1500, 2400, 5000, 12000, 42000]) {
      const axisMax = computeAxisMax([peak], 1);
      assert.ok(axisMax > peak, `axisMax ${axisMax} must exceed peak ${peak}`);
    }
  });

  it("keeps at least AXIS_HEADROOM of clear space above the peak", () => {
    for (const peak of [120, 300, 900, 1750, 2600, 4800, 11000]) {
      const axisMax = computeAxisMax([peak], AXIS_MIN_STEP.calories);
      assert.ok(
        axisMax >= peak * (1 + AXIS_HEADROOM),
        `axisMax ${axisMax} gives no headroom over ${peak}`
      );
    }
  });

  it("divides into AXIS_SEGMENTS equal, whole-number bands", () => {
    const axisMax = computeAxisMax([2400], AXIS_MIN_STEP.calories);
    const step = axisMax / AXIS_SEGMENTS;
    assert.equal(Number.isInteger(step), true);
    for (let i = 0; i <= AXIS_SEGMENTS; i++) {
      assert.equal(Number.isInteger(step * i), true);
    }
    assert.deepEqual(
      [0, 1, 2, 3].map((i) => formatAxisValue(step * i)),
      ["0", "1000", "2000", "3000"]
    );
  });

  it("scales a monthly sum window with short tick labels", () => {
    const axisMax = computeAxisMax([12000], AXIS_MIN_STEP.calories);
    assert.equal(axisMax, 15000);
    // 5-digit ticks would collide with the plot; the axis is read as
    // 0 / 5000 / 10k / 15k.
    const step = axisMax / AXIS_SEGMENTS;
    assert.deepEqual(
      [0, 1, 2, 3].map((i) => formatAxisValue(step * i)),
      ["0", "5000", "10k", "15k"]
    );
  });

  it("still renders a usable axis for an empty window", () => {
    assert.equal(computeAxisMax([], AXIS_MIN_STEP.calories), AXIS_MIN_STEP.calories * AXIS_SEGMENTS);
    assert.equal(computeAxisMax([], AXIS_MIN_STEP.protein), AXIS_MIN_STEP.protein * AXIS_SEGMENTS);
    assert.equal(computeAxisMax([0, 0, 0], 10), 30);
  });

  it("survives NaN, Infinity and negative input", () => {
    // Nothing plottable: the floor still produces a readable axis.
    assert.equal(computeAxisMax([Number.NaN, Number.POSITIVE_INFINITY, -50], 10), 30);
    // A nonsense minStep is ignored rather than poisoning the scale.
    assert.ok(computeAxisMax([100], Number.NaN) > 100);
    assert.ok(computeAxisMax([100], 0) > 100);
  });
});

// ── formatAxisValue / formatAxisTick ─────────────────────────────────────────
describe("axis tick formatting", () => {
  it("shortens large numbers so they fit the label gutter", () => {
    assert.equal(formatAxisValue(0), "0");
    assert.equal(formatAxisValue(600), "600");
    assert.equal(formatAxisValue(3000), "3000");
    assert.equal(formatAxisValue(10000), "10k");
    assert.equal(formatAxisValue(15000), "15k");
    assert.equal(formatAxisValue(Number.NaN), "0");
  });

  it("formatAxisTick adapts chart-kit's string labels", () => {
    assert.equal(formatAxisTick("12000"), "12k");
    assert.equal(formatAxisTick("0"), "0");
    assert.equal(formatAxisTick("not-a-number"), "not-a-number");
  });
});

// ── buildDailyWindow ─────────────────────────────────────────────────────────
describe("buildDailyWindow()", () => {
  it("returns one point per day, oldest first, ending today", () => {
    const window = buildDailyWindow([], TREND_DAY_COUNT, TODAY);
    assert.equal(window.points.length, TREND_DAY_COUNT);
    assert.deepEqual(
      window.points.map((point) => point.key),
      ["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"]
    );
    assert.deepEqual(window.points.map((point) => point.label), ["9/16", "9/17", "9/18", "9/19", "9/20", "9/21", "9/22"]);
    assert.equal(at(window.points, TREND_DAY_COUNT - 1).isCurrent, true);
    assert.equal(at(window.points, 0).isCurrent, false);
    assert.equal(window.range, "days");
  });

  it("puts each day's totals on that day's point", () => {
    const window = buildDailyWindow(
      [log("2026-09-22", 500, 40, 50, 10), log("2026-09-21", 300, 20, 30, 5)],
      TREND_DAY_COUNT,
      TODAY
    );
    assert.equal(at(window.points, 6).calories, 500);
    assert.equal(at(window.points, 6).protein, 40);
    assert.equal(at(window.points, 6).carbs, 50);
    assert.equal(at(window.points, 6).fats, 10);
    assert.equal(at(window.points, 5).calories, 300);
    // Untouched days stay at zero — the gaps are part of the trend.
    assert.equal(at(window.points, 4).calories, 0);
  });

  it("moves only today's point when today's food is logged", () => {
    // Regression guard for "the trend never changes as I add data": with weekly
    // sums this barely registered; with daily buckets it is one whole point.
    const before = buildDailyWindow([log("2026-09-20", 1800)], TREND_DAY_COUNT, TODAY);
    const after = buildDailyWindow(
      [log("2026-09-20", 1800), log("2026-09-22", 600)],
      TREND_DAY_COUNT,
      TODAY
    );

    const beforeValues = before.points.map((point) => point.calories);
    const afterValues = after.points.map((point) => point.calories);
    assert.deepEqual(beforeValues.slice(0, -1), afterValues.slice(0, -1));
    assert.equal(at(beforeValues, 6), 0);
    assert.equal(at(afterValues, 6), 600);
    assert.equal(after.totals.calories - before.totals.calories, 600);
  });

  it("ignores logs outside the window", () => {
    const window = buildDailyWindow([log("2026-09-01", 9999)], TREND_DAY_COUNT, TODAY);
    assert.equal(window.totals.calories, 0);
    assert.equal(window.average.calories, 0);
  });

  it("sums the window and averages per point", () => {
    const window = buildDailyWindow(
      [log("2026-09-22", 700, 50, 60, 20), log("2026-09-21", 700, 30, 40, 10)],
      TREND_DAY_COUNT,
      TODAY
    );
    assert.deepEqual(window.totals, { calories: 1400, protein: 80, carbs: 100, fats: 30 });
    assert.deepEqual(window.average, { calories: 200, protein: 11, carbs: 14, fats: 4 });
  });

  it("guards a nonsense day count", () => {
    assert.equal(buildDailyWindow([], Number.NaN, TODAY).points.length, TREND_DAY_COUNT);
    assert.equal(buildDailyWindow([], 0, TODAY).points.length, 1);
    assert.equal(buildDailyWindow([], 3.7, TODAY).points.length, 3);
  });
});

// ── buildMonthlyWindow ───────────────────────────────────────────────────────
describe("buildMonthlyWindow()", () => {
  it("returns one point per month, ending on the current one", () => {
    const window = buildMonthlyWindow([], TREND_MONTH_COUNT, TODAY);
    assert.equal(window.points.length, TREND_MONTH_COUNT);
    assert.deepEqual(window.points.map((point) => point.key), ["2026-07", "2026-08", "2026-09"]);
    assert.deepEqual(window.points.map((point) => point.label), ["Jul", "Aug", "Sep"]);
    assert.equal(at(window.points, TREND_MONTH_COUNT - 1).isCurrent, true);
    assert.equal(window.range, "months");
  });

  it("sums every day of a month into that month's point", () => {
    const window = buildMonthlyWindow(
      [log("2026-09-05", 100), log("2026-09-28", 250), log("2026-08-20", 200), log("2026-01-01", 5000)],
      TREND_MONTH_COUNT,
      TODAY
    );
    assert.equal(at(window.points, 2).calories, 350);
    assert.equal(at(window.points, 1).calories, 200);
    assert.equal(at(window.points, 0).calories, 0);
    assert.equal(window.totals.calories, 550);
  });

  it("crosses the year boundary correctly", () => {
    const window = buildMonthlyWindow([], TREND_MONTH_COUNT, new Date(2027, 0, 15));
    assert.deepEqual(window.points.map((point) => point.key), ["2026-11", "2026-12", "2027-01"]);
  });
});
