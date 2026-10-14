import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { RequireAuth } from "@/components/RequireAuth";
import { AppHeader } from "@/components/AppHeader";
import { MonthCalendar } from "@/components/MonthCalendar";
import { MealSlot } from "@/components/MealSlot";
import { useTabBarClearance } from "@/components/ScrollableTabBar";
import { useAuth } from "@/src/hooks/useAuth";
import { useDailyLog } from "@/src/hooks/useDailyLog";
import { useLoggedDatesInMonth } from "@/src/hooks/useLoggedDatesInMonth";
import { weekOf } from "@/src/lib/monthGrid";
import { lockDay, unlockDay } from "@/src/lib/db";
import {
  calculateTotals,
  groupMealItemsByType,
  toLocalDateString,
} from "@/src/lib/nutrition";
import { BRAND, COLORS, MACRO_COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import { LinearGradient } from "expo-linear-gradient";
import { MealType } from "@/src/types";

/** Stable no-op for disabled MealSlot "+" while a day is locked. */
const noop = () => {};

/** Fixed display order of the meal slots on the Daily Log. */
const MEAL_ORDER: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snacks/Extra"];

function LogContent() {
  const router = useRouter();
  const { userId } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const {
    items,
    locked,
    refresh: refreshLog,
    removeMealItem,
  } = useDailyLog(userId, selectedDate);
  const tabBarClearance = useTabBarClearance();

  const todayString = useMemo(() => toLocalDateString(new Date()), []);

  // Strip follows the selected day so a month-grid selection is always visible
  // in the week above it (see MonthCalendar).
  const weekDates = useMemo(() => weekOf(selectedDate), [selectedDate]);

  const { loggedDates, refresh: refreshLoggedDates } = useLoggedDatesInMonth(
    userId,
    selectedDate
  );

  useFocusEffect(
    useCallback(() => {
      void refreshLog();
      void refreshLoggedDates();
    }, [refreshLog, refreshLoggedDates])
  );

  const totals = useMemo(() => calculateTotals(items), [items]);
  const grouped = useMemo(() => groupMealItemsByType(items), [items]);

  const isToday = toLocalDateString(selectedDate) === todayString;

  const handleAddMeal = useCallback(
    (mealType: MealType) => {
      router.push({
        pathname: "/search",
        params: { mealType, date: toLocalDateString(selectedDate) },
      });
    },
    [router, selectedDate]
  );

  const handleRemoveMeal = useCallback(
    (mealItemId: string) => {
      void removeMealItem(mealItemId);
    },
    [removeMealItem]
  );

  const handleLockDay = useCallback(() => {
    void lockDay(toLocalDateString(selectedDate)).then(() => refreshLog());
  }, [selectedDate, refreshLog]);

  const handleUnlockDay = useCallback(() => {
    void unlockDay(toLocalDateString(selectedDate)).then(() => refreshLog());
  }, [selectedDate, refreshLog]);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["left", "right"]}>
      <AppHeader />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: tabBarClearance }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header block */}
        <View className="mb-4">
          <Text className="text-2xl font-manrope-extrabold text-ink">Daily Log</Text>
          <Text className="mt-0.5 text-sm font-manrope text-ink-muted">
            Breakfast · Lunch · Dinner · Snacks
          </Text>
        </View>

        {/* Week strip + collapsible whole-month view (see MonthCalendar) */}
        <MonthCalendar
          anchor={selectedDate}
          weekDates={weekDates}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          isToday={isToday}
          loggedDates={loggedDates}
        />

        {/* Totals summary card */}
        <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
          <View className="flex-row items-center justify-between">
            <Text className="mb-1 flex-1 text-base font-manrope-bold text-ink">
              {isToday ? "Logged today" : `Logged ${toLocalDateString(selectedDate)}`}
            </Text>
            {locked ? (
              <View className="flex-row items-center rounded-full bg-primary-soft px-2.5 py-1">
                <Ionicons name="lock-closed" size={12} color={COLORS.primaryInk} />
                <Text className="font-manrope-bold ml-1 text-xs text-primary-ink">Completed</Text>
              </View>
            ) : null}
          </View>
          <View className="mb-3 flex-row items-baseline">
            <Text className="text-3xl font-manrope-extrabold text-ink">
              {Math.round(totals.calories)}
            </Text>
            <Text className="ml-1.5 font-manrope text-sm text-ink-muted">kcal</Text>
          </View>
          <View className="flex-row justify-between rounded-xl bg-wash px-4 py-3">
            <View className="flex-1 items-center">
              <Text
                className="font-manrope-bold text-base"
                style={{ color: MACRO_COLORS.protein }}
              >
                {Math.round(totals.protein)}g
              </Text>
              <Text className="mt-0.5 text-xs font-manrope text-ink-muted">Protein</Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="font-manrope-bold text-base" style={{ color: MACRO_COLORS.carbs }}>
                {Math.round(totals.carbs)}g
              </Text>
              <Text className="mt-0.5 text-xs font-manrope text-ink-muted">Carbs</Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="font-manrope-bold text-base" style={{ color: MACRO_COLORS.fats }}>
                {Math.round(totals.fats)}g
              </Text>
              <Text className="mt-0.5 text-xs font-manrope text-ink-muted">Fats</Text>
            </View>
          </View>
        </View>

        {/* Meal slots — add/remove disabled while the day is locked */}
        {MEAL_ORDER.map((mealType) => (
          <MealSlot
            key={mealType}
            mealType={mealType}
            items={grouped[mealType]}
            onAdd={locked ? noop : handleAddMeal}
            onRemove={locked ? undefined : handleRemoveMeal}
          />
        ))}

        {/* Database search CTA */}
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/search",
              params: { date: toLocalDateString(selectedDate) },
            })
          }
          className="mb-3 rounded-2xl bg-card p-4"
          style={SHADOWS.card}
        >
          <Text className="text-center font-manrope-semibold text-primary-ink">
            Search the food database (FatSecret + Open Food Facts)
          </Text>
        </Pressable>

        {/* Scan CTA */}
        <Pressable
          disabled={locked === true}
          onPress={() =>
            router.push({
              pathname: "/scanner",
              params: { date: toLocalDateString(selectedDate) },
            })
          }
          className={`rounded-3xl bg-primary-soft px-4 py-3 ${locked ? "opacity-40" : ""}`}
        >
          <Text className="text-center text-sm font-manrope-semibold text-primary-ink">
            Scan a barcode instead
          </Text>
        </Pressable>

        {/* Lock & Complete Day — prominent, at the bottom of the log */}
        <Pressable
          onPress={locked ? handleUnlockDay : handleLockDay}
          accessibilityRole="button"
          accessibilityLabel={
            locked
              ? `Unlock ${toLocalDateString(selectedDate)} for editing`
              : `Lock and complete ${toLocalDateString(selectedDate)}`
          }
          className="mt-4 overflow-hidden rounded-3xl"
        >
          {/* Mint → mint-green: the icon and label are deep emerald ink, which
              only holds AA contrast across a same-family sweep. Locked state
              stays flat mint so the two states remain distinguishable. */}
          <LinearGradient
            colors={locked ? [BRAND.mint, BRAND.mint] : [BRAND.mint, BRAND.mintGreen]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 24, paddingVertical: 14, paddingHorizontal: 16 }}
          >
            <View className="flex-row items-center justify-center">
              <Ionicons
                name={locked ? "lock-open" : "lock-closed"}
                size={16}
                color={COLORS.ink}
              />
              <Text className="font-manrope-bold ml-2 text-center text-base text-ink">
                {locked ? "Unlock this day" : "Lock & Complete Day"}
              </Text>
            </View>
          </LinearGradient>
        </Pressable>
        {locked ? (
          <Text className="font-manrope mt-2 text-center text-xs text-ink-faint">
            This day is completed — additions and edits are disabled. Tap unlock
            if something needs fixing.
          </Text>
        ) : (
          <Text className="font-manrope mt-2 text-center text-xs text-ink-faint">
            Locking freezes this day so the totals can&apos;t drift after review.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function LogScreen() {
  return (
    <RequireAuth>
      <LogContent />
    </RequireAuth>
  );
}