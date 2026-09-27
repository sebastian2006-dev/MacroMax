/**
 * Local-first persistence layer.
 *
 * ALL user data (profile, daily logs, meal items, saved recipes, the food
 * cache) lives in ONE SQLite database created under
 * `<FileSystem.documentDirectory>/db/macromax.db`.
 *
 * Why SQLite + documentDirectory (and not AsyncStorage): AsyncStorage is a
 * small key/value store intended for tiny values; app updates installed over
 * an existing install keep the document directory untouched, and files there
 * are only removed when the app is uninstalled — so goals, logs and saved
 * dishes automatically survive APK upgrades. It also gives transactional
 * writes and indexed queries instead of read-parse-rewrite-whole-array.
 *
 * The read-only bundled ingredient database (assets/seed.db → Tier 1 of the
 * search pipeline) is a DIFFERENT file, managed by src/lib/seedDb.ts. It must
 * never be deleted on app updates; nothing in this module touches it.
 *
 * Fresh installs start empty: the database file does not exist until the
 * first write, and the schema has no seed rows.
 *
 * HISTORY: the earliest builds kept the profile and food cache in
 * AsyncStorage. That package has been REMOVED — this module previously
 * carried a one-time AsyncStorage→SQLite importer, dropped when the last
 * AsyncStorage-only release aged out. The `user_prefs` table now holds
 * every lightweight key/value the old key-value store did.
 */

import * as SQLite from "expo-sqlite";
import { Directory, Paths } from "expo-file-system";
import {
  CustomRecipe,
  DailyLog,
  FoodCacheItem,
  FoodSource,
  MealItem,
  MealType,
  Profile,
  RecipeIngredient,
  ServingPortion,
} from "@/src/types";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupCustomRecipe,
  BackupDailyLog,
  BackupMealItem,
  BackupPayload,
  BackupRecipeIngredient,
} from "@/src/lib/backupData";

export const LOCAL_USER_ID = "local";

/** Where the user database lives, relative to FileSystem.documentDirectory. */
const DB_DIRECTORY = "db";
const DB_NAME = "macromax.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Open (and lazily create) the user database under the document directory.
 * Memoized per launch; the schema is idempotent.
 */
function openAppDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      // The `directory` argument MUST be an absolute file URI. A relative
      // name like "db" fails native parent-resolution with
      // "Couldn't create directory 'db'. Parent directory is null."
      const dir = new Directory(Paths.document, DB_DIRECTORY);
      dir.create({ idempotent: true, intermediates: true });

      const db = SQLite.openDatabaseSync(DB_NAME, {}, dir.uri);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS profile (
          id              TEXT PRIMARY KEY NOT NULL,
          username        TEXT,
          target_calories INTEGER NOT NULL DEFAULT 0,
          target_protein  INTEGER NOT NULL DEFAULT 0,
          target_carbs    INTEGER NOT NULL DEFAULT 0,
          target_fats     INTEGER NOT NULL DEFAULT 0,
          created_at      TEXT
        );

        CREATE TABLE IF NOT EXISTS daily_logs (
          id             TEXT PRIMARY KEY NOT NULL,
          user_id        TEXT NOT NULL,
          log_date       TEXT NOT NULL UNIQUE,
          total_calories REAL NOT NULL DEFAULT 0,
          total_protein  REAL NOT NULL DEFAULT 0,
          total_carbs    REAL NOT NULL DEFAULT 0,
          total_fats     REAL NOT NULL DEFAULT 0,
          locked_at      TEXT,
          created_at     TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(log_date);

        CREATE TABLE IF NOT EXISTS meal_items (
          id            TEXT PRIMARY KEY NOT NULL,
          daily_log_id  TEXT NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
          meal_type     TEXT NOT NULL,
          item_name     TEXT NOT NULL,
          serving_size  TEXT NOT NULL,
          calories      REAL NOT NULL,
          protein       REAL NOT NULL,
          carbs         REAL NOT NULL,
          fats          REAL NOT NULL,
          created_at    TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_meal_items_log ON meal_items(daily_log_id);

        CREATE TABLE IF NOT EXISTS custom_recipes (
          id             TEXT PRIMARY KEY NOT NULL,
          user_id        TEXT NOT NULL,
          recipe_name    TEXT NOT NULL,
          total_calories REAL NOT NULL,
          total_protein  REAL NOT NULL,
          total_carbs    REAL NOT NULL,
          total_fats     REAL NOT NULL,
          created_at     TEXT
        );

        CREATE TABLE IF NOT EXISTS recipe_ingredients (
          id                       TEXT PRIMARY KEY NOT NULL,
          recipe_id                TEXT NOT NULL REFERENCES custom_recipes(id) ON DELETE CASCADE,
          food_name                TEXT NOT NULL,
          quantity_grams_or_units  REAL NOT NULL,
          calories                 REAL NOT NULL,
          protein                  REAL NOT NULL,
          carbs                    REAL NOT NULL,
          fats                     REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

        CREATE TABLE IF NOT EXISTS food_cache (
          id                TEXT PRIMARY KEY NOT NULL,
          barcode           TEXT,
          external_id       TEXT,
          food_name         TEXT NOT NULL,
          brand             TEXT,
          calories_per_100g REAL NOT NULL,
          protein_per_100g  REAL NOT NULL,
          carbs_per_100g    REAL NOT NULL,
          fats_per_100g     REAL NOT NULL,
          portions_json     TEXT,
          source            TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_food_cache_barcode ON food_cache(barcode);
        CREATE INDEX IF NOT EXISTS idx_food_cache_external ON food_cache(external_id);

        -- Lightweight app-level key/value preferences (onboarding state,
        -- walkthrough). Lives in the SAME database file as the user data so
        -- a backup or an APK update carries it with everything else.
        CREATE TABLE IF NOT EXISTS user_prefs (
          key   TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      return db;
    })().catch((error) => {
      // Allow a later retry if opening failed (e.g. transient FS error).
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// (The legacy AsyncStorage → SQLite importer was removed along with the
// AsyncStorage package itself. See the module header for the history.)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// App preferences (user_prefs table)
// ---------------------------------------------------------------------------

/**
 * The preference keys MacroMax persists in `user_prefs`, inside macromax.db
 * itself. Same durability as the food logs: they survive app updates and only
 * disappear when the app is uninstalled.
 */
export const USER_PREF_KEYS = {
  /** True once the full onboarding flow (name → goals → walkthrough) is done. */
  onboarding: "has_completed_onboarding",
  /** True once the first-run walkthrough has been watched to the end. */
  walkthrough: "has_seen_walkthrough",
} as const;

/** Upsert against an explicit connection (usable inside open transactions). */
async function setPrefOn(
  db: SQLite.SQLiteDatabase,
  key: string,
  value: string
): Promise<void> {
  await db.runAsync(
    "INSERT INTO user_prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value
  );
}

/** Write one preference (string value). */
export async function setAppPref(key: string, value: string): Promise<void> {
  const db = await openAppDb();
  await setPrefOn(db, key, value);
}

/** Read one preference, or null when unset. */
export async function getAppPref(key: string): Promise<string | null> {
  const db = await openAppDb();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM user_prefs WHERE key = ?",
    key
  );
  return row?.value ?? null;
}

async function getAllPrefs(db: SQLite.SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM user_prefs"
  );
  const prefs: Record<string, string> = {};
  for (const row of rows) {
    prefs[row.key] = row.value;
  }
  return prefs;
}

/** True once the user has finished the full onboarding flow. */
export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    return (await getAppPref(USER_PREF_KEYS.onboarding)) === "true";
  } catch (error) {
    console.warn("Failed to read the onboarding flag from SQLite", error);
    return false;
  }
}

/** Persists onboarding completion. Called once the name is saved. */
export async function setOnboardingComplete(): Promise<void> {
  await setAppPref(USER_PREF_KEYS.onboarding, "true");
}

// ---------------------------------------------------------------------------
// Day lock ("Lock & Complete Day")
// ---------------------------------------------------------------------------

/** ISO timestamp when the given date was locked, or null when open. */
export async function isDayLocked(date: string): Promise<string | null> {
  const db = await openAppDb();
  const row = await db.getFirstAsync<{ locked_at: string | null }>(
    "SELECT locked_at FROM daily_logs WHERE log_date = ?",
    date
  );
  return row?.locked_at ?? null;
}

/** Locks the given date; further additions/edits for it are refused. */
export async function lockDay(date: string): Promise<void> {
  const db = await openAppDb();
  const log = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM daily_logs WHERE log_date = ?",
    date
  );
  if (!log) {
    return; // Nothing logged that day — nothing to lock.
  }
  await db.runAsync("UPDATE daily_logs SET locked_at = ? WHERE id = ?", new Date().toISOString(), log.id);
}

