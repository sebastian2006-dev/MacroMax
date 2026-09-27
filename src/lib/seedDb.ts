/**
 * Tier 1 data source — the pre-bundled, read-only ingredient database.
 *
 * `assets/seed.db` (built by `npm run build:db` from IFCT 2017 + USDA) ships
 * inside the app bundle. On first use it is copied once into the app's
 * document directory, because SQLite cannot reliably open files that live
 * inside the bundled APK/IPA. The copy is then opened with expo-sqlite and
 * searched through its FTS5 index (`ingredients_fts`), which returns matches
 * in a few milliseconds — fully offline, zero API cost.
 *
 * Every call is guarded so a missing/corrupt seed or a native-module failure
 * (e.g. web) degrades to "no Tier 1 results" instead of crashing the search
 * pipeline. Tier 2 (user cache) and Tier 3 (remote APIs) pick up the slack.
 */

import { SearchResult } from "@/src/types";
import { toSearchResult } from "@/src/lib/foodResults";

/** Cap on Tier 1 rows per query — the unified sort trims to 30 anyway. */
const SEED_MATCH_LIMIT = 15;

/**
 * Bump when scripts/build-db.js output changes materially (schema, data
 * fixes). A mismatch makes the bundled copy replace the device's stale one.
 */
const SEED_VERSION = "3";

export type SeedDatabaseLike = {
  execAsync: (source: string) => Promise<unknown>;
  getAllAsync: <T>(source: string, ...params: unknown[]) => Promise<T[]>;
  closeSync: () => void;
};

let dbPromise: Promise<SeedDatabaseLike | null> | null = null;

/**
 * Reset the memoized open/copy promise. Exists for tests and hot reload —
 * the pipeline never needs to call this.
 */
export function resetSeedDbForTests(): void {
  dbPromise = null;
}

/**
 * Open (and lazily copy) the bundled seed database.
 *
 * Returns null when the seed cannot be provided (native module missing,
 * bundled asset unavailable, copy failed) — callers treat that as "Tier 1
 * has nothing to offer this session" and fall through to Tier 2.
 */
export async function getSeedDb(): Promise<SeedDatabaseLike | null> {
  if (!dbPromise) {
    dbPromise = openSeedDb().catch((error) => {
      console.warn("Seed DB unavailable — Tier 1 disabled for this session", error);
      return null;
    });
  }
  return dbPromise;
}

async function openSeedDb(): Promise<SeedDatabaseLike | null> {
  // expo-asset resolves the Metro resource; the bundle copy is read-only.
  const { Asset } = await import("expo-asset");
  const asset = Asset.fromModule(require("../../assets/seed.db"));
  await asset.downloadAsync();
  if (!asset.localUri) {
    console.warn("Seed DB asset not found in the bundle — did you run `npm run build:db`?");
    return null;
  }

  // Copy into the document directory. The version marker makes app updates
  // replace a STALE device copy (e.g. the pre-fix DB whose USDA Foundation
  // rows had NULL macros) — without it, "skip if exists" would keep serving
  // old data forever.
  const { File, Directory, Paths } = await import("expo-file-system");
  const destDir = new Directory(Paths.document, "db");
  destDir.create({ idempotent: true, intermediates: true });
  const dest = new File(destDir, "seed.db");
  const marker = new File(destDir, "seed.version");

  const markerText = marker.exists ? await marker.text() : "";

  const needsCopy =
    !dest.exists ||
    dest.size === 0 ||
    !marker.exists ||
    markerText.trim() !== SEED_VERSION;

  if (needsCopy) {
    const bundled = new File(asset.localUri);
    try {
      // `copy()` rejects with "Destination already exists" when the target is
      // present, so clear the stale copy first. The marker is written ONLY
      // after a successful copy — otherwise the next launch would think the
      // device is up to date while still serving the old DB.
      if (dest.exists) {
        dest.delete();
      }
      await bundled.copy(dest, { overwrite: true });
      marker.write(SEED_VERSION);
    } catch (error) {
      // Degrade to a warning: Tier 2/3 still work, and the marker mismatch
      // makes the next launch retry the refresh.
      console.warn("Failed to refresh seed DB copy", error);
    }
  }

  const { openDatabaseSync } = await import("expo-sqlite");
  // Absolute directory URI — relative names fail native parent-resolution.
  const db = openDatabaseSync("seed.db", {}, destDir.uri);
  return db as unknown as SeedDatabaseLike;
}

/**
 * FTS5 prefix search over the seed database.
 *
 * The stored query is `token*` per word, so "chick" matches "Chicken",
 * "chicken curry" matches both words anywhere in name/category. `ORDER BY
 * bm25()` puts tightest matches first; the unified relevancy sort in
 * foodResults.ts re-ranks afterwards.
 */
export async function searchSeedDb(query: string): Promise<SearchResult[]> {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => /^[\p{L}\p{N}]+$/u.test(token))
    .slice(0, 6);
  if (tokens.length === 0) {
    return [];
  }

  const db = await getSeedDb();
  if (!db) {
    return [];
  }

  // FTS5 MATCH syntax: each token as a quoted prefix ("tok" *).
  const matchExpression = tokens.map((token) => `"${token}" *`).join(" ");
  try {
    const rows = await db.getAllAsync<{
      id: number;
      name: string;
      category: string | null;
      calories: number | null;
      protein: number | null;
      carbs: number | null;
      fats: number | null;
      fiber: number | null;
      source: string | null;
    }>(
      // COALESCE keeps NULLs out of the UI math (NULL propagates through
      // arithmetic and can produce NaN/0 displays downstream).
      `SELECT i.id, i.name, i.category,
              COALESCE(i.calories, 0) AS calories,
              COALESCE(i.protein, 0)  AS protein,
              COALESCE(i.carbs, 0)    AS carbs,
              COALESCE(i.fats, 0)     AS fats,
              COALESCE(i.fiber, 0)    AS fiber,
              i.source
       FROM ingredients_fts f
       JOIN ingredients i ON i.id = f.rowid
       WHERE ingredients_fts MATCH ?
       ORDER BY bm25(ingredients_fts)
       LIMIT ?`,
      matchExpression,
      SEED_MATCH_LIMIT
    );

    return rows.map((row) =>
      toSearchResult({
        id: `seed-${row.id}`,
        barcode: null,
        external_id: `seed-${row.id}`,
        food_name: row.name,
        brand: row.category,
        // Number() coerces any TEXT-typed values SQLite hands back.
        calories_per_100g: round2(Number(row.calories) || 0),
        protein_per_100g: round2(Number(row.protein) || 0),
        carbs_per_100g: round2(Number(row.carbs) || 0),
        fats_per_100g: round2(Number(row.fats) || 0),
        portions: null,
        source: "fallback",
      })
    );
  } catch (error) {
    console.warn("Seed DB search failed", error);
    return [];
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
