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
      // Light "Emerald Ring" design tokens (mirrored in src/theme/colors.ts).
      //
      // The brand emerald #10B981 is bright: 2.54:1 on white both as text and
      // under white text. So it stays a FILL token, and `.ink` siblings carry
      // every label/value (primary-ink 5.5:1, secondary-ink 6.7:1,
      // tertiary-ink 5.0:1). test/themeContrast.test.ts asserts all of it.
      // ------------------------------------------------------------------
      colors: {
        // App background (airy mint-gray) + card surface (pure white)
        surface: "#F4F9F6",
        card: "#FFFFFF",
        // Text ramp: ink 17.9:1, muted 4.8:1, faint 4.6:1 on white
        ink: {
          DEFAULT: "#0F172A",
          muted: "#5F7085",
          faint: "#66788E"
        },
        // Primary — brand emerald (fill) + its text-safe ink
        primary: {
          DEFAULT: "#10B981",
          ink: "#047857",
          deep: "#047857",
          soft: "#E7F8F1"
        },
        // Secondary — Protein (logo electric-blue arc)
        secondary: {
          DEFAULT: "#3B82F6",
          ink: "#1D4ED8",
          deep: "#1D4ED8",
          soft: "#E8F1FE"
        },
        // Tertiary — Fats & warnings (logo amber arc)
        tertiary: {
          DEFAULT: "#F5A623",
          ink: "#B45309",
          deep: "#B45309",
          soft: "#FDF3E3"
        },
        // Carbs — the mint-green sibling of the top-left arc
        mint: {
          DEFAULT: "#34D399",
          soft: "#5EEAD4",
          ink: "#0F766E"
        },
        // Destructive actions
        danger: {
          DEFAULT: "#DC2626",
          soft: "#FDECEC"
        },
        // Brand gradient: the logo's three arcs (decorative beds and pills).
        // `wordmark*` are the deeper siblings used when the gradient IS text.
        brand: {
          mint: "#2DD4BF",
          mintSoft: "#5EEAD4",
          blue: "#3B82F6",
          blueSoft: "#7CB6FB",
          amber: "#F5A623",
          amberSoft: "#FBD07C",
          wordmarkFrom: "#047857",
          wordmarkMid: "#1D4ED8",
          wordmarkTo: "#B45309"
        },
        // Inset fields, chips and tracks; `deep` is the selected/stronger step
        wash: {
          DEFAULT: "#EDF3EF",
          deep: "#E3EDE7"
        },
        // Borders, dividers and dashed outlines
        edge: "#E5E7EB"
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
