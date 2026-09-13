import React, { memo, useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Self-contained search input (the "input latency" fix).
 *
 * The TextInput renders against LOCAL state, so each keystroke repaints this
 * tiny component instantly and never waits on a parent re-render. Changes are
 * forwarded straight up — debouncing the *pipeline* is owned by
 * `useFoodSearch` via `useDebouncedValue`, so there is exactly one debounce in
 * the chain. External value changes (e.g. a programmatic clear) sync back in.
 */
export const SearchBar = memo(function SearchBar({
  value,
  onChangeText,
  placeholder = "Search food, ingredient, or barcode",
  autoFocus = false,
}: SearchBarProps) {
  const [text, setText] = useState(value);

  // Sync programmatic value changes from the parent (reset/clear).
  useEffect(() => {
    setText(value);
  }, [value]);

  function handleChange(next: string) {
    setText(next); // instant, local only
    onChangeText(next);
  }

  return (
    <View className="mb-4 flex-row items-center rounded-3xl bg-card px-4" style={SHADOWS.card}>
      <Ionicons name="search" size={18} color={COLORS.inkFaint} />
      <TextInput
        value={text}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={COLORS.inkFaint}
        autoFocus={autoFocus}
        className="font-manrope ml-2 flex-1 py-3 text-base text-ink"
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={placeholder}
      />
    </View>
  );
});
