import React, { memo, useCallback, useEffect, useRef } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "expo-router/tabs";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import { MAX_TAB_SCALE, tabBarMetrics } from "@/src/lib/tabBarLayout";

/** Tab metadata: name must match the Tabs.Screen route name in (tabs)/_layout. */
interface TabItem {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}

export const TAB_ITEMS: TabItem[] = [
  { name: "index", label: "Today", icon: "pie-chart-outline", iconActive: "pie-chart" },
  { name: "log", label: "Daily Log", icon: "restaurant-outline", iconActive: "restaurant" },
  { name: "recipe", label: "Custom Dish", icon: "add-circle-outline", iconActive: "add-circle" },
  { name: "analytics", label: "Analytics", icon: "stats-chart-outline", iconActive: "stats-chart" },
  { name: "settings", label: "Profile", icon: "person-outline", iconActive: "person" },
];

/** Geometry — slot/height scaling rules live in src/lib/tabBarLayout.ts. */
function useTabBarMetrics() {
  const { fontScale } = useWindowDimensions();
  return tabBarMetrics(fontScale);
}

/**
 * Bottom padding screens need under their scroll content so the last card is
 * never hidden behind the sliding tab bar.
 */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  const { contentHeight } = useTabBarMetrics();
  return contentHeight + Math.max(insets.bottom, 8) + 24;
}

/**
 * Horizontal "sliding window" bottom navigation.
 *
 * Every tab is a fixed-width slot inside a horizontal ScrollView, so when the
 * total width exceeds the screen the bar scrolls instead of cramping/truncating
 * icons. The bar also owns its bottom safe-area inset (paddingBottom), which
 * fixes the previously truncated bottom edge on gesture-nav devices. The
 * focused tab is scrolled back into view on every navigation.
 *
 * Slots, icons and the bar height all scale with the OS font scale (bounded by
 * MAX_TAB_SCALE) so labels stay complete — never "Daily L…" — while remaining
 * readable for users who bump their system font size.
 */
export const ScrollableTabBar = memo(function ScrollableTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { scale, itemWidth, contentHeight } = useTabBarMetrics();
  const scrollRef = useRef<ScrollView>(null);
  const focusedIndex = state.index;

  const scrollFocusedIntoView = useCallback(() => {
    const offset = Math.max(0, focusedIndex * itemWidth - (windowWidth - itemWidth) / 2);
    scrollRef.current?.scrollTo({ x: offset, animated: true });
  }, [focusedIndex, itemWidth, windowWidth]);

  useEffect(() => {
    scrollFocusedIntoView();
  }, [scrollFocusedIntoView]);

  return (
    <View
      className="bg-card"
      style={[
        {
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          height: contentHeight + Math.max(insets.bottom, 8),
        },
        SHADOWS.nav,
      ]}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 6 }}
        onContentSizeChange={scrollFocusedIntoView}
      >
        {state.routes.map((route, index) => {
          const isFocused = index === state.index;
          const item = TAB_ITEMS.find((candidate) => candidate.name === route.name);
          if (!item) {
            return null;
          }
          const options = descriptors[route.key]?.options;
          const label = (options?.title as string | undefined) ?? item.label;
          const color = isFocused ? COLORS.primary : COLORS.inkFaint;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={label}
              style={{ width: itemWidth }}
              className="items-center justify-center"
            >
              <View
                className={`items-center justify-center rounded-full px-3 ${
                  isFocused ? "bg-primary-soft" : "bg-transparent"
                }`}
                style={{ minHeight: 30 * scale }}
              >
                <Ionicons
                  name={isFocused ? item.iconActive : item.icon}
                  size={Math.round(22 * scale)}
                  color={color}
                />
              </View>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={MAX_TAB_SCALE}
                className={`mt-0.5 px-0.5 text-[11px] ${
                  isFocused ? "font-manrope-bold text-primary" : "font-manrope-semibold text-ink-faint"
                }`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});
