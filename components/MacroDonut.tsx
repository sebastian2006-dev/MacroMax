import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

export interface MacroDonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface MacroDonutProps {
  segments: MacroDonutSegment[];
  /** Big text in the centre, e.g. "1,860". */
  centerValue: string;
  /** Small caption under the centre value, e.g. "kcal · this week". */
  centerLabel: string;
  size?: number;
  strokeWidth?: number;
  /** Track color behind segments (visible through the segment gaps). */
  trackColor?: string;
}

/**
 * Donut (ring) chart for macro distribution. Each segment is an SVG circle
 * arc whose dash array is proportional to its share of the total; segments
 * start at 12 o'clock and run clockwise. Renders a neutral empty ring when
 * the total is zero so charts never look broken.
 */
export const MacroDonut = memo(function MacroDonut({
  segments,
  centerValue,
  centerLabel,
  size = 148,
  strokeWidth = 18,
  trackColor = "#E6E9F3",
}: MacroDonutProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const gap = total > 0 && segments.length > 1 ? Math.min(2.5, circumference / segments.length / 8) : 0;

  let consumed = 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Track (shows through segment gaps) */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {total > 0 ? (
          <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
            {segments.map((segment) => {
              const value = Math.max(0, segment.value);
              const length = (value / total) * circumference;
              const drawable = Math.max(length - gap, 0);
              const element = (
                <Circle
                  key={segment.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={segment.color}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${drawable} ${circumference - drawable}`}
                  strokeDashoffset={-consumed}
                />
              );
              consumed += length;
              return element;
            })}
          </G>
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text className="font-manrope-extrabold text-xl text-ink" numberOfLines={1} adjustsFontSizeToFit>
          {centerValue}
        </Text>
        <Text className="font-manrope mt-0.5 text-[11px] text-ink-muted" numberOfLines={1}>
          {centerLabel}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
});
