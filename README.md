# MacroMax

Standalone native macro & nutrition tracking Android application built with React Native (Expo), TypeScript, NativeWind, and on-device local storage.

## Features

- **Today's Overview** dashboard with animated goal rings (Calories · Protein) and macro bars (Carbs · Fats)
- **Daily Log** for managing meals across Breakfast, Lunch, Dinner and Snacks/Extra
- **Custom Dish** builder — name a dish, pick ingredients + servings, save it as a one-tap loggable batch
- Customizable daily targets for calories, protein, carbs, and fats
- Horizontal **sliding-window bottom navigation** (safe-area aware) across Today, Daily Log, Custom Dish, Analytics and Profile
- Barcode scanning via `expo-camera` → **Open Food Facts V2** product endpoint
- Text search via **FatSecret Platform API** (OAuth 2.0, raw ingredients & dishes) + **Open Food Facts** (packaged products)
- Serving-aware logging: grams, pieces/units, and provider **standard portions** (including ml-based servings)
- Debounced, input-isolated search UI (no typing latency), offline cache for repeat lookups
- Weekly/monthly analytics

## Tech Stack

- React Native / Expo SDK 52
- Expo Router v4 (sliding custom tab bar)
- TypeScript (`strict: true`)
- NativeWind (Tailwind CSS) with the **Vitality Core** design tokens (Manrope)
- Local storage via AsyncStorage (offline-first, no account required)
- `react-native-chart-kit` for analytics charts

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure food providers in `.env` (see `.env.example`):

   - `EXPO_PUBLIC_FATSECRET_CLIENT_ID` / `EXPO_PUBLIC_FATSECRET_CLIENT_SECRET` — FatSecret Platform API (required for ingredient/dish text search).
   - `EXPO_PUBLIC_OFF_USER_AGENT` — custom Open Food Facts User-Agent (recommended).

3. Start the app:

   ```bash
   npm start
   ```

4. Build a standalone Android APK:

   ```bash
   npx expo prebuild
   cd android && ./gradlew assembleRelease
   ```

## Data Providers

| Flow                    | Provider                                                       | Notes                                             |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Barcode scanning        | Open Food Facts V2 `…/api/v2/product/{barcode}.json`           | Custom `User-Agent` header required               |
| Packaged products       | Open Food Facts search (`cgi/search.pl`)                       | Serving sizes mapped to portions                  |
| Raw ingredients & dishes| FatSecret Platform API (`food.search`/`foods.search`, `food.get`, OAuth 2.0 client-credentials) | Serving table → standard portions (g & ml) |
| Repeat lookups          | On-device AsyncStorage cache                                   | Offline-friendly                                  |
| Last resort             | Built-in reference list                                        | Never hangs empty                                 |

## Testing

**Status: ✅ 182 / 182 unit tests passing** (Node built-in test runner via `tsx`), plus a strict `tsc --noEmit` type-check. The tests exercise the **real `src/lib` modules** (pure logic only — no native/network dependencies), so they verify actual app behaviour, not copies of it.

```bash
npm test           # run all unit tests
npm run typecheck  # strict TypeScript check (app + tests)
npm run ci         # typecheck + tests (what CI runs)
```

GitHub Actions (`.github/workflows/ci.yml`) runs both jobs on every push to `main`/`feature/*` and on PRs targeting `main`.

| Suite                         | File                              | Tests | What it ensures                                                         |
| ----------------------------- | --------------------------------- | ----- | ---------------------------------------------------------------------- |
| Nutrition engine              | `test/nutrition.test.ts`          | 38    | Macro add/scale/totals math, goal mapping, low-intake alerts at the 50% threshold, date helpers (`toLocalDateString`, `startOfWeek`, `addDays`, `getDateNDaysAgo`), rolling 7-day averages, meal-slot grouping |
| Serving units                 | `test/servingUnits.test.ts`       | 50    | Piece-size rules (egg/roti/banana… incl. specificity & case/whitespace), grams conversion, quantity parsing, grams/pieces/portion modes, portion multipliers, pluralisation, settings reference table |
| Food-search pipeline (`api`)  | `test/api.test.ts`                | 27    | Result dedupe (barcode → externalId → source+name), cache eligibility (only FatSecret/Open Food Facts), cache-row mapping incl. 2-dp rounding & portions, cache-row → result mapping, legacy `ifct2017`/`usda` row migration |
| Offline fallback database     | `test/fallbackFoods.test.ts`      | 15    | Case-insensitive substring search, macro values of key foods, Indian staple coverage, result shape (`fallback` source, `100 g` serving, stable ids) |
| HTTP helpers                  | `test/http.test.ts`               | 16    | Defensive numeric coercion (`toNumber`) and RFC-4648 base64 used for FatSecret OAuth Basic auth (`toBase64`) |
| FatSecret mapping             | `test/fatSecret.test.ts`          | 14    | Description parsing (`Per 100g - …`), `100 g`/default serving → per-100g derivation, single-serving JSON quirk, ml portions (1 ml ≈ 1 g), portion cap/dedupe, rejection of unusable foods |
| Sync-status store             | `test/syncStatus.test.ts`         | 12    | Header pill modes: online / local / cached / mixed / offline / idle, pub/sub notifications & unsubscribing |
| Open Food Facts mapping       | `test/openFoodFacts.test.ts`      | 10    | Per-100g mapping, kJ→kcal fallback, per-serving → per-100g scaling, standard portions from `serving_size`/`serving_quantity`, 2-dp precision, rejection of unusable products |

While building this suite, the tests surfaced and fixed two real defects: a missing export (`mapFatSecretSearchItem`) and, more importantly, a **cache-eligibility bug** in the search pipeline (results were filtered against the whole result object instead of its `source` — every remote result was silently skipped when writing the offline cache) and a **FatSecret description parser bug** (calories in the `Per 100g - Calories: …` segment were parsed as 0 because of an over-anchored regex).

## Project Structure

```text
app/                    # Expo Router screens (tabs: index=Today, log, recipe, analytics, settings)
components/             # Reusable UI components (incl. ScrollableTabBar, AddFoodSheet, ServingInput)
src/hooks/              # Data hooks
src/lib/                # Local storage, nutrition, provider clients (fatSecret.ts, openFoodFacts.ts)
src/theme/              # Vitality Core semantic colors + shadow styles
src/types/              # Shared TypeScript types
test/                   # Unit tests (Node test runner + tsx)
.github/workflows/      # CI pipeline (typecheck + unit tests)
```
