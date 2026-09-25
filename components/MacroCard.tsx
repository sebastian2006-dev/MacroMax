import React from "react";
import { Text, View } from "react-native";
import { Macros } from "@/src/types";
import { COLORS, MACRO_COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import { TILE_MAX_FONT_SCALE } from "@/src/theme/typography";

interface MacroCardProps {
  title: string;
  macros: Macros;
  accentColor?: string;
  /** Upper limit for fats; when set and exceeded, the fats stat flags red. */
  fatsTarget?: number;
}

function MacroStat({
  value,
  label,
  color,
  caption,
}: {
  value: string;
  label: string;
  color?: string;
  /** Optional small line under the label, e.g. "12g over". */
  caption?: string;
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
      {caption ? (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
          className="text-[10px] font-manrope-semibold text-danger"
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

export const MacroCard = React.memo(function MacroCard({
  title,
  macros,
  accentColor = MACRO_COLORS.protein,
  fatsTarget,
}: MacroCardProps) {
  const fatsOver =
    typeof fatsTarget === "number" && fatsTarget > 0
      ? Math.max(0, macros.fats - fatsTarget)
      : 0;
  const fatsExceeded = fatsOver > 0;

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
        <MacroStat
          value={`${Math.round(macros.fats)}g`}
          label="Fats"
          color={fatsExceeded ? COLORS.danger : MACRO_COLORS.fats}
          caption={fatsExceeded ? `${Math.round(fatsOver)}g over` : undefined}
        />
      </View>
    </View>
  );
});