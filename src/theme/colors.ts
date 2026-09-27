/**
 * MacroMax design tokens — light "Emerald Ring" theme.
 *
 * The brand emerald (#10B981) is a BRIGHT color: it measures 2.54:1 on white
 * as text, and white on it measures the same. A single token cannot serve both
 * "brand fill" and "readable label", so this palette keeps the two roles apart:
 *
 *   primary / secondary / tertiary   → fills, highlights, ring + chart accents
 *   primaryInk / secondaryInk / …    → text-safe siblings of the same hue
 *
 * Both halves are verified in test/themeContrast.test.ts (WCAG maths, AA 4.5:1
 * for text and 3:1 for UI graphics), so a palette edit cannot quietly ship an
 * unreadable combination. Tokens are mirrored as Tailwind classes in
 * tailwind.config.js.
 */

/** Raw colors sampled from the logo artwork (provenance for every token). */
export const PALETTE = {
  /** The logo artwork's own field color (its outer edge). */
  emeraldField: "#0B4335",
  /** Mint arc (top-left) — ring + chart accent. */
  mint: "#2DD4BF",
  /** Mint-green sibling of the top-left arc. */
  mintGreen: "#34D399",
  /** Electric blue arc (top-right) — protein. */
  blue: "#3B82F6",
  /** Amber gold arc (bottom) — fats. */
  amber: "#F5A623",
  /** The M: crisp mint white. */
  mintWhite: "#ECFDF5",
  white: "#FFFFFF",
  offWhite: "#F4F9F6",
  textDark: "#0F172A",
  textMuted: "#64748B",
} as const;

/**
 * Brand gradient — the logo's three arcs. `stops` is the decorative sweep used
 * behind the greeting card and the active tab pill; `wordmark` is the deeper
 * sibling trio used where the gradient IS the text (5:1+ on a light surface).
 */
export const BRAND = {
  mint: PALETTE.mint,
  blue: PALETTE.blue,
  amber: PALETTE.amber,
  stops: [PALETTE.mint, PALETTE.blue, PALETTE.amber] as const,
  mintGreen: PALETTE.mintGreen,
  /** Legible-on-light stops for gradient WORDMARKS and text. */
  wordmark: ["#047857", "#1D4ED8", "#B45309"] as const,
  mintSoft: "#5EEAD4",
  blueSoft: "#7CB6FB",
  amberSoft: "#FBD07C",
} as const;

/** Semantic surface + text ramp for the light theme. */
export const COLORS = {
  /** App background — airy mint-gray. */
  surface: "#F4F9F6",
  /** Cards, inputs, popups and sheets. */
  card: "#FFFFFF",
  /** Inset fills: chips, segmented tracks, ring troughs. */
  wash: "#EDF3EF",
  /** Stronger inset / selected chip. */
  washDeep: "#E3EDE7",
  /** Borders and dividers (cards, lists, inputs). */
  edge: "#E5E7EB",

  /** Headings and body copy. */
  ink: "#0F172A",
  /** Secondary copy. Nudged from #64748B, which measures 4.47:1 on the
   *  surface background — a hair under AA. */
  inkMuted: "#5F7085",
  /** Faint labels, placeholder text. */
  inkFaint: "#5C6E83",

  /** Brand emerald — buttons, active tabs, highlights (fill only). */
  primary: "#10B981",
  /** Text-safe emerald (5.5:1 on white) for labels, links, values. */
  primaryInk: "#047857",
  primarySoft: "#E7F8F1",
  /** Pressed / darker fill step. */
  primaryDeep: "#047857",

  /** Electric blue — protein. */
  secondary: "#3B82F6",
  secondaryInk: "#1D4ED8",
  secondarySoft: "#E8F1FE",

  /** Amber gold — fats, warnings, badges. */
  tertiary: "#F5A623",
  tertiaryInk: "#B45309",
  tertiarySoft: "#FDF3E3",

  /** Destructive actions. Darker than the usual #DC2626 so error copy keeps
   *  AA on the tinted `dangerSoft` chip (4.2:1 there, 6.5:1 on white). */
  danger: "#B91C1C",
  dangerSoft: "#FDECEC",
} as const;

/**
 * High-contrast chart ramp — the five hues the data-viz spec calls for. Every
 * hue is ≥ 3:1 against both the light card (#FFFFFF) and the dark emerald
 * field (#0B4335), and neighbouring hues are far apart on the color wheel, so
 * segments/lines are instantly distinguishable in BOTH themes.
 *
 * Charts (rings, donuts, trend lines) draw from this ramp; TEXT that names a
 * macro keeps MACRO_COLORS (the deep, text-safe siblings) — a 2px line in
 * #047857 disappears, but 16px bold text in it is perfectly readable.
 */
export const CHART_SERIES = {
  blue: "#3B82F6",
  mint: "#10B981",
  coral: "#EF4444",
  violet: "#8B5CF6",
  amber: "#F59E0B",
} as const;

/**
 * Per-macro color for VALUES and labels: the text-safe siblings, so the big
 * numbers in the Daily Summary are legible on white.
 */
export const MACRO_COLORS = {
  calories: COLORS.primaryInk,
  protein: COLORS.secondaryInk,
  carbs: "#0F766E",
  fats: COLORS.tertiaryInk,
} as const;

/**
 * Ring-specific macro colors for the dashboard progress rings, re-balanced for
 * distinguishability from the high-contrast CHART_SERIES ramp (a calories
 * mint that sat ~2° from carbs' mint-green made the two green rings hard to
 * tell apart): calories = neon mint, protein = electric blue, carbs = vivid
 * violet, fats = bright amber. ≥ 60° of hue between any two rings.
 */
export const RING_COLORS = {
  calories: CHART_SERIES.mint,
  protein: CHART_SERIES.blue,
  carbs: CHART_SERIES.violet,
  fats: CHART_SERIES.amber,
} as const;

/** Opacity of an unfilled ring track — a faint tint of its own fill color. */
export const RING_TRACK_ALPHA = 0.18;

/**
 * Add an alpha channel to a 6-digit hex color (`#RRGGBB` → `#RRGGBBAA`).
 * Anything that isn't plain hex (named colors, `rgb()`, an already-alpha hex)
 * is returned untouched so callers never receive an invalid value.
 */
export function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }
  const clamped = Math.min(1, Math.max(0, alpha));
  const byte = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
  return `${color}${byte.toUpperCase()}`;
}

export const CHART_COLORS = {
  /** Axis/label ink — never a series color. */
  label: COLORS.inkMuted,
  /** Faint dashed gridlines behind the trend lines. */
  grid: withAlpha(COLORS.ink, 0.16),
} as const;

/**
 * One entry per charted macro. Deliberate assignments:
 *  - calories → vivid violet: the "headline" series previously borrowed mint,
 *    which sat 2° from carbs' hue — two green lines nobody could tell apart.
 *  - protein → electric blue, carbs → neon mint, fats → bright amber: all
 *    now ≥ 100° apart from their neighbours (was ~30° between mint pairs).
 * `CHART_SERIES.violet` is the free fifth hue for future series (e.g. fiber).
 */
export const MACRO_CHART_COLORS = {
  calories: CHART_SERIES.violet,
  protein: CHART_SERIES.blue,
  carbs: CHART_SERIES.mint,
  fats: CHART_SERIES.amber,
} as const;
