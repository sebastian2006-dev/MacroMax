/**
 * Pure helpers for the food-search result pipeline.
 *
 * These functions contain NO I/O (no fetch, no AsyncStorage) so they can be
 * unit-tested in Node directly — they are the logic behind:
 *   - deduplicating provider results (barcode → externalId → source+name)
 *   - deciding which results qualify for the on-device cache
 *   - building cache rows from results
 *   - mapping cached rows back to SearchResults
 */

import type { FoodCacheItem, FoodSource, SearchResult } from "@/src/types";

/** Round to 2 decimals (macro precision used across the data layer). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Only remote-provider results are persisted to the on-device cache. */
export function isCacheableSource(
  source: SearchResult["source"]
): source is Extract<SearchResult["source"], "fatsecret" | "open_food_facts"> {
  return source === "fatsecret" || source === "open_food_facts";
}

/**
 * Dedupe results by, in priority order:
 *   1. barcode (Open Food Facts product code)
 *   2. externalId (FatSecret food_id)
 *   3. `${source}-${lowercased name}`
 */
export function dedupeResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const unique: SearchResult[] = [];

  for (const result of results) {
    const key =
      result.barcode ??
      result.externalId ??
      `${result.source}-${result.name.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(result);
    }
  }

  return unique;
}

/** Build upsertable cache rows from search results (cacheable sources only). */
export function cacheRowsFromResults(
  results: SearchResult[]
): Omit<FoodCacheItem, "id">[] {
  return results.filter((result) => isCacheableSource(result.source)).map((result) => ({
    barcode: result.barcode ?? null,
    external_id: result.externalId ?? result.barcode ?? null,
    food_name: result.name,
    brand: result.brand ?? null,
    calories_per_100g: round2(result.calories),
    protein_per_100g: round2(result.protein),
    carbs_per_100g: round2(result.carbs),
    fats_per_100g: round2(result.fats),
    portions: result.portions && result.portions.length > 0 ? result.portions : null,
    source: result.source,
  }));
}

/** Map a cached row back to the shared SearchResult shape. */
export function toSearchResult(item: FoodCacheItem): SearchResult {
  return {
    id: item.id,
    name: item.food_name,
    brand: item.brand,
    barcode: item.barcode,
    externalId: item.external_id,
    source: item.source,
    calories: item.calories_per_100g,
    protein: item.protein_per_100g,
    carbs: item.carbs_per_100g,
    fats: item.fats_per_100g,
    servingSize: "100 g",
    portions: item.portions ?? [],
  };
}

/** Narrow a raw persisted source string onto the current FoodSource union. */
export function normalizeSource(raw: unknown): FoodSource {
  if (
    raw === "open_food_facts" ||
    raw === "fatsecret" ||
    raw === "user_custom" ||
    raw === "fallback"
  ) {
    return raw;
  }
  // Legacy rows ("ifct2017" / "usda") written before the provider migration.
  return "fallback";
}
