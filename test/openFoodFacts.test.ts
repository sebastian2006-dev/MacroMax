/**
 * @file openFoodFacts.test.ts
 * Unit tests for the REAL src/lib/openFoodFacts.ts mapping layer — turning
 * raw OFF V2 product payloads into app SearchResults with per-100g macros
 * and standard serving portions. No network calls are made.
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapOffProduct } from "../src/lib/openFoodFacts";

// ── Per-100g mapping ─────────────────────────────────────────────────────────
describe("mapOffProduct() — per-100g nutrition", () => {
  it("maps a fully-populated product", () => {
    const r = mapOffProduct({
      code: "3017620422003",
      product_name: "Chocolate Hazelnut Spread",
      brands: "Ferrero",
      serving_size: "1 serving (15 g)",
      serving_quantity: 15,
      nutriments: {
        "energy-kcal_100g": 539,
        proteins_100g: 6.3,
        carbohydrates_100g: 57.5,
        fat_100g: 30.9,
      },
    });
    assert.ok(r);
    assert.equal(r.name, "Chocolate Hazelnut Spread");
    assert.equal(r.brand, "Ferrero");
    assert.equal(r.barcode, "3017620422003");
    assert.equal(r.externalId, "3017620422003");
    assert.equal(r.source, "open_food_facts");
    assert.equal(r.calories, 539);
    assert.equal(r.protein, 6.3);
    assert.equal(r.carbs, 57.5);
    assert.equal(r.fats, 30.9);
    assert.equal(r.servingSize, "100 g");
  });

  it("derives kcal from kJ when the kcal field is absent", () => {
    const r = mapOffProduct({
      product_name: "Energy Drink",
      nutriments: {
        energy_100g: 1674, // kJ
        proteins_100g: 0,
        carbohydrates_100g: 94,
        fat_100g: 0,
      },
    });
    assert.ok(r);
    assert.ok(Math.abs(r.calories - 400.1) < 0.05, `expected ~400.1 kcal, got ${r.calories}`);
  });

  it("keeps decimal precision to 2 places", () => {
    const r = mapOffProduct({
      product_name: "Oats",
      nutriments: {
        "energy-kcal_100g": 379.55,
        proteins_100g: 13.666,
        carbohydrates_100g: 67.7,
        fat_100g: 6.52,
      },
    });
    assert.ok(r);
    assert.equal(r.calories, 379.55);
    assert.equal(r.protein, 13.67);
  });

  it("trims whitespace from product names", () => {
    const r = mapOffProduct({ product_name: "  Plain Yoghurt  ", nutriments: { "energy-kcal_100g": 60 } });
    assert.ok(r);
    assert.equal(r.name, "Plain Yoghurt");
  });
});

// ── Serving-only fallback ────────────────────────────────────────────────────
describe("mapOffProduct() — per-serving fallback & portions", () => {
  it("computes per-100g from serving data when per-100g values are missing", () => {
    const r = mapOffProduct({
      code: "7622210449283",
      product_name: "Cereal Bar",
      serving_size: "1 bar (50 g)",
      serving_quantity: 50,
      nutriments: {
        "energy-kcal_serving": 250,
        proteins_serving: 5,
        carbohydrates_serving: 30,
        fat_serving: 10,
      },
    });
    assert.ok(r);
    assert.equal(r.calories, 500);
    assert.equal(r.protein, 10);
    assert.equal(r.carbs, 60);
    assert.equal(r.fats, 20);
  });

  it("attaches a standard portion from serving_size + serving_quantity", () => {
    const r = mapOffProduct({
      code: "7622210449283",
      product_name: "Cereal Bar",
      serving_size: "1 bar (50 g)",
      serving_quantity: 50,
      nutriments: {
        "energy-kcal_100g": 500,
        proteins_100g: 10,
        carbohydrates_100g: 60,
        fat_100g: 20,
      },
    });
    assert.ok(r);
    assert.equal(r.portions?.length, 1);
    assert.equal(r.portions?.[0].label, "1 bar (50 g)");
    assert.equal(r.portions?.[0].grams, 50);
    assert.equal(r.portions?.[0].unit, "g");
  });

  it("produces no portion when serving_quantity is missing", () => {
    const r = mapOffProduct({
      product_name: "Cereal Bar",
      serving_size: "1 bar",
      nutriments: {
        "energy-kcal_100g": 500,
        proteins_100g: 10,
        carbohydrates_100g: 60,
        fat_100g: 20,
      },
    });
    assert.ok(r);
    assert.deepEqual(r.portions, []);
  });
});

// ── Rejection cases ──────────────────────────────────────────────────────────
describe("mapOffProduct() — unusable products", () => {
  it("returns null when the product has no name", () => {
    assert.equal(
      mapOffProduct({ code: "1", nutriments: { "energy-kcal_100g": 100 } }),
      null
    );
  });

  it("returns null when no energy data exists at all", () => {
    assert.equal(
      mapOffProduct({
        product_name: "Empty Label",
        nutriments: { proteins_100g: 5 },
      }),
      null
    );
  });

  it("returns null when per-serving data has no gram quantity to scale from", () => {
    assert.equal(
      mapOffProduct({
        product_name: "Mystery Food",
        nutriments: { "energy-kcal_serving": 250 },
      }),
      null
    );
  });
});
