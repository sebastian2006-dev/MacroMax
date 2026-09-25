import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { COLORS, MACRO_TRACKS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import { TILE_MAX_FONT_SCALE } from "@/src/theme/typography";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const FALLBACK_TRACK = "#EEF1F7";

function trackForColor(color: string): string {
  if (color === COLORS.primary) return MACRO_TRACKS.calories;
  if (color === COLORS.secondary) return MACRO_TRACKS.protein;
  if (color === COLORS.tertiary) return MACRO_TRACKS.carbs;
  return FALLBACK_TRACK;
}

interface MacroRingProps {
  label: string;
  value: number;
  unit: string;
  target?: number | null;
  color: string;
  size?: number;
  strokeWidth?: number;
}

/**
 * Circular progress ring (donut) for a daily macro total.
 *
 * The fill animates with react-native-reanimated (UI-thread worklets), NOT
 * the legacy Animated API. Reanimated's useAnimatedProps writes directly to
 * the shadow tree on Fabric every frame, so it works correctly on the new
 * architecture — unlike `Animated.Value` + `setNativeProps`, which silently
 * no-ops on Fabric and causes the ring to jump instantly instead of animate.
 *
 * The animation is driven by a shared value that re-runs withTiming whenever
 * `progress` (derived from value/target) changes — including on date switch,
 * so switching days animates a NEW fill rather than jump-cutting.
 */
export const MacroRing = React.memo(function MacroRing({
  label,
  value,
  unit,
  target,
  color,
  size = 132,
  strokeWidth = 12,
}: MacroRingProps) {
  const hasTarget = typeof target === "number" && target > 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = hasTarget ? Math.min(1, Math.max(0, value / (target as number))) : 0;
  const trackColor = trackForColor(color);

  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    animatedProgress.value = withTiming(progress, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
    // progress is a derived primitive (number), safe as an effect dep —
    // this re-fires on every value/target change, including date switches.
  }, [progress, animatedProgress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  return (
    <View className="flex-1 items-center rounded-2xl bg-card p-4" style={SHADOWS.card}>
      <View style={{ width: "100%", maxWidth: size, aspectRatio: 1 }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {hasTarget ? (
            <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
              <AnimatedCircle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                animatedProps={animatedProps}
              />
            </G>
          ) : null}
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
            className="text-3xl font-manrope-extrabold text-ink"
          >
            {Math.round(value)}
          </Text>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
            className="text-xs font-manrope text-ink-muted"
          >
            {unit}
          </Text>
        </View>
      </View>

      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
        className="mt-2 text-center text-sm font-manrope-bold text-ink"
      >
        {label}
      </Text>
      {hasTarget ? (
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
          className="text-center text-xs font-manrope text-ink-muted"
        >
          {Math.round(value)} / {Math.round(target)} {unit}
        </Text>
      ) : (
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
          className="text-center text-xs font-manrope text-ink-faint"
        >
          Goal not set · set in Profile
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
});