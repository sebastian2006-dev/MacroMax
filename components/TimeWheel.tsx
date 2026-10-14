import React, { memo, useCallback, useRef } from "react";
import { Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  Extrapolation,
  SharedValue,
} from "react-native-reanimated";
import { TILE_MAX_FONT_SCALE } from "@/src/theme/typography";

/** One row's height — also the snap interval, so rows are always centred. */
const ITEM_HEIGHT = 44;
/** Visible height: five rows, which is what reads as a wheel. */
const WHEEL_HEIGHT = ITEM_HEIGHT * 5;
/** Padding that lets the first/last row scroll to the centre band. */
const VERTICAL_PADDING = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;

interface WheelProps {
  label: string;
  items: string[];
  /** Currently selected index (0-based). */
  index: number;
  onIndexChange: (index: number) => void;
  /** Fixed column width; the hour/minute columns are wider than am/pm. */
  width: number;
}

/**
 * One scrollable column of the time picker.
 *
 * The dim/shrink-away-from-centre look is driven by a Reanimated scroll shared
 * value, so it animates on the UI thread with no per-frame JS work; the
 * committed index is only pushed back to React on scroll end.
 */
const Wheel = memo(function Wheel({ label, items, index, onIndexChange, width }: WheelProps) {
  const scrollY = useSharedValue(index * ITEM_HEIGHT);
  const committedRef = useRef(index);

  const commit = useCallback(
    (offsetY: number) => {
      const next = Math.min(items.length - 1, Math.max(0, Math.round(offsetY / ITEM_HEIGHT)));
      if (next !== committedRef.current) {
        committedRef.current = next;
        onIndexChange(next);
      }
    },
    [items.length, onIndexChange]
  );

  const handler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  return (
    <View
      style={{ width, height: WHEEL_HEIGHT }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label} picker`}
      accessibilityValue={{ text: items[index] }}
    >
      <Animated.ScrollView
        // `contentOffset` is the starting offset (applied natively on mount,
        // both platforms) — no imperative scrollTo, so nothing can fight a drag.
        contentOffset={{ x: 0, y: index * ITEM_HEIGHT }}
        onScroll={handler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        bounces={false}
        // The editor scrolls too: without this, Android hands the vertical drag
        // to the parent ScrollView and the wheel never spins.
        nestedScrollEnabled
        onMomentumScrollEnd={(event) => commit(event.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(event) => commit(event.nativeEvent.contentOffset.y)}
        contentContainerStyle={{ paddingVertical: VERTICAL_PADDING }}
      >
        {items.map((item, itemIndex) => (
          <WheelRow
            key={item}
            label={item}
            position={itemIndex * ITEM_HEIGHT}
            scrollY={scrollY}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
});

const WheelRow = memo(function WheelRow({
  label,
  position,
  scrollY,
}: {
  label: string;
  position: number;
  scrollY: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(position - scrollY.value);
    return {
      opacity: interpolate(distance, [0, ITEM_HEIGHT, ITEM_HEIGHT * 2], [1, 0.45, 0.25], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(distance, [0, ITEM_HEIGHT], [1, 0.85], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Animated.View
      style={[{ height: ITEM_HEIGHT, alignItems: "center", justifyContent: "center" }, animatedStyle]}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
        className="text-center text-2xl font-manrope-bold text-ink"
      >
        {label}
      </Text>
    </Animated.View>
  );
});

interface TimeWheelProps {
  /** 0-23 wall-clock hour. */
  hour: number;
  /** 0-59. */
  minute: number;
  onChange: (next: { hour: number; minute: number }) => void;
}

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const MERIDIEMS = ["am", "pm"];

/**
 * Samsung-clock-style time wheel: hour / minute / am-pm columns, the centred
 * row large and bright with its neighbours dimmed, framed by the mint wash
 * band from the app's own palette.
 *
 * Both 12-hour conversion and the am/pm edge cases (12 am = 00:00, 12 pm =
 * 12:00) are handled here so the screen only ever deals in an 0-23 hour.
 */
export const TimeWheel = memo(function TimeWheel({ hour, minute, onChange }: TimeWheelProps) {
  const isPm = hour >= 12;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const hourIndex = hour12 - 1;
  const minuteIndex = Math.min(59, Math.max(0, minute));
  const meridiemIndex = isPm ? 1 : 0;

  const setHour12 = useCallback(
    (nextHourIndex: number) => {
      const base = (nextHourIndex + 1) % 12;
      onChange({ hour: isPm ? base + 12 : base, minute });
    },
    [isPm, minute, onChange]
  );

  const setMinute = useCallback(
    (nextMinuteIndex: number) => {
      onChange({ hour, minute: nextMinuteIndex });
    },
    [hour, onChange]
  );

  const setMeridiem = useCallback(
    (nextMeridiemIndex: number) => {
      // 12-hour base keeps 12 am → 00:00 and 12 pm → 12:00.
      const base = hour % 12;
      onChange({ hour: nextMeridiemIndex === 1 ? base + 12 : base, minute });
    },
    [hour, minute, onChange]
  );

  return (
    <View className="items-center justify-center">
      {/* Centre band — sits behind the rows and marks the selected values. */}
      <View
        pointerEvents="none"
        className="absolute rounded-2xl bg-wash"
        style={{ height: ITEM_HEIGHT, left: 16, right: 16 }}
      />
      <View className="flex-row items-center justify-center">
        <Wheel label="Hour" items={HOURS} index={hourIndex} onIndexChange={setHour12} width={84} />
        <Text
          maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
          className="px-1 text-2xl font-manrope-bold text-ink"
          style={{ marginBottom: 4 }}
        >
          :
        </Text>
        <Wheel
          label="Minute"
          items={MINUTES}
          index={minuteIndex}
          onIndexChange={setMinute}
          width={84}
        />
        <View style={{ width: 8 }} />
        <Wheel
          label="AM or PM"
          items={MERIDIEMS}
          index={meridiemIndex}
          onIndexChange={setMeridiem}
          width={52}
        />
      </View>
    </View>
  );
});
