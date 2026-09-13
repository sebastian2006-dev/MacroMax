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
  classifyFoodSearchMatch,
  dedupeResults,
  getSearchTier,
  isCacheableSource,
  isLocalSufficient,
  LOCAL_SUFFICIENCY_THRESHOLD,
  normalizeSource,
  sortFoodSearchResults,
  sortSearchResults,
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

// ── classifyFoodSearchMatch ──────────────────────────────────────────────────
describe("classifyFoodSearchMatch()", () => {
  it("raw & plain ingredients are 'basic'", () => {
    assert.equal(classifyFoodSearchMatch("Chicken breast raw", "fatsecret"), "basic");
    assert.equal(classifyFoodSearchMatch("Chicken breast (cooked)", "fatsecret"), "basic");
    assert.equal(classifyFoodSearchMatch("Chicken raw leg piece", "fatsecret"), "basic");
  });

  it("preparation styles are 'prepared'", () => {
    assert.equal(classifyFoodSearchMatch("Fried chicken", "fatsecret"), "prepared");
    assert.equal(classifyFoodSearchMatch("Grilled chicken wings", "fatsecret"), "prepared");
    assert.equal(classifyFoodSearchMatch("Baked salmon fillet", "open_food_facts"), "prepared");
  });

  it("mixed dishes are 'complex'", () => {
    assert.equal(classifyFoodSearchMatch("Chicken curry", "fatsecret"), "complex");
    assert.equal(classifyFoodSearchMatch("Butter chicken", "fatsecret"), "complex");
    assert.equal(classifyFoodSearchMatch("Chicken biryani", "fatsecret"), "complex");
    assert.equal(classifyFoodSearchMatch("Egg fried rice", "fatsecret"), "complex"); // rice dish term wins over "fried"
  });

  it("custom recipes are pinned", () => {
    assert.equal(classifyFoodSearchMatch("Anything at all", "custom_recipe"), "custom");
  });

  it("empty names are pushed down (complex)", () => {
    assert.equal(classifyFoodSearchMatch("", "fatsecret"), "complex");
  });
});

// ── sortFoodSearchResults ────────────────────────────────────────────────────
describe("sortFoodSearchResults() — chicken example", () => {
  const names = [
    "Chicken biryani",
    "Fried chicken",
    "Chicken breast (raw)",
    "Chicken curry",
    "Grilled chicken wings",
    "Butter chicken",
    "Chicken breast (cooked)",
    "Chicken raw leg piece",
  ];
  const results = names.map((name, i) =>
    makeResult({ id: `c${i}`, name, source: "fatsecret", barcode: null, externalId: `fs-c${i}` })
  );

  const sorted = sortFoodSearchResults(results, "chicken");

  it("keeps every result (no loss or duplication)", () => {
    assert.equal(sorted.length, names.length);
    assert.equal(new Set(sorted.map((r) => r.id)).size, names.length);
  });

  it("orders basic ingredients before prepared before complex", () => {
    const position = (name: string) => sorted.findIndex((r) => r.name === name);
    const basics = ["Chicken breast (raw)", "Chicken breast (cooked)", "Chicken raw leg piece"];
    const prepared = ["Fried chicken", "Grilled chicken wings"];
    const complex = ["Chicken curry", "Butter chicken", "Chicken biryani"];

    const maxBasic = Math.max(...basics.map(position));
    const minPrepared = Math.min(...prepared.map(position));
    const maxPrepared = Math.max(...prepared.map(position));
    const minComplex = Math.min(...complex.map(position));

    assert.ok(maxBasic < minPrepared, "every basic ingredient ranks above every prepared dish");
    assert.ok(maxPrepared < minComplex, "every prepared dish ranks above every complex dish");
    // And the complex dishes own the tail of the list.
    assert.deepEqual(
      sorted.slice(minComplex).map((r) => r.name).sort(),
      [...complex].sort()
    );
  });

  it("raw variant ranks above the cooked variant of the same cut", () => {
    const sortedNames = sorted.map((r) => r.name);
    assert.ok(
      sortedNames.indexOf("Chicken breast (raw)") < sortedNames.indexOf("Chicken breast (cooked)"),
      "raw chicken breast should appear before cooked"
    );
  });
});

