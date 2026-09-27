import React, { memo } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { toLocalDateString } from "@/src/lib/nutrition";
import { COLORS } from "@/src/theme/colors";

interface WeekStripProps {
  /** Seven dates (Monday → Sunday) to render, in order. */
  weekDates: Date[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  /** When false, a compact "Today" shortcut is appended to jump back. */
  isToday: boolean;
  /** Dates (toLocalDateString format) that have at least one logged item. */
  loggedDates?: Set<string>;
}

const CHIP_GAP = 8;
const TODAY_CHIP_WIDTH = 60;
const MIN_DAY_CHIP_WIDTH = 46;
const CHIP_HEIGHT = 60;
/** Size of the small "this chip is today" dot. */
const TODAY_DOT_SIZE = 4;

export const WeekStrip = memo(function WeekStrip({
  weekDates,
  selectedDate,
  onSelectDate,
  isToday,
  loggedDates,
}: WeekStripProps) {
  const { width: windowWidth } = useWindowDimensions();
  const selectedString = toLocalDateString(selectedDate);
  // Calendar-today, computed once per render — independent of which date is
  // selected. Used to mark the actual "today" chip with a small dot so the
  // user can always see where "today" is on the strip, even while looking
  // at a different day (selection alone doesn't convey this).
  const todayString = toLocalDateString(new Date());

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
    <View
      className="relative mb-4 flex-row items-center overflow-hidden"
      style={{ height: CHIP_HEIGHT + 8 }}
    >
      {selectedIndex >= 0 ? (
        <View
          pointerEvents="none"
          className="absolute rounded-2xl bg-primary"
          style={{
            left: selectedIndex * (chipWidth + CHIP_GAP),
            width: chipWidth,
            height: CHIP_HEIGHT,
            shadowColor: "#0F172A",
            shadowOpacity: 0.22,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 4,
            transform: [{ scale: 1.04 }],
          }}
        />
      ) : null}

      {weekDates.map((date, index) => {
        const dateString = toLocalDateString(date);
        const isSelected = index === selectedIndex;
        const isLogged = loggedDates?.has(dateString) ?? false;
        const isCalendarToday = dateString === todayString;

        return (
          <Pressable
            key={dateString}
            onPress={() => onSelectDate(date)}
            android_ripple={null}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={
              date.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              }) + (isCalendarToday ? ", today" : "") + (isLogged ? ", logged" : "")
            }
            style={{ width: chipWidth, height: CHIP_HEIGHT, marginRight: CHIP_GAP }}
            className={`shrink-0 items-center justify-center rounded-2xl px-1.5 ${!isSelected && isLogged ? "bg-primary-soft" : ""
              }`}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              className={`text-center text-[11px] font-manrope ${isSelected ? "text-ink" : "text-ink-muted"
                }`}
            >
              {date.toLocaleDateString("en-US", { weekday: "short" })}
            </Text>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              className={`text-center text-base font-manrope-bold ${isSelected ? "text-ink" : "text-ink"
                }`}
            >
              {date.getDate()}
            </Text>
            {/* "Today" marker — a small dot, independent of selection/logged
                state, so today's chip is identifiable even when you're
                looking at a different day. Uses a fixed-height wrapper so
                its presence/absence never shifts chip layout. */}
            <View style={{ height: TODAY_DOT_SIZE + 2, marginTop: 2 }}>
              {isCalendarToday ? (
                <View
                  style={{
                    width: TODAY_DOT_SIZE,
                    height: TODAY_DOT_SIZE,
                    borderRadius: TODAY_DOT_SIZE / 2,
                    // Dark dot on the mint selected chip, slate dot on the light wash.
                    backgroundColor: isSelected ? COLORS.ink : COLORS.inkFaint,
                  }}
                />
              ) : null}
            </View>
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
          style={{ height: CHIP_HEIGHT }}
          className={`shrink-0 items-center justify-center rounded-2xl bg-primary-soft px-3 ${isToday ? "opacity-40" : ""
            }`}
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            className="text-[11px] font-manrope-semibold text-primary-ink"
          >
            Today
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});