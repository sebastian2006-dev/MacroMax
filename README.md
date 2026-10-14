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
![Tests](https://img.shields.io/badge/tests-420%20passing-brightgreen)
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
- **Collapsible month calendar** — a dropdown above the strip opens the whole month, where every day shows whether anything was logged (filled dot) or not, with today ringed and the selected day filled. The strip follows your selection, and the panel stretches into the page rather than over it: it is laid out in normal flow with a fixed six-row, whole-pixel grid (see [monthGrid.ts](src/lib/monthGrid.ts)), so expanding it pushes the rings and cards below down and can never overlap them
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

### Meal reminders

- **Four alarms, one per meal** — Breakfast, Lunch, Dinner and Snacks/Extra, each with its own time, weekdays and name
- **Scheduled by Android itself** (`expo-notifications` → `AlarmManager`), so a reminder still pops up when MacroMax is closed, killed or swiped out of Recents; pending reminders are re-armed automatically after a reboot
- **Ring once or repeat** — pick any set of weekdays (or *Every day*) to repeat, or switch on **Ring once**: it fires at the next occurrence and then turns itself off until you switch it back on, exactly like a one-off alarm
- **Samsung-style editor** — a snap-scrolling hour/minute/am-pm wheel above a sheet card with the day chips (Sunday in red), an underlined *Alarm name* field and Cancel/Save, restyled into the app's own light Emerald Ring palette
- **Friendly, not naggy** — the notification carries the reminder's name and a rotating, human line per meal; tapping it opens the Daily Log
- **Arrives on time** — Android 14+ denies exact alarms by default, so the alarms screen offers a one-tap deep link to *Alarms & reminders* plus a Battery-settings shortcut for OEM power savers. Without that access the reminder still arrives, just possibly a few minutes late
- **Backed up with everything else** — the reminder config lives in `user_prefs`, so a backup/restore carries it, and the app re-arms the OS schedule on the next launch
- **Expo Go safe by construction** — importing `expo-notifications` throws on Android inside Expo Go (remote push was removed from it in SDK 53), so the package is never imported statically: [notifications.ts](src/lib/notifications.ts) loads it lazily *behind* an Expo Go guard, the app boots normally there, the alarms screen says a development build is required, and the settings you enter are kept for when you install one

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
│  (tabs): Today · Log · Recipe · Analytics · Settings   login · search · scan · alarms │
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
| Native integrations | expo-camera, expo-file-system, expo-sharing, expo-document-picker, expo-updates (reload-after-restore), expo-notifications (scheduled meal reminders), expo-intent-launcher (exact-alarm settings) |
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

Out of the box the APK is signed with the debug key the Expo template ships — the same artifact `expo run:android --variant release` produces: **installable on any phone, rejected by Play**. Set all three of `RELEASE_KEYSTORE_BASE64` (base64 of your `.jks`), `RELEASE_KEYSTORE_PASSWORD` and `RELEASE_KEYSTORE_ALIAS` as repository secrets and an `apk`/`both` build re-signs with your own key instead, then verifies the result. An `aab`-only run has no APK to re-sign, so Play needs your own upload key for that path.

### Reminder permissions

The APK requests `SCHEDULE_EXACT_ALARM` (declared in [app.json](app.json)) so meal reminders can land on the minute; the notification permission itself and `RECEIVE_BOOT_COMPLETED` come from the `expo-notifications` manifest. `USE_EXACT_ALARM` is deliberately **not** requested — Android grants it automatically but Play restricts it to clock/calendar apps, and the alarms screen links to the system *Alarms & reminders* switch instead. [notificationConfig.test.ts](test/notificationConfig.test.ts) guards both the permission and the channel id.

### Optional provider keys

`EXPO_PUBLIC_FATSECRET_CLIENT_ID`, `EXPO_PUBLIC_FATSECRET_CLIENT_SECRET`, `EXPO_PUBLIC_FATSECRET_REGION` and `EXPO_PUBLIC_OFF_USER_AGENT` are picked up from repository secrets if you define them — see [Environment Variables](#environment-variables). Like a local `.env`, they are compiled *into* the bundle. Leave them unset and the build is unaffected: only FatSecret-backed text search goes away (Open Food Facts needs no key and still serves both search and barcode lookups, on top of the bundled database and cache).

### What the run leaves behind

| Artifact | Retention | Contents |
| --- | --- | --- |
| `macromax-apk` / `macromax-aab` | 30 days | `MacroMax-<version>-<arm\|all-abis>.apk` / `.aab` |
| `build-metadata` | 90 days | `BUILD-INFO.txt` (commit, run URL, how it was signed) and the **R8 `mapping.txt`** needed to read any crash trace |

Before uploading, the artifact is verified independently of Gradle: both ARM ABIs present (and no `x86` payload in an `arm-only` build), 16 KB page alignment (`zipalign -c -P 16`, required on Android 15+), a valid signature (`apksigner verify`) and a warning if the APK grows past 90 MiB. The job summary reports the plan plus the ABI list, size and SHA-256.

A first run takes roughly 20-40 minutes — it downloads the NDK and compiles the Reanimated/Worklets C++ for two ABIs from scratch; the npm and Gradle caches make later runs much quicker.

### Cutting a release

Two ways, both publishing a GitHub Release with the APK, the bundle, `BUILD-INFO.txt` and the R8 mapping attached:

```bash
git tag v1.0.0
git push origin v1.0.0        # tag push → builds AND publishes
```

or **Actions → Build APK → Run workflow** with *Also publish a GitHub Release* ticked. The manual path uses `release_tag` when you fill it in and `v<app.json version>` otherwise (`1.2.3` is accepted as well as `v1.2.3`), validates it against `v<major>.<minor>.<patch>[-prerelease]`, and cuts the tag at the commit the run actually built (`--target $GITHUB_SHA`) — so a release no longer costs a trip to the Artifacts list. Re-running the same tag updates the existing release instead of failing on it.

> This is why the release job's condition is no longer tag-only: a `workflow_dispatch` run is on a branch, so the old `if: startsWith(github.ref, 'refs/tags/v')` silently skipped it for every hand-triggered build. [releaseWorkflow.test.ts](test/releaseWorkflow.test.ts) now asserts both paths.

EAS is untouched by all of this: [eas.json](eas.json) and its profiles still work, and `BUILD_TARGET` is only ever set by this workflow.

---

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `EXPO_PUBLIC_FATSECRET_CLIENT_ID` | For text search | FatSecret Platform API client ID |
| `EXPO_PUBLIC_FATSECRET_CLIENT_SECRET` | For text search | FatSecret client secret — keep out of release binaries (see `.env.example`) |
| `EXPO_PUBLIC_FATSECRET_REGION` | No | Result region, e.g. `IN` |
| `EXPO_PUBLIC_OFF_USER_AGENT` | Recommended | Descriptive Open Food Facts User-Agent |

Only FatSecret needs a key. Without the FatSecret pair, text search falls back to Open Food Facts (keyless) plus the bundled seed DB, cache and fallback list; barcode scanning and backup/restore are never key-dependent.

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

**420 / 420 unit tests passing** plus lint (`--max-warnings 0`) and strict `tsc --noEmit`. Tests exercise the **real modules** — pure logic, no native or network dependencies — so they verify actual app behaviour rather than copies of it.

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
| Month grid & calendar layout | 20 | Fixed 42-cell grid for every month (leap February included), Monday-first ordering, month ranges for the logged-dates query, and the grid-fit maths that keeps the expanded panel inside the card and its height identical month to month |
| Meal reminders | 42 | Weekday mapping (Monday-first UI → expo's Sunday = 1), `nextOccurrence` across today/tomorrow/week/month/year, one-shot vs per-weekday schedules, the "no days ticked = rings once" rule, hostile stored JSON, and the reconcile pass that switches a rung one-shot alarm off |
| Notification config | 16 | The `expo-notifications` plugin, the Android channel id, `SCHEDULE_EXACT_ALARM` present and `USE_EXACT_ALARM` deliberately absent, the package id the exact-alarm deep link targets, SDK-matched dependency versions, and a source scan proving neither `expo-notifications` nor `expo-intent-launcher` (both of which throw on import where their native half is missing) can reach the bundle's startup path |
| Release workflow | 11 | Manual builds can publish (inputs + job condition), artifacts merge into one directory, the tag is cut at the built commit, and the shipped tag-validation regex accepts `v1.2.3[-rc.1]` while rejecting junk |

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main`/`feature/**` and every PR targeting `main`:

1. **Lint → Type-check → Test** — one sequential gate (`npm run ci`), Node 24, npm-cached.
2. **Metro bundle smoke check** — after the gates pass, `expo export` compiles the Android bundle so an unresolvable import (a red-screen-on-device class of bug that typecheck can't see) fails CI instead of your phone.

The README badge above always reflects the latest `main` run.

Building the app is a second, deliberately manual workflow — a build only ever happens when someone asks for one:

| Workflow | Trigger | What it runs | What you get |
| --- | --- | --- | --- |
| [ci.yml](.github/workflows/ci.yml) | every push / PR | `npm run ci`, then a Metro bundle smoke check | a pass/fail badge — nothing to download |
| [build-apk.yml](.github/workflows/build-apk.yml) | **Actions → Build APK**, or a `v*` tag | those same gates, then `expo prebuild` + the Gradle release build | `MacroMax-<version>-arm.apk` or `.aab`, the R8 mapping, and a GitHub Release on tags **or on a manual run with *publish a release* ticked** |

`build-apk.yml` is the no-EAS path: inputs, signing, secrets and the post-build checks it enforces are documented under [Build an APK without EAS](#build-an-apk-without-eas).

---

## Project Structure

Only the parts you need to navigate: full file lists live in the directories themselves.

```text
MacroMax/
├── app/                  # Expo Router screens
│                         #   (tabs)/ Today · Log · Recipe · Analytics · Settings
│                         #   login · search · scanner · alarms · alarm-edit
│                         #   root and tab layouts
├── components/           # Reusable UI: cards, rings, donut, sheets, scanner, week strip,
│                         #   month calendar, time wheel, weekday chips, tab bar
├── src/
│   ├── hooks/            # useDailyLog · useFoodSearch · useProfile · useAuth · useSyncStatus
│   │                     #   useLoggedDatesInMonth · useMealReminders · …
│   ├── lib/              # Pure, unit-tested core
│   │                     #   db · nutrition · api (3-tier search) · seedDb · servingUnits
│   │                     #   fatSecret · openFoodFacts · fallbackFoods · foodResults
│   │                     #   backup · backupData · greeting · trendSeries · debounce · http
│   │                     #   monthGrid (calendar maths) · mealReminders (alarm rules)
│   │                     #   notifications (expo-notifications adapter)
│   ├── theme/            # Emerald Ring tokens: colors · shadows · typography
│   └── types/            # Shared models (FoodItem, DailyLog, …)
├── assets/               # Logo, favicon, screenshots, bundled seed.db (Tier-1 FTS5 foods)
├── scripts/              # build-db.js (rebuild seed.db) · generate-android-icons.js (+ inputs/ CSVs)
├── test/                 # 331 unit tests (Node test runner + tsx)
├── plugins/              # android-proguard-rules.pro — the R8 keeps for release builds
├── .github/workflows/    # ci.yml (gates) · build-apk.yml (APK/AAB, no EAS)
├── app.config.js         # Dynamic Expo config: R8, resource shrinking, ARM ABIs, minSdk
├── app.json              # Static Expo app config: icons, plugins, permissions
├── eas.json              # EAS profiles (optional — the GitHub pipeline does not use them)
└── config at the root    # package.json · tsconfig · eslint · babel · metro · tailwind/NativeWind
```
## License

MacroMax is distributed under the **Apache License 2.0 with Commons Clause v1.0**.

- **Personal & Educational Use:** You are free to view, fork, compile, modify, and run MacroMax for your personal use.
- **Commercial Restriction:** You may not sell MacroMax, distribute paid binaries, package it with ads, or publish monetized builds to app stores (Google Play, Apple App Store, etc.).

For commercial licensing requests, reach out to [sebastiankappen105@gmail.com].