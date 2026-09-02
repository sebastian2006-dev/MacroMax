import React from "react";
import { Text, View } from "react-native";
import { COLORS } from "@/src/theme/colors";

interface MacroProgressBarProps {
  label: string;
  current: number;
  target: number;
  color?: string;
}

export const MacroProgressBar = React.memo(function MacroProgressBar({
  label,
  current,
  target,
  color = COLORS.primary,
}: MacroProgressBarProps) {
  // No goal set — show the logged amount without a meaningless empty bar.
  if (target <= 0) {
    return (
      <View className="mb-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-manrope-semibold text-ink-muted">{label}</Text>
          <Text className="text-xs font-manrope text-ink-muted">{Math.round(current)} g logged</Text>
        </View>
      </View>
    );
  }

  const percent = Math.min(100, Math.round((current / target) * 100));

  return (
    <View className="mb-4">
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="text-sm font-manrope-semibold text-ink-muted">{label}</Text>
        <Text className="text-xs font-manrope-semibold text-ink-muted">{percent}%</Text>
      </View>
      <View className="h-2.5 w-full overflow-hidden rounded-full bg-wash">
        <View
          className="h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </View>
    </View>
  );
});
