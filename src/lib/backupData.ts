/**
 * Backup payload — the pure, node-testable half of the Settings → Data feature.
 *
 * Everything here runs without native modules: `src/lib/db.ts` imports the
 * `BackupPayload` type from this file, `src/lib/backup.ts` adds the native
 * pieces (expo-file-system / expo-sharing / expo-document-picker). Tests import
 * this module directly — they must never pull in expo-sqlite.
 *
 * Trust model: an imported backup file is UNTRUSTED INPUT. It may come from an
 * old app version, another app, or a hand-edited file. `validateBackupPayload()`
 * therefore never returns its input as-is — it returns a freshly built payload
 * whose rows are coerced (numbers via Number(), strings via String()) and whose
 * unusable rows are DROPPED, so `restoreAllData()` can run inside one
 * transaction without ever tripping a constraint mid-import.
 */

/** Bumped only for breaking payload changes; importers refuse newer files. */
export const BACKUP_VERSION = 1;
export const BACKUP_FORMAT = "macromax-backup";

/**
 * Hard ceiling per table. A backup is device-local user data, but this keeps a
 * hostile or corrupted file from OOMing the JS runtime on restore.
 */
export const MAX_ROWS_PER_TABLE = 100_000;

export interface BackupProfile {
  username: string | null;
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fats: number;
  created_at: string | null;
}

export interface BackupDailyLog {
  id: string;
  log_date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fats: number;
  locked_at: string | null;
  created_at: string | null;
}

export interface BackupMealItem {
  id: string;
  daily_log_id: string;
  meal_type: string;
  item_name: string;
  serving_size: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  created_at: string | null;
}

export interface BackupCustomRecipe {
  id: string;
  recipe_name: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fats: number;
  created_at: string | null;
}

export interface BackupRecipeIngredient {
  id: string;
  recipe_id: string;
  food_name: string;
  quantity_grams_or_units: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface BackupFoodCacheItem {
  id: string;
  barcode: string | null;
  external_id: string | null;
  food_name: string;
  brand: string | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fats_per_100g: number;
  portions: { id: string; label: string; grams: number; unit?: "g" | "ml" }[] | null;
  source: string;
}

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exported_at: string;
  profile: BackupProfile | null;
  daily_logs: BackupDailyLog[];
  meal_items: BackupMealItem[];
  custom_recipes: BackupCustomRecipe[];
  recipe_ingredients: BackupRecipeIngredient[];
  food_cache: BackupFoodCacheItem[];
  app_flags: Record<string, string>;
}

/** Raised with a user-presentable message; the UI shows it verbatim. */
export class BackupError extends Error {}

// ---------------------------------------------------------------------------
// Coercion helpers — every field of an imported row passes through one of these
// ---------------------------------------------------------------------------

function toNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
}

function toStr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = typeof value === "string" ? value : String(value);
  return str.trim() === "" ? null : str;
}

