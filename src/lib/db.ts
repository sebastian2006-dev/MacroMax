import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CustomRecipe,
  DailyLog,
  FoodCacheItem,
  FoodSource,
  MealItem,
  MealType,
  Profile,
  RecipeIngredient,
} from "@/src/types";

export const LOCAL_USER_ID = "local";
const PROFILE_KEY = "@macromax/profile";
const FOOD_CACHE_KEY = "@macromax/food_cache";
const CUSTOM_RECIPES_KEY = "@macromax/custom_recipes";
const RECIPE_INGREDIENTS_KEY = "@macromax/recipe_ingredients";
const DAILY_LOGS_KEY = "@macromax/daily_logs";
const MEAL_ITEMS_KEY = "@macromax/meal_items";

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (error) {
    console.warn(`Failed to read ${key}`, error);
    return fallback;
  }
}

async function writeJson<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

async function readArray<T>(key: string): Promise<T[]> {
  return readJson<T[]>(key, []);
}

async function writeArray<T>(key: string, value: T[]): Promise<void> {
  await writeJson(key, value);
}

function defaultProfile(): Profile {
  // Zero targets = goals not configured yet. Goal rings on the dashboard are
  // only shown once the user sets targets in Settings.
  return {
    id: LOCAL_USER_ID,
    username: null,
    target_calories: 0,
    target_protein: 0,
    target_carbs: 0,
    target_fats: 0,
    created_at: new Date().toISOString(),
  };
}

/**
 * Normalize one cached food row. Rows written before the provider migration
 * may carry the retired "ifct2017"/"usda" sources and miss the new columns —
 * map them to "fallback" and fill defaults so nothing downstream crashes.
 */
function normalizeCacheItem(item: Partial<FoodCacheItem>): FoodCacheItem {
  const rawSource: unknown = item.source;
  const source: FoodSource =
    rawSource === "open_food_facts" ||
    rawSource === "fatsecret" ||
    rawSource === "user_custom" ||
    rawSource === "fallback"
      ? rawSource
      : "fallback"; // legacy "ifct2017" / "usda" rows land here
  return {
    id: item.id ?? createId("food"),
    barcode: item.barcode ?? null,
    external_id: item.external_id ?? null,
    food_name: item.food_name ?? "Unknown food",
    brand: item.brand ?? null,
    calories_per_100g: item.calories_per_100g ?? 0,
    protein_per_100g: item.protein_per_100g ?? 0,
    carbs_per_100g: item.carbs_per_100g ?? 0,
    fats_per_100g: item.fats_per_100g ?? 0,
    portions: item.portions ?? [],
    source,
  };
}

export async function getProfile(): Promise<Profile | null> {
  const profile = await readJson<Profile | null>(PROFILE_KEY, null);
  return profile ?? defaultProfile();
}

export async function saveProfile(profile: Profile): Promise<void> {
  await writeJson(PROFILE_KEY, profile);
}

export async function updateProfileTargets(targets: {
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fats: number;
}): Promise<Profile | null> {
  const profile = (await getProfile()) ?? defaultProfile();
  const updated: Profile = {
    ...profile,
    ...targets,
  };
  await saveProfile(updated);
  return updated;
}

export async function getFoodCache(query?: string): Promise<FoodCacheItem[]> {
  const cache = (await readArray<Partial<FoodCacheItem>>(FOOD_CACHE_KEY)).map(normalizeCacheItem);
  const normalized = query?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return cache.slice(0, 20);
  }
  return cache
    .filter((item) => item.food_name.toLowerCase().includes(normalized))
    .slice(0, 20);
}

export async function findFoodCacheByBarcode(barcode: string): Promise<FoodCacheItem | null> {
  const cache = (await readArray<Partial<FoodCacheItem>>(FOOD_CACHE_KEY)).map(normalizeCacheItem);
  return cache.find((item) => item.barcode === barcode) ?? null;
}

export async function upsertFoodCache(rows: Omit<FoodCacheItem, "id">[]): Promise<void> {
  const cache = (await readArray<Partial<FoodCacheItem>>(FOOD_CACHE_KEY)).map(normalizeCacheItem);

  for (const row of rows) {
    const existingIndex = row.barcode
      ? cache.findIndex((item) => item.barcode === row.barcode)
      : row.external_id
      ? cache.findIndex((item) => item.barcode === null && item.external_id === row.external_id)
      : cache.findIndex(
          (item) =>
            item.barcode === null &&
            item.food_name.toLowerCase() === row.food_name.toLowerCase() &&
            item.source === row.source
        );

    if (existingIndex >= 0) {
      cache[existingIndex] = {
        ...cache[existingIndex],
        ...row,
        id: cache[existingIndex].id,
      };
    } else {
      cache.push({
        ...row,
        id: createId("food"),
      });
    }
  }

  await writeArray(FOOD_CACHE_KEY, cache);
}

export async function addCustomFoodToCache(
  foodName: string,
  macrosPer100g: { calories: number; protein: number; carbs: number; fats: number }
): Promise<FoodCacheItem | null> {
  const item: FoodCacheItem = {
    id: createId("food"),
    barcode: null,
    external_id: null,
    food_name: foodName,
    brand: "Custom",
    calories_per_100g: macrosPer100g.calories,
    protein_per_100g: macrosPer100g.protein,
    carbs_per_100g: macrosPer100g.carbs,
    fats_per_100g: macrosPer100g.fats,
    portions: [],
    source: "user_custom",
  };

  const cache = (await readArray<Partial<FoodCacheItem>>(FOOD_CACHE_KEY)).map(normalizeCacheItem);
  cache.push(item);
  await writeArray(FOOD_CACHE_KEY, cache);
  return item;
}

