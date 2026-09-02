/**
 * Semantic macro colors — Vitality Core palette (DESIGN.md).
 *
 * Calories map to Primary green (#006C49), Protein to Secondary blue
 * (#0058BE), and Carbs/Fats to Tertiary orange (#9D4300). Components should
 * import from here instead of hardcoding hex values so the design system
 * stays in one place.
 */

export const COLORS = {
  surface: "#F9F9FF",
  card: "#FFFFFF",
  ink: "#111C2D",
  inkMuted: "#5D6B7E",
  inkFaint: "#98A1B0",
  primary: "#006C49",
  primaryDeep: "#005239",
  primarySoft: "#E3F1EC",
  secondary: "#0058BE",
  secondaryDeep: "#004494",
  secondarySoft: "#E7EFFA",
  tertiary: "#9D4300",
  tertiaryDeep: "#7A3400",
  tertiarySoft: "#F8EEE6",
  danger: "#DC2626",
  dangerSoft: "#FCEBEA",
} as const;

/** Per-macro semantic color (used by rings, bars, summary cards). */
export const MACRO_COLORS = {
  calories: COLORS.primary,
  protein: COLORS.secondary,
  carbs: COLORS.tertiary,
  fats: COLORS.tertiary,
} as const;

/** Very light track tint derived from the macro color (ring/bar track). */
export const MACRO_TRACKS = {
  calories: "#E3F1EC",
  protein: "#E7EFFA",
  carbs: "#F3E3D4",
  fats: "#F8EEE6",
} as const;

export type MacroKey = keyof typeof MACRO_COLORS;

/** Soft tint background used for macro chips / pill rows. */
export const MACRO_SOFTS = {
  calories: COLORS.primarySoft,
  protein: COLORS.secondarySoft,
  carbs: COLORS.tertiarySoft,
  fats: "#F3E3D4",
} as const;

export const CHART_COLORS = {
  lineCalories: COLORS.primary,
  lineProtein: COLORS.secondary,
  grid: "#E4E8F0",
  label: COLORS.inkMuted,
} as const;