function toNullableIso(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/** `YYYY-MM-DD` in LOCAL time, built from date parts (never toISOString — it shifts by timezone). */
export function buildBackupFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `macromax-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

export function serializeBackup(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

/** One-line human summary for confirm dialogs, e.g. "12 days · 34 meals · 3 recipes". */
export function summarizeBackup(payload: BackupPayload): string {
  const parts: string[] = [];
  const days = payload.daily_logs.length;
  const meals = payload.meal_items.length;
  const recipes = payload.custom_recipes.length;
  const foods = payload.food_cache.length;
  if (days > 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (meals > 0) parts.push(`${meals} ${meals === 1 ? "meal" : "meals"}`);
  if (recipes > 0) parts.push(`${recipes} ${recipes === 1 ? "recipe" : "recipes"}`);
  if (foods > 0) parts.push(`${foods} cached ${foods === 1 ? "food" : "foods"}`);
  return parts.length > 0 ? parts.join(" · ") : "no data";
}

// ---------------------------------------------------------------------------
// Row sanitizers — drop what cannot be restored, coerce what can
// ---------------------------------------------------------------------------

const LOG_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeProfile(raw: unknown): BackupProfile | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  return {
    username: toNullableStr(row.username),
    target_calories: Math.max(0, Math.round(toNum(row.target_calories))),
    target_protein: Math.max(0, Math.round(toNum(row.target_protein))),
    target_carbs: Math.max(0, Math.round(toNum(row.target_carbs))),
    target_fats: Math.max(0, Math.round(toNum(row.target_fats))),
    created_at: toNullableIso(row.created_at),
  };
}

function sanitizeDailyLogs(raw: unknown): BackupDailyLog[] {
  if (!Array.isArray(raw)) return [];
  const logs: BackupDailyLog[] = [];
  for (const entry of raw.slice(0, MAX_ROWS_PER_TABLE)) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const id = toStr(row.id).trim();
    const logDate = toStr(row.log_date).trim();
    if (!id || !LOG_DATE_PATTERN.test(logDate)) continue;
    logs.push({
      id,
      log_date: logDate,
      total_calories: toNum(row.total_calories),
      total_protein: toNum(row.total_protein),
      total_carbs: toNum(row.total_carbs),
      total_fats: toNum(row.total_fats),
      locked_at: toNullableIso(row.locked_at),
      created_at: toNullableIso(row.created_at),
    });
  }
  return logs;
}

function sanitizeMealItems(raw: unknown): BackupMealItem[] {
  if (!Array.isArray(raw)) return [];
  const items: BackupMealItem[] = [];
  for (const entry of raw.slice(0, MAX_ROWS_PER_TABLE)) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const id = toStr(row.id).trim();
    const logId = toStr(row.daily_log_id).trim();
    const name = toStr(row.item_name).trim();
    if (!id || !logId || !name) continue;
    items.push({
      id,
      daily_log_id: logId,
      meal_type: toStr(row.meal_type).trim() || "Snacks/Extra",
      item_name: name,
      serving_size: toStr(row.serving_size) || "100 g",
      calories: toNum(row.calories),
      protein: toNum(row.protein),
      carbs: toNum(row.carbs),
      fats: toNum(row.fats),
      created_at: toNullableIso(row.created_at),
    });
  }
  return items;
}

function sanitizeRecipes(raw: unknown): BackupCustomRecipe[] {
  if (!Array.isArray(raw)) return [];
  const recipes: BackupCustomRecipe[] = [];
  for (const entry of raw.slice(0, MAX_ROWS_PER_TABLE)) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const id = toStr(row.id).trim();
    const name = toStr(row.recipe_name).trim();
    if (!id || !name) continue;
    recipes.push({
      id,
      recipe_name: name,
      total_calories: toNum(row.total_calories),
      total_protein: toNum(row.total_protein),
      total_carbs: toNum(row.total_carbs),
      total_fats: toNum(row.total_fats),
      created_at: toNullableIso(row.created_at),
    });
  }
  return recipes;
}

function sanitizeIngredients(raw: unknown): BackupRecipeIngredient[] {
  if (!Array.isArray(raw)) return [];
  const ingredients: BackupRecipeIngredient[] = [];
  for (const entry of raw.slice(0, MAX_ROWS_PER_TABLE)) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const id = toStr(row.id).trim();
    const recipeId = toStr(row.recipe_id).trim();
    const name = toStr(row.food_name).trim();
    if (!id || !recipeId || !name) continue;
    ingredients.push({
      id,
      recipe_id: recipeId,
      food_name: name,
      quantity_grams_or_units: toNum(row.quantity_grams_or_units),
      calories: toNum(row.calories),
      protein: toNum(row.protein),
      carbs: toNum(row.carbs),
      fats: toNum(row.fats),
    });
  }
  return ingredients;
}

function sanitizeFoodCache(raw: unknown): BackupFoodCacheItem[] {
  if (!Array.isArray(raw)) return [];
  const items: BackupFoodCacheItem[] = [];
  for (const entry of raw.slice(0, MAX_ROWS_PER_TABLE)) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const id = toStr(row.id).trim();
    const name = toStr(row.food_name).trim();
    if (!id || !name) continue;

    let portions: BackupFoodCacheItem["portions"] = null;
    if (Array.isArray(row.portions)) {
      const cleaned = row.portions
        .map((portion) => {
          if (typeof portion !== "object" || portion === null) return null;
          const p = portion as Record<string, unknown>;
          const grams = toNum(p.grams);
          const label = toStr(p.label).trim();
          if (!label || grams <= 0) return null;
          const unit = p.unit === "ml" ? "ml" : "g";
          return {
            id: toStr(p.id).trim() || `portion_${label}`,
            label,
            grams,
            unit: unit as "g" | "ml",
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
      if (cleaned.length > 0) portions = cleaned;
    }

    items.push({
      id,
      barcode: toNullableStr(row.barcode),
      external_id: toNullableStr(row.external_id),
      food_name: name,
      brand: toNullableStr(row.brand),
      calories_per_100g: toNum(row.calories_per_100g),
      protein_per_100g: toNum(row.protein_per_100g),
      carbs_per_100g: toNum(row.carbs_per_100g),
      fats_per_100g: toNum(row.fats_per_100g),
      portions,
      source: toStr(row.source).trim() || "fallback",
    });
  }
  return items;
}

function sanitizeAppFlags(raw: unknown): Record<string, string> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const flags: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key === "string" && key.trim() !== "" && typeof value === "string") {
      flags[key] = value;
    }
  }
  return flags;
}

/**
 * Validates and sanitizes an unknown parsed-JSON value into a payload that is
 * safe to hand to `restoreAllData()`. Throws `BackupError` with a
 * user-presentable message when the file is not a MacroMax backup at all.
 */
export function validateBackupPayload(raw: unknown): BackupPayload {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new BackupError("That file is not a MacroMax backup.");
  }
  const outer = raw as Record<string, unknown>;
  if (outer.format !== BACKUP_FORMAT) {
    throw new BackupError("That file is not a MacroMax backup.");
  }
  const version = toNum(outer.version);
  if (version > BACKUP_VERSION) {
    throw new BackupError(
      "This backup was created by a newer version of MacroMax. Update the app first."
    );
  }
  if (version !== BACKUP_VERSION) {
    throw new BackupError("This backup file uses an unsupported format.");
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: toNullableIso(outer.exported_at) ?? new Date(0).toISOString(),
    profile: sanitizeProfile(outer.profile),
    daily_logs: sanitizeDailyLogs(outer.daily_logs),
    meal_items: sanitizeMealItems(outer.meal_items),
    custom_recipes: sanitizeRecipes(outer.custom_recipes),
    recipe_ingredients: sanitizeIngredients(outer.recipe_ingredients),
    food_cache: sanitizeFoodCache(outer.food_cache),
    app_flags: sanitizeAppFlags(outer.app_flags),
  };
}
