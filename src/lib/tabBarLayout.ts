/**
 * Bottom-navigation geometry.
 *
 * Kept free of React Native imports (plain numbers and arithmetic only) so the
 * layout contract can be unit tested — see test/tabBarLayout.test.ts. The
 * contract is what fixes the "Daily L… / Custom Di… / Analyti…" truncation:
 * a tab label may never be wider than the slot it sits in, at *any* OS font
 * scale, so the label can only ever render in full.
 */

/** Bar content height above the bottom safe-area inset, at 100% font scale. */
export const TAB_BAR_CONTENT_HEIGHT = 62;

/** Slot width per tab at 100% font scale (5 slots × 92dp already exceeds most phones). */
export const TAB_ITEM_WIDTH = 92;

/** Horizontal padding around a label inside its slot (px-0.5 → 2dp per side). */
export const TAB_LABEL_PADDING = 2;

/** Tab label font size in px at 100% font scale (text-[11px]). */
export const TAB_LABEL_FONT_SIZE = 11;

/**
 * Average glyph advance of Manrope_600SemiBold as a fraction of the font size.
 * Measured off the rendered tab bar: "Custom Dish" occupies ~76dp at 11px
 * (76 / 11px / 11 glyphs ≈ 0.63em per glyph). Used only to prove that labels
 * fit; it is deliberately a slight over-estimate (Manrope's narrow glyphs such
 * as "i" advance less), so the check errs towards flagging a label too wide.
 */
export const TAB_LABEL_AVG_ADVANCE_EM = 0.63;

/**
 * Upper bound for tab-bar scaling.
 *
 * Slot width, bar height and label font size all scale with the OS font scale
 * (so a larger system font gets more room instead of an ellipsis), and all
 * three stop growing here so the bar cannot eat the screen. Because the label
 * stops growing at the same bound as its slot, the label/slot fit ratio is
 * never worse than it is at 100% — this is the invariant the unit test pins.
 */
export const MAX_TAB_SCALE = 1.4;

export interface TabBarMetrics {
  /** Clamped font-scale multiplier actually applied to the bar. */
  scale: number;
  itemWidth: number;
  contentHeight: number;
  /** Usable label width inside a slot (slot width minus its label padding). */
  labelMaxWidth: number;
}

/**
 * Geometry for a given OS font scale. Values below 1 (fontScale < 1 is possible
 * when a user shrinks system text) clamp *up* to the design size: the bar is
 * already the smallest comfortable size and shrinking it would hurt more than
 * it helps.
 */
export function tabBarMetrics(fontScale?: number | null): TabBarMetrics {
  const raw = typeof fontScale === "number" && Number.isFinite(fontScale) && fontScale > 0
    ? fontScale
    : 1;
  const scale = Math.min(Math.max(raw, 1), MAX_TAB_SCALE);
  const itemWidth = TAB_ITEM_WIDTH * scale;
  return {
    scale,
    itemWidth,
    contentHeight: TAB_BAR_CONTENT_HEIGHT * scale,
    labelMaxWidth: itemWidth - TAB_LABEL_PADDING * 2,
  };
}

/** Approximate rendered width of a tab label at the given (clamped) scale. */
export function estimateTabLabelWidth(label: string, fontScale?: number | null): number {
  const { scale } = tabBarMetrics(fontScale);
  return label.length * TAB_LABEL_FONT_SIZE * TAB_LABEL_AVG_ADVANCE_EM * scale;
}

/** True when `label` renders in full inside its slot — no ellipsis, no wrap. */
export function tabLabelFits(label: string, fontScale?: number | null): boolean {
  return estimateTabLabelWidth(label, fontScale) <= tabBarMetrics(fontScale).labelMaxWidth;
}
