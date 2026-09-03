/**
 * @file servingUnits.test.ts
 * Unit tests for the REAL src/lib/servingUnits.ts module — grams / pieces /
 * provider-portion conversion used by the serving input across the app.
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SERVING_STATE,
  formatServingSize,
  formatUnitQuantity,
  getServingUnitForFood,
  parseQuantity,
  servingStateToGrams,
  servingUnitLabel,
  UNIT_GRAM_DEFAULTS,
  unitsToGrams,
  type ServingUnit,
} from "../src/lib/servingUnits";
import type { ServingPortion } from "../src/types";

const EGG: ServingUnit = { unit: "egg", gramsPerUnit: 50 };
const CUP: ServingPortion = { id: "p1", label: "1 cup (244 g)", grams: 244, unit: "g" };

// ── getServingUnitForFood ────────────────────────────────────────────────────
describe("getServingUnitForFood()", () => {
  it("empty string returns null", () => assert.equal(getServingUnitForFood(""), null));
  it("whitespace-only returns null", () => assert.equal(getServingUnitForFood("   "), null));
  it("unrecognized food returns null", () => assert.equal(getServingUnitForFood("grilled salmon"), null));

  it("recognizes egg (50g)", () => {
    const r = getServingUnitForFood("Egg");
    assert.ok(r);
    assert.equal(r.unit, "egg");
    assert.equal(r.gramsPerUnit, 50);
  });

  it("egg white takes priority over plain egg", () => {
    const r = getServingUnitForFood("Egg white");
    assert.ok(r);
    assert.equal(r.unit, "egg white");
    assert.equal(r.gramsPerUnit, 33);
  });

  it("egg yolk takes priority over plain egg", () => {
    const r = getServingUnitForFood("Egg yolk");
    assert.ok(r);
    assert.equal(r.unit, "egg yolk");
    assert.equal(r.gramsPerUnit, 17);
  });

  it("recognizes banana (118g)", () => {
    const r = getServingUnitForFood("banana");
    assert.ok(r);
    assert.equal(r.gramsPerUnit, 118);
  });

  it("recognizes guava (90g)", () => {
    const r = getServingUnitForFood("Guava");
    assert.ok(r);
    assert.equal(r.unit, "guava");
    assert.equal(r.gramsPerUnit, 90);
  });

  it("recognizes roti (40g)", () => {
    const r = getServingUnitForFood("Roti");
    assert.ok(r);
    assert.equal(r.unit, "roti");
  });

  it("recognizes chapati as roti", () => {
    const r = getServingUnitForFood("chapati");
    assert.ok(r);
    assert.equal(r.unit, "roti");
  });

  it("recognizes paratha (80g)", () => {
    const r = getServingUnitForFood("paratha");
    assert.ok(r);
    assert.equal(r.gramsPerUnit, 80);
  });

  it("recognizes apple (182g)", () => {
    const r = getServingUnitForFood("Apple");
    assert.ok(r);
    assert.equal(r.gramsPerUnit, 182);
  });

  it("case-insensitive matching", () => {
    const r = getServingUnitForFood("BANANA");
    assert.ok(r);
    assert.equal(r.unit, "banana");
  });

  it("extra whitespace is normalised", () => {
    const r = getServingUnitForFood("  egg  ");
    assert.ok(r);
    assert.equal(r.unit, "egg");
  });
});

// ── unitsToGrams ─────────────────────────────────────────────────────────────
describe("unitsToGrams()", () => {
  it("1 egg = 50g", () => assert.equal(unitsToGrams(1, EGG), 50));
  it("2 eggs = 100g", () => assert.equal(unitsToGrams(2, EGG), 100));
  it("0 eggs = 0g", () => assert.equal(unitsToGrams(0, EGG), 0));
  it("negative quantity = 0g (guard)", () => assert.equal(unitsToGrams(-1, EGG), 0));
  it("NaN = 0g (guard)", () => assert.equal(unitsToGrams(NaN, EGG), 0));
  it("Infinity = 0g (guard)", () => assert.equal(unitsToGrams(Infinity, EGG), 0));
  it("fractional units", () => assert.equal(unitsToGrams(0.5, EGG), 25));
});

// ── formatUnitQuantity ───────────────────────────────────────────────────────
describe("formatUnitQuantity()", () => {
  it("1 egg is singular", () => assert.equal(formatUnitQuantity(1, EGG), "1 egg"));
  it("2 eggs is plural", () => assert.equal(formatUnitQuantity(2, EGG), "2 eggs"));
  it("1.5 eggs keeps one decimal", () => assert.equal(formatUnitQuantity(1.5, EGG), "1.5 eggs"));
  it("pluralises compound units (egg white)", () =>
    assert.equal(formatUnitQuantity(2, { unit: "egg white", gramsPerUnit: 33 }), "2 egg whites"));
});

// ── parseQuantity ────────────────────────────────────────────────────────────
describe("parseQuantity()", () => {
  it("parses integer string", () => assert.equal(parseQuantity("100"), 100));
  it("parses float string", () => assert.equal(parseQuantity("2.5"), 2.5));
  it("empty string returns 0", () => assert.equal(parseQuantity(""), 0));
  it("non-numeric string returns 0", () => assert.equal(parseQuantity("abc"), 0));
  it("negative string returns 0", () => assert.equal(parseQuantity("-5"), 0));
  it("parses zero", () => assert.equal(parseQuantity("0"), 0));
  it("large number is accepted", () => assert.equal(parseQuantity("9999"), 9999));
});

// ── DEFAULT_SERVING_STATE ────────────────────────────────────────────────────
describe("DEFAULT_SERVING_STATE", () => {
  it("is grams mode at 100 g", () =>
    assert.deepEqual(DEFAULT_SERVING_STATE, {
      mode: "grams",
      quantity: "100",
      unit: null,
      portion: null,
    }));
});

// ── servingStateToGrams ──────────────────────────────────────────────────────
describe("servingStateToGrams()", () => {
  it("grams mode: returns quantity directly", () =>
    assert.equal(servingStateToGrams({ mode: "grams", quantity: "150", unit: null, portion: null }), 150));

  it("units mode: 2 eggs = 100g", () =>
    assert.equal(servingStateToGrams({ mode: "units", quantity: "2", unit: EGG, portion: null }), 100));

  it("portion mode: 1 cup = 244g", () =>
    assert.equal(servingStateToGrams({ mode: "portion", quantity: "1", unit: null, portion: CUP }), 244));

  it("portion mode: 2 cups = 488g", () =>
    assert.equal(servingStateToGrams({ mode: "portion", quantity: "2", unit: null, portion: CUP }), 488));

  it("grams mode with invalid quantity returns 0", () =>
    assert.equal(servingStateToGrams({ mode: "grams", quantity: "abc", unit: null, portion: null }), 0));

  it("units mode with missing unit falls back to raw quantity", () =>
    assert.equal(servingStateToGrams({ mode: "units", quantity: "150", unit: null, portion: null }), 150));
});

// ── servingUnitLabel ─────────────────────────────────────────────────────────
describe("servingUnitLabel()", () => {
  it("grams mode returns 'grams'", () =>
    assert.equal(servingUnitLabel({ mode: "grams", quantity: "100", unit: null, portion: null }), "grams"));

  it("units mode qty=1 returns singular", () =>
    assert.equal(servingUnitLabel({ mode: "units", quantity: "1", unit: EGG, portion: null }), "egg"));

  it("units mode qty=2 returns plural", () =>
    assert.equal(servingUnitLabel({ mode: "units", quantity: "2", unit: EGG, portion: null }), "eggs"));

  it("portion mode returns portion label", () =>
    assert.equal(servingUnitLabel({ mode: "portion", quantity: "1", unit: null, portion: CUP }), "1 cup (244 g)"));
});

// ── formatServingSize ────────────────────────────────────────────────────────
describe("formatServingSize()", () => {
  it("grams mode formats with g suffix", () =>
    assert.equal(formatServingSize({ mode: "grams", quantity: "150", unit: null, portion: null }), "150 g"));

  it("units mode 1 egg is singular", () =>
    assert.equal(formatServingSize({ mode: "units", quantity: "1", unit: EGG, portion: null }), "1 egg"));

  it("units mode 2 eggs is plural", () =>
    assert.equal(formatServingSize({ mode: "units", quantity: "2", unit: EGG, portion: null }), "2 eggs"));

  it("portion mode qty=1 returns just the label", () =>
    assert.equal(formatServingSize({ mode: "portion", quantity: "1", unit: null, portion: CUP }), "1 cup (244 g)"));

  it("portion mode qty=2 prefixes a multiplier", () =>
    assert.equal(formatServingSize({ mode: "portion", quantity: "2", unit: null, portion: CUP }), "2 × 1 cup (244 g)"));
});

// ── UNIT_GRAM_DEFAULTS reference table ───────────────────────────────────────
describe("UNIT_GRAM_DEFAULTS (settings reference table)", () => {
  it("exposes the documented conversions", () => {
    const banana = UNIT_GRAM_DEFAULTS.find((i) => i.label === "Medium Banana");
    assert.ok(banana);
    assert.equal(banana.gramsPerUnit, 118);
  });

  it("every entry maps to a resolvable piece rule", () => {
    for (const entry of UNIT_GRAM_DEFAULTS) {
      const resolved = getServingUnitForFood(entry.label);
      assert.ok(resolved, `no rule resolves for ${entry.label}`);
      assert.equal(resolved.gramsPerUnit, entry.gramsPerUnit);
    }
  });
});
