import React, { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { WeekStrip } from "@/components/WeekStrip";
import {
  LOGGED_DOT_SIZE,
  WEEKDAY_INITIALS,
  WEEKDAY_NAMES,
  WEEKDAY_ROW_HEIGHT,
  buildMonthGrid,
  monthGridMetrics,
  monthLabel,
} from "@/src/lib/monthGrid";
import { toLocalDateString } from "@/src/lib/nutrition";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import { TILE_MAX_FONT_SCALE } from "@/src/theme/typography";

interface MonthCalendarProps {
  /** Month to expand — the selected day's month (no month navigation by design). */
  anchor: Date;
  /** Monday → Sunday dates for the collapsed strip. */
  weekDates: Date[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  /** False when the selected day isn't calendar-today (shows the Today shortcut). */
  isToday: boolean;
  /** Dates (toLocalDateString) with at least one logged item, for the month. */
  loggedDates?: Set<string>;
}

/** Logged marker size, aliased for readability in the cell markup. */
const LOGGED_DOT = LOGGED_DOT_SIZE;

/**
 * Collapsible month calendar: the familiar 7-day strip, plus a dropdown that
 * reveals every day of the month with a logged / not-logged marker per day.
 *
 * LAYOUT-STABILITY CONTRACT (see the dashboard overlap glitch):
 *  - everything renders in normal document flow inside the screen's
 *    ScrollView, so expanding pushes the rings and the cards below DOWN;
 *    nothing here is absolutely positioned, so it cannot overlap them;
 *  - the grid's size comes from `monthGridMetrics` (pure, unit-tested): whole-
 *    pixel cells across the card's real inner width and a FIXED six-row
 *    height, so no frame is ever measured at 0 and the expanded card is the
 *    same height in February as in January;
 *  - only opacity/translate animate (FadeInDown), never height, so no layout
 *    animation can race the ring measurement or the ScrollView.
 */
export const MonthCalendar = memo(function MonthCalendar({
  anchor,
  weekDates,
  selectedDate,
  onSelectDate,
  isToday,
  loggedDates,
}: MonthCalendarProps) {
  const [expanded, setExpanded] = useState(false);
  const { width: windowWidth } = useWindowDimensions();

  const metrics = useMemo(() => monthGridMetrics(windowWidth), [windowWidth]);
  const { cellWidth, cellHeight, gap, gridHeight } = metrics;

  const cells = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const selectedString = toLocalDateString(selectedDate);
  const todayString = useMemo(() => toLocalDateString(new Date()), []);

  const rows = useMemo(() => {
    const result: (typeof cells)[] = [];
    for (let index = 0; index < cells.length; index += 7) {
      result.push(cells.slice(index, index + 7));
    }
    return result;
  }, [cells]);

  const handleToggle = useCallback(() => setExpanded((previous) => !previous), []);

  return (
    <View className="mb-4">
      {/* Header: what the strip below covers, and the dropdown itself. The
          button is a 44dp target with hitSlop so it stays tappable at any
          font scale. */}
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="font-manrope-semibold text-sm text-ink-muted">
          {expanded ? monthLabel(anchor) : "This week"}
        </Text>
        <Pressable
          onPress={handleToggle}
          android_ripple={null}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={
            expanded ? "Hide the month view" : "Show the whole month's logged days"
          }
          className="flex-row items-center rounded-full bg-primary-soft px-3 py-1.5"
        >
          <Text className="font-manrope-semibold text-xs text-primary-ink">
            {expanded ? "Hide month" : "Month"}
          </Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color={COLORS.primaryInk}
            style={{ marginLeft: 4 }}
          />
        </Pressable>
      </View>

      <WeekStrip
        weekDates={weekDates}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        isToday={isToday}
        loggedDates={loggedDates}
      />

      {expanded ? (
        <Animated.View
          entering={FadeInDown.duration(180)}
          className="overflow-hidden rounded-2xl bg-card p-4"
          style={SHADOWS.card}
          accessibilityLabel={`${monthLabel(anchor)} logged days`}
        >
          {/* Weekday header — one letter per column, Sunday in the brand's
              danger red so Sunday reads the same way it does on the strip. */}
          <View
            className="flex-row"
            style={{ gap, height: WEEKDAY_ROW_HEIGHT }}
          >
            {WEEKDAY_INITIALS.map((initial, index) => (
              <Text
                key={`${initial}-${index}`}
                numberOfLines={1}
                maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
                style={{ width: cellWidth }}
                className={`text-center text-[11px] font-manrope-semibold ${
                  index === 6 ? "text-danger" : "text-ink-faint"
                }`}
              >
                {initial}
              </Text>
            ))}
          </View>

          {/* The grid. Fixed 6 rows × fixed 46dp cells = metrics.gridHeight. */}
          <View style={{ height: gridHeight, gap }}>
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} className="flex-row" style={{ height: cellHeight, gap }}>
                {row.map((cell) => {
                  const isSelected = cell.dateString === selectedString;
                  const isLogged = loggedDates?.has(cell.dateString) ?? false;
                  const isCalendarToday = cell.dateString === todayString;
                  const disabled = !cell.inMonth;

                  return (
                    <Pressable
                      key={cell.dateString}
                      disabled={disabled}
                      onPress={() => onSelectDate(cell.date)}
                      android_ripple={null}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected, disabled }}
                      accessibilityLabel={
                        `${WEEKDAY_NAMES[cell.weekdayIndex]}, ${cell.date.toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                        })}` +
                        (isCalendarToday ? ", today" : "") +
                        (isLogged ? ", logged" : ", not logged")
                      }
                      style={{ width: cellWidth, height: cellHeight }}
                      className="items-center justify-center"
                    >
                      <View
                        className={`items-center justify-center rounded-full ${
                          isSelected ? "bg-primary" : ""
                        }`}
                        style={{
                          width: cellHeight - 12,
                          height: cellHeight - 12,
                          // Today gets a hairline ring (only while unselected,
                          // so it never fights the filled selection disc).
                          borderWidth: isCalendarToday && !isSelected ? 1.5 : 0,
                          borderColor: COLORS.primaryInk,
                        }}
                      >
                        <Text
                          numberOfLines={1}
                          maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
                          className={`text-[13px] font-manrope-semibold ${
                            isSelected
                              ? "text-ink"
                              : disabled
                                ? "text-ink-faint opacity-50"
                                : "text-ink"
                          }`}
                        >
                          {cell.dayOfMonth}
                        </Text>
                        {/* Logged marker — a fixed-height slot so a dot's
                            presence never shifts the number's baseline. */}
                        <View style={{ height: LOGGED_DOT + 1, marginTop: 1 }}>
                          {isLogged ? (
                            <View
                              style={{
                                width: LOGGED_DOT,
                                height: LOGGED_DOT,
                                borderRadius: LOGGED_DOT / 2,
                                backgroundColor: isSelected ? COLORS.ink : COLORS.primaryInk,
                              }}
                            />
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Legend — the two markers the grid uses, spelled out. */}
          <View className="mt-3 flex-row items-center justify-center">
            <View
              style={{
                width: LOGGED_DOT,
                height: LOGGED_DOT,
                borderRadius: LOGGED_DOT / 2,
                backgroundColor: COLORS.primaryInk,
              }}
            />
            <Text className="font-manrope ml-1.5 text-xs text-ink-muted">Logged</Text>
            <View
              className="ml-4"
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: COLORS.primaryInk,
              }}
            />
            <Text className="font-manrope ml-1.5 text-xs text-ink-muted">Today</Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
});