export async function getCustomRecipes(): Promise<CustomRecipe[]> {
  const recipes = await readArray<CustomRecipe>(CUSTOM_RECIPES_KEY);
  return recipes.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

export async function searchCustomRecipes(query: string): Promise<CustomRecipe[]> {
  const normalized = query.trim().toLowerCase();
  const recipes = await getCustomRecipes();
  if (!normalized) {
    return recipes.slice(0, 20);
  }
  return recipes
    .filter((recipe) => recipe.recipe_name.toLowerCase().includes(normalized))
    .slice(0, 20);
}

export async function insertCustomRecipe(
  input: Omit<CustomRecipe, "id" | "user_id" | "created_at">,
  ingredients: Omit<RecipeIngredient, "id" | "recipe_id">[]
): Promise<CustomRecipe | null> {
  const recipes = await readArray<CustomRecipe>(CUSTOM_RECIPES_KEY);
  const recipe: CustomRecipe = {
    ...input,
    id: createId("recipe"),
    user_id: LOCAL_USER_ID,
    created_at: new Date().toISOString(),
  };
  recipes.push(recipe);
  await writeArray(CUSTOM_RECIPES_KEY, recipes);

  const allIngredients = await readArray<RecipeIngredient>(RECIPE_INGREDIENTS_KEY);
  const rows: RecipeIngredient[] = ingredients.map((ingredient) => ({
    ...ingredient,
    id: createId("ingredient"),
    recipe_id: recipe.id,
  }));
  allIngredients.push(...rows);
  await writeArray(RECIPE_INGREDIENTS_KEY, allIngredients);

  return recipe;
}

export async function getRecipeIngredients(recipeId: string): Promise<RecipeIngredient[]> {
  const ingredients = await readArray<RecipeIngredient>(RECIPE_INGREDIENTS_KEY);
  return ingredients.filter((ingredient) => ingredient.recipe_id === recipeId);
}

export async function getDailyLog(date: string): Promise<DailyLog | null> {
  const logs = await readArray<DailyLog>(DAILY_LOGS_KEY);
  return logs.find((log) => log.log_date === date) ?? null;
}

export async function ensureDailyLog(date: string): Promise<DailyLog | null> {
  const logs = await readArray<DailyLog>(DAILY_LOGS_KEY);
  const existing = logs.find((log) => log.log_date === date);
  if (existing) {
    return existing;
  }

  const dailyLog: DailyLog = {
    id: createId("log"),
    user_id: LOCAL_USER_ID,
    log_date: date,
    total_calories: 0,
    total_protein: 0,
    total_carbs: 0,
    total_fats: 0,
  };
  logs.push(dailyLog);
  await writeArray(DAILY_LOGS_KEY, logs);
  return dailyLog;
}

export async function getMealItems(dailyLogId: string): Promise<MealItem[]> {
  const items = await readArray<MealItem>(MEAL_ITEMS_KEY);
  return items
    .filter((item) => item.daily_log_id === dailyLogId)
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
}

export async function addMealItem(
  dailyLogId: string,
  input: {
    meal_type: MealType;
    item_name: string;
    serving_size: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  }
): Promise<MealItem | null> {
  const items = await readArray<MealItem>(MEAL_ITEMS_KEY);
  const mealItem: MealItem = {
    ...input,
    id: createId("meal"),
    daily_log_id: dailyLogId,
    created_at: new Date().toISOString(),
  };
  items.push(mealItem);
  await writeArray(MEAL_ITEMS_KEY, items);
  await recalculateDailyLog(dailyLogId);
  return mealItem;
}

export async function removeMealItem(mealItemId: string): Promise<boolean> {
  const items = await readArray<MealItem>(MEAL_ITEMS_KEY);
  const item = items.find((candidate) => candidate.id === mealItemId);
  if (!item) {
    return false;
  }
  await writeArray(
    MEAL_ITEMS_KEY,
    items.filter((candidate) => candidate.id !== mealItemId)
  );
  await recalculateDailyLog(item.daily_log_id);
  return true;
}

export async function getDailyLogs(startDate?: string): Promise<DailyLog[]> {
  const logs = await readArray<DailyLog>(DAILY_LOGS_KEY);
  const filtered = startDate ? logs.filter((log) => log.log_date >= startDate) : logs;
  return filtered.sort((a, b) => a.log_date.localeCompare(b.log_date));
}

async function recalculateDailyLog(dailyLogId: string): Promise<void> {
  const logs = await readArray<DailyLog>(DAILY_LOGS_KEY);
  const logIndex = logs.findIndex((log) => log.id === dailyLogId);
  if (logIndex < 0) {
    return;
  }

  const items = await readArray<MealItem>(MEAL_ITEMS_KEY);
  const dailyItems = items.filter((item) => item.daily_log_id === dailyLogId);
  logs[logIndex] = {
    ...logs[logIndex],
    total_calories: dailyItems.reduce((sum, item) => sum + (item.calories || 0), 0),
    total_protein: dailyItems.reduce((sum, item) => sum + (item.protein || 0), 0),
    total_carbs: dailyItems.reduce((sum, item) => sum + (item.carbs || 0), 0),
    total_fats: dailyItems.reduce((sum, item) => sum + (item.fats || 0), 0),
  };
  await writeArray(DAILY_LOGS_KEY, logs);
}
