import React from "react";
import { Text, View } from "react-native";
import { COLORS } from "@/src/theme/colors";

interface MacroProgressBarProps {
  label: string;
  current: number;
  target: number;
  color?: string;
  /**
   * Treat `target` as an upper LIMIT rather than a goal to reach. The bar then
   * reads "x / y g limit" and turns red past the limit instead of quietly
   * filling to 100% and hiding the overshoot.
   */
  limit?: boolean;
}

export const MacroProgressBar = React.memo(function MacroProgressBar({
  label,
  current,
  target,
  color = COLORS.primary,
  limit = false,
}: MacroProgressBarProps) {
  // No goal/limit set — show the logged amount without a meaningless empty bar.
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

  const over = limit ? Math.max(0, current - target) : 0;
  const exceeded = over > 0;
  // Only a limit is allowed to look "broken" — an unmet goal is not a failure.
  const barColor = exceeded ? COLORS.danger : color;
  const percent = Math.min(100, Math.round((current / target) * 100));

  const caption = exceeded
    ? `${Math.round(current)} / ${Math.round(target)} g · ${Math.round(over)} g over`
    : limit
    ? `${Math.round(current)} / ${Math.round(target)} g limit`
    : `${percent}%`;

  return (
    <View className="mb-4">
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="text-sm font-manrope-semibold text-ink-muted">{label}</Text>
        <Text
          className={`text-xs font-manrope-semibold ${
            exceeded ? "text-danger" : "text-ink-muted"
          }`}
        >
          {caption}
        </Text>
      </View>
      <View className="h-2.5 w-full overflow-hidden rounded-full bg-wash">
        <View
          className="h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: barColor }}
        />
      </View>
    </View>
  );
});
