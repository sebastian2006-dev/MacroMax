import React from "react";
import { Text, View } from "react-native";
import { Macros } from "@/src/types";
import { MACRO_COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

interface MacroCardProps {
  title: string;
  macros: Macros;
  accentColor?: string;
}

export const MacroCard = React.memo(function MacroCard({
  title,
  macros,
  accentColor = MACRO_COLORS.protein,
}: MacroCardProps) {
  return (
    <View className="rounded-2xl bg-card p-4" style={SHADOWS.card}>
      <Text className="mb-2 text-base font-manrope-bold text-ink">{title}</Text>
      <View className="flex-row justify-between">
        <View>
          <Text className="text-3xl font-manrope-extrabold text-ink">
            {Math.round(macros.calories)}
          </Text>
          <Text className="text-xs font-manrope text-ink-muted">kcal</Text>
        </View>
        <View className="flex-row items-end space-x-3">
          <View>
            <Text className="text-sm font-manrope-semibold" style={{ color: accentColor }}>
              {Math.round(macros.protein)}g
            </Text>
            <Text className="text-xs font-manrope-semibold text-ink-muted">Protein</Text>
          </View>
          <View>
            <Text className="text-sm font-manrope-semibold" style={{ color: MACRO_COLORS.carbs }}>
              {Math.round(macros.carbs)}g
            </Text>
            <Text className="text-xs font-manrope-semibold text-ink-muted">Carbs</Text>
          </View>
          <View>
            <Text className="text-sm font-manrope-semibold" style={{ color: MACRO_COLORS.fats }}>
              {Math.round(macros.fats)}g
            </Text>
            <Text className="text-xs font-manrope-semibold text-ink-muted">Fats</Text>
          </View>
        </View>
      </View>
    </View>
  );
});
