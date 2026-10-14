import React, { memo } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { ALL_DAYS, normaliseDays } from "@/src/lib/mealReminders";

interface WeekdayChipsProps {
  /** Monday-first indices (0 = Monday … 6 = Sunday). */
  days: number[];
  onChange: (days: number[]) => void;
  /** Dimmed while the reminder is in one-shot mode. */
  muted?: boolean;
}

/** Monday-first initials, matching the order the chips are rendered in. */
const CHIP_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const CHIP_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const CHIP_GAP = 6;
const CHIP_MAX = 40;
const CHIP_MIN = 32;

/**
 * The `M T W T F S S` row from the Samsung alarm editor: tap to toggle a day,
 * Sunday always in the brand's danger red (Samsung's own convention for the
 * weekend edge). Selecting any day is what makes a reminder repeat weekly —
 * with none selected it becomes a one-shot, which is why the parent screen
 * shows "Once" whenever this row is empty.
 */
export const WeekdayChips = memo(function WeekdayChips({
  days,
  onChange,
  muted = false,
}: WeekdayChipsProps) {
  const { width: windowWidth } = useWindowDimensions();
  // Chips share the card's inner width: page inset (16×2) + card padding (16×2).
  const available = Math.max(0, windowWidth - 64);
  const chipSize = Math.min(CHIP_MAX, Math.max(CHIP_MIN, Math.floor((available - CHIP_GAP * 6) / 7)));

  const toggle = (day: number) => {
    onChange(normaliseDays(days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));
  };

  return (
    <View>
      <View className="flex-row justify-between" style={{ gap: CHIP_GAP }}>
        {CHIP_LABELS.map((label, day) => {
          const selected = days.includes(day);
          const isSunday = day === 6;
          return (
            <Pressable
              key={`${label}-${day}`}
              onPress={() => toggle(day)}
              android_ripple={null}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${CHIP_NAMES[day]}${selected ? ", every week" : ""}`}
              style={{ width: chipSize, height: chipSize }}
              className={`items-center justify-center rounded-full ${
                selected ? "bg-primary" : "bg-wash"
              } ${muted && !selected ? "opacity-50" : ""}`}
            >
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
                className={`text-sm font-manrope-semibold ${
                  selected ? "text-ink" : isSunday ? "text-danger" : "text-ink-muted"
                }`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="mt-2 flex-row items-center" style={{ gap: CHIP_GAP }}>
        <Pressable
          onPress={() => onChange([...ALL_DAYS])}
          android_ripple={null}
          accessibilityRole="button"
          accessibilityLabel="Repeat every day"
          className="rounded-full bg-primary-soft px-3 py-1"
        >
          <Text className="font-manrope-semibold text-xs text-primary-ink">Every day</Text>
        </Pressable>
        <Pressable
          onPress={() => onChange([])}
          android_ripple={null}
          accessibilityRole="button"
          accessibilityLabel="Clear the selected days (rings once)"
          className="rounded-full bg-wash px-3 py-1"
        >
          <Text className="font-manrope-semibold text-xs text-ink-muted">No days</Text>
        </Pressable>
        <Text className="font-manrope flex-1 text-right text-xs text-ink-faint">
          {days.length === 0 ? "Rings once" : "Repeats weekly"}
        </Text>
      </View>
    </View>
  );
});
