/**
 * @file fatSecret.test.ts
 * Unit tests for the REAL src/lib/fatSecret.ts mapping layer — description
 * parsing, serving-table → per-100g derivation and standard portions.
 * No network calls are made (token/API functions are not exercised here).
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapFatSecretFood,
  mapFatSecretSearchItem,
  parseDescriptionMacros,
} from "../src/lib/fatSecret";
import type { FatSecretFoodDetail, FatSecretSearchItem } from "../src/lib/fatSecret";

// ── parseDescriptionMacros ───────────────────────────────────────────────────
describe("parseDescriptionMacros()", () => {
  it("parses a per-100g search description", () => {
    const m = parseDescriptionMacros(
      "Per 100g - Calories: 22kcal | Fat: 0.34g | Carbs: 3.28g | Protein: 3.09g"
    );
    assert.deepEqual(m, { calories: 22, protein: 3.09, carbs: 3.28, fats: 0.34 });
  });

  it("returns null for per-serving descriptions (no 100g basis)", () => {
    const m = parseDescriptionMacros(
      "Per 1 serving - Calories: 300kcal | Fat: 13.00g | Carbs: 32.00g | Protein: 15.00g"
    );
    assert.equal(m, null);
  });

  it("returns null for undefined / empty descriptions", () => {
    assert.equal(parseDescriptionMacros(undefined), null);
    assert.equal(parseDescriptionMacros(""), null);
  });

  it("handles decimal and integer values uniformly", () => {
    const m = parseDescriptionMacros(
      "Per 100g - Calories: 165kcal | Fat: 3.6g | Carbs: 0g | Protein: 31g"
    );
    assert.deepEqual(m, { calories: 165, protein: 31, carbs: 0, fats: 3.6 });
  });
});

// ── mapFatSecretFood — 100 g serving present ─────────────────────────────────
describe("mapFatSecretFood()", () => {
  it("uses the exact '100 g' serving when present", () => {
    const food: FatSecretFoodDetail = {
      food_id: "1",
      food_name: "Chicken Breast",
      food_type: "Generic",
      servings: {
        serving: [
          {
            serving_id: "50321",
            serving_description: "100 g",
            metric_serving_amount: "100.000",
            metric_serving_unit: "g",
            calories: "195",
            carbohydrate: "0",
            protein: "29.55",
            fat: "7.72",
          },
          {
            serving_id: "5034",
            serving_description: "1/2 small (yield after cooking, bone removed)",
            metric_serving_amount: "84.000",
            metric_serving_unit: "g",
            calories: "164",
            carbohydrate: "0",
            protein: "24.82",
            fat: "6.48",
          },
        ],
      },
    };

    const r = mapFatSecretFood(food);
    assert.ok(r);
    assert.equal(r.id, "fatsecret-1");
    assert.equal(r.externalId, "1");
    assert.equal(r.source, "fatsecret");
    assert.equal(r.calories, 195);
    assert.equal(r.protein, 29.55);
    assert.equal(r.fats, 7.72);
    // Only the non-100g serving becomes a quick-log portion.
    assert.equal(r.portions?.length, 1);
    assert.equal(r.portions?.[0].label, "1/2 small (yield after cooking, bone removed)");
    assert.equal(r.portions?.[0].grams, 84);
  });

  it("handles a single serving object (FatSecret JSON quirk) instead of an array", () => {
    const food: FatSecretFoodDetail = {
      food_id: "2",
      food_name: "Mushrooms",
      servings: {
        serving: {
          serving_id: "34244",
          serving_description: "1 cup pieces or slices",
          metric_serving_amount: "70.000",
          metric_serving_unit: "g",
          calories: "15",
          carbohydrate: "2.30",
          protein: "2.16",
          fat: "0.24",
        },
      },
    };
    const r = mapFatSecretFood(food);
    assert.ok(r);
    // No 100g serving → scaled from the default metric serving (70 g).
    assert.ok(Math.abs(r.calories - 21.43) < 0.01, `calories=${r.calories}`);
    assert.equal(r.portions?.length, 1);
    assert.equal(r.portions?.[0].grams, 70);
  });

  it("prefers the is_default serving when no 100g serving exists", () => {
    const food: FatSecretFoodDetail = {
      food_id: "3",
      food_name: "Cereal Bar",
      brand_name: "BrandCo",
      servings: {
        serving: [
          {
            serving_description: "1 bar (60 g)",
            metric_serving_amount: "60.000",
            metric_serving_unit: "g",
            is_default: "1",
            calories: "240",
            carbohydrate: "30",
            protein: "10",
            fat: "8",
          },
        ],
      },
    };
    const r = mapFatSecretFood(food);
    assert.ok(r);
    assert.equal(r.brand, "BrandCo");
    assert.equal(r.calories, 400); // 240 * 100 / 60
    assert.equal(r.protein, 16.67); // 10 * 100 / 60 → 16.666…
    assert.equal(r.portions?.[0].label, "1 bar (60 g)");
  });

  it("maps millilitre servings as portions (1 ml ≈ 1 g approximation)", () => {
    const food: FatSecretFoodDetail = {
      food_id: "4",
      food_name: "Milk",
      servings: {
        serving: [
          {
            serving_description: "250 ml",
            metric_serving_amount: "250.000",
            metric_serving_unit: "ml",
            calories: "125",
            carbohydrate: "12",
            protein: "8",
            fat: "5",
          },
          {
            serving_description: "100 g",
            metric_serving_amount: "100.000",
            metric_serving_unit: "g",
            calories: "50",
            carbohydrate: "4.8",
            protein: "3.2",
            fat: "2",
          },
        ],
      },
    };
    const r = mapFatSecretFood(food);
    assert.ok(r);
    assert.equal(r.calories, 50); // from the 100 g serving
    assert.equal(r.portions?.[0].label, "250 ml");
    assert.equal(r.portions?.[0].grams, 250);
    assert.equal(r.portions?.[0].unit, "ml");
  });

  it("caps portions at 8 and dedupes identical labels", () => {
    const servings = Array.from({ length: 12 }, (_, i) => ({
      serving_id: String(i),
      serving_description: i % 2 === 0 ? "1 cup" : `Portion ${i} g`,
      metric_serving_amount: String(30 + i),
      metric_serving_unit: "g" as const,
      calories: "100",
      carbohydrate: "10",
      protein: "5",
      fat: "2",
    }));
    const food: FatSecretFoodDetail = { food_id: "5", food_name: "Cereal", servings: { serving: servings } };
    const r = mapFatSecretFood(food);
    assert.ok(r);
    assert.ok(r.portions && r.portions.length <= 8);
    const labels = new Set(r.portions!.map((p) => p.label));
    assert.equal(labels.size, r.portions!.length);
  });

  it("returns null when no usable serving exists", () => {
    const food: FatSecretFoodDetail = { food_id: "6", food_name: "Ghost Food", servings: { serving: [] } };
    assert.equal(mapFatSecretFood(food), null);
  });

  it("returns null when the food has no name", () => {
    assert.equal(mapFatSecretFood({ food_id: "7", food_name: "", servings: { serving: [] } }), null);
  });
});

// ── mapFatSecretSearchItem ───────────────────────────────────────────────────
describe("mapFatSecretSearchItem()", () => {
  it("builds a lightweight result from a per-100g description", () => {
    const item: FatSecretSearchItem = {
      food_id: "36421",
      food_name: "Mushrooms",
      food_type: "Generic",
      food_description:
        "Per 100g - Calories: 22kcal | Fat: 0.34g | Carbs: 3.28g | Protein: 3.09g",
    };
    const r = mapFatSecretSearchItem(item);
    assert.ok(r);
    assert.equal(r.id, "fatsecret-36421");
    assert.equal(r.externalId, "36421");
    assert.equal(r.calories, 22);
    assert.deepEqual(r.portions, []);
  });

  it("returns null when the description has no per-100g data", () => {
    const item: FatSecretSearchItem = {
      food_id: "41963",
      food_name: "Cheeseburger",
      food_description:
        "Per 1 serving - Calories: 300kcal | Fat: 13.00g | Carbs: 32.00g | Protein: 15.00g",
    };
    assert.equal(mapFatSecretSearchItem(item), null);
  });

  it("returns null when macros cannot be parsed", () => {
    const item: FatSecretSearchItem = { food_id: "9", food_name: "Broken", food_description: "no data" };
    assert.equal(mapFatSecretSearchItem(item), null);
  });
});
