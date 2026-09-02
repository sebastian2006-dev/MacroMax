import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { RequireAuth } from "@/components/RequireAuth";
import { AppHeader } from "@/components/AppHeader";
import { MealSlot } from "@/components/MealSlot";
import { useTabBarClearance } from "@/components/ScrollableTabBar";
import { useAuth } from "@/src/hooks/useAuth";
import { useDailyLog } from "@/src/hooks/useDailyLog";
import {
  addDays,
  calculateTotals,
  groupMealItemsByType,
  startOfWeek,
  toLocalDateString,
} from "@/src/lib/nutrition";
import { COLORS, MACRO_COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import { MealType } from "@/src/types";

const MEAL_ORDER: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snacks/Extra"];

function LogContent() {
  const router = useRouter();
  const { userId } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const {
    items,
    loading: logLoading,
    refresh: refreshLog,
    removeMealItem,
  } = useDailyLog(userId, selectedDate);
  const tabBarClearance = useTabBarClearance();

  const todayString = useMemo(() => toLocalDateString(new Date()), []);

  const weekDates = useMemo(() => {
    const monday = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshLog();
    }, [refreshLog])
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

  if (logLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

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

        {/* Week strip — 7 equal-width day chips filling the screen width */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-4"
          contentContainerStyle={{ flexGrow: 1, columnGap: 8 }}
        >
          {weekDates.map((date) => {
            const dateString = toLocalDateString(date);
            const isSelected = toLocalDateString(selectedDate) === dateString;
            return (
              <Pressable
                key={dateString}
                onPress={() => setSelectedDate(date)}
                className={`flex-1 items-center rounded-2xl px-1 py-2 ${
                  isSelected ? "bg-primary" : "bg-card"
                }`}
              >
                <Text
                  className={`text-center text-[11px] font-manrope ${
                    isSelected ? "text-card" : "text-ink-muted"
                  }`}
                >
                  {date.toLocaleDateString("en-US", { weekday: "short" })}
                </Text>
                <Text
                  className={`text-center text-sm font-manrope-bold ${
                    isSelected ? "text-card" : "text-ink"
                  }`}
                >
                  {date.getDate()}
                </Text>
              </Pressable>
            );
          })}
          {!isToday ? (
            <Pressable
              onPress={() => setSelectedDate(new Date())}
              className="items-center justify-center rounded-2xl bg-primary-soft px-3 py-2"
            >
              <Text className="text-[11px] font-manrope-semibold text-primary">Today</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {/* Totals summary card */}
        <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
          <Text className="mb-1 text-base font-manrope-bold text-ink">
            {isToday ? "Logged today" : `Logged ${toLocalDateString(selectedDate)}`}
          </Text>
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

        {/* Meal slots */}
        {MEAL_ORDER.map((mealType) => (
          <MealSlot
            key={mealType}
            mealType={mealType}
            items={grouped[mealType]}
            onAdd={handleAddMeal}
            onRemove={handleRemoveMeal}
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
          <Text className="text-center font-manrope-semibold text-primary">
            Search the food database (FatSecret + Open Food Facts)
          </Text>
        </Pressable>

        {/* Scan CTA */}
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/scanner",
              params: { date: toLocalDateString(selectedDate) },
            })
          }
          className="rounded-3xl bg-primary-soft px-4 py-3"
        >
          <Text className="text-center text-sm font-manrope-semibold text-primary">
            Scan a barcode instead
          </Text>
        </Pressable>
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
