import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { RequireAuth } from "@/components/RequireAuth";
import { AppHeader } from "@/components/AppHeader";
import { MacroRing } from "@/components/MacroRing";
import { MacroProgressBar } from "@/components/MacroProgressBar";
import { MacroCard } from "@/components/MacroCard";
import { LowIntakeAlertCard } from "@/components/LowIntakeAlertCard";
import { useTabBarClearance } from "@/components/ScrollableTabBar";
import { useAuth } from "@/src/hooks/useAuth";
import { useProfile } from "@/src/hooks/useProfile";
import { useDailyLog } from "@/src/hooks/useDailyLog";
import {
  addDays,
  calculateTotals,
  getGoalTargets,
  getLowIntakeAlerts,
  startOfWeek,
  toLocalDateString,
} from "@/src/lib/nutrition";
import { COLORS, MACRO_COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

const ZERO_PROFILE = {
  target_calories: 0,
  target_protein: 0,
  target_carbs: 0,
  target_fats: 0,
};

type IoniconName = keyof typeof Ionicons.glyphMap;

function DashboardContent() {
  const router = useRouter();
  const { userId, name } = useAuth();
  const { profile, loading: profileLoading, refresh: refreshProfile } = useProfile(userId);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { items, loading: logLoading, refresh: refreshLog } = useDailyLog(userId, selectedDate);
  const tabBarClearance = useTabBarClearance();

  const todayString = useMemo(() => toLocalDateString(new Date()), []);

  const weekDates = useMemo(() => {
    const monday = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshLog();
      void refreshProfile();
    }, [refreshLog, refreshProfile])
  );

  const totals = useMemo(() => calculateTotals(items), [items]);
  const targets = useMemo(() => getGoalTargets(profile ?? ZERO_PROFILE), [profile]);
  const alerts = useMemo(() => getLowIntakeAlerts(totals, targets), [totals, targets]);

  const isToday = toLocalDateString(selectedDate) === todayString;
  const hasTargets = targets.calories > 0;

  const quickActions: { label: string; icon: IoniconName; onPress: () => void }[] = [
    {
      label: "Add Food",
      icon: "search",
      onPress: () =>
        router.push({
          pathname: "/search",
          params: { date: toLocalDateString(selectedDate) },
        }),
    },
    {
      label: "Scan Barcode",
      icon: "barcode-outline",
      onPress: () =>
        router.push({
          pathname: "/scanner",
          params: { date: toLocalDateString(selectedDate) },
        }),
    },
    {
      label: "Custom Dish",
      icon: "add-circle-outline",
      onPress: () => router.push({ pathname: "/recipe", params: {} }),
    },
  ];

  if (profileLoading || logLoading) {
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
        {/* Greeting + selected date */}
        <View className="mb-4">
          <Text className="text-2xl font-manrope-extrabold text-ink">
            {name ? `Hi, ${name}` : "Today"}
          </Text>
          <Text className="mt-0.5 text-sm font-manrope text-ink-muted">
            {selectedDate.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
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

        {/* Rings: Calories + Protein */}
        <View className="mb-4 flex-row">
          <View className="mr-2 flex-1">
            <MacroRing
              label="Calories"
              value={totals.calories}
              unit="kcal"
              target={targets.calories > 0 ? targets.calories : null}
              color={MACRO_COLORS.calories}
            />
          </View>
          <View className="ml-2 flex-1">
            <MacroRing
              label="Protein"
              value={totals.protein}
              unit="g"
              target={targets.protein > 0 ? targets.protein : null}
              color={MACRO_COLORS.protein}
            />
          </View>
        </View>

        {/* Empty state — nothing logged for today */}
        {isToday && items.length === 0 ? (
          <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
            <Text className="text-center font-manrope text-sm text-ink-muted">
              Nothing logged yet today — tap Add Food to start.
            </Text>
          </View>
        ) : null}

        {/* Macros progress: Carbs & Fats (grams) */}
        <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
          <Text className="mb-3 text-base font-manrope-bold text-ink">Today's Macros</Text>
          <MacroProgressBar
            label="Carbs"
            current={totals.carbs}
            target={targets.carbs}
            color={MACRO_COLORS.carbs}
          />
          <MacroProgressBar
            label="Fats"
            current={totals.fats}
            target={targets.fats}
            color={MACRO_COLORS.fats}
          />
        </View>

        {/* Daily summary numbers */}
        <View className="mb-4">
          <MacroCard title="Daily Summary" macros={totals} />
        </View>

        {/* Gentle nudges when goals are configured */}
        {hasTargets && alerts.length > 0 ? (
          <View className="mb-4">
            <Text className="mb-2 text-base font-manrope-bold text-ink">Gentle nudges</Text>
            {alerts.map((alert) => (
              <LowIntakeAlertCard key={alert.key} alert={alert} />
            ))}
          </View>
        ) : null}

        {/* Quick actions */}
        <View className="mb-2 rounded-2xl bg-card p-4" style={SHADOWS.card}>
          <View className="flex-row">
            {quickActions.map((action, index) => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                className={`flex-1 items-center justify-center rounded-2xl bg-primary-soft px-2 py-4 ${
                  index < quickActions.length - 1 ? "mr-2" : ""
                }`}
              >
                <Ionicons name={action.icon} size={24} color={COLORS.primary} />
                <Text className="mt-1.5 text-center text-xs font-manrope-semibold text-ink">
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text className="mt-3 text-center font-manrope text-xs text-ink-faint">
            Log each meal in the Daily Log tab below.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function HomeScreen() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
