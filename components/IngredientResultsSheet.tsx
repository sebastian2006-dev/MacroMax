import React, { memo, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { sourceLabel } from "@/src/lib/foodLabels";
import { SearchResult } from "@/src/types";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

interface IngredientResultsSheetProps {
  /** When true the sheet slides up; when false it slides away. */
  visible: boolean;
  loading: boolean;
  results: SearchResult[];
  onSelect: (result: SearchResult) => void;
  onClose: () => void;
}

const MAX_SHEET_HEIGHT = 480;

/**
 * Sliding-window bottom sheet for ingredient search results (Custom Dish).
 *
 * Rises over the lower part of the screen with a dimmed backdrop; the result
 * list scrolls inside the sheet and can be dismissed via the backdrop, the ✕
 * button, or by selecting a result. Uses the RN Animated API (native driver)
 * — never NativeWind animation/shadow classes (which crash expo-router).
 */
export const IngredientResultsSheet = memo(
  function IngredientResultsSheet({
    visible,
    loading,
    results,
    onSelect,
    onClose,
  }: IngredientResultsSheetProps) {
    const { height: windowHeight } = useWindowDimensions();
    const sheetHeight = Math.min(MAX_SHEET_HEIGHT, windowHeight * 0.55);
    const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

    useEffect(() => {
      Animated.timing(progress, {
        toValue: visible ? 1 : 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, [visible, progress]);

    const translateY = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [sheetHeight + 32, 0],
    });
    const backdropOpacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 0.28],
    });

    return (
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents={visible ? "auto" : "none"}
        accessibilityViewIsModal={visible}
      >
        {/* Dimmed backdrop — tap to dismiss */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityLabel="Dismiss search results"
          />
        </Animated.View>

        {/* Sliding window */}
        <Animated.View
          style={[
            styles.sheet,
            SHADOWS.sheet,
            { height: sheetHeight, transform: [{ translateY }] },
          ]}
        >
          <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
            <View className="flex-row items-baseline">
              <Text className="font-manrope-bold text-base text-ink">Results</Text>
              {results.length > 0 ? (
                <Text className="font-manrope ml-2 text-xs text-ink-muted">
                  {results.length} match{results.length === 1 ? "" : "es"} · basic first
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityLabel="Close results"
              className="rounded-full bg-wash p-2"
            >
              <Ionicons name="close" size={16} color={COLORS.inkMuted} />
            </Pressable>
          </View>

          {loading && results.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={COLORS.primary} />
              <Text className="font-manrope mt-3 text-sm text-ink-muted">Searching foods…</Text>
            </View>
          ) : (
            <ScrollView
              className="flex-1 px-4"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}
            >
              {results.map((result) => (
                <Pressable
                  key={result.id}
                  onPress={() => onSelect(result)}
                  className="mb-1.5 rounded-xl bg-wash px-3 py-2.5"
                >
                  <Text className="font-manrope-semibold text-sm text-ink" numberOfLines={1}>
                    {result.name}
                  </Text>
                  <Text className="font-manrope text-xs text-ink-muted">
                    {sourceLabel(result)} · {Math.round(result.calories)} kcal / 100 g
                  </Text>
                </Pressable>
              ))}
              {!loading && results.length === 0 ? (
                <Text className="font-manrope py-6 text-center text-sm text-ink-muted">
                  No matching foods found.
                </Text>
              ) : null}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    );
  },
  (prev, next) =>
    prev.visible === next.visible &&
    prev.loading === next.loading &&
    prev.results === next.results &&
    prev.onSelect === next.onSelect &&
    prev.onClose === next.onClose
);

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: COLORS.ink,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
});
