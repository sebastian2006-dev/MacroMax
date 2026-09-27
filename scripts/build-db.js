#!/usr/bin/env node
/**
 * build-db.js — Mobile-optimized seed database builder.
 *
 * Parses the Indian Food Composition Tables (IFCT 2017) and USDA FoodData
 * Central (SR Legacy + Foundation) CSVs and emits a compressed SQLite file
 * with an FTS5 full-text search index into ./assets/seed.db.
 *
 * Usage:  node scripts/build-db.js
 * Reqs:   Node >= 22.5 (built-in `node:sqlite` DatabaseSync)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { DatabaseSync } = require('node:sqlite');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT = path.join(__dirname, '..');
const INPUT_DIR = path.join(__dirname, 'inputs');
const OUTPUT_PATH = path.join(ROOT, 'assets', 'seed.db');

// FDC standard nutrient ids (all per 100 g):
//   1008 Energy (kcal) · 1003 Protein (g) · 1005 Carbohydrates (g)
//   1004 Total lipid/fat (g) · 1079 Fiber, total dietary (g)
const FDC_NUTRIENTS = {
  1008: 'calories',
  1003: 'protein',
  1005: 'carbs',
  1004: 'fats',
  1079: 'fiber',
};

// IFCT 2017 columns (per 100 g edible portion). "enerc" is handled separately.
const IFCT_COLUMNS = { protcnt: 'protein', choavldf: 'carbs', fatce: 'fats', fibtg: 'fiber' };

const SR_FOOD = path.join(INPUT_DIR, 'sr_food.csv');
const SR_NUTRIENT = path.join(INPUT_DIR, 'sr_food_nutrient.csv');
const FOUNDATION_FOOD = path.join(INPUT_DIR, 'foundation_food (2).csv');
const FOUNDATION_NUTRIENT = path.join(INPUT_DIR, 'foundation_food_nutrient.csv');
const IFCT_CSV = path.join(INPUT_DIR, 'ifct2017_compositions.csv');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const trimOrNull = (v) => {
  const s = typeof v === 'string' ? v.trim() : v;
  return s === undefined || s === null || s === '' ? null : s;
};

/** Trimmed float rounded to 2 decimals; null for empty/invalid values. */
const num2 = (v) => {
  const s = trimOrNull(v);
  if (s === null) return null;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

const round2 = (n) => Math.round(n * 100) / 100;

/** Stream a CSV file, calling `onRow` for every parsed record. */
function readCsv(file, onRow) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(file)
      .pipe(
        csv({
          // IFCT's first header is "\uFEFFcode" (UTF-8 BOM) — strip it and
          // trim every header so lookups like r.code / r.fdc_id always work.
          mapHeaders: ({ header }) => header.replace(/^\uFEFF/, '').trim(),
        })
      )
      .on('data', (row) => {
        try {
          onRow(row);
        } catch (err) {
          err.message = `${path.basename(file)} row error: ${err.message}`;
          reject(err);
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Parsers — each folds its dataset into a Map<key, record>
// ---------------------------------------------------------------------------

/**
 * IFCT 2017. Energy is stored in kJ ("enerc") and converted to kcal;
 * all other values are grams per 100 g already.
 */
async function parseIfct(map) {
  let count = 0;
  await readCsv(IFCT_CSV, (r) => {
    const name = trimOrNull(r.name);
    if (!name) return;

    const macros = {};
    for (const [col, macro] of Object.entries(IFCT_COLUMNS)) macros[macro] = num2(r[col]);
    const enercKj = num2(r.enerc);
    macros.calories = enercKj === null ? null : round2(enercKj / 4.184); // kJ -> kcal

    map.set(`ifct:${r.code}`, { name, category: 'Indian Food (IFCT 2017)', macros, source: 'ifct2017' });
    count++;
  });
  console.log(`  IFCT 2017: ${count} foods`);
}

/** USDA SR Legacy: join sr_food.csv with sr_food_nutrient.csv on fdc_id. */
async function parseSrLegacy(map) {
  const foods = new Map(); // fdc_id -> description
  await readCsv(SR_FOOD, (r) => {
    const fdcId = trimOrNull(r.fdc_id);
    const description = trimOrNull(r.description);
    if (fdcId && description) foods.set(fdcId, description);
  });

  const collected = new Map(); // fdc_id -> { macro: value }
  await readCsv(SR_NUTRIENT, (r) => {
    const fdcId = trimOrNull(r.fdc_id);
    const macro = FDC_NUTRIENTS[r.nutrient_id];
    if (!fdcId || !macro || !foods.has(fdcId)) return;
    const value = num2(r.amount);
    if (value === null) return;
    let m = collected.get(fdcId);
    if (!m) collected.set(fdcId, (m = {}));
    m[macro] = value;
  });

  let count = 0;
  for (const [fdcId, macros] of collected) {
    map.set(`sr:${fdcId}`, {
      name: foods.get(fdcId),
      category: 'USDA SR Legacy',
      macros,
      source: 'usda_sr_legacy',
    });
    count++;
  }
  console.log(`  USDA SR Legacy: ${count} foods (of ${foods.size} in food file)`);
}

/**
 * USDA Foundation: join foundation_food.csv with foundation_food_nutrient.csv.
 * The food dump mixes "foundation_food" rows with acquisition / sub-sample
 * rows that repeat the same fdc_id, so we keep the first row per fdc_id.
 * Nutrient rows also repeat (acquisition + sub-samples); first value wins.
 */
async function parseFoundation(map) {
  const seen = new Set();
  const foods = new Map(); // fdc_id -> { description, dataType }
  await readCsv(FOUNDATION_FOOD, (r) => {
    const fdcId = trimOrNull(r.fdc_id);
    const description = trimOrNull(r.description);
    if (!fdcId || !description || seen.has(fdcId)) return;
    seen.add(fdcId);
    foods.set(fdcId, { description, dataType: trimOrNull(r.data_type) });
  });

  const collected = new Map(); // fdc_id -> { macro: value, dataType }
  await readCsv(FOUNDATION_NUTRIENT, (r) => {
    const fdcId = trimOrNull(r.fdc_id);
    const macro = FDC_NUTRIENTS[Number(r.nutrient_id)];
    if (!fdcId || !macro || !foods.has(fdcId)) return;
    let m = collected.get(fdcId);
    if (!m) collected.set(fdcId, (m = { macros: {}, dataType: foods.get(fdcId).dataType }));
    if (m.macros[macro] === undefined) {
      const value = num2(r.amount);
      if (value !== null) m.macros[macro] = value; // first non-null wins
    }
  });

  let count = 0;
  for (const [fdcId, entry] of collected) {
    map.set(`fd:${fdcId}`, {
      name: foods.get(fdcId).description,
      category: 'USDA Foundation',
      macros: entry.macros,
      source: 'usda_foundation',
      // TRUE foundation_food rows outrank acquisition/sub-sample siblings
      // during name dedupe (their nutrient sets are the complete ones).
      typeRank: entry.dataType === 'foundation_food' ? 0 : 1,
    });
    count++;
  }
  console.log(`  USDA Foundation: ${count} foods (of ${foods.size} in food file)`);
}

// ---------------------------------------------------------------------------
// Portion mapping
// ---------------------------------------------------------------------------

/**
 * Smart portion rules — first regex that matches the lower-cased name wins.
 * A "100 g" row is always added as the universal fallback.
 */
const PORTION_RULES = [
  { rx: /\begg\b/, unit: '1 Large Egg', grams: 50 },
  { rx: /\bspinach\b/, unit: '1 Cup', grams: 30 },
  { rx: /\brice\b/, unit: '1 Cup (cooked)', grams: 158 },
  { rx: /\b(beans?|lentils?|rajma|chana|dal)\b/, unit: '1 Cup (cooked)', grams: 177 },
  { rx: /\bmilk\b(?!.*(powder|condensed|evaporated))/, unit: '1 Cup', grams: 244 },
];

function portionsFor(name) {
  const lower = name.toLowerCase();
  const matched = PORTION_RULES.find((rule) => rule.rx.test(lower));
  const portions = [{ unit_name: '100 g', gram_weight: 100 }];
  if (matched) portions.unshift({ unit_name: matched.unit, gram_weight: matched.grams });
  return portions;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Building seed database…');
  console.log(`  node ${process.version}`);

  const inputs = [
    ['IFCT 2017', IFCT_CSV],
    ['USDA SR food', SR_FOOD],
    ['USDA SR nutrients', SR_NUTRIENT],
    ['USDA Foundation food', FOUNDATION_FOOD],
    ['USDA Foundation nutrients', FOUNDATION_NUTRIENT],
  ];
  for (const [label, file] of inputs) {
    console.log(`  ${fs.existsSync(file) ? '✓' : '✗ MISSING'} ${label}: ${path.relative(ROOT, file)}`);
  }
  const missing = inputs.filter(([, f]) => !fs.existsSync(f));
  if (missing.length) {
    console.error(`\nMissing input files: ${missing.map(([, f]) => path.relative(ROOT, f)).join(', ')}`);
    process.exit(1);
  }

  // 1) Ingest all datasets into one map (provenance-keyed, so ids never collide).
  const map = new Map();
  await parseIfct(map);
  await parseSrLegacy(map);
  await parseFoundation(map);

  // 2) Deduplicate by name (case-insensitive). Map preserves insertion order
  //    and IFCT is inserted first, so IFCT wins over USDA on collisions and
  //    re-runs stay deterministic.
  //
  //    QUALITY-AWARE: the Foundation dump repeats the same food name across
  //    sample / sub-sample / acquisition rows (different fdc_ids) whose
  //    nutrient coverage varies — some siblings carry only fiber or none of
  //    the 5 macros. Picking the FIRST sibling blindly is what produced rows
  //    with NULL calories/protein in the app ("0 g" search results). Instead,
  //    keep the sibling with the MOST complete macro set; ties break by
  //    source priority (IFCT > SR > Foundation), then by true
  //    foundation_food rows over acquisition artifacts.
  const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fats', 'fiber'];
  const macroCount = (m) => MACRO_KEYS.filter((k) => m && m[k] !== null && m[k] !== undefined).length;
  const SOURCE_RANK = { ifct2017: 0, usda_sr_legacy: 1, usda_foundation: 2 };

  const byName = new Map();
  let deduped = 0;
  for (const rec of map.values()) {
    const key = rec.name.toLowerCase();
    const current = byName.get(key);
    if (!current) {
      byName.set(key, rec);
      continue;
    }
    deduped++;
    const a = {
      source: SOURCE_RANK[current.source] ?? 9,
      count: macroCount(current.macros),
      type: current.typeRank ?? 0,
    };
    const b = {
      source: SOURCE_RANK[rec.source] ?? 9,
      count: macroCount(rec.macros),
      type: rec.typeRank ?? 0,
    };
    const challengerWins =
      b.count > a.count ||
      (b.count === a.count && (b.source < a.source || (b.source === a.source && b.type < a.type)));
    if (challengerWins) byName.set(key, rec);
  }

  // Drop rows that are unusable in a macro tracker. The Foundation dump
  // carries the 5 core macros for only a small subset of fdc_ids — the rest
  // are acquisition/sample rows with only specialty compounds (amino acids,
  // fatty acids). Those rows kept e.g. fiber set but calories NULL, and
  // surfaced in the app as "0 g" results. ENERGY IS THE GATE: no calories
  // value (NULL) = no usable nutrition row. (SR rows all carry 1008 energy;
  // legitimately-zero-calorie foods still have a non-NULL 0.)
  for (const [key, rec] of byName) {
    const calories = rec.macros.calories;
    if (calories === null || calories === undefined || macroCount(rec.macros) === 0) {
      byName.delete(key);
    }
  }
  console.log(`  ${byName.size} unique ingredients (${deduped} duplicates dropped)`);

  // 3) Create the database + normalized schema + FTS5 index.
  if (fs.existsSync(OUTPUT_PATH)) fs.unlinkSync(OUTPUT_PATH);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const db = new DatabaseSync(OUTPUT_PATH);

  // Build-time pragmas only (nothing shipped to the app needs to persist).
  db.exec('PRAGMA journal_mode = DELETE;'); // no -wal/-shm sidecar files
  db.exec('PRAGMA synchronous = OFF;');

  db.exec(`
    CREATE TABLE ingredients (
      id       INTEGER PRIMARY KEY,
      name     TEXT NOT NULL,
      category TEXT,
      calories REAL, -- kcal per 100 g
      protein  REAL, -- g per 100 g
      carbs    REAL, -- g per 100 g
      fats     REAL, -- g per 100 g
      fiber    REAL, -- g per 100 g
      source   TEXT
    );

    CREATE TABLE ingredient_servings (
      id            INTEGER PRIMARY KEY,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
      unit_name     TEXT NOT NULL,
      gram_weight   REAL NOT NULL
    );

    CREATE INDEX idx_servings_ingredient ON ingredient_servings(ingredient_id);

    CREATE VIRTUAL TABLE ingredients_fts USING fts5(
      name,
      category,
      content='ingredients',
      content_rowid='id'
    );

    -- Keep the external-content FTS index in sync (standard pattern).
    CREATE TRIGGER ingredients_ai AFTER INSERT ON ingredients BEGIN
      INSERT INTO ingredients_fts(rowid, name, category)
      VALUES (new.id, new.name, new.category);
    END;
    CREATE TRIGGER ingredients_ad AFTER DELETE ON ingredients BEGIN
      INSERT INTO ingredients_fts(ingredients_fts, rowid, name, category)
      VALUES ('delete', old.id, old.name, old.category);
    END;
    CREATE TRIGGER ingredients_au AFTER UPDATE ON ingredients BEGIN
      INSERT INTO ingredients_fts(ingredients_fts, rowid, name, category)
      VALUES ('delete', old.id, old.name, old.category);
      INSERT INTO ingredients_fts(rowid, name, category)
      VALUES (new.id, new.name, new.category);
    END;
  `);

  // 4) Insert everything inside one explicit transaction.
  const insertIngredient = db.prepare(
    'INSERT INTO ingredients (name, category, calories, protein, carbs, fats, fiber, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertServing = db.prepare(
    'INSERT INTO ingredient_servings (ingredient_id, unit_name, gram_weight) VALUES (?, ?, ?)'
  );

  db.exec('BEGIN;');
  let ingredientCount = 0;
  let servingCount = 0;
  for (const rec of byName.values()) {
    const m = rec.macros;
    // node:sqlite binds null but rejects undefined — coerce missing macros.
    const { lastInsertRowid } = insertIngredient.run(
      rec.name,
      rec.category,
      m.calories ?? null,
      m.protein ?? null,
      m.carbs ?? null,
      m.fats ?? null,
      m.fiber ?? null,
      rec.source
    );
    for (const portion of portionsFor(rec.name)) {
      insertServing.run(lastInsertRowid, portion.unit_name, portion.gram_weight);
      servingCount++;
    }
    ingredientCount++;
  }
  db.exec('COMMIT;');

  // 5) Compact the FTS index, then VACUUM to shrink the file.
  db.exec("INSERT INTO ingredients_fts(ingredients_fts) VALUES('optimize');");
  db.exec('VACUUM;');
  db.close();

  const bytes = fs.statSync(OUTPUT_PATH).size;
  console.log(`  ✓ ${path.relative(ROOT, OUTPUT_PATH)} — ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  ingredients: ${ingredientCount} · servings: ${servingCount}`);
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
