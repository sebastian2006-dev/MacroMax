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

// ---------------------------------------------------------------------------
// Search relevance & sorting
//
// Results are ranked by how "basic" the food is for the typed query:
//   1. exact matches & raw single ingredients  (Chicken breast raw)
//   2. cooked/prepared variations              (Fried chicken, Grilled wings)
//   3. complex dishes containing the ingredient(Chicken curry, Butter chicken)
// ---------------------------------------------------------------------------

/** Words that mark a food name as a complex/mixed dish rather than an ingredient. */
const COMPLEX_DISH_TERMS = [
  "curry", "biryani", "masala", "tikka", "kebab", "kabab", "vindaloo", "korma",
  "jalfrezi", "bhuna", "saag", "karahi", "kadai", "kadhai", "makhani",
  "butter chicken", "kung pao", "general tso", "orange chicken", "sweet and sour",
  "manchurian", "fried rice", "stew", "soup", "casserole", "lasagna", "lasagne",
  "burger", "pizza", "sandwich", "burrito", "taco", "wrap", "ramen", "pho",
  "chow mein", "bowl",
];

/** Words that mark a cooking/preparation style (still an ingredient, not a dish). */
const PREPARED_TERMS = [
  "fried", "grilled", "roasted", "baked", "broiled", "sauteed", "sautéed",
  "seared", "deep-fried", "pan-fried", "air-fried", "stir-fried", "breaded",
  "battered", "barbequed", "barbecued", "bbq", "smoked", "broasted",
  "char-grilled", "roast", "scrambled", "poached", "tandoori", "smashed", "mashed",
];

export type SearchCategory = "custom" | "basic" | "prepared" | "complex";

function normalizeFoodName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Classify one food name against the typed query:
 *  - custom    → user's own saved dishes (always pinned first)
 *  - basic     → plain/raw/cooked single ingredients
 *  - prepared  → ingredients with a preparation style (fried, grilled…)
 *  - complex   → multi-ingredient dishes (curry, biryani, burger…)
 */
export function classifyFoodSearchMatch(name: string, source: SearchResult["source"]): SearchCategory {
  if (source === "custom_recipe") {
    return "custom";
  }
  const normalized = normalizeFoodName(name);
  if (!normalized) {
    return "complex"; // unrankable — push down rather than up
  }
  if (COMPLEX_DISH_TERMS.some((term) => normalized.includes(term))) {
    return "complex";
  }
  if (PREPARED_TERMS.some((term) => normalized.includes(term))) {
    return "prepared";
  }
  return "basic";
}

/** Category base weights (higher = surfaced earlier). */
const CATEGORY_WEIGHT: Record<SearchCategory, number> = {
  custom: 10000,
  basic: 300,
  prepared: 200,
  complex: 100,
};

/**
 * Rank search results by relevance: basic ingredients first, prepared
 * variations second, complex dishes last. Within a category, exact /
 * prefix / substring phrase matches win, raw beats cooked, and the original
 * provider order is the stable tie-break.
 */
export function sortFoodSearchResults(results: SearchResult[], query: string): SearchResult[] {
  const q = normalizeFoodName(query);
  const tokens = q.split(" ").filter(Boolean);

  const scored = results.map((result, index) => {
    const name = normalizeFoodName(result.name);
    const category = classifyFoodSearchMatch(result.name, result.source);
    let score = CATEGORY_WEIGHT[category];

    // Phrase-match quality inside the category.
    if (q && name === q) {
      score += 100;
    } else if (q && name.startsWith(q)) {
      score += 60;
    } else if (q && name.includes(q)) {
      score += 30;
    }
    // Every query token appearing in the name boosts multi-word searches.
    if (tokens.length > 1 && tokens.every((token) => name.includes(token))) {
      score += 20;
    }
    // Within "basic", keep raw ahead of cooked.
    if (name.includes("raw")) {
      score += 6;
    } else if (name.includes("cooked")) {
      score += 2;
    }
    // Prefer ingredient databases over packaged-product listings.
    if (result.source === "fatsecret") {
      score += 4;
    }

    return { result, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((entry) => entry.result);
}
