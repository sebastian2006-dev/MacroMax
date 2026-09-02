import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import { LineChart } from "react-native-chart-kit";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { RequireAuth } from "@/components/RequireAuth";
import { AppHeader } from "@/components/AppHeader";
import { useTabBarClearance } from "@/components/ScrollableTabBar";
import { useAuth } from "@/src/hooks/useAuth";
import { getDailyLogs } from "@/src/lib/db";
import {
  addDays,
  getDateNDaysAgo,
  startOfWeek,
  toLocalDateString,
} from "@/src/lib/nutrition";
import { CHART_COLORS, COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import { DailyLog } from "@/src/types";

type ViewMode = "week" | "month";

function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function buildWeeklyData(logs: DailyLog[], weeks: number) {
  const today = new Date();
  const currentMonday = startOfWeek(today);
  const buckets: { key: string; label: string; calories: number; protein: number }[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const monday = addDays(currentMonday, -i * 7);
    buckets.push({
      key: toLocalDateString(monday),
      label: `${monday.getMonth() + 1}/${monday.getDate()}`,
      calories: 0,
      protein: 0,
    });
  }

  for (const log of logs) {
    const date = parseDate(log.log_date);
    const monday = startOfWeek(date);
    const key = toLocalDateString(monday);
    const bucket = buckets.find((item) => item.key === key);
    if (bucket) {
      bucket.calories += log.total_calories;
      bucket.protein += log.total_protein;
    }
  }

  return buckets;
}

function buildMonthlyData(logs: DailyLog[], months: number) {
  const now = new Date();
  const buckets: { key: string; label: string; calories: number; protein: number }[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    buckets.push({
      key,
      label: date.toLocaleString("en", { month: "short" }),
      calories: 0,
      protein: 0,
    });
  }

  for (const log of logs) {
    const key = log.log_date.slice(0, 7);
    const bucket = buckets.find((item) => item.key === key);
    if (bucket) {
      bucket.calories += log.total_calories;
      bucket.protein += log.total_protein;
    }
  }

  return buckets;
}

/** Hex (#RRGGBB) → rgba() string for react-native-chart-kit callbacks. */
function rgba(hex: string, opacity: number): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function makeChartConfig(lineColor: string) {
  return {
    backgroundGradientFrom: COLORS.surface,
    backgroundGradientTo: COLORS.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => rgba(lineColor, opacity),
    labelColor: (opacity = 1) => rgba(CHART_COLORS.label, opacity),
    propsForDots: { r: "4", strokeWidth: "2", stroke: lineColor },
  };
}

function datasetLineColor(lineColor: string) {
  return (opacity = 1) => rgba(lineColor, opacity);
}

function AnalyticsContent() {
  const { userId } = useAuth();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const bottomClearance = useTabBarClearance();

  const loadLogs = useCallback(async () => {
    if (!userId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const startDate = getDateNDaysAgo(120);
      const data = await getDailyLogs(startDate);
      setLogs(data);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void loadLogs();
    }, [loadLogs])
  );

  const weeklyData = useMemo(() => buildWeeklyData(logs, 6), [logs]);
  const monthlyData = useMemo(() => buildMonthlyData(logs, 3), [logs]);
  const currentWeek = weeklyData[weeklyData.length - 1];
  const hasMonthlyData = monthlyData.filter((item) => item.calories > 0).length >= 2;
  const chartData = viewMode === "week" ? weeklyData : monthlyData;
  const hasAnyData = logs.some(
    (log) =>
      log.total_calories > 0 ||
      log.total_protein > 0 ||
      log.total_carbs > 0 ||
      log.total_fats > 0
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Content width: screen − outer padding (16 × 2) − card padding (16 × 2).
  const chartWidth = Dimensions.get("window").width - 64;
  const caloriesConfig = makeChartConfig(CHART_COLORS.lineCalories);
  const proteinConfig = makeChartConfig(CHART_COLORS.lineProtein);
  const lineCalories = datasetLineColor(CHART_COLORS.lineCalories);
  const lineProtein = datasetLineColor(CHART_COLORS.lineProtein);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["left", "right"]}>
      <AppHeader />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: bottomClearance }}
      >
        <Text className="font-manrope-extrabold mb-1 text-2xl text-ink">Analytics</Text>
        <Text className="font-manrope mb-4 text-sm text-ink-muted">
          Weekly totals and monthly overview
        </Text>

        {!hasAnyData ? (
          <View className="rounded-2xl bg-card p-6" style={SHADOWS.card}>
            <Text className="font-manrope text-center text-sm text-ink-muted">
              Not enough data yet. Log a few meals to see trends.
            </Text>
          </View>
        ) : (
          <>
            <View className="mb-4 flex-row">
              <View className="mr-2 flex-1 rounded-2xl bg-card p-4" style={SHADOWS.card}>
                <Text className="font-manrope text-sm text-ink-muted">
                  This Week · Calories
                </Text>
                <Text className="font-manrope-extrabold mt-1 text-2xl text-ink">
                  {Math.round(currentWeek?.calories ?? 0)} kcal
                </Text>
              </View>
              <View className="flex-1 rounded-2xl bg-card p-4" style={SHADOWS.card}>
                <Text className="font-manrope text-sm text-ink-muted">
                  This Week · Protein
                </Text>
                <Text className="font-manrope-extrabold mt-1 text-2xl text-ink">
                  {Math.round(currentWeek?.protein ?? 0)}g
                </Text>
              </View>
            </View>

            <View className="mb-4 flex-row rounded-full bg-wash p-1">
              <Pressable
                onPress={() => setViewMode("week")}
                className={`flex-1 rounded-full py-2 ${
                  viewMode === "week" ? "bg-card" : ""
                }`}
                style={SHADOWS.card}
              >
                <Text
                  className={`text-center text-sm ${
                    viewMode === "week"
                      ? "font-manrope-bold text-primary"
                      : "font-manrope-semibold text-ink-muted"
                  }`}
                >
                  Weekly
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setViewMode("month")}
                disabled={!hasMonthlyData}
                className={`flex-1 rounded-full py-2 ${
                  viewMode === "month" ? "bg-card" : ""
                } ${!hasMonthlyData ? "opacity-50" : ""}`}
                style={SHADOWS.card}
              >
                <Text
                  className={`text-center text-sm ${
                    viewMode === "month"
                      ? "font-manrope-bold text-primary"
                      : "font-manrope-semibold text-ink-muted"
                  }`}
                >
                  Monthly
                </Text>
              </Pressable>
            </View>

            {!hasMonthlyData ? (
              <Text className="font-manrope mb-3 text-center text-sm text-ink-muted">
                Monthly view unlocks after at least 2 months of data.
              </Text>
            ) : null}

            <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
              <Text className="font-manrope-bold mb-3 text-base text-ink">
                {viewMode === "week" ? "Calories · Weekly totals" : "Calories · Monthly totals"}
              </Text>
              <LineChart
                data={{
                  labels: chartData.map((item) => item.label),
                  datasets: [
                    {
                      data: chartData.map((item) => Math.round(item.calories)),
                      color: lineCalories,
                      strokeWidth: 2,
                    },
                  ],
                }}
                width={chartWidth}
                height={220}
                chartConfig={caloriesConfig}
                bezier
                style={{ borderRadius: 16 }}
              />
            </View>

            <View className="rounded-2xl bg-card p-4" style={SHADOWS.card}>
              <Text className="font-manrope-bold mb-3 text-base text-ink">
                {viewMode === "week" ? "Protein · Weekly totals" : "Protein · Monthly totals"}
              </Text>
              <LineChart
                data={{
                  labels: chartData.map((item) => item.label),
                  datasets: [
                    {
                      data: chartData.map((item) => Math.round(item.protein)),
                      color: lineProtein,
                      strokeWidth: 2,
                    },
                  ],
                }}
                width={chartWidth}
                height={220}
                chartConfig={proteinConfig}
                bezier
                style={{ borderRadius: 16 }}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function AnalyticsScreen() {
  return (
    <RequireAuth>
      <AnalyticsContent />
    </RequireAuth>
  );
}