describe("sortFoodSearchResults() — general behaviour", () => {
  it("is stable: equal-scoring results keep their input order", () => {
    const results = [
      makeResult({ id: "a", name: "Banana", source: "fatsecret", externalId: "fs-a" }),
      makeResult({ id: "b", name: "banana split", source: "fatsecret", externalId: "fs-b" }),
    ];
    const sorted = sortFoodSearchResults(results, "banana");
    assert.equal(sorted[0].id, "a");
    assert.equal(sorted[1].id, "b");
  });

  it("pins custom recipes to the very top", () => {
    const results = [
      makeResult({ name: "Chicken breast (raw)", source: "fatsecret", externalId: "fs-1" }),
      makeResult({ name: "My Sunday Chicken", source: "custom_recipe", externalId: null }),
    ];
    const sorted = sortFoodSearchResults(results, "chicken");
    assert.equal(sorted[0].name, "My Sunday Chicken");
  });

  it("prefers exact/prefix phrase matches inside a category", () => {
    const results = [
      makeResult({ name: "Grilled whole chicken", source: "fatsecret", externalId: "fs-1" }),
      makeResult({ name: "chicken", source: "fatsecret", externalId: "fs-2" }),
      makeResult({ name: "Chicken breast", source: "fatsecret", externalId: "fs-3" }),
    ];
    const sorted = sortFoodSearchResults(results, "chicken");
    assert.equal(sorted[0].name, "chicken"); // exact match
    assert.equal(sorted[1].name, "Chicken breast"); // prefix match
    assert.equal(sorted[2].name, "Grilled whole chicken"); // prepared, substring only
  });

  it("handles multi-word queries with token coverage", () => {
    const results = [
      makeResult({ name: "Chicken curry", source: "fatsecret", externalId: "fs-1" }),
      makeResult({ name: "Chicken breast (raw)", source: "fatsecret", externalId: "fs-2" }),
      makeResult({ name: "Chicken soup with rice", source: "fatsecret", externalId: "fs-3" }),
    ];
    const sorted = sortFoodSearchResults(results, "chicken breast");
    assert.equal(sorted[0].name, "Chicken breast (raw)");
  });

  it("empty query keeps provider order", () => {
    const results = [
      makeResult({ name: "Zucchini", source: "fatsecret", externalId: "fs-z" }),
      makeResult({ name: "Apple", source: "fatsecret", externalId: "fs-a" }),
    ];
    const sorted = sortFoodSearchResults(results, "");
    assert.deepEqual(sorted.map((r) => r.name), ["Zucchini", "Apple"]);
  });
});

// ── getSearchTier — the public 1/2/3 hierarchy ───────────────────────────────
describe("getSearchTier()", () => {
  it("Tier 1: raw / plain single ingredients (incl. other cuts)", () => {
    assert.equal(getSearchTier("Chicken breast raw", "fatsecret"), 1);
    assert.equal(getSearchTier("Chicken breast (raw)", "fatsecret"), 1);
    assert.equal(getSearchTier("Chicken raw leg piece", "fatsecret"), 1); // raw stays Tier 1
    assert.equal(getSearchTier("Chicken breast (cooked)", "fatsecret"), 1);
  });

  it("Tier 2: cooked/prepared variations", () => {
    assert.equal(getSearchTier("Fried chicken", "fatsecret"), 2);
    assert.equal(getSearchTier("Grilled chicken wings", "open_food_facts"), 2);
  });

  it("Tier 3: complex multi-ingredient dishes", () => {
    assert.equal(getSearchTier("Chicken curry", "fatsecret"), 3);
    assert.equal(getSearchTier("Butter chicken", "fatsecret"), 3);
  });
});

// ── sortSearchResults — strict tier separation ───────────────────────────────
describe("sortSearchResults() — strict tier enforcement", () => {
  it("never lets a lower tier outrank a higher tier, even on a stronger match", () => {
    const results = [
      // Tier 3 exact phrase match — the strongest possible within-tier score.
      makeResult({ id: "c", name: "Chicken curry", source: "fatsecret", externalId: "fs-c" }),
      // Tier 2 with no phrase bonus at all.
      makeResult({ id: "p", name: "Grilled chicken", source: "fatsecret", externalId: "fs-p" }),
      // Tier 1 with no phrase bonus at all.
      makeResult({ id: "b", name: "Chicken breast (raw)", source: "fatsecret", externalId: "fs-b" }),
    ];

    const sorted = sortSearchResults(results, "chicken curry");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["b", "p", "c"],
      "tier order must dominate the within-tier score"
    );
  });

  it("sorts the chicken example into the 3 tiers with raw breast first", () => {
    const names = [
      "Chicken breast (raw)", // tier 1
      "Chicken breast (cooked)", // tier 1
      "Chicken raw leg piece", // tier 1 — any raw single ingredient stays Tier 1
      "Fried chicken", // tier 2
      "Chicken curry", // tier 3
      "Butter chicken", // tier 3
    ];
    const results = names.map((name, i) =>
      makeResult({ id: `x${i}`, name, source: "fatsecret", barcode: null, externalId: `fs-${i}` })
    );

    const order = sortSearchResults(results, "chicken").map((r) => r.name);
    assert.deepEqual(order, [
      "Chicken breast (raw)",
      "Chicken raw leg piece",
      "Chicken breast (cooked)",
      "Fried chicken",
      "Chicken curry",
      "Butter chicken",
    ]);
  });

  it("is aliased by the legacy sortFoodSearchResults name", () => {
    assert.equal(sortFoodSearchResults, sortSearchResults);
  });
});

// ── isLocalSufficient — local-DB-first policy ────────────────────────────────
describe("isLocalSufficient() — local-first switch", () => {
  it("defaults to a threshold of 5 matches", () => {
    assert.equal(LOCAL_SUFFICIENCY_THRESHOLD, 5);
  });

  it("a total local miss falls through to the remote APIs", () => {
    assert.equal(isLocalSufficient(0), false);
  });

  it("too few local matches still falls through", () => {
    assert.equal(isLocalSufficient(1), false);
    assert.equal(isLocalSufficient(4), false);
  });

  it("enough local matches skip the remote APIs entirely", () => {
    assert.equal(isLocalSufficient(5), true);
    assert.equal(isLocalSufficient(12), true);
  });

  it("accepts a custom threshold", () => {
    assert.equal(isLocalSufficient(2, 2), true);
    assert.equal(isLocalSufficient(1, 2), false);
  });
});
