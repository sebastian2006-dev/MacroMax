/**
 * @file api.test.ts
 * Unit tests for the REAL pure search-result pipeline used by src/lib/api.ts:
 *   - dedupeResults()        — dedupe by barcode → externalId → source+name
 *   - isCacheableSource()    — only fatsecret / open_food_facts are cached
 *   - cacheRowsFromResults() — result → AsyncStorage row mapping
 *   - toSearchResult()       — cached row → SearchResult mapping
 *   - normalizeSource()      — legacy "ifct2017"/"usda" rows → "fallback"
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cacheRowsFromResults,
  dedupeResults,
  isCacheableSource,
  normalizeSource,
  toSearchResult,
} from "../src/lib/foodResults";
import type { FoodCacheItem, SearchResult } from "../src/types";

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: "test-1",
    name: "Test Food",
    brand: null,
    barcode: null,
    externalId: null,
    source: "fatsecret",
    calories: 100,
    protein: 10,
    carbs: 15,
    fats: 3,
    servingSize: "100 g",
    portions: [],
    ...overrides,
  };
}

// ── dedupeResults — barcode keying ───────────────────────────────────────────
describe("dedupeResults() — barcode keying", () => {
  it("single result is kept as-is", () => {
    const r = [makeResult({ barcode: "1234567" })];
    assert.equal(dedupeResults(r).length, 1);
  });

  it("two entries with same barcode → only first kept", () => {
    const r = [
      makeResult({ barcode: "1234567", name: "Product A" }),
      makeResult({ barcode: "1234567", name: "Product B" }),
    ];
    const out = dedupeResults(r);
    assert.equal(out.length, 1);
    assert.equal(out[0].name, "Product A");
  });

  it("two entries with different barcodes → both kept", () => {
    const r = [makeResult({ barcode: "1111111" }), makeResult({ barcode: "2222222" })];
    assert.equal(dedupeResults(r).length, 2);
  });
});

// ── dedupeResults — externalId keying ────────────────────────────────────────
describe("dedupeResults() — externalId keying (no barcode)", () => {
  it("same externalId → deduplicated", () => {
    const r = [
      makeResult({ externalId: "fs-42", name: "Oats A" }),
      makeResult({ externalId: "fs-42", name: "Oats B" }),
    ];
    assert.equal(dedupeResults(r).length, 1);
  });

  it("different externalIds → both kept", () => {
    const r = [makeResult({ externalId: "fs-42" }), makeResult({ externalId: "fs-99" })];
    assert.equal(dedupeResults(r).length, 2);
  });
});

// ── dedupeResults — name+source keying ───────────────────────────────────────
describe("dedupeResults() — name+source keying (no barcode/externalId)", () => {
  it("same source + name (case-insensitive) → deduplicated", () => {
    const r = [
      makeResult({ source: "fallback", name: "Rice", barcode: null, externalId: null }),
      makeResult({ source: "fallback", name: "rice", barcode: null, externalId: null }),
    ];
    assert.equal(dedupeResults(r).length, 1);
  });

  it("same name but different source → both kept", () => {
    const r = [
      makeResult({ source: "fatsecret", name: "Egg", barcode: null, externalId: null }),
      makeResult({ source: "open_food_facts", name: "Egg", barcode: null, externalId: null }),
    ];
    assert.equal(dedupeResults(r).length, 2);
  });
});

// ── dedupeResults — key priority & edge cases ────────────────────────────────
describe("dedupeResults() — key priority & edge cases", () => {
  it("barcode takes priority over externalId", () => {
    const r = [
      makeResult({ barcode: "AAA", externalId: "X" }),
      makeResult({ barcode: "AAA", externalId: "Y" }),
    ];
    assert.equal(dedupeResults(r).length, 1);
  });

  it("empty input returns empty array", () => assert.equal(dedupeResults([]).length, 0));

  it("deduplicates only exact duplicates in a 10-item batch", () => {
    const batch: SearchResult[] = [
      makeResult({ barcode: "BC1", name: "A" }),
      makeResult({ barcode: "BC1", name: "A dup" }), // dup of BC1
      makeResult({ barcode: "BC2", name: "B" }),
      makeResult({ externalId: "E1", name: "C" }),
      makeResult({ externalId: "E1", name: "C dup" }), // dup of E1
      makeResult({ source: "fallback", name: "D", barcode: null, externalId: null }),
      makeResult({ source: "fallback", name: "D", barcode: null, externalId: null }), // dup
      makeResult({ source: "fatsecret", name: "D", barcode: null, externalId: null }), // diff source
      makeResult({ barcode: "BC3" }),
      makeResult({ barcode: "BC4" }),
    ];
    // Unique: BC1, BC2, E1, fallback-d, fatsecret-d, BC3, BC4 = 7
    assert.equal(dedupeResults(batch).length, 7);
  });

  it("does not mutate the input array", () => {
    const input = [makeResult({ barcode: "1" }), makeResult({ barcode: "1" })];
    dedupeResults(input);
    assert.equal(input.length, 2);
  });
});

// ── isCacheableSource ────────────────────────────────────────────────────────
describe("isCacheableSource() — cache eligibility filter", () => {
  it("fatsecret is cacheable", () => assert.equal(isCacheableSource("fatsecret"), true));
  it("open_food_facts is cacheable", () => assert.equal(isCacheableSource("open_food_facts"), true));
  it("fallback is NOT cacheable", () => assert.equal(isCacheableSource("fallback"), false));
  it("user_custom is NOT cacheable", () => assert.equal(isCacheableSource("user_custom"), false));
  it("custom_recipe is NOT cacheable", () => assert.equal(isCacheableSource("custom_recipe"), false));
});

// ── cacheRowsFromResults ─────────────────────────────────────────────────────
describe("cacheRowsFromResults()", () => {
  it("filters out non-cacheable sources entirely", () => {
    const rows = cacheRowsFromResults([
      makeResult({ source: "fatsecret" }),
      makeResult({ source: "fallback", barcode: null, externalId: null }),
      makeResult({ source: "custom_recipe", barcode: null, externalId: null }),
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, "fatsecret");
  });

  it("maps externalId and barcode fields", () => {
    const [row] = cacheRowsFromResults([makeResult({ barcode: "890", externalId: "fs-7" })]);
    assert.equal(row.barcode, "890");
    assert.equal(row.external_id, "fs-7");
  });

  it("external_id falls back to barcode when externalId is absent", () => {
    const [row] = cacheRowsFromResults([makeResult({ barcode: "890", externalId: null })]);
    assert.equal(row.external_id, "890");
  });

  it("rounds macros to 2 decimals", () => {
    const [row] = cacheRowsFromResults([
      makeResult({ calories: 99.9999, protein: 10.005, carbs: 15.555, fats: 3.444 }),
    ]);
    assert.deepEqual(
      [row.calories_per_100g, row.protein_per_100g, row.carbs_per_100g, row.fats_per_100g],
      [100, 10.01, 15.56, 3.44]
    );
  });

  it("stores portions only when non-empty", () => {
    const [withPortions] = cacheRowsFromResults([
      makeResult({ portions: [{ id: "p1", label: "1 cup (244 g)", grams: 244 }] }),
    ]);
    assert.equal(withPortions.portions?.length, 1);
    const [without] = cacheRowsFromResults([makeResult({ portions: [] })]);
    assert.equal(without.portions, null);
  });

  it("empty input produces no rows", () => assert.equal(cacheRowsFromResults([]).length, 0));
});

// ── toSearchResult ───────────────────────────────────────────────────────────
describe("toSearchResult() — cache row → SearchResult", () => {
  const row: FoodCacheItem = {
    id: "food_abc",
    barcode: "8901234567890",
    external_id: "8901234567890",
    food_name: "Protein Bar",
    brand: "SomeBrand",
    calories_per_100g: 380,
    protein_per_100g: 30,
    carbs_per_100g: 40,
    fats_per_100g: 12,
    portions: [{ id: "p1", label: "1 bar (60 g)", grams: 60, unit: "g" }],
    source: "open_food_facts",
  };

  it("maps every field onto the shared shape", () => {
    const r = toSearchResult(row);
    assert.equal(r.id, "food_abc");
    assert.equal(r.name, "Protein Bar");
    assert.equal(r.brand, "SomeBrand");
    assert.equal(r.barcode, "8901234567890");
    assert.equal(r.externalId, "8901234567890");
    assert.equal(r.source, "open_food_facts");
    assert.equal(r.calories, 380);
    assert.equal(r.protein, 30);
    assert.equal(r.carbs, 40);
    assert.equal(r.fats, 12);
    assert.equal(r.servingSize, "100 g");
    assert.equal(r.portions?.length, 1);
  });

  it("null portions become an empty array", () => {
    const r = toSearchResult({ ...row, portions: null });
    assert.deepEqual(r.portions, []);
  });
});

// ── normalizeSource ──────────────────────────────────────────────────────────
describe("normalizeSource() — legacy row migration", () => {
  it("keeps current sources", () => {
    assert.equal(normalizeSource("fatsecret"), "fatsecret");
    assert.equal(normalizeSource("open_food_facts"), "open_food_facts");
    assert.equal(normalizeSource("user_custom"), "user_custom");
    assert.equal(normalizeSource("fallback"), "fallback");
  });

  it("legacy ifct2017 / usda rows become fallback", () => {
    assert.equal(normalizeSource("ifct2017"), "fallback");
    assert.equal(normalizeSource("usda"), "fallback");
  });

  it("unknown/undefined values become fallback", () => {
    assert.equal(normalizeSource(undefined), "fallback");
    assert.equal(normalizeSource("anything-else"), "fallback");
  });
});
