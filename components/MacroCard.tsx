import React from "react";
import { Text, View } from "react-native";
import { Macros } from "@/src/types";
import { MACRO_COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import { TILE_MAX_FONT_SCALE } from "@/src/theme/typography";

interface MacroCardProps {
  title: string;
  macros: Macros;
  accentColor?: string;
}

/**
 * A single macro figure as a vertical stack: value on top, label underneath.
 *
 * The stack is content-sized (never `flex-1`) so a wider value such as "102g"
 * cannot squeeze its neighbour, and every line is pinned to one line at a
 * bounded font scale — inside a four-column grid wrapping is always a defect,
 * never a feature, and an ellipsis on a 5-character label reads as broken data.
 */
function MacroStat({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <View className="items-center">
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
        className="text-sm font-manrope-semibold"
        style={color ? { color } : undefined}
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
        className="mt-0.5 text-xs font-manrope-semibold text-ink-muted"
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Daily totals summary: calories plus the three macro figures.
 *
 * Layout contract — one balanced row of four vertical stacks:
 *  - `justify-between` spreads the figures across the card, so the gaps stay
 *    even instead of the trio huddling against the right padding edge;
 *  - `gap-3` is the *minimum* spacing between figures (`space-x-*` is used
 *    nowhere else in this codebase because NativeWind resolves it to a
 *    `> * + *` selector that doesn't apply on native, which is what silently
 *    collapsed these gaps to ~2dp and made the numbers look crammed);
 *  - `items-end` bottom-aligns the stacks, so all three macro values sit on one
 *    row and all three labels on the next, at every font scale.
 *
 * Fit check at the narrowest supported width (320dp screen, p-4 = 32dp card
 * padding, xl = 150% font): 320 - 32 - 32 = 256dp of content; the four stacks
 * measure ~81 + 62 + 50 + 36 = 229dp + 3 × 12dp minimum gaps = 265dp, so the
 * row drifts at most 9dp into the card's own padding — it can never collide
 * with the card edge or push a label into a wrap.
 */
export const MacroCard = React.memo(function MacroCard({
  title,
  macros,
  accentColor = MACRO_COLORS.protein,
}: MacroCardProps) {
  return (
    <View className="rounded-2xl bg-card p-4" style={SHADOWS.card}>
      <Text className="mb-3 text-base font-manrope-bold text-ink">{title}</Text>

      <View className="flex-row items-end justify-between gap-3">
        <View className="items-center">
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
            className="text-3xl font-manrope-extrabold text-ink"
          >
            {Math.round(macros.calories)}
          </Text>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
            className="mt-0.5 text-xs font-manrope text-ink-muted"
          >
            kcal
          </Text>
        </View>

        <MacroStat value={`${Math.round(macros.protein)}g`} label="Protein" color={accentColor} />
        <MacroStat value={`${Math.round(macros.carbs)}g`} label="Carbs" color={MACRO_COLORS.carbs} />
        <MacroStat value={`${Math.round(macros.fats)}g`} label="Fats" color={MACRO_COLORS.fats} />
      </View>
    </View>
  );
});
