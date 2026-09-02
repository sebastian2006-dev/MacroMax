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

## Project Structure

```text
app/                    # Expo Router screens (tabs: index=Today, log, recipe, analytics, settings)
components/             # Reusable UI components (incl. ScrollableTabBar, AddFoodSheet, ServingInput)
src/hooks/              # Data hooks
src/lib/                # Local storage, nutrition, provider clients (fatSecret.ts, openFoodFacts.ts)
src/theme/              # Vitality Core semantic colors
src/types/              # Shared TypeScript types
```
