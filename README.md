<div align="center">
  <img src="./assets/macromax_A_ring_1024.png" width="120" alt="MacroMax app icon" />
</div>

# MacroMax

[![CI](https://github.com/sebastian2006-dev/MacroMax/actions/workflows/ci.yml/badge.svg)](https://github.com/sebastian2006-dev/MacroMax/actions/workflows/ci.yml)
[![Website](https://img.shields.io/badge/website-macromaxweb.vercel.app-000000?logo=vercel&logoColor=white)](https://macromaxweb.vercel.app/)

**An offline-first macro & nutrition tracker for Android.**

Built natively with React Native (Expo SDK 57), TypeScript strict mode and NativeWind — no account, no cloud: every byte of user data lives in an on-device SQLite database that survives app updates, with one-tap JSON backup/restore for moving devices.

![Platform](https://img.shields.io/badge/platform-Android-3DDC84?logo=android&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-SDK%2057-000020?logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tests](https://img.shields.io/badge/tests-331%20passing-brightgreen)
![Storage](https://img.shields.io/badge/storage-SQLite%20only-003B57?logo=sqlite&logoColor=white)

---

## Table of Contents

- [Screenshots](#-screenshots)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Android Release Build](#android-release-build)
- [Build an APK without EAS](#build-an-apk-without-eas)
- [Environment Variables](#environment-variables)
- [Data Providers](#data-providers)
- [Testing](#testing)
- [CI](#ci)
- [Project Structure](#project-structure)

---

## 📱 Screenshots

| Today's Overview | Daily Log | Custom Dish Builder |
| :---: | :---: | :---: |
| <img src="./assets/SC1.jpeg" width="250" alt="Today's Overview" /> | <img src="./assets/SC5.jpeg" width="250" alt="Daily Log" /> | <img src="./assets/SC3.jpeg" width="250" alt="Custom Dish Builder" /> |

<div align="center">
  <table>
    <thead>
      <tr>
        <th align="center">Analytics Dashboard</th>
        <th align="center">Profile &amp; Settings</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td align="center"><img src="./assets/SC2.jpeg" width="250" alt="Analytics Dashboard" /></td>
        <td align="center"><img src="./assets/SC6.jpeg" width="250" alt="Profile &amp; Settings" /></td>
      </tr>
    </tbody>
  </table>
</div>

---

## Features

### First run

- **3-step onboarding** — name → daily goals (with a prominent *Set it later / Skip*) → a 3-slide walkthrough of Search / Log / Track. The completion flag lives in SQLite: it survives app updates and never replays unless app data is cleared.

### Tracking

- **Today's Overview** dashboard with animated goal rings (Calories · Protein) in the brand's high-contrast chart palette, plus low-intake nudges (time-gated, never naggy) and fat-limit warnings
- **Daily Log** for managing meals across Breakfast, Lunch, Dinner and Snacks/Extra, with **Lock & Save Day** — a locked day refuses further edits so reviewed totals can't drift
- **Custom Dish** builder — name a dish, pick ingredients + servings, save it as a one-tap loggable batch
- **Weekly strip** with logged-day dots and day-switching; ring animations re-fill per day
- **Time-aware greeting card** — hour-calibrated buckets (morning / midday / afternoon / evening / night) with a rotating phrase per bucket

### Food search

- Barcode scanning via `expo-camera` → **Open Food Facts V2** product endpoint
- Text search via **FatSecret Platform API** (OAuth 2.0, raw ingredients & dishes) + **Open Food Facts** (packaged products)
- **3-tier pipeline**: bundled SQLite ingredient database (FTS5, 8,379 foods from IFCT 2017 + USDA) → on-device cache → remote APIs, with strict relevance ranking applied identically at every tier
- **Debounced** input (~350 ms) — the pipeline fires once the user stops typing, never per keystroke
- Serving-aware logging: grams, pieces/units (egg, roti, banana…), and provider **standard portions** (including ml-based servings)

### Analytics

- Swipeable per-macro trend pages (calories / protein / carbs / fats) with **daily and monthly windows**, self-calibrating Y axes (headroom above the peak, never clipped), readable date labels and honest captions
- Macro-split donut with period totals and per-macro percentages
- Rolling 7-day averages per metric

### Data ownership

- **Export backup** — the entire dataset (logs, meals, recipes, goals, name, prefs) as pretty-printed JSON via the Android share sheet (Files, Gmail, Drive…)
- **Import backup** — pick a file, review a summary of what it contains, confirm, and restore in a single all-or-nothing transaction; the app then offers a reload
- Every table validated and sanitized on import — malformed rows are dropped, numbers coerced, hostile files rejected with a human-readable error

### Design system

- Light **"Emerald Ring"** theme built from the logo's own palette, with WCAG-checked contrast enforced by unit tests (bright hues fill, deep `.ink` siblings carry text)
- Tablet-aware layouts (600dp breakpoint: capped card widths, scaled type, comfy text measures)
- Manrope typeface, soft shadows, mint gradient CTAs

---

## Architecture

```
┌──────────────────────────────  app/ (Expo Router)  ─────────────────────────────┐
│  (tabs): Today · Log · Recipe · Analytics · Settings      login · search · scan │
└──────────────┬──────────────────────────────────────────────────┬──────────────┘
               │ hooks (useAuth, useProfile, useDailyLog, …)       │
┌──────────────▼──────────────────────────────────────────────────▼──────────────┐
│  src/lib — pure, unit-tested core                                                │
│   nutrition · trendSeries · servingUnits · greeting · walkthrough · backupData   │
│   api (3-tier search) · fatSecret · openFoodFacts · fallbackFoods · seedDb      │
└──────────────┬───────────────────────────────────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────────────────────────────┐
│  src/lib/db.ts — ONE SQLite database (macromax.db) in FileSystem.documentDirectory│
│  profile · daily_logs · meal_items · custom_recipes · recipe_ingredients          │
│  food_cache · user_prefs (key/value) · WAL · FK on · day-locking · backup I/O     │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Storage is SQLite-only.** The user database lives at `<FileSystem.documentDirectory>/db/macromax.db`, which Android preserves across app updates (and only removes on uninstall). Identity (name), onboarding/walkthrough flags and every goal sit in the same file as the food logs — the `user_prefs` key/value table replaced AsyncStorage entirely, and the package is no longer a dependency. A bundled read-only ingredient database (`assets/seed.db`, FTS5) feeds Tier 1 of search and is never written at runtime.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | React Native 0.86 / Expo SDK 57 |
| Routing | Expo Router (custom gradient tab bar) |
| Language | TypeScript (`strict: true`) |
| Styling | NativeWind (Tailwind) + semantic theme tokens |
| Storage | **expo-sqlite** (user data + prefs) + bundled FTS5 seed DB |
| Animation | react-native-reanimated (UI-thread ring fills) |
| Charts | `react-native-chart-kit` + hand-rolled SVG (rings, donut) |
| Native integrations | expo-camera, expo-file-system, expo-sharing, expo-document-picker, expo-updates (reload-after-restore) |
| Lint / Test | ESLint 9 (eslint-config-expo) · Node built-in test runner via tsx |

---

## Getting Started

### Prerequisites

- Node.js 24 and npm
- An Android device or emulator
- For the dev client: Android SDK (or use Expo Go for UI-only work — note the SQLite/shared/picker flows need a build)

### Installation

```bash
npm install
cp .env.example .env   # add your FatSecret keys (text search)
npm start
```

### Building a dev client / APK

```bash
npx expo run:android                # dev client (recommended)
# release APK:
npx expo prebuild
cd android && ./gradlew assembleRelease

# or ask GitHub to do it, without EAS — see "Build an APK without EAS"
```

`app.config.js` picks the ABI set from `BUILD_TARGET`: `physical` builds the ARM-only APK real phones need, `emulator` keeps `x86_64` so an AVD can install it, and unset falls back to the EAS profile.

Useful scripts:

```bash
npm run build:db      # rebuild assets/seed.db from scripts/inputs CSVs
npm run build:icons   # regenerate launcher/splash art from the canonical logo
npm run ci            # lint + typecheck + tests (what CI runs)
```

---

## Android Release Build

Release builds are tuned for the phones this app actually runs on — **every ARM Android phone shipped since 2017**. None of it is written into `android/`, which is git-ignored build output; it is declared once in [app.config.js](app.config.js) and re-applied by the Expo CLI on every prebuild (local, CI and EAS alike).

| Setting | Value | What it buys |
| --- | --- | --- |
| `minSdkVersion` | `24` (Android 7.0) | Pinned floor: 2017-era devices install, and a future SDK raising the floor fails the config loudly instead of dropping them silently |
| `enableMinifyInReleaseBuilds` | `true` | Runs **R8** on release builds: strips and obfuscates unreachable Java/Kotlin, shrinks the dex, optimizes the rest |
| `enableShrinkResourcesInReleaseBuilds` | `true` | Removes `res/` entries nothing reachable references (requires R8 above) |
| `enablePngCrunchInReleaseBuilds` | `true` | AAPT2 recompresses packaged PNGs |
| `extraProguardRules` | [plugins/android-proguard-rules.pro](plugins/android-proguard-rules.pro) | The R8 keeps library consumer rules cannot supply |
| `buildArchs` | ARM-only for `preview`/`production`, all four ABIs otherwise | Ships `arm64-v8a` + `armeabi-v7a` to devices; keeps `x86_64` so x86 AVDs and the dev client still install |

### ARM coverage

| ABI | Role | Devices |
| --- | --- | --- |
| `arm64-v8a` | 64-bit ARM — mandatory on Google Play since 2019 | Practically every phone since 2017 (64-bit Snapdragon / Exynos / Kirin / MediaTek SoCs) |
| `armeabi-v7a` | 32-bit ARM | 2017-2019 budget phones and 32-bit installs of 64-bit chips |
| `x86`, `x86_64` | Emulator / AVD only | Never part of a store build |

Debug and development builds keep all four ABIs so an `x86_64` AVD (and expo-dev-client) still work. Store builds drop x86 entirely, which is where tens of megabytes of unused Hermes/JSI/Reanimated/Worklets `.so` payload would otherwise sit in every download. The GitHub pipeline below selects the ARM-only set with `BUILD_TARGET=physical`, no EAS profile required.

### R8 specifics

- Reanimated, Worklets and TurboModules are instantiated by name from C++/JS, so [plugins/android-proguard-rules.pro](plugins/android-proguard-rules.pro) keeps those entry points plus the source-file/line-table attributes the Play Console needs to de-minify a trace. Everything else is left to the libraries' own consumer rules (React Native, Expo Modules, expo-updates, react-native-svg and Reanimated all ship them), so R8 stays free to delete what nothing references.
- **Crash reports are only readable with the mapping file** — keep `android/app/build/outputs/mapping/release/mapping.txt` (or the mapping artifact) from every release build; without it a Play Console trace is obfuscated names.
- A prebuild regenerates `android/`, so re-run `npm run build:icons` afterwards — the launcher/boot-splash artwork and the hand-tuned splash theme are not expressible in `app.json`.

### What the switches actually remove

Measured on this project (release APK, both ARM ABIs, debug-signed, same source):

| Artifact | R8 + resource shrinking | Both off |
| --- | --- | --- |
| dex (`classes*.dex`) | 17.8 MiB | 53.9 MiB |
| `resources.arsc` | 1.43 MiB | 1.66 MiB |
| Whole APK | **65.8 MiB** | 78.3 MiB |

R8 also leaves a 63 MB mapping file (668k lines) and a `usage.txt` of ~85k removed declarations — that is what makes the settings worth keeping, and why turning them off should be a deliberate decision rather than a silent one.

Check any produced APK:

```bash
unzip -l android/app/build/outputs/apk/release/app-release.apk | grep "lib/"   # expect arm64-v8a + armeabi-v7a only
ls android/app/build/outputs/mapping/release/                                   # R8 mapping + seeds
zipalign -c -P 16 -v 4 android/app/build/outputs/apk/release/app-release.apk    # 16 KB page alignment (Android 15+)
```

The ARM-only payload is 46.5 MiB of that APK (27.6 MiB `arm64-v8a` + 18.9 MiB `armeabi-v7a`); the page-size check matters because Android 15+ devices can run with 16 KB pages and Play rejects releases whose bundled `.so` files are only 4 KB aligned.

---

## Build an APK without EAS

[.github/workflows/build-apk.yml](.github/workflows/build-apk.yml) builds a release APK — or a Play bundle — **on a GitHub runner, with no Expo account, no EAS quota and no Android SDK on your machine**. Start it from **Actions → Build APK → Run workflow**, or push a tag like `v1.0.0` to build *and* publish a GitHub Release.

Because `android/` is git-ignored build output, the workflow does exactly what you would do by hand:

| # | Step | Why |
| --- | --- | --- |
| 1 | `npm ci` | the committed lockfile *is* the build's dependency set |
| 2 | `expo prebuild --platform android --no-install` | app.json + app.config.js (plugins, R8, ABI set, `minSdkVersion`) → the native project |
| 3 | `npm run build:icons` | launcher and boot-splash art that `app.json` cannot express |
| 4 | `./gradlew :app:assembleRelease` | the R8-shrunk, resource-shrunk, ARM-only, signed APK |

Gradle only starts once the run has proved the generated project really carries the release config: it asserts `reactNativeArchitectures`, `android.minSdkVersion=24`, R8, resource shrinking and PNG crunching in `android/gradle.properties`, and that the committed R8 keeps reached `proguard-rules.pro`. A regression in [app.config.js](app.config.js) therefore fails the pipeline instead of quietly shipping a fatter or x86-carrying APK.

### Inputs

| Input | Options | Result |
| --- | --- | --- |
| `abis` | `arm-only` *(default)* | `arm64-v8a` + `armeabi-v7a` — what every ARM phone since 2017 has (`BUILD_TARGET=physical`) |
| | `all-abis` | adds `x86`/`x86_64` so an emulator can install the APK too (`BUILD_TARGET=emulator`) |
| `artifact` | `apk` *(default)*, `aab`, `both` | installable APK, Play bundle, or both |

### Signing

Out of the box the APK is signed with the debug key the Expo template ships — the same artifact `expo run:android --variant release` produces: **installable on any phone, rejected by Play**. Set all three of `RELEASE_KEYSTORE_BASE64` (base64 of your `.jks`), `RELEASE_KEYSTORE_PASSWORD` and `RELEASE_KEYSTORE_ALIAS` as repository secrets and the run re-signs with your own key instead, then verifies the result.

### Optional provider keys

`EXPO_PUBLIC_FATSECRET_CLIENT_ID`, `EXPO_PUBLIC_FATSECRET_CLIENT_SECRET`, `EXPO_PUBLIC_FATSECRET_REGION` and `EXPO_PUBLIC_OFF_USER_AGENT` are picked up from repository secrets if you define them — see [Environment Variables](#environment-variables). Like a local `.env`, they are compiled *into* the bundle. Leave them unset and the workflow still builds; the app just answers searches from its offline tiers.

### What the run leaves behind

| Artifact | Retention | Contents |
| --- | --- | --- |
| `macromax-apk` / `macromax-aab` | 30 days | `MacroMax-<version>-<arm\|all-abis>.apk` / `.aab` |
| `build-metadata` | 90 days | `BUILD-INFO.txt` (commit, run URL, how it was signed) and the **R8 `mapping.txt`** needed to read any crash trace |

Before uploading, the artifact is verified independently of Gradle: both ARM ABIs present (and no `x86` payload in an `arm-only` build), 16 KB page alignment (`zipalign -c -P 16`, required on Android 15+), a valid signature (`apksigner verify`) and a warning if the APK grows past 90 MiB. The job summary reports the plan plus the ABI list, size and SHA-256.

A first run takes roughly 20-40 minutes — it downloads the NDK and compiles the Reanimated/Worklets C++ for two ABIs from scratch; the npm and Gradle caches make later runs much quicker.

### Cutting a release

```bash
git tag v1.0.0
git push origin v1.0.0
```

The tag build runs the same gates and the same build, then attaches the APK, the bundle, `BUILD-INFO.txt` and the R8 mapping to a GitHub Release for that tag.

EAS is untouched by all of this: [eas.json](eas.json) and its profiles still work, and `BUILD_TARGET` is only ever set by this workflow.

---

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `EXPO_PUBLIC_FATSECRET_CLIENT_ID` | For text search | FatSecret Platform API client ID |
| `EXPO_PUBLIC_FATSECRET_CLIENT_SECRET` | For text search | FatSecret client secret — keep out of release binaries (see `.env.example`) |
| `EXPO_PUBLIC_FATSECRET_REGION` | No | Result region, e.g. `IN` |
| `EXPO_PUBLIC_OFF_USER_AGENT` | Recommended | Descriptive Open Food Facts User-Agent |

The app degrades gracefully without keys: local tiers (seed DB, cache, fallback list) still answer searches.

---

## Data Providers

| Flow | Provider | Notes |
| --- | --- | --- |
| Tier 1 (offline) | Bundled `assets/seed.db` (FTS5) | 8,379 foods — IFCT 2017 + USDA, quality-deduped, energy-gated |
| Tier 2 (offline) | `food_cache` table | Every past lookup, replayed instantly |
| Tier 3 (online) | FatSecret Platform API | OAuth 2.0 client credentials; standard portions (g & ml) |
| Tier 3 (online) | Open Food Facts | V2 product endpoint (barcode) + search API |
| Last resort | Built-in reference list | Searches never hang empty |
| Ordering | Unified 3-tier relevance sort | Tier 1 raw/basic → Tier 2 cooked/prepared → Tier 3 complex dishes |

---

## Testing

**331 / 331 unit tests passing** plus lint (`--max-warnings 0`) and strict `tsc --noEmit`. Tests exercise the **real modules** — pure logic, no native or network dependencies — so they verify actual app behaviour rather than copies of it.

```bash
npm test           # run all unit tests
npm run lint       # eslint, zero warnings allowed
npm run typecheck  # strict TypeScript check (app + tests)
npm run ci         # everything CI runs
```

| Suite | Tests | What it ensures |
| --- | --- | --- |
| Nutrition engine | 57 | Macro math, goal mapping + **goal-input parsing** (blank/junk/clamps), default-goal resolution, alerts (fats = limit, not goal), date helpers, rolling averages, meal grouping |
| Search pipeline (`api`) | 51 | Dedupe (barcode → externalId → source+name), cache eligibility & row mapping, 3-tier relevance sorting, local-first sufficiency policy |
| Serving units | 50 | Piece-size rules, grams conversion, quantity parsing, portion multipliers, pluralisation |
| Trend series & axes | 24 | Daily/monthly bucketing, year rollover, headroom axis ceilings that never clip the peak, tick formatting |
| Greeting calibration | 17 | Full 24-hour bucket table, boundary flips, the no-lunch-in-morning regression, tiling, Ionicons glyph existence |
| HTTP helpers | 16 | Numeric coercion, RFC-4648 base64 for OAuth |
| Offline fallback DB | 15 | Substring search, macro values, result shape |
| Backup payload | 14 | Round-trip serialization, hostile-input sanitization, version guarding, summary lines |
| FatSecret mapping | 14 | Description parsing, per-100g derivation, ml portions, rejection of unusable foods |
| Theme contrast (WCAG) | 12 | Every text/background pair ≥ AA, chart hues visible on light **and** dark fields, the "never white-on-mint" guard |
| Sync-status store | 12 | Header pill modes, pub/sub |
| Open Food Facts | 10 | Per-100g/per-serving mapping, kJ→kcal, portions, rejection rules |
| Ring palette | 9 | Hue-family + pairwise-separation guards, track = own-color tint, `withAlpha` clamping |
| Tab-bar layout | 7 | Geometry vs font scale; labels never truncate at 100–300% |
| Debounce | 6 | Trailing-edge semantics, cancel/flush, burst collapse |
| Android release config | 17 | R8 / resource-shrinking / PNG-crunch switches, `minSdkVersion` floor, the committed proguard keeps, and the `BUILD_TARGET` ABI override the APK pipeline uses |

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main`/`feature/**` and every PR targeting `main`:

1. **Lint → Type-check → Test** — one sequential gate (`npm run ci`), Node 24, npm-cached.
2. **Metro bundle smoke check** — after the gates pass, `expo export` compiles the Android bundle so an unresolvable import (a red-screen-on-device class of bug that typecheck can't see) fails CI instead of your phone.

The README badge above always reflects the latest `main` run.

Producing the artifacts is a second, intentionally manual workflow — [Build an APK without EAS](#build-an-apk-without-eas) — so a build only ever happens when someone asks for one.

---

## Project Structure

```text
MacroMax/
├── .github/
│   └── workflows/
│       ├── build-apk.yml              # APK/AAB pipeline: prebuild → Gradle → verify → artifact (no EAS)
│       └── ci.yml                     # CI pipeline (lint → typecheck → test → bundle smoke check)
├── app/                               # Expo Router screens
│   ├── (tabs)/
│   │   ├── _layout.tsx                # Bottom tab bar layout & navigation
│   │   ├── index.tsx                  # Today's Overview dashboard & goal rings
│   │   ├── log.tsx                    # Daily Log (Breakfast, Lunch, Dinner, Snacks)
│   │   ├── recipe.tsx                 # Custom Dish builder & saved batches
│   │   ├── analytics.tsx              # Analytics dashboard, trends & macro-split donut
│   │   └── settings.tsx               # Profile & daily goal targets settings
│   ├── _layout.tsx                    # Root layout, theme provider & onboarding guard
│   ├── login.tsx                      # 3-step walkthrough & onboarding
│   ├── scanner.tsx                    # Barcode scanner screen (camera)
│   └── search.tsx                     # Food search screen with sliding bottom sheet
├── assets/                            # Static media & bundled databases
│   ├── favicon.png                    # Web/app favicon
│   ├── macromax_A_ring_1024.png       # Canonical app logo (1024x1024)
│   ├── SC1.jpeg                       # Screenshot: Today's Overview
│   ├── SC2.jpeg                       # Screenshot: Analytics Dashboard
│   ├── SC3.jpeg                       # Screenshot: Custom Dish Builder
│   ├── SC5.jpeg                       # Screenshot: Daily Log
│   ├── SC6.jpeg                       # Screenshot: Profile & Settings
│   └── seed.db                        # Bundled Tier-1 FTS5 SQLite ingredient database
├── components/                        # Reusable UI components
│   ├── AddFoodSheet.tsx               # Add food sliding sheet modal
│   ├── AppHeader.tsx                  # Header with time-aware greeting & sync pill
│   ├── BarcodeScannerModal.tsx        # Camera barcode scanner modal
│   ├── DynamicGreeting.tsx            # Hour-calibrated greeting banner
│   ├── IngredientResultsSheet.tsx     # Custom dish ingredient picker
│   ├── LimitAlertCard.tsx             # Fat limit and dietary alerts
│   ├── LowIntakeAlertCard.tsx         # Time-gated low-intake nudges
│   ├── MacroCard.tsx                  # Macro stat overview cards
│   ├── MacroDonut.tsx                 # Hand-rolled SVG macro-split donut chart
│   ├── MacroProgressBar.tsx           # Linear macro progress bar
│   ├── MacroRing.tsx                  # Animated UI-thread circular progress ring
│   ├── MealSlot.tsx                   # Meal item container with delete & edit
│   ├── MealTargetSheet.tsx            # Meal goal configuration sheet
│   ├── RequireAuth.tsx                # Onboarding completion check wrapper
│   ├── ScrollableTabBar.tsx           # Custom gradient bottom tab bar
│   ├── SearchBar.tsx                  # Debounced food search input
│   ├── ServingInput.tsx               # Serving quantity & unit selector
│   └── WeekStrip.tsx                  # Weekly day-selector strip with indicator dots
├── scripts/                           # Build & generation utilities
│   ├── build-db.js                    # Rebuilds assets/seed.db from CSV datasets
│   ├── generate-android-icons.js      # Generates Android adaptive launcher icons
│   └── inputs/                        # Raw nutritional datasets (IFCT 2017 & USDA)
│       ├── foundation_food (2).csv
│       ├── foundation_food_nutrient.csv
│       ├── ifct2017_compositions.csv
│       ├── sr_food.csv
│       └── sr_food_nutrient.csv
├── src/
│   ├── hooks/                         # Custom React hooks
│   │   ├── useAuth.ts                 # User profile & onboarding status
│   │   ├── useDailyLog.ts             # Day-specific food logging & totals
│   │   ├── useDebouncedValue.ts       # Debounce utility hook
│   │   ├── useFoodSearch.ts           # 3-tier food search orchestration
│   │   ├── useProfile.ts              # Goals, name, & profile state
│   │   ├── useSyncStatus.ts           # Search source sync status state
│   │   └── useWeekLoggedDates.ts      # Active logged dates for the weekly strip
│   ├── lib/                           # Core business logic (pure, unit-tested)
│   │   ├── api.ts                     # 3-tier search pipeline (local DB, cache, remote)
│   │   ├── authStore.ts               # In-memory auth/profile store
│   │   ├── backup.ts                  # JSON file import/export via share sheet
│   │   ├── backupData.ts              # Backup serialization & hostile-input validation
│   │   ├── db.ts                      # SQLite database operations & migrations
│   │   ├── debounce.ts                # Pure debounce function
│   │   ├── fallbackFoods.ts           # Built-in offline fallback food database
│   │   ├── fatSecret.ts               # FatSecret Platform API client (OAuth 2.0)
│   │   ├── foodLabels.ts              # Food item naming & label utilities
│   │   ├── foodResults.ts             # Search result deduplication & ranking
│   │   ├── greeting.ts                # Time-of-day greeting calibration
│   │   ├── http.ts                    # Defensive HTTP & base64 helpers
│   │   ├── nutrition.ts               # Nutrition calculations, scaling & goal parsing
│   │   ├── openFoodFacts.ts           # Open Food Facts API client & parser
│   │   ├── seedDb.ts                  # Bundled seed database queries (FTS5)
│   │   ├── servingUnits.ts            # Serving unit conversion (grams, units, portions)
│   │   ├── syncStatus.ts              # Sync status state pub/sub store
│   │   ├── tabBarLayout.ts            # Tab bar typography & scale metrics
│   │   ├── trendSeries.ts             # Chart series bucketing & headroom axis math
│   │   └── walkthrough.ts            # Onboarding walkthrough slide definitions
│   ├── theme/                         # Design system tokens
│   │   ├── colors.ts                  # Emerald Ring palette & WCAG-compliant tokens
│   │   ├── shadows.ts                 # Platform elevation & shadow presets
│   │   └── typography.ts              # Font families & scale definitions
│   └── types/                         # Shared TypeScript interfaces
│       └── index.ts                   # Core data models (FoodItem, DailyLog, etc.)
├── test/                              # 331 unit tests (Node test runner + tsx)
│   ├── api.test.ts                    # 3-tier search pipeline tests
│   ├── appConfig.test.ts              # ARM ABI policy + R8/release-shrinking guards
│   ├── backupData.test.ts             # Backup sanitization & round-trip tests
│   ├── debounce.test.ts               # Debounce timing tests
│   ├── fallbackFoods.test.ts          # Offline fallback food database tests
│   ├── fatSecret.test.ts              # FatSecret mapping & regex parsing tests
│   ├── greeting.test.ts               # Greeting bucket & boundary flip tests
│   ├── http.test.ts                   # HTTP helpers & base64 encoding tests
│   ├── nutrition.test.ts              # Nutrition math, goal parsing & macro tests
│   ├── openFoodFacts.test.ts          # Open Food Facts mapping & kJ conversion tests
│   ├── ringColors.test.ts             # Progress ring palette separation tests
│   ├── servingUnits.test.ts           # Serving units & portion conversion tests
│   ├── syncStatus.test.ts             # Sync status store & mode resolution tests
│   ├── tabBarLayout.test.ts           # Tab bar metrics & label fit tests
│   ├── themeContrast.test.ts          # WCAG contrast ratio compliance tests
│   └── trendSeries.test.ts            # Chart trend series & headroom ceiling tests
├── plugins/
│   └── android-proguard-rules.pro     # R8 keeps appended to the generated release build
├── .gitattributes                     # Binary file attributes
├── .gitignore                         # Git ignore rules
├── app.config.js                      # Dynamic Expo config (ARM ABIs, R8, resource shrinking)
├── app.json                           # Expo app configuration
├── babel.config.js                    # Babel config (NativeWind)
├── eas.json                           # Expo Application Services configuration
├── eslint.config.mjs                  # ESLint 9 configuration (eslint-config-expo)
├── global.css                         # Tailwind/NativeWind global stylesheets
├── global.d.ts                        # Global CSS module declarations
├── metro.config.js                    # Metro bundler configuration
├── nativewind-env.d.ts                # NativeWind type definitions
├── package.json                       # Project dependencies & scripts
├── tailwind.config.js                 # Tailwind CSS configuration
└── tsconfig.json                      # Strict TypeScript compiler options
```
