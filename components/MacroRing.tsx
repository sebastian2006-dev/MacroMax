import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { RING_TRACK_ALPHA, withAlpha } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import { TILE_MAX_FONT_SCALE } from "@/src/theme/typography";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Arc fill duration — long enough to read as "filling", short enough to feel snappy. */
const FILL_DURATION_MS = 700;

interface MacroRingProps {
  label: string;
  value: number;
  unit: string;
  /** Daily goal. 0/null/NaN renders the unfilled "goal not set" state. */
  target?: number | null;
  /**
   * True when `target` came from DEFAULT_GOAL_TARGETS rather than the user's
   * profile — the caption then says so instead of pretending it was chosen.
   */
  isDefaultGoal?: boolean;
  color: string;
  /** Track behind the arc; defaults to a 10% tint of `color`. */
  trackColor?: string;
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
  isDefaultGoal = false,
  color,
  trackColor,
  size = 132,
  strokeWidth = 12,
}: MacroRingProps) {
  // Defensive coercion: a NaN/Infinity here would poison strokeDashoffset and
  // make the whole ring disappear rather than merely look wrong.
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const safeTarget =
    typeof target === "number" && Number.isFinite(target) && target > 0 ? target : null;
  const hasTarget = safeTarget !== null;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = hasTarget ? Math.min(1, safeValue / safeTarget) : 0;
  // Unfilled arc = the ring's own color at 10% opacity, so each ring's track
  // matches its fill instead of borrowing a generic grey/blue tint.
  const resolvedTrack = trackColor ?? withAlpha(color, RING_TRACK_ALPHA);

  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    animatedProgress.value = withTiming(progress, {
      duration: FILL_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    // progress is a derived primitive (number), safe as an effect dep —
    // this re-fires on every value/target change, including date switches.
  }, [progress, animatedProgress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  return (
    /*
     * LAYOUT-STABILITY CONTRACT (see the dashboard overlap glitch):
     *  - NO flex-1 on the card: its height must come from content, not from
     *    a flexible parent, or a transient measure of 0 lets neighbours
     *    slide up and overlap the rings.
     *  - The SVG box has a FIXED pixel height (size) instead of
     *    aspectRatio — aspectRatio can resolve to 0 during Fabric's first
     *    measure passes on Android, collapsing the arc into the calendar.
     *  - overflow-hidden clips the stroke cap so it can never paint outside
     *    the rounded card while animating.
     */
    <View className="w-full items-center overflow-hidden rounded-2xl bg-card p-4" style={SHADOWS.card}>
      <View style={{ width: "100%", maxWidth: size, height: size }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={resolvedTrack}
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
                // Static starting offset so a full ring can never flash for one
                // frame before the animated value (0 on mount) takes over.
                strokeDashoffset={circumference}
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
            {Math.round(safeValue)}
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
          {Math.round(safeValue)} / {Math.round(safeTarget)} {unit}
          {isDefaultGoal ? (
            <Text className="text-ink-faint"> · default</Text>
          ) : null}
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
