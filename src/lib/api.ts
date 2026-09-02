import { FoodCacheItem, SearchResult } from "@/src/types";
import {
  addCustomFoodToCache as dbAddCustomFoodToCache,
  findFoodCacheByBarcode,
  getFoodCache,
  searchCustomRecipes as dbSearchCustomRecipes,
  upsertFoodCache,
} from "@/src/lib/db";
import { searchFallbackFoods } from "@/src/lib/fallbackFoods";
import { searchFatSecret } from "@/src/lib/fatSecret";
import { searchOpenFoodFacts, searchOpenFoodFactsByBarcode } from "@/src/lib/openFoodFacts";
import { safeResolve } from "@/src/lib/http";
import { reportSearchSources, SyncSource } from "@/src/lib/syncStatus";

function toSearchResult(item: FoodCacheItem): SearchResult {
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

async function searchLocalCache(query: string): Promise<SearchResult[]> {
  try {
    const data = await getFoodCache(query);
    return data.map(toSearchResult);
  } catch (error) {
    console.warn("Local food cache search failed", error);
    return [];
  }
}

async function searchCustomRecipes(userId: string | null, query: string): Promise<SearchResult[]> {
  if (!userId) {
    return [];
  }

  try {
    const recipes = await dbSearchCustomRecipes(query);
    return recipes.map((recipe) => ({
      id: `recipe-${recipe.id}`,
      name: recipe.recipe_name,
      brand: "Custom Dish",
      barcode: null,
      externalId: null,
      source: "custom_recipe" as const,
      calories: recipe.total_calories,
      protein: recipe.total_protein,
      carbs: recipe.total_carbs,
      fats: recipe.total_fats,
      servingSize: "1 dish",
      portions: [],
    }));
  } catch (error) {
    console.warn("Custom recipe search failed", error);
    return [];
  }
}

/** Persist remote provider results so repeats work offline. */
async function cacheResults(results: SearchResult[]): Promise<void> {
  const rows = results
    .filter(
      (result): result is SearchResult & { source: "open_food_facts" | "fatsecret" } =>
        result.source === "open_food_facts" || result.source === "fatsecret"
    )
    .map((result) => ({
      barcode: result.barcode ?? null,
      external_id: result.externalId ?? result.barcode ?? null,
      food_name: result.name,
      brand: result.brand ?? null,
      calories_per_100g: Math.round(result.calories * 100) / 100,
      protein_per_100g: Math.round(result.protein * 100) / 100,
      carbs_per_100g: Math.round(result.carbs * 100) / 100,
      fats_per_100g: Math.round(result.fats * 100) / 100,
      portions: result.portions && result.portions.length > 0 ? result.portions : null,
      source: result.source,
    }));

  if (rows.length === 0) {
    return;
  }

  try {
    await upsertFoodCache(rows);
  } catch (error) {
    console.warn("Failed to cache food results", error);
  }
}

function dedupe(results: SearchResult[]): SearchResult[] {
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

/**
 * Search foods with a local-first, provider-parallel strategy:
 *
 *   1. Saved custom dishes — always surfaced first.
 *   2. FatSecret Platform API + Open Food Facts searched in PARALLEL:
 *        - FatSecret: raw ingredients, cooked dishes, Indian foods (text).
 *        - Open Food Facts: packaged products (search + portions).
 *   3. On-device food cache (mirrors earlier lookups — offline repeats).
 *   4. Built-in fallback list — last resort so a search never hangs empty.
 *
 * Every provider is individually guarded, so a missing key, timeout or bad
 * response can never crash the app or reject the whole search.
 */
export async function searchFoods(query: string, userId?: string | null): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    reportSearchSources([], { remoteAttempted: false, remoteFailed: false });
    return [];
  }

  const collected: SearchResult[] = [];
  const sources = new Set<SyncSource>();

  // 1) Saved dishes (custom recipes) first.
  const customRecipes = await safeResolve(() => searchCustomRecipes(userId ?? null, trimmed), []);
  if (customRecipes.length > 0) {
    sources.add("custom_recipe");
    collected.push(...customRecipes);
  }

  // 2) Remote providers in parallel — FatSecret (text/ingredients) and
  //    Open Food Facts (packaged) complement each other.
  const [fatSecretResults, offResults] = await Promise.all([
    safeResolve(() => searchFatSecret(trimmed), []),
    safeResolve(() => searchOpenFoodFacts(trimmed), []),
  ]);

  const remoteAttempted = true;
  let remoteFailed = true;
  if (fatSecretResults.length > 0) {
    remoteFailed = false;
    sources.add("fatsecret");
    collected.push(...fatSecretResults);
  }
  if (offResults.length > 0) {
    remoteFailed = false;
    sources.add("open_food_facts");
    collected.push(...offResults);
  }

  // 3) Local cache mirrors earlier lookups and keeps repeats working offline.
  const cached = await safeResolve(() => searchLocalCache(trimmed), []);
  if (cached.length > 0) {
    sources.add("local_cache");
    collected.push(...cached);
  }

  // 4) Last resort: built-in fallback list when everything else came up empty.
  if (collected.length === 0 && remoteFailed) {
    const fallbackResults = searchFallbackFoods(trimmed);
    if (fallbackResults.length > 0) {
      sources.add("fallback");
      collected.push(...fallbackResults);
    }
  }

  const results = dedupe(collected);
  await cacheResults(results);

  reportSearchSources([...sources], { remoteAttempted, remoteFailed });
  return results.slice(0, 30);
}

/**
 * Barcode lookup:
 *   1. Local food cache (offline-friendly, instant for repeat scans).
 *   2. Open Food Facts V2 product endpoint:
 *      https://world.openfoodfacts.org/api/v2/product/{barcode}.json
 */
export async function searchFoodByBarcode(barcode: string): Promise<SearchResult | null> {
  const cleaned = barcode.trim();
  if (!cleaned) {
    return null;
  }

  try {
    const cached = await findFoodCacheByBarcode(cleaned);
    if (cached) {
      reportSearchSources(["local_cache"], { remoteAttempted: false, remoteFailed: false });
      return toSearchResult(cached);
    }
  } catch (error) {
    console.warn("Barcode cache lookup failed", error);
  }

  const result = await safeResolve(() => searchOpenFoodFactsByBarcode(cleaned), null);
  if (result) {
    await cacheResults([result]);
    reportSearchSources(["open_food_facts"], { remoteAttempted: true, remoteFailed: false });
    return result;
  }

  reportSearchSources(["open_food_facts"], { remoteAttempted: true, remoteFailed: true });
  return null;
}

export async function addCustomFoodToCache(
  foodName: string,
  macrosPer100g: { calories: number; protein: number; carbs: number; fats: number }
): Promise<SearchResult | null> {
  try {
    const item = await dbAddCustomFoodToCache(foodName, macrosPer100g);
    return item ? toSearchResult(item) : null;
  } catch (error) {
    console.warn("Failed to add custom food to cache", error);
    return null;
  }
}
