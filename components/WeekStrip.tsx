import React, { memo } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { toLocalDateString } from "@/src/lib/nutrition";

interface WeekStripProps {
  /** Seven dates (Monday → Sunday) to render, in order. */
  weekDates: Date[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  /** When false, a compact "Today" shortcut is appended to jump back. */
  isToday: boolean;
}

/** Gap between chips. */
const CHIP_GAP = 6;
/** Space reserved for the "Today" shortcut chip. */
const TODAY_CHIP_WIDTH = 58;
/** Lower bound for a day chip so labels can never squeeze. */
const MIN_DAY_CHIP_WIDTH = 40;

/**
 * Horizontal week picker shared by the Today dashboard and the Daily Log.
 *
 * Deliberately NOT a horizontal ScrollView. On Android 12, appearing/changing
 * a green background on a view inside a horizontal ScrollView mispaints that
 * drawable with wildly wrong vertical bounds for a few frames — the
 * "calendar becomes abnormally long for a split second" glitch (confirmed by
 * frame analysis of the user's screen recording: a solid #006C49 bar exactly
 * one chip wide, painted from the strip top ~460px down, while layout stayed
 * untouched). A plain row has no such engine path. Design contract:
 *  - Chips have FIXED pixel widths computed once from the window (only
 *    rotation changes them), so selection can never resize anything.
 *  - The selection highlight is a SINGLE absolutely-positioned overlay that
 *    only slides left/right. It never mounts/unmounts and never changes size
 *    — and it lives in the vertical scroll content, which updates safely
 *    everywhere else in the app.
 *  - The row clips its content (`overflow-hidden`), so even a future
 *    mispaint is hard-bounded to the strip's own height.
 *  - Labels are single-line with capped font scaling; the "Today" shortcut
 *    is always mounted (dimmed & disabled when today is selected) whenever
 *    there is room for it.
 *  - The component is memoized, so unrelated parent re-renders (e.g. the
 *    daily log fetch finishing right after a date tap) skip it entirely.
 */
export const WeekStrip = memo(function WeekStrip({
  weekDates,
  selectedDate,
  onSelectDate,
  isToday,
}: WeekStripProps) {
  const { width: windowWidth } = useWindowDimensions();
  const selectedString = toLocalDateString(selectedDate);

  // Fill the padded content width with the 7 day chips; the Today shortcut
  // is only rendered when it fits without squeezing the day chips.
  const available = windowWidth - 32;
  const canFitToday =
    7 * MIN_DAY_CHIP_WIDTH + 6 * CHIP_GAP + TODAY_CHIP_WIDTH <= available;
  const chipWidth = Math.max(
    MIN_DAY_CHIP_WIDTH,
    Math.floor((available - 6 * CHIP_GAP - (canFitToday ? TODAY_CHIP_WIDTH : 0)) / 7)
  );

  const selectedIndex = weekDates.findIndex(
    (date) => toLocalDateString(date) === selectedString
  );

  return (
    <View className="relative mb-4 flex-row overflow-hidden">
      {/* Moving highlight: rendered first so chip labels paint above it. */}
      {selectedIndex >= 0 ? (
        <View
          pointerEvents="none"
          className="absolute top-0 bottom-0 rounded-2xl bg-primary"
          style={{
            left: selectedIndex * (chipWidth + CHIP_GAP),
            width: chipWidth,
          }}
        />
      ) : null}

      {weekDates.map((date, index) => {
        const dateString = toLocalDateString(date);
        const isSelected = index === selectedIndex;
        return (
          <Pressable
            key={dateString}
            onPress={() => onSelectDate(date)}
            android_ripple={null}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={date.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            style={{ width: chipWidth, marginRight: CHIP_GAP }}
            className="shrink-0 items-center justify-center rounded-2xl px-1.5 py-2"
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              className={`text-center text-[11px] font-manrope ${
                isSelected ? "text-card" : "text-ink-muted"
              }`}
            >
              {date.toLocaleDateString("en-US", { weekday: "short" })}
            </Text>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              className={`text-center text-sm font-manrope-bold ${
                isSelected ? "text-card" : "text-ink"
              }`}
            >
              {date.getDate()}
            </Text>
          </Pressable>
        );
      })}

      {canFitToday ? (
        <Pressable
          onPress={() => onSelectDate(new Date())}
          disabled={isToday}
          android_ripple={null}
          accessibilityRole="button"
          accessibilityState={{ disabled: isToday }}
          accessibilityLabel="Jump to today"
          className={`shrink-0 items-center justify-center rounded-2xl bg-primary-soft px-3 py-2 ${
            isToday ? "opacity-40" : ""
          }`}
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            className="text-[11px] font-manrope-semibold text-primary"
          >
            Today
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});
