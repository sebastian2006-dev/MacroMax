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
import {
  cacheRowsFromResults,
  dedupeResults,
  isLocalSufficient,
  LOCAL_SUFFICIENCY_THRESHOLD,
  sortSearchResults,
  toSearchResult,
} from "@/src/lib/foodResults";
import { searchOpenFoodFacts, searchOpenFoodFactsByBarcode } from "@/src/lib/openFoodFacts";
import { searchSeedDb } from "@/src/lib/seedDb";
import { safeResolve } from "@/src/lib/http";
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

/** Persist remote provider results so repeats work offline (Tier 2). */
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
 * The 3-Tier Smart Search waterfall.
 *
 * ┌────────────────────────────────────────────────────────┐
 * │                   User Search Input                    │
 * └───────────────────────────┬────────────────────────────┘
 *                             ▼
 *  TIER 1  Local pre-bundled seed DB (expo-sqlite + FTS5)
 *          → ≥ 5 matches? sort and STOP (zero cost, zero latency)
 *                             ▼
 *  TIER 2  Local user layer — write-through cache from previous
 *          API hits + saved dishes + built-in staples
 *          → ≥ 5 matches? sort and STOP (still offline)
 *                             ▼
 *  TIER 3  Remote APIs (FatSecret + Open Food Facts, parallel)
 *          → every API result is written back into the Tier 2
 *            cache so the same search never hits the API again
 *
 * Every exit path funnels through the SAME unified relevance sort
 * (sortSearchResults): raw ingredients → prepared variations → dishes,
 * with saved custom dishes pinned on top.
 *
 * Note on Tier 2: saved custom dishes and the built-in staples list are
 * merged in whenever Tier 1 alone is thin. They are free, instant, and
 * user-owned, so they never justify an API call on their own — but they
 * must never be hidden behind a Tier 1 sufficiency shortcut either.
 *
 * Every tier is individually guarded (safeResolve), so a missing seed DB,
 * a full cache, or a dead network degrades to the next tier — never a crash.
 */
export async function searchFoodPipeline(
  query: string,
  userId?: string | null
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    reportSearchSources([], { remoteAttempted: false, remoteFailed: false });
    return [];
  }

  const sources = new Set<SyncSource>();

  // ── TIER 1: pre-bundled ingredient database (read-only, offline) ──────────
  const tier1 = await safeResolve(() => searchSeedDb(trimmed), []);
  if (tier1.length > 0) {
    sources.add("fallback"); // bundled reference data surfaces as "Local"
  }
  let results = dedupeResults(tier1);

  // ── TIER 2: local user layer — only when Tier 1 is insufficient ───────────
  if (!isLocalSufficient(results.length, LOCAL_SUFFICIENCY_THRESHOLD)) {
    const [customRecipes, cached, builtIn] = await Promise.all([
      safeResolve(() => searchCustomRecipes(userId ?? null, trimmed), []),
      safeResolve(() => searchLocalCache(trimmed), []),
      Promise.resolve(safeResolveSync(() => searchFallbackFoods(trimmed), [])),
    ]);

    if (customRecipes.length > 0) {
      sources.add("custom_recipe");
    }
    if (cached.length > 0) {
      sources.add("local_cache");
    }
    if (builtIn.length > 0) {
      sources.add("fallback");
    }
    results = dedupeResults([...customRecipes, ...cached, ...builtIn, ...results]);
  }

  let remoteAttempted = false;
  let remoteFailed = false;

  // ── TIER 3: remote APIs — only when both local tiers are insufficient ─────
  if (!isLocalSufficient(results.length, LOCAL_SUFFICIENCY_THRESHOLD)) {
    remoteAttempted = true;
    remoteFailed = true;

    const [fatSecretResults, offResults] = await Promise.all([
      safeResolve(() => searchFatSecret(trimmed), []),
      safeResolve(() => searchOpenFoodFacts(trimmed), []),
    ]);

    const remoteResults = dedupeResults([...fatSecretResults, ...offResults]);

    if (fatSecretResults.length > 0) {
      sources.add("fatsecret");
      remoteFailed = false;
    }
    if (offResults.length > 0) {
      sources.add("open_food_facts");
      remoteFailed = false;
    }

    // CRITICAL: write every API hit into the Tier 2 cache (fire-and-forget is
    // fine — the current search must not wait on the persistence round-trip).
    if (remoteResults.length > 0) {
      void cacheResults(remoteResults);
    }

    results = dedupeResults([...results, ...remoteResults]);
  }

  // ── Unified relevance sort on every exit path ─────────────────────────────
  const ranked = sortSearchResults(results, trimmed).slice(0, 30);
  reportSearchSources([...sources], { remoteAttempted, remoteFailed });
  return ranked;
}

/** Run a synchronous producer, swallowing failures into the fallback. */
function safeResolveSync<T>(producer: () => T, fallback: T): T {
  try {
    return producer();
  } catch (error) {
    console.warn("Food lookup step failed", error);
    return fallback;
  }
}

/** @deprecated Renamed to {@link searchFoodPipeline}. Kept for back-compat. */
export const searchFoods = searchFoodPipeline;

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
    void cacheResults([result]);
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
