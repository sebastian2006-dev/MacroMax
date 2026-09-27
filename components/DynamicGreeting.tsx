import React, { useEffect, useMemo, useState } from "react";
import { AppState, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { greetingBucketFor, pickGreeting } from "@/src/lib/greeting";
import { BRAND, COLORS } from "@/src/theme/colors";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * The dashboard "greeting tablet": a polished pill card with a slowly
 * breathing brand-gradient background (reanimated opacity on an Expo
 * LinearGradient — GPU-friendly, UI-thread only).
 *
 * Text stability vs. timeliness:
 *  - the bucket comes from the shared, unit-tested table in src/lib/greeting.ts
 *    (05–12 morning, 12–14 midday, 14–17 afternoon, 17–22 evening, 22–05 night);
 *  - one random seed is drawn per mount, so the phrase is STABLE while a bucket
 *    is active (the old 5-second rotation is not coming back);
 *  - the clock re-reads every minute and whenever the app returns to the
 *    foreground, so an overnight session can no longer greet you with
 *    yesterday's midday phrase.
 */
export function DynamicGreeting({
  name,
  date,
}: {
  name: string | null;
  /** Date shown on the line below (the dashboard's selected day). */
  date?: Date;
}) {
  // Clock for the bucket + the date line. Timers do not fire while the app is
  // suspended, so coming back to the foreground re-reads it immediately — that
  // is exactly when a stale greeting is most glaring.
  const [clockDate, setClockDate] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setClockDate(new Date());
    const timer = setInterval(tick, 60_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") tick();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  // One seed per mount: same bucket + same seed = same phrase, so the text
  // only changes when the clock crosses into a new part of the day.
  const [phraseSeed] = useState(() => Math.floor(Math.random() * 97));
  const bucket = greetingBucketFor(clockDate);
  const { icon, phrase } = useMemo(() => pickGreeting(bucket, phraseSeed), [bucket, phraseSeed]);

  // Breathing gradient: gentle opacity pulse between 0.78 and 1.0, ~5s cycle.
  const breathe = useSharedValue(0);
  useEffect(() => {
    breathe.value = withRepeat(
      withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => {
      breathe.value = 0;
    };
  }, [breathe]);

  const gradientStyle = useAnimatedStyle(() => ({
    opacity: 0.78 + 0.22 * (1 - Math.abs(breathe.value - 0.5) * 2),
  }));

  const displayName = name?.trim() ? `, ${name.trim()}` : "";
  const showDate = (date ?? clockDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(15)}
      className="mb-4"
      style={{ borderRadius: 20 }}
    >
      <View style={{ borderRadius: 20, overflow: "hidden" }}>
        {/* Animated brand-gradient bed (breathing opacity), text on top */}
        <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, gradientStyle]}>
          <LinearGradient
            colors={[...BRAND.stops]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1 }}
          />
        </Animated.View>

        {/* White scrim: the arc gradient reads as a soft brand tint behind it,
            while the dark ink on top clears AA contrast at every stop. */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(255, 255, 255, 0.86)",
          }}
        />

        <View
          className="flex-row items-center px-4 py-3.5"
          style={{ borderRadius: 20 }}
          accessibilityLabel={`${phrase}${displayName} — ${showDate}`}
        >
          <View
            className="mr-3 h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: COLORS.primarySoft }}
          >
            {/* Glyph names live in src/lib/greeting.ts (asserted by tests); the
                cast keeps that module free of any vector-icons dependency. */}
            <Ionicons name={icon as IoniconName} size={19} color={COLORS.primaryInk} />
          </View>
          <View className="flex-1">
            <Text
              numberOfLines={1}
              className="text-xl font-manrope-extrabold text-ink"
            >
              {phrase}
              {displayName}
            </Text>
            <Text className="mt-0.5 text-xs leading-4 font-manrope text-ink-muted">
              {showDate}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
