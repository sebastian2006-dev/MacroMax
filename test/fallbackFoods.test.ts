/**
 * @file fallbackFoods.test.ts
 * Unit tests for the REAL src/lib/fallbackFoods.ts module — the built-in
 * offline food database used when remote providers return nothing.
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { searchFallbackFoods } from "../src/lib/fallbackFoods";

describe("searchFallbackFoods()", () => {
  it("empty query returns empty array", () => assert.equal(searchFallbackFoods("").length, 0));
  it("whitespace-only query returns empty array", () => assert.equal(searchFallbackFoods("   ").length, 0));
  it("nonsense query returns empty array", () => assert.equal(searchFallbackFoods("xyzxyz123").length, 0));

  it("case-insensitive: 'RICE' matches rice entries", () => {
    const r = searchFallbackFoods("RICE");
    assert.ok(r.length >= 2);
    assert.ok(r.every((i) => i.name.toLowerCase().includes("rice")));
  });

  it("'chicken' matches multiple entries", () => {
    const r = searchFallbackFoods("chicken");
    assert.ok(r.length >= 2);
  });

  it("'egg' matches 'Egg (whole)' and 'Egg white'", () => {
    const r = searchFallbackFoods("egg");
    assert.ok(r.length >= 2);
    assert.ok(r.some((i) => i.name === "Egg (whole)"));
    assert.ok(r.some((i) => i.name === "Egg white"));
  });

  it("'banana' returns exactly one result", () => {
    const r = searchFallbackFoods("banana");
    assert.equal(r.length, 1);
    assert.equal(r[0].name, "Banana");
  });

  it("each result has source='fallback'", () => {
    const r = searchFallbackFoods("egg");
    assert.ok(r.every((i) => i.source === "fallback"));
  });

  it("each result has servingSize='100 g'", () => {
    const r = searchFallbackFoods("rice");
    assert.ok(r.every((i) => i.servingSize === "100 g"));
  });

  it("each result has a unique id prefixed with 'fallback-'", () => {
    const r = searchFallbackFoods("egg");
    const ids = r.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => id.startsWith("fallback-")));
  });

  it("'paneer' returns correct macro values (per 100 g)", () => {
    const [p] = searchFallbackFoods("paneer");
    assert.ok(p);
    assert.equal(p.calories, 265);
    assert.equal(p.protein, 18);
    assert.equal(p.carbs, 4);
    assert.equal(p.fats, 20);
  });

  it("partial substring match works: 'oat'", () => {
    const r = searchFallbackFoods("oat");
    assert.ok(r.length >= 1);
    assert.ok(r[0].name.toLowerCase().includes("oat"));
  });

  it("'whey' returns the whey protein entry with 80g protein", () => {
    const [w] = searchFallbackFoods("whey");
    assert.ok(w);
    assert.equal(w.protein, 80);
  });

  it("Indian staples are covered (dal, paneer, idli, dosa, roti)", () => {
    for (const query of ["dal", "paneer", "idli", "dosa", "roti"]) {
      assert.ok(searchFallbackFoods(query).length >= 1, `expected results for "${query}"`);
    }
  });

  it("results are ordered by dataset position, not randomized", () => {
    const r = searchFallbackFoods("chicken");
    const names = r.map((i) => i.name);
    assert.deepEqual(names, [...names].sort((a, b) => names.indexOf(a) - names.indexOf(b)));
  });
});
