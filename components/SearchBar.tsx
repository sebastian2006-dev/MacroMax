import React, { memo, useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** How long to wait after the last keystroke before notifying the parent. */
  debounceMs?: number;
}

/**
 * Self-contained search input (the "input latency" fix).
 *
 * The TextInput renders against LOCAL state so every keystroke only
 * re-renders this tiny component — the parent screen (result lists, macro
 * previews, sheets) is not touched until the user pauses typing, at which
 * point onChangeText fires once (debounced). External value changes (e.g. a
 * programmatic clear after adding an ingredient) still sync in via effect.
 */
export const SearchBar = memo(function SearchBar({
  value,
  onChangeText,
  placeholder = "Search food, ingredient, or barcode",
  autoFocus = false,
  debounceMs = 300,
}: SearchBarProps) {
  const [text, setText] = useState(value);
  const lastEmittedRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync programmatic value changes from the parent (reset/clear).
  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      lastEmittedRef.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );

  function handleChange(next: string) {
    setText(next); // instant, local only
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      lastEmittedRef.current = next;
      onChangeText(next);
    }, debounceMs);
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