/** Reopens a locked day (undo). */
export async function unlockDay(date: string): Promise<void> {
  const db = await openAppDb();
  await db.runAsync("UPDATE daily_logs SET locked_at = NULL WHERE log_date = ?", date);
}

/** The set of locked dates among `dates` (toLocalDateString strings). */
export async function getLockedDates(dates: string[]): Promise<Set<string>> {
  if (dates.length === 0) {
    return new Set();
  }
  const db = await openAppDb();
  const placeholders = dates.map(() => "?").join(", ");
  const rows = await db.getAllAsync<{ log_date: string }>(
    `SELECT log_date FROM daily_logs WHERE locked_at IS NOT NULL AND log_date IN (${placeholders})`,
    ...dates
  );
  return new Set(rows.map((row) => row.log_date));
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

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

export async function getProfile(): Promise<Profile | null> {
  const db = await openAppDb();
  const row = await db.getFirstAsync<{
    id: string;
    username: string | null;
    target_calories: number;
    target_protein: number;
    target_carbs: number;
    target_fats: number;
    created_at: string | null;
  }>("SELECT * FROM profile LIMIT 1");
  if (!row) {
    return defaultProfile();
  }
  return {
    id: row.id,
    username: row.username,
    target_calories: row.target_calories,
    target_protein: row.target_protein,
    target_carbs: row.target_carbs,
    target_fats: row.target_fats,
    created_at: row.created_at ?? undefined,
  };
}

export async function saveProfile(profile: Profile): Promise<void> {
  const db = await openAppDb();
  await db.runAsync(
    `INSERT INTO profile (id, username, target_calories, target_protein, target_carbs, target_fats, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       username = excluded.username,
       target_calories = excluded.target_calories,
       target_protein = excluded.target_protein,
       target_carbs = excluded.target_carbs,
       target_fats = excluded.target_fats`,
    profile.id,
    profile.username,
    profile.target_calories,
    profile.target_protein,
    profile.target_carbs,
    profile.target_fats,
    profile.created_at ?? new Date().toISOString()
  );
}

/**
 * Persist ONLY the display name, creating the profile row if needed. Identity
 * lives in SQLite (not AsyncStorage) so it survives app updates alongside the
 * food data.
 */
export async function saveProfileName(name: string): Promise<void> {
  const db = await openAppDb();
  const trimmed = name.trim();
  await db.runAsync(
    `INSERT INTO profile (id, username, target_calories, target_protein, target_carbs, target_fats, created_at)
     VALUES (?, ?, 0, 0, 0, 0, ?)
     ON CONFLICT(id) DO UPDATE SET username = excluded.username`,
    LOCAL_USER_ID,
    trimmed,
    new Date().toISOString()
  );
}

export async function updateProfileTargets(targets: {
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fats: number;
}): Promise<Profile | null> {
  const current = (await getProfile()) ?? defaultProfile();
  const updated: Profile = { ...current, ...targets };
  await saveProfile(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Food cache (Tier 2 of the search pipeline)
// ---------------------------------------------------------------------------

/** Normalize one cached food row (legacy/malformed rows land on "fallback"). */
function normalizeCacheItem(item: Partial<FoodCacheItem>): FoodCacheItem {
  const rawSource: unknown = item.source;
  const source: FoodSource =
    rawSource === "open_food_facts" ||
    rawSource === "fatsecret" ||
    rawSource === "user_custom" ||
    rawSource === "fallback"
      ? rawSource
      : "fallback";
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

interface FoodCacheRow {
  id: string;
  barcode: string | null;
  external_id: string | null;
  food_name: string;
  brand: string | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fats_per_100g: number;
  portions_json: string | null;
  source: string;
}

function rowToCacheItem(row: FoodCacheRow): FoodCacheItem {
  let portions: ServingPortion[] | null = null;
  if (row.portions_json) {
    try {
      portions = JSON.parse(row.portions_json) as ServingPortion[];
    } catch {
      portions = null;
    }
  }
  return normalizeCacheItem({ ...row, portions, source: row.source as FoodSource });
}

const FOOD_CACHE_COLUMNS = `id, barcode, external_id, food_name, brand, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g, portions_json, source`;

export async function getFoodCache(query?: string): Promise<FoodCacheItem[]> {
  const db = await openAppDb();
  const normalized = query?.trim().toLowerCase() ?? "";
  const rows = normalized
    ? await db.getAllAsync<FoodCacheRow>(
        `SELECT ${FOOD_CACHE_COLUMNS} FROM food_cache
         WHERE lower(food_name) LIKE '%' || ? || '%'
         ORDER BY food_name LIMIT 20`,
        normalized
      )
    : await db.getAllAsync<FoodCacheRow>(
        `SELECT ${FOOD_CACHE_COLUMNS} FROM food_cache ORDER BY food_name LIMIT 20`
      );
  return rows.map(rowToCacheItem);
}

export async function findFoodCacheByBarcode(barcode: string): Promise<FoodCacheItem | null> {
  const db = await openAppDb();
  const row = await db.getFirstAsync<FoodCacheRow>(
    `SELECT ${FOOD_CACHE_COLUMNS} FROM food_cache WHERE barcode = ? LIMIT 1`,
    barcode
  );
  return row ? rowToCacheItem(row) : null;
}

export async function upsertFoodCache(rows: Omit<FoodCacheItem, "id">[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const db = await openAppDb();
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const existing = row.barcode
        ? await db.getFirstAsync<{ id: string }>(
            "SELECT id FROM food_cache WHERE barcode = ?",
            row.barcode
          )
        : row.external_id
          ? await db.getFirstAsync<{ id: string }>(
              "SELECT id FROM food_cache WHERE barcode IS NULL AND external_id = ?",
              row.external_id
            )
          : await db.getFirstAsync<{ id: string }>(
              `SELECT id FROM food_cache
               WHERE barcode IS NULL AND lower(food_name) = lower(?) AND source = ?`,
              row.food_name,
              row.source
            );

      const portionsJson =
        row.portions && row.portions.length > 0 ? JSON.stringify(row.portions) : null;

      if (existing) {
        await db.runAsync(
          `UPDATE food_cache SET barcode = ?, external_id = ?, food_name = ?, brand = ?,
             calories_per_100g = ?, protein_per_100g = ?, carbs_per_100g = ?, fats_per_100g = ?,
             portions_json = ?, source = ?
           WHERE id = ?`,
          row.barcode ?? null,
          row.external_id ?? null,
          row.food_name,
          row.brand ?? null,
          row.calories_per_100g,
          row.protein_per_100g,
          row.carbs_per_100g,
          row.fats_per_100g,
          portionsJson,
          row.source,
          existing.id
        );
      } else {
        await db.runAsync(
          `INSERT INTO food_cache (id, barcode, external_id, food_name, brand, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g, portions_json, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          createId("food"),
          row.barcode ?? null,
          row.external_id ?? null,
          row.food_name,
          row.brand ?? null,
          row.calories_per_100g,
          row.protein_per_100g,
          row.carbs_per_100g,
          row.fats_per_100g,
          portionsJson,
          row.source
        );
      }
    }
  });
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

  const db = await openAppDb();
  await db.runAsync(
    `INSERT INTO food_cache (id, barcode, external_id, food_name, brand, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g, portions_json, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id,
    item.barcode,
    item.external_id,
    item.food_name,
    item.brand,
    item.calories_per_100g,
    item.protein_per_100g,
    item.carbs_per_100g,
    item.fats_per_100g,
    null,
    item.source
  );
  return item;
}

// ---------------------------------------------------------------------------
// Custom recipes
// ---------------------------------------------------------------------------

export async function getCustomRecipes(): Promise<CustomRecipe[]> {
  const db = await openAppDb();
  return db.getAllAsync<CustomRecipe>(
    `SELECT id, user_id, recipe_name, total_calories, total_protein, total_carbs, total_fats, created_at
     FROM custom_recipes ORDER BY created_at DESC`
  );
}

export async function searchCustomRecipes(query: string): Promise<CustomRecipe[]> {
  const db = await openAppDb();
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return getCustomRecipes();
  }
  return db.getAllAsync<CustomRecipe>(
    `SELECT id, user_id, recipe_name, total_calories, total_protein, total_carbs, total_fats, created_at
     FROM custom_recipes
     WHERE lower(recipe_name) LIKE '%' || ? || '%'
     ORDER BY created_at DESC LIMIT 20`,
    normalized
  );
}

export async function insertCustomRecipe(
  input: Omit<CustomRecipe, "id" | "user_id" | "created_at">,
  ingredients: Omit<RecipeIngredient, "id" | "recipe_id">[]
): Promise<CustomRecipe | null> {
  const db = await openAppDb();
  const recipe: CustomRecipe = {
    ...input,
    id: createId("recipe"),
    user_id: LOCAL_USER_ID,
    created_at: new Date().toISOString(),
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO custom_recipes (id, user_id, recipe_name, total_calories, total_protein, total_carbs, total_fats, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      recipe.id,
      recipe.user_id,
      recipe.recipe_name,
      recipe.total_calories,
      recipe.total_protein,
      recipe.total_carbs,
      recipe.total_fats,
      recipe.created_at ?? new Date().toISOString()
    );

    for (const ingredient of ingredients) {
      await db.runAsync(
        `INSERT INTO recipe_ingredients (id, recipe_id, food_name, quantity_grams_or_units, calories, protein, carbs, fats)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        createId("ingredient"),
        recipe.id,
        ingredient.food_name,
        ingredient.quantity_grams_or_units,
        ingredient.calories,
        ingredient.protein,
        ingredient.carbs,
        ingredient.fats
      );
    }
  });

  return recipe;
}

// ---------------------------------------------------------------------------
// Daily logs & meal items
// ---------------------------------------------------------------------------

async function recalculateDailyLog(db: SQLite.SQLiteDatabase, dailyLogId: string): Promise<void> {
  await db.runAsync(
    `UPDATE daily_logs SET
       total_calories = (SELECT COALESCE(SUM(calories), 0) FROM meal_items WHERE daily_log_id = ?),
       total_protein  = (SELECT COALESCE(SUM(protein), 0)  FROM meal_items WHERE daily_log_id = ?),
       total_carbs    = (SELECT COALESCE(SUM(carbs), 0)    FROM meal_items WHERE daily_log_id = ?),
       total_fats     = (SELECT COALESCE(SUM(fats), 0)     FROM meal_items WHERE daily_log_id = ?)
     WHERE id = ?`,
    dailyLogId,
    dailyLogId,
    dailyLogId,
    dailyLogId,
    dailyLogId
  );
}

export async function ensureDailyLog(date: string): Promise<DailyLog | null> {
  const db = await openAppDb();

  // Fast path: the row already exists.
  const existing = await db.getFirstAsync<
    DailyLog & { locked_at: string | null }
  >(
    `SELECT id, user_id, log_date, total_calories, total_protein, total_carbs, total_fats, created_at, locked_at
     FROM daily_logs WHERE log_date = ?`,
    date
  );
  if (existing) {
    const { locked_at, ...log } = existing;
    void locked_at;
    return log;
  }

  // RACE-SAFE CREATE: two screens can mount at once (freezeOnBlur keeps the
  // dashboard and the log both alive), and both may call this in the same
  // tick. A plain INSERT would make the loser throw
  // "UNIQUE constraint failed: daily_logs.log_date". INSERT OR IGNORE lets
  // both proceed; the re-SELECT below then returns the one winning row.
  await db.runAsync(
    `INSERT OR IGNORE INTO daily_logs (id, user_id, log_date, total_calories, total_protein, total_carbs, total_fats, locked_at, created_at)
     VALUES (?, ?, ?, 0, 0, 0, 0, NULL, ?)`,
    createId("log"),
    LOCAL_USER_ID,
    date,
    new Date().toISOString()
  );

  const created = await db.getFirstAsync<
    DailyLog & { locked_at: string | null }
  >(
    `SELECT id, user_id, log_date, total_calories, total_protein, total_carbs, total_fats, created_at, locked_at
     FROM daily_logs WHERE log_date = ?`,
    date
  );
  if (!created) {
    return null;
  }
  const { locked_at, ...log } = created;
  void locked_at;
  return log;
}

export async function getMealItems(dailyLogId: string): Promise<MealItem[]> {
  const db = await openAppDb();
  return db.getAllAsync<MealItem>(
    `SELECT id, daily_log_id, meal_type, item_name, serving_size, calories, protein, carbs, fats, created_at
     FROM meal_items WHERE daily_log_id = ? ORDER BY created_at`,
    dailyLogId
  );
}

/**
 * Refuses writes to a locked day. Returns null when the day is locked —
 * callers surface that as a "day is completed" state instead of a write.
 */
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
  const db = await openAppDb();
  const lock = await db.getFirstAsync<{ locked_at: string | null }>(
    "SELECT locked_at FROM daily_logs WHERE id = ?",
    dailyLogId
  );
  if (lock?.locked_at) {
    return null;
  }

  const mealItem: MealItem = {
    ...input,
    id: createId("meal"),
    daily_log_id: dailyLogId,
    created_at: new Date().toISOString(),
  };
  await db.runAsync(
    `INSERT INTO meal_items (id, daily_log_id, meal_type, item_name, serving_size, calories, protein, carbs, fats, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    mealItem.id,
    mealItem.daily_log_id,
    mealItem.meal_type,
    mealItem.item_name,
    mealItem.serving_size,
    mealItem.calories,
    mealItem.protein,
    mealItem.carbs,
    mealItem.fats,
    mealItem.created_at ?? new Date().toISOString()
  );
  await recalculateDailyLog(db, dailyLogId);
  return mealItem;
}

/** Refuses removals from a locked day. */
export async function removeMealItem(mealItemId: string): Promise<boolean> {
  const db = await openAppDb();
  const item = await db.getFirstAsync<{ id: string; daily_log_id: string }>(
    "SELECT id, daily_log_id FROM meal_items WHERE id = ?",
    mealItemId
  );
  if (!item) {
    return false;
  }
  const lock = await db.getFirstAsync<{ locked_at: string | null }>(
    "SELECT locked_at FROM daily_logs WHERE id = ?",
    item.daily_log_id
  );
  if (lock?.locked_at) {
    return false;
  }
  await db.runAsync("DELETE FROM meal_items WHERE id = ?", mealItemId);
  await recalculateDailyLog(db, item.daily_log_id);
  return true;
}

export async function getDailyLogs(startDate?: string): Promise<DailyLog[]> {
  const db = await openAppDb();
  return startDate
    ? db.getAllAsync<DailyLog>(
        `SELECT id, user_id, log_date, total_calories, total_protein, total_carbs, total_fats, created_at
         FROM daily_logs WHERE log_date >= ? ORDER BY log_date`,
        startDate
      )
    : db.getAllAsync<DailyLog>(
        `SELECT id, user_id, log_date, total_calories, total_protein, total_carbs, total_fats, created_at
         FROM daily_logs ORDER BY log_date`
      );
}

/**
 * Returns the set of log_date strings (within [startDate, endDate], inclusive)
 * that have at least one non-empty meal item logged. Used by WeekStrip's
 * logged-day dot indicator.
 */
export async function getLoggedDatesInRange(
  startDate: string,
  endDate: string
): Promise<string[]> {
  const db = await openAppDb();
  const rows = await db.getAllAsync<{ log_date: string }>(
    `SELECT DISTINCT dl.log_date
     FROM daily_logs dl
     JOIN meal_items mi ON mi.daily_log_id = dl.id
     WHERE dl.log_date >= ? AND dl.log_date <= ?`,
    startDate,
    endDate
  );
  return rows.map((row) => row.log_date);
}

// ---------------------------------------------------------------------------
// Backup export / import (Settings → Data)
// ---------------------------------------------------------------------------

/**
 * Reads EVERY user table into a backup payload. Per-parent child queries keep
 * the reads indexed and the shapes identical to the payload types.
 */
export async function readAllUserData(): Promise<BackupPayload> {
  const db = await openAppDb();

  const profileRow = await db.getFirstAsync<{
    username: string | null;
    target_calories: number;
    target_protein: number;
    target_carbs: number | null;
    target_fats: number | null;
    created_at: string | null;
  }>(
    "SELECT username, target_calories, target_protein, target_carbs, target_fats, created_at FROM profile LIMIT 1"
  );

  const logs = await db.getAllAsync<
    DailyLog & { locked_at?: string | null; created_at?: string | null }
  >(
    `SELECT id, log_date, total_calories, total_protein, total_carbs, total_fats, locked_at, created_at
     FROM daily_logs ORDER BY log_date`
  );

  const daily_logs: BackupDailyLog[] = [];
  const meal_items: BackupMealItem[] = [];
  for (const log of logs) {
    daily_logs.push({
      id: log.id,
      log_date: log.log_date,
      total_calories: log.total_calories,
      total_protein: log.total_protein,
      total_carbs: log.total_carbs,
      total_fats: log.total_fats,
      locked_at: log.locked_at ?? null,
      created_at: log.created_at ?? null,
    });
    const items = await db.getAllAsync<MealItem>(
      `SELECT id, daily_log_id, meal_type, item_name, serving_size, calories, protein, carbs, fats, created_at
       FROM meal_items WHERE daily_log_id = ? ORDER BY created_at`,
      log.id
    );
    for (const item of items) {
      meal_items.push({
        id: item.id,
        daily_log_id: item.daily_log_id,
        meal_type: item.meal_type,
        item_name: item.item_name,
        serving_size: item.serving_size,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fats: item.fats,
        created_at: item.created_at ?? null,
      });
    }
  }

  const recipeRows = await db.getAllAsync<CustomRecipe>(
    `SELECT id, recipe_name, total_calories, total_protein, total_carbs, total_fats, created_at
     FROM custom_recipes ORDER BY created_at`
  );
  const custom_recipes: BackupCustomRecipe[] = [];
  const recipe_ingredients: BackupRecipeIngredient[] = [];
  for (const recipe of recipeRows) {
    custom_recipes.push({
      id: recipe.id,
      recipe_name: recipe.recipe_name,
      total_calories: recipe.total_calories,
      total_protein: recipe.total_protein,
      total_carbs: recipe.total_carbs,
      total_fats: recipe.total_fats,
      created_at: recipe.created_at ?? null,
    });
    const ingredients = await db.getAllAsync<RecipeIngredient>(
      `SELECT id, recipe_id, food_name, quantity_grams_or_units, calories, protein, carbs, fats
       FROM recipe_ingredients WHERE recipe_id = ?`,
      recipe.id
    );
    for (const ingredient of ingredients) {
      recipe_ingredients.push({
        id: ingredient.id,
        recipe_id: ingredient.recipe_id,
        food_name: ingredient.food_name,
        quantity_grams_or_units: ingredient.quantity_grams_or_units,
        calories: ingredient.calories,
        protein: ingredient.protein,
        carbs: ingredient.carbs,
        fats: ingredient.fats,
      });
    }
  }

  const cacheRows = await db.getAllAsync<FoodCacheRow>(
    `SELECT ${FOOD_CACHE_COLUMNS} FROM food_cache ORDER BY food_name`
  );

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    profile: profileRow
      ? {
          username: profileRow.username,
          target_calories: profileRow.target_calories,
          target_protein: profileRow.target_protein,
          target_carbs: profileRow.target_carbs ?? 0,
          target_fats: profileRow.target_fats ?? 0,
          created_at: profileRow.created_at,
        }
      : null,
    daily_logs,
    meal_items,
    custom_recipes,
    recipe_ingredients,
    food_cache: cacheRows.map(rowToCacheItem).map((item) => ({
      id: item.id,
      barcode: item.barcode,
      external_id: item.external_id,
      food_name: item.food_name,
      brand: item.brand,
      calories_per_100g: item.calories_per_100g,
      protein_per_100g: item.protein_per_100g,
      carbs_per_100g: item.carbs_per_100g,
      fats_per_100g: item.fats_per_100g,
      portions: item.portions ?? null,
      source: item.source,
    })),
    app_flags: await getAllPrefs(db),
  };
}

/**
 * Replaces the ENTIRE user dataset with a validated backup payload, inside
 * one transaction: either everything restores or nothing does. Children are
 * deleted before parents (foreign keys are on) and inserted after them.
 * Rows keep their original ids so a backup round-trips to the same device
 * byte-for-byte; the backup wins on any id collision.
 */
export async function restoreAllData(payload: BackupPayload): Promise<void> {
  const db = await openAppDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM meal_items");
    await db.runAsync("DELETE FROM recipe_ingredients");
    await db.runAsync("DELETE FROM custom_recipes");
    await db.runAsync("DELETE FROM daily_logs");
    await db.runAsync("DELETE FROM food_cache");
    await db.runAsync("DELETE FROM profile");

    if (payload.profile) {
      await db.runAsync(
        `INSERT INTO profile (id, username, target_calories, target_protein, target_carbs, target_fats, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        LOCAL_USER_ID,
        payload.profile.username,
        payload.profile.target_calories,
        payload.profile.target_protein,
        payload.profile.target_carbs,
        payload.profile.target_fats,
        payload.profile.created_at
      );
    }

    for (const log of payload.daily_logs) {
      await db.runAsync(
        `INSERT INTO daily_logs (id, user_id, log_date, total_calories, total_protein, total_carbs, total_fats, locked_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        log.id,
        LOCAL_USER_ID,
        log.log_date,
        log.total_calories,
        log.total_protein,
        log.total_carbs,
        log.total_fats,
        log.locked_at,
        log.created_at
      );
    }

    for (const item of payload.meal_items) {
      await db.runAsync(
        `INSERT INTO meal_items (id, daily_log_id, meal_type, item_name, serving_size, calories, protein, carbs, fats, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.id,
        item.daily_log_id,
        item.meal_type,
        item.item_name,
        item.serving_size,
        item.calories,
        item.protein,
        item.carbs,
        item.fats,
        item.created_at
      );
    }

    for (const recipe of payload.custom_recipes) {
      await db.runAsync(
        `INSERT INTO custom_recipes (id, user_id, recipe_name, total_calories, total_protein, total_carbs, total_fats, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        recipe.id,
        LOCAL_USER_ID,
        recipe.recipe_name,
        recipe.total_calories,
        recipe.total_protein,
        recipe.total_carbs,
        recipe.total_fats,
        recipe.created_at
      );
    }

    for (const ingredient of payload.recipe_ingredients) {
      await db.runAsync(
        `INSERT INTO recipe_ingredients (id, recipe_id, food_name, quantity_grams_or_units, calories, protein, carbs, fats)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ingredient.id,
        ingredient.recipe_id,
        ingredient.food_name,
        ingredient.quantity_grams_or_units,
        ingredient.calories,
        ingredient.protein,
        ingredient.carbs,
        ingredient.fats
      );
    }

    for (const food of payload.food_cache) {
      await db.runAsync(
        `INSERT INTO food_cache (id, barcode, external_id, food_name, brand, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g, portions_json, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        food.id,
        food.barcode,
        food.external_id,
        food.food_name,
        food.brand,
        food.calories_per_100g,
        food.protein_per_100g,
        food.carbs_per_100g,
        food.fats_per_100g,
        food.portions && food.portions.length > 0 ? JSON.stringify(food.portions) : null,
        food.source
      );
    }

    await db.runAsync("DELETE FROM user_prefs");
    const flags = { ...payload.app_flags };
    if (flags[USER_PREF_KEYS.onboarding] === undefined) {
      // A hand-made backup without the flag must not lock a user out of the
      // data it just restored: a named profile implies onboarding completed.
      flags[USER_PREF_KEYS.onboarding] =
        payload.profile?.username != null
          ? "true"
          : (await getAppPref(USER_PREF_KEYS.onboarding)) ?? "false";
    }
    for (const [key, value] of Object.entries(flags)) {
      await setPrefOn(db, key, value);
    }
  });
}

/** Forget the memoized connection so the next call reopens (retry path). */
export function resetDbConnection(): void {
  dbPromise = null;
}
