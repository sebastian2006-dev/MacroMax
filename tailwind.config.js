/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  // Class-based dark mode: prevents nativewind's color-scheme observer from
  // throwing "Cannot manually set color scheme, as dark mode is type 'media'"
  // on web (tailwind's default "media" strategy is incompatible with it).
  darkMode: "class",
  theme: {
    extend: {
      // ------------------------------------------------------------------
      // Vitality Core design tokens (DESIGN.md)
      // ------------------------------------------------------------------
      colors: {
        // App background / surface (clean, cool near-white)
        surface: "#F9F9FF",
        // Elevated card surface
        card: "#FFFFFF",
        // Text ramp derived from the core ink color #111C2D
        ink: {
          DEFAULT: "#111C2D",
          muted: "#5D6B7E",
          faint: "#98A1B0"
        },
        // Primary — Calories / Success (Vibrant Green)
        primary: {
          DEFAULT: "#006C49",
          deep: "#005239",
          soft: "#E3F1EC"
        },
        // Secondary — Protein (Deep Blue)
        secondary: {
          DEFAULT: "#0058BE",
          deep: "#004494",
          soft: "#E7EFFA"
        },
        // Tertiary — Carbs & Fats (Bright Orange)
        tertiary: {
          DEFAULT: "#9D4300",
          deep: "#7A3400",
          soft: "#F8EEE6"
        },
        // Destructive actions (delete etc.) — kept minimal & tinted
        danger: {
          DEFAULT: "#DC2626",
          soft: "#FCEBEA"
        },
        // Neutral wash for segmented controls, tracks & subtle fills
        wash: {
          DEFAULT: "#F1F3FA",
          deep: "#E6E9F3"
        }
      },
      // Manrope is the only typeface in the app. Each weight is registered as
      // its own native font family (Android cannot synthesize weights), so we
      // expose semantic classes: font-manrope, font-manrope-medium,
      // font-manrope-semibold, font-manrope-bold, font-manrope-extrabold.
      fontFamily: {
        manrope: ["Manrope_400Regular"],
        "manrope-medium": ["Manrope_500Medium"],
        "manrope-semibold": ["Manrope_600SemiBold"],
        "manrope-bold": ["Manrope_700Bold"],
        "manrope-extrabold": ["Manrope_800ExtraBold"]
      },
      // ------------------------------------------------------------------
      // NOTE: no boxShadow tokens here on purpose. NativeWind's runtime
      // `shadow-*` utilities crash expo-router screens with a bogus
      // "Couldn't find a navigation context" error (NativeWind bug, see
      // expo/expo#38423). Use the SHADOWS style objects from
      // "@/src/theme/shadows" instead (elevation on Android, soft shadows
      // on iOS/web).
      // ------------------------------------------------------------------
    }
  },
  plugins: []
};
