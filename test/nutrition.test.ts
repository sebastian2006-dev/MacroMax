/**
 * @file nutrition.test.ts
 * Unit tests for the REAL src/lib/nutrition.ts module — the macro engine
 * behind totals, goals, low-intake alerts and date helpers.
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  addMacros,
  calculateRollingAverages,
  calculateTotals,
  EMPTY_MACROS,
  getDateNDaysAgo,
  getGoalTargets,
  getLowIntakeAlerts,
  groupMealItemsByType,
  scaleMacros,
  startOfWeek,
  toLocalDateString,
} from "../src/lib/nutrition";
import type { DailyLog, Macros, MealItem, MealType, Profile } from "../src/types";

function day(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return toLocalDateString(d);
}

// ── addMacros ────────────────────────────────────────────────────────────────
describe("addMacros()", () => {
  it("two empty objects return empty", () =>
    assert.deepEqual(addMacros(EMPTY_MACROS, EMPTY_MACROS), EMPTY_MACROS));

  it("correctly sums all fields", () =>
    assert.deepEqual(
      addMacros(
        { calories: 200, protein: 25, carbs: 30, fats: 5 },
        { calories: 100, protein: 10, carbs: 15, fats: 3 }
      ),
      { calories: 300, protein: 35, carbs: 45, fats: 8 }
    ));

  it("handles negative values", () =>
    assert.deepEqual(
      addMacros(
        { calories: 500, protein: 50, carbs: 60, fats: 20 },
        { calories: -100, protein: -5, carbs: -10, fats: -2 }
      ),
      { calories: 400, protein: 45, carbs: 50, fats: 18 }
    ));

  it("is associative", () => {
    const a: Macros = { calories: 100, protein: 10, carbs: 20, fats: 5 };
    const b: Macros = { calories: 200, protein: 20, carbs: 30, fats: 8 };
    const c: Macros = { calories: 50, protein: 5, carbs: 10, fats: 2 };
    assert.deepEqual(addMacros(addMacros(a, b), c), addMacros(a, addMacros(b, c)));
  });
});

// ── scaleMacros ──────────────────────────────────────────────────────────────
describe("scaleMacros()", () => {
  it("100g returns original", () => {
    const m = { calories: 200, protein: 25, carbs: 30, fats: 5 };
    assert.deepEqual(scaleMacros(m, 100), m);
  });

  it("200g doubles values", () =>
    assert.deepEqual(
      scaleMacros({ calories: 100, protein: 10, carbs: 15, fats: 3 }, 200),
      { calories: 200, protein: 20, carbs: 30, fats: 6 }
    ));

  it("50g halves values", () =>
    assert.deepEqual(
      scaleMacros({ calories: 200, protein: 20, carbs: 30, fats: 10 }, 50),
      { calories: 100, protein: 10, carbs: 15, fats: 5 }
    ));

  it("0g returns all zeros", () =>
    assert.deepEqual(scaleMacros({ calories: 500, protein: 40, carbs: 60, fats: 20 }, 0), EMPTY_MACROS));
});

// ── calculateTotals ──────────────────────────────────────────────────────────
describe("calculateTotals()", () => {
  it("empty list returns empty macros", () => assert.deepEqual(calculateTotals([]), EMPTY_MACROS));

  it("single item is returned unchanged", () => {
    const i: Macros = { calories: 300, protein: 25, carbs: 40, fats: 8 };
    assert.deepEqual(calculateTotals([i]), i);
  });

  it("sums three items correctly", () =>
    assert.deepEqual(
      calculateTotals([
        { calories: 200, protein: 20, carbs: 25, fats: 5 },
        { calories: 150, protein: 15, carbs: 18, fats: 4 },
        { calories: 100, protein: 8, carbs: 12, fats: 3 },
      ]),
      { calories: 450, protein: 43, carbs: 55, fats: 12 }
    ));
});

// ── getGoalTargets ───────────────────────────────────────────────────────────
describe("getGoalTargets()", () => {
  it("maps numeric targets through unchanged", () => {
    const profile = {
      target_calories: 2000,
      target_protein: 150,
      target_carbs: 250,
      target_fats: 70,
    } as Profile;
    assert.deepEqual(getGoalTargets(profile), { calories: 2000, protein: 150, carbs: 250, fats: 70 });
  });

  it("null carbs/fats (not configured) become 0", () => {
    const profile = {
      target_calories: 2000,
      target_protein: 150,
      target_carbs: null,
      target_fats: null,
    } as Profile;
    assert.deepEqual(getGoalTargets(profile), { calories: 2000, protein: 150, carbs: 0, fats: 0 });
  });
});

// ── getLowIntakeAlerts ───────────────────────────────────────────────────────
describe("getLowIntakeAlerts()", () => {
  it("no alerts when all macros meet targets", () => {
    const m: Macros = { calories: 2000, protein: 150, carbs: 250, fats: 70 };
    assert.equal(getLowIntakeAlerts(m, m).length, 0);
  });

  it("no alerts when targets are zero (not configured)", () =>
    assert.equal(getLowIntakeAlerts(EMPTY_MACROS, EMPTY_MACROS).length, 0));

  it("fires alert at 49% (below 50% threshold)", () => {
    const alerts = getLowIntakeAlerts(
      { calories: 980, protein: 0, carbs: 0, fats: 0 },
      { calories: 2000, protein: 0, carbs: 0, fats: 0 }
    );
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].key, "calories");
    assert.equal(alerts[0].percent, 49);
  });

  it("does NOT fire alert at exactly 50%", () =>
    assert.equal(
      getLowIntakeAlerts(
        { calories: 1000, protein: 0, carbs: 0, fats: 0 },
        { calories: 2000, protein: 0, carbs: 0, fats: 0 }
      ).length,
      0
    ));

  it("fires all four alerts when everything is low", () => {
    const alerts = getLowIntakeAlerts(
      { calories: 500, protein: 30, carbs: 50, fats: 10 },
      { calories: 2000, protein: 150, carbs: 250, fats: 70 }
    );
    assert.equal(alerts.length, 4);
  });

  it("alert message contains label and percent", () => {
    const [a] = getLowIntakeAlerts(
      { calories: 400, protein: 0, carbs: 0, fats: 0 },
      { calories: 2000, protein: 0, carbs: 0, fats: 0 }
    );
    assert.ok(a.message.includes("Calories") && a.message.includes("20%"));
  });
});

// ── toLocalDateString ────────────────────────────────────────────────────────
describe("toLocalDateString()", () => {
  it("Jan 1st is zero-padded correctly", () => assert.equal(toLocalDateString(new Date(2024, 0, 1)), "2024-01-01"));
  it("Dec 31st is formatted correctly", () => assert.equal(toLocalDateString(new Date(2024, 11, 31)), "2024-12-31"));
  it("mid-year date is formatted correctly", () => assert.equal(toLocalDateString(new Date(2025, 5, 15)), "2025-06-15"));
});

// ── startOfWeek ──────────────────────────────────────────────────────────────
describe("startOfWeek()", () => {
  it("Monday stays as Monday", () => assert.equal(toLocalDateString(startOfWeek(new Date(2024, 0, 1))), "2024-01-01"));
  it("Sunday goes back to Monday", () => assert.equal(toLocalDateString(startOfWeek(new Date(2024, 0, 7))), "2024-01-01"));
  it("Wednesday goes back to Monday", () => assert.equal(toLocalDateString(startOfWeek(new Date(2024, 0, 3))), "2024-01-01"));
  it("resets time to midnight", () => {
    const r = startOfWeek(new Date(2024, 0, 3, 15, 30, 45));
    assert.equal(r.getHours(), 0);
    assert.equal(r.getMinutes(), 0);
  });
});

// ── addDays ──────────────────────────────────────────────────────────────────
describe("addDays()", () => {
  it("adding 0 days returns same date", () => assert.equal(toLocalDateString(addDays(new Date(2024, 5, 15), 0)), "2024-06-15"));
  it("adding 7 days returns next week", () => assert.equal(toLocalDateString(addDays(new Date(2024, 5, 15), 7)), "2024-06-22"));
  it("negative days go back in time", () => assert.equal(toLocalDateString(addDays(new Date(2024, 5, 15), -5)), "2024-06-10"));
  it("original date is not mutated", () => {
    const d = new Date(2024, 5, 15);
    addDays(d, 10);
    assert.equal(toLocalDateString(d), "2024-06-15");
  });
});

// ── getDateNDaysAgo ──────────────────────────────────────────────────────────
describe("getDateNDaysAgo()", () => {
  it("0 days ago is today", () => assert.equal(getDateNDaysAgo(0), day(0)));
  it("1 day ago is yesterday", () => assert.equal(getDateNDaysAgo(1), day(-1)));
  it("7 days ago is a week back", () => assert.equal(getDateNDaysAgo(7), day(-7)));
});

// ── calculateRollingAverages ─────────────────────────────────────────────────
describe("calculateRollingAverages()", () => {
  const mkLog = (log_date: string, total_calories: number, total_protein = 0): DailyLog => ({
    id: `log-${log_date}`,
    user_id: "local",
    log_date,
    total_calories,
    total_protein,
    total_carbs: 0,
    total_fats: 0,
  });

  it("empty input returns empty output", () => assert.deepEqual(calculateRollingAverages([]), []));

  it("single log: rolling equals own value", () => {
    const r = calculateRollingAverages([mkLog("2024-01-01", 2000, 150)]);
    assert.equal(r[0].rolling_calories, 2000);
    assert.equal(r[0].rolling_protein, 150);
  });

  it("sorts out-of-order logs before computing", () => {
    const logs: DailyLog[] = [
      mkLog("2024-01-03", 3000),
      mkLog("2024-01-01", 1000),
      mkLog("2024-01-02", 2000),
    ];
    const r = calculateRollingAverages(logs, 2);
    assert.equal(r[0].rolling_calories, 1000);
    assert.equal(r[1].rolling_calories, 1500);
    assert.equal(r[2].rolling_calories, 2500);
  });
});

// ── groupMealItemsByType ─────────────────────────────────────────────────────
describe("groupMealItemsByType()", () => {
  const mk = (meal_type: MealType): MealItem =>
    ({ id: `x-${meal_type}`, daily_log_id: "l1", meal_type, item_name: "Item", serving_size: "100 g", calories: 100, protein: 10, carbs: 15, fats: 3 });

  it("all buckets empty for no items", () => {
    const r = groupMealItemsByType([]);
    assert.equal(r.Breakfast.length + r.Lunch.length + r.Dinner.length + r["Snacks/Extra"].length, 0);
  });

  it("routes items to correct buckets", () => {
    const r = groupMealItemsByType([mk("Breakfast"), mk("Lunch"), mk("Lunch"), mk("Dinner"), mk("Snacks/Extra")]);
    assert.equal(r.Breakfast.length, 1);
    assert.equal(r.Lunch.length, 2);
    assert.equal(r.Dinner.length, 1);
    assert.equal(r["Snacks/Extra"].length, 1);
  });
});
