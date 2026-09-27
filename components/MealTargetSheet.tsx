import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { MEAL_TYPES, MealType } from "@/src/types";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Per-meal icon so the chooser reads at a glance. */
const MEAL_ICONS: Record<MealType, IoniconName> = {
  Breakfast: "sunny-outline",
  Lunch: "restaurant-outline",
  Dinner: "moon-outline",
  "Snacks/Extra": "cube-outline",
};

/** 190 ms — inside the 180–200 ms window that reads as instant but animated. */
const ENTER_DURATION_MS = 190;

/** How far the sheet drifts up as it fades in. */
const ENTER_OFFSET_Y = 18;

/** Starting scale for the fade+scale entrance. */
const ENTER_SCALE_FROM = 0.95;

interface MealTargetSheetProps {
  /** The dish waiting to be logged; null hides the sheet. */
  dishName: string | null;
  /** Where the log write should go. Return false to keep the sheet open. */
  onPick: (mealType: MealType) => Promise<boolean>;
  onDismiss: () => void;
}

/**
 * "Where should this go?" bottom sheet for the Saved Dishes "+" button.
 *
 * Replaces the old behavior of silently forcing the dish into Snacks/Extra.
 * The entrance is a single lightweight timing curve — fade in while scaling
 * from 0.95 and drifting up 18 px — driven by one shared value that also fades
 * the dimmer, so the backdrop can never pop in ahead of the sheet (which is
 * what made the old springy SlideInDown feel jarring).
 */
export function MealTargetSheet({ dishName, onPick, onDismiss }: MealTargetSheetProps) {
  const insets = useSafeAreaInsets();
  const [adding, setAdding] = useState<MealType | null>(null);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!dishName) {
      // Block double-taps while a write is in flight (writes are ~instant,
      // this only guards the animation window).
      setAdding(null);
      // Snap back so the NEXT open replays the entrance from the start.
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: ENTER_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [dishName, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const sheetStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p,
      transform: [
        { translateY: (1 - p) * ENTER_OFFSET_Y },
        { scale: ENTER_SCALE_FROM + (1 - ENTER_SCALE_FROM) * p },
      ],
    };
  });

  if (!dishName) {
    return null;
  }

  const handlePick = (mealType: MealType) => {
    setAdding(mealType);
    void onPick(mealType).finally(() => setAdding(null));
  };

  return (
    <View className="absolute inset-0 z-50">
      {/* Dimmer — fades in with the sheet, tap to dismiss */}
      <Animated.View style={backdropStyle} className="absolute inset-0 bg-black/40">
        <Pressable onPress={onDismiss} className="flex-1" accessibilityLabel="Cancel" />
      </Animated.View>
      <Animated.View
        className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-card px-5 pt-5"
        style={[
          { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          SHADOWS.sheet,
          sheetStyle,
        ]}
      >
        <View className="mb-1 h-1 w-10 self-center rounded-full bg-wash-deep" />
        <Text className="font-manrope-bold mt-3 text-lg text-ink" numberOfLines={2}>
          Log “{dishName}” to…
        </Text>
        <Text className="font-manrope mt-0.5 mb-3 text-sm text-ink-muted">
          Pick the meal this dish belongs to.
        </Text>

        <View className="mb-2 gap-2">
          {MEAL_TYPES.map((mealType) => {
            const busy = adding === mealType;
            return (
              <Pressable
                key={mealType}
                onPress={() => handlePick(mealType)}
                disabled={adding !== null}
                accessibilityRole="button"
                accessibilityLabel={`Add to ${mealType}`}
                className="flex-row items-center rounded-2xl bg-wash px-4 py-3.5 active:opacity-70"
              >
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-primary-soft">
                  <Ionicons name={MEAL_ICONS[mealType]} size={18} color={COLORS.primaryInk} />
                </View>
                <Text className="font-manrope-semibold flex-1 text-base text-ink">
                  {mealType}
                </Text>
                {busy ? (
                  <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.inkFaint} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={COLORS.inkFaint} />
                )}
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}
