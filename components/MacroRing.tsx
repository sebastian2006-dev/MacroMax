import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { COLORS, MACRO_TRACKS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import { TILE_MAX_FONT_SCALE } from "@/src/theme/typography";

// React Native's built-in Animated API (no reanimated dependency) — works
// identically on iOS, Android and web with react-native-svg.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Soft tint used for the empty ring track when the color prop isn't a macro color. */
const FALLBACK_TRACK = "#EEF1F7";

/** Resolve a macro color to its matching *-soft track hex (Vitality palette). */
function trackForColor(color: string): string {
  if (color === COLORS.primary) {
    return MACRO_TRACKS.calories;
  }
  if (color === COLORS.secondary) {
    return MACRO_TRACKS.protein;
  }
  if (color === COLORS.tertiary) {
    return MACRO_TRACKS.carbs;
  }
  return FALLBACK_TRACK;
}

interface MacroRingProps {
  label: string;
  value: number;
  unit: string;
  /** Goal target; when 0/undefined the ring shows the plain count instead. */
  target?: number | null;
  color: string;
  /**
   * Design size of the ring in dp. It is used as the *maximum* diameter: the
   * ring shrinks to fit narrower cards instead of overflowing them (see below).
   */
  size?: number;
  strokeWidth?: number;
}

/**
 * Animated circular progress ring (donut) for a daily macro total.
 * When no goal target is configured, the ring renders as a neutral full ring
 * with the actual count in the middle — no empty progress, no error clutter.
 *
 * Two cards sit side by side, so a card is only ~(screen − 64dp) / 2 wide: at
 * `size = 132` a fixed-width <Svg> is wider than the card's content box on
 * narrow phones and bleeds over the card edge / centre gutter. The SVG is
 * therefore laid out at `width: 100%` of the card's content box (capped at
 * `size`) with a square `viewBox`, which keeps the drawn geometry pixel-identical
 * at full size and scales it down cleanly when the card is narrower.
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
  const progress = hasTarget ? Math.min(1, Math.max(0, value / target)) : 0;
  const trackColor = trackForColor(color);

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progressAnim.stopAnimation();
    progressAnim.setValue(0);
    const animation = Animated.timing(progressAnim, {
      toValue: progress,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // strokeDashoffset is not a native-driver style
    });
    animation.start();
    return () => {
      progressAnim.stopAnimation();
    };
  }, [progress, progressAnim]);

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

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
                strokeDashoffset={strokeDashoffset}
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

      {/* Caption: one line for the macro name (never "Protei…"), up to two
          centred lines for the detail so it wraps instead of ellipsizing. */}
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
