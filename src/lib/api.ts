import { SearchResult } from "@/src/types";
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
import {
  cacheRowsFromResults,
  dedupeResults,
  isLocalSufficient,
  LOCAL_SUFFICIENCY_THRESHOLD,
  sortSearchResults,
  toSearchResult,
} from "@/src/lib/foodResults";
import { reportSearchSources, SyncSource } from "@/src/lib/syncStatus";

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
  const rows = cacheRowsFromResults(results);
  if (rows.length === 0) {
    return;
  }

  try {
    await upsertFoodCache(rows);
  } catch (error) {
    console.warn("Failed to cache food results", error);
  }
}

/**
 * Search foods with a strict LOCAL-FIRST strategy:
 *
 *   1. On-device layer, queried first and in parallel:
 *        - saved custom dishes (always surfaced, pinned to the top),
 *        - the food cache (mirrors earlier lookups — offline repeats),
 *        - the built-in reference list (static DB, never empty for staples).
 *   2. If the local layer already returns enough matches
 *      (>= LOCAL_SUFFICIENCY_THRESHOLD) we STOP here — no network at all.
 *   3. Otherwise the remote providers are queried in PARALLEL to top up:
 *        - FatSecret: raw ingredients, cooked dishes, Indian foods (text).
 *        - Open Food Facts: packaged products (search + portions).
 *
 * Everything is finally run through the SAME relevance sort, so local and
 * remote rows are ranked by one consistent 3-tier algorithm. Every provider is
 * individually guarded, so a missing key, timeout or bad response can never
 * crash the app or reject the whole search.
 */
export async function searchFoods(query: string, userId?: string | null): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    reportSearchSources([], { remoteAttempted: false, remoteFailed: false });
    return [];
  }

  const collected: SearchResult[] = [];
  const sources = new Set<SyncSource>();

  // 1) LOCAL LAYER FIRST — saved dishes + on-device cache + built-in DB.
  const [customRecipes, cached, builtIn] = await Promise.all([
    safeResolve(() => searchCustomRecipes(userId ?? null, trimmed), []),
    safeResolve(() => searchLocalCache(trimmed), []),
    Promise.resolve(searchFallbackFoods(trimmed)),
  ]);

  if (customRecipes.length > 0) {
    sources.add("custom_recipe");
    collected.push(...customRecipes);
  }
  if (cached.length > 0) {
    sources.add("local_cache");
    collected.push(...cached);
  }
  if (builtIn.length > 0) {
    sources.add("fallback");
    collected.push(...builtIn);
  }

  const localMatches = dedupeResults(collected);

  // 2) Enough local matches? Return them and STOP — never touch the network.
  let remoteAttempted = false;
  let remoteFailed = false;

  if (!isLocalSufficient(localMatches.length, LOCAL_SUFFICIENCY_THRESHOLD)) {
    // 3) Remote providers in parallel — only reached when local is thin.
    remoteAttempted = true;
    remoteFailed = true;

    const [fatSecretResults, offResults] = await Promise.all([
      safeResolve(() => searchFatSecret(trimmed), []),
      safeResolve(() => searchOpenFoodFacts(trimmed), []),
    ]);

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
  }

  // One unified relevance sort for both local and remote results:
  // basic ingredients → prepared variations → complex dishes.
  const results = sortSearchResults(dedupeResults(collected), trimmed);
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
