export type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snacks/Extra";

export const MEAL_TYPES: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snacks/Extra"];

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

/**
 * A standard portion (serving) supplied by a food provider, e.g.
 * FatSecret "1 cup (244 g)" or Open Food Facts "1 bar (60 g)".
 *
 * `grams` is the gram equivalent of ONE portion. Liquids reported in
 * millilitres are converted with a 1 g ≈ 1 ml approximation (density ~1),
 * which is accurate enough for nutrition logging (milk, juice, etc.).
 */
export interface ServingPortion {
  id: string;
  /** Human label, e.g. "1 cup (244 g)" or "250 ml". */
  label: string;
  /** Gram equivalent of one portion. */
  grams: number;
  /** "g" or "ml" as reported by the provider. */
  unit?: "g" | "ml";
}

/**
 * Provider that a food entry came from. IFCT 2017 / USDA were retired in the
 * API migration — legacy rows in the local cache are treated as "fallback".
 */
export type FoodSource =
  | "open_food_facts"
  | "fatsecret"
  | "user_custom"
  | "custom_recipe"
  | "fallback";

export interface Profile {
  id: string;
  username: string | null;
  target_calories: number;
  target_protein: number;
  target_carbs: number | null;
  target_fats: number | null;
  created_at?: string;
}

export interface FoodCacheItem {
  id: string;
  /** Open Food Facts barcode / product code. */
  barcode: string | null;
  /** Provider food id (FatSecret food_id, OFF product code). */
  external_id: string | null;
  food_name: string;
  brand: string | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fats_per_100g: number;
  /** Standard portions shipped with the provider response (may be empty). */
  portions?: ServingPortion[] | null;
  source: FoodSource;
}

export interface SearchResult extends Macros {
  id: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  /** Provider food id (FatSecret food_id / OFF code) for re-fetching. */
  externalId?: string | null;
  source: FoodSource | "custom_recipe";
  /** Human description of the reference quantity, e.g. "100 g". */
  servingSize?: string;
  /** Standard portions (provider servings) that can be logged directly. */
  portions?: ServingPortion[];
}

export interface MealItem extends Macros {
  id: string;
  daily_log_id: string;
  meal_type: MealType;
  item_name: string;
  serving_size: string;
  created_at?: string;
}

export interface DailyLog {
  id: string;
  user_id: string;
  log_date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fats: number;
}

export interface CustomRecipe {
  id: string;
  user_id: string;
  recipe_name: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fats: number;
  created_at?: string;
}

export interface RecipeIngredient extends Macros {
  id: string;
  recipe_id: string;
  food_name: string;
  quantity_grams_or_units: number;
}

export interface GoalTargets {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface LowIntakeAlert {
  key: keyof Macros;
  label: string;
  current: number;
  target: number;
  percent: number;
  message: string;
}
