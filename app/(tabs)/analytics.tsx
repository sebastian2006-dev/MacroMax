import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { RequireAuth } from "@/components/RequireAuth";
import { AppHeader } from "@/components/AppHeader";
import { MacroDonut, MacroDonutSegment } from "@/components/MacroDonut";
import { useTabBarClearance } from "@/components/ScrollableTabBar";
import { useAuth } from "@/src/hooks/useAuth";
import { getDailyLogs } from "@/src/lib/db";
import { addDays, getDateNDaysAgo, startOfWeek, toLocalDateString } from "@/src/lib/nutrition";
import { CHART_COLORS, COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import { DailyLog } from "@/src/types";

type ViewMode = "week" | "month";

interface Bucket {
  key: string;
  label: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function emptyBucket(key: string, label: string): Bucket {
  return { key, label, calories: 0, protein: 0, carbs: 0, fats: 0 };
}

function buildWeeklyData(logs: DailyLog[], weeks: number): Bucket[] {
  const today = new Date();
  const currentMonday = startOfWeek(today);
  const buckets: Bucket[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const monday = addDays(currentMonday, -i * 7);
    buckets.push(emptyBucket(toLocalDateString(monday), `${monday.getMonth() + 1}/${monday.getDate()}`));
  }

  for (const log of logs) {
    const monday = startOfWeek(parseDate(log.log_date));
    const bucket = buckets.find((item) => item.key === toLocalDateString(monday));
    if (bucket) {
      bucket.calories += log.total_calories;
      bucket.protein += log.total_protein;
      bucket.carbs += log.total_carbs;
      bucket.fats += log.total_fats;
    }
  }

  return buckets;
}

function buildMonthlyData(logs: DailyLog[], months: number): Bucket[] {
  const now = new Date();
  const buckets: Bucket[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    buckets.push(emptyBucket(key, date.toLocaleString("en", { month: "short" })));
  }

  for (const log of logs) {
    const key = log.log_date.slice(0, 7);
    const bucket = buckets.find((item) => item.key === key);
    if (bucket) {
      bucket.calories += log.total_calories;
      bucket.protein += log.total_protein;
      bucket.carbs += log.total_carbs;
      bucket.fats += log.total_fats;
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

function lineColor(lineColor: string) {
  return (opacity = 1) => rgba(lineColor, opacity);
}

// Macro line colors follow the Vitality palette: Calories = primary green,
// Protein = secondary blue, Fat = tertiary orange.
const LINE_COLORS = {
  calories: CHART_COLORS.lineCalories,
  protein: CHART_COLORS.lineProtein,
  fats: COLORS.tertiary,
};

function MetricCard({
  title,
  color,
  chartData,
  width,
  metric,
}: {
  title: string;
  color: string;
  chartData: Bucket[];
  width: number;
  metric: "calories" | "protein" | "fats";
}) {
  return (
    <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
      <View className="mb-3 flex-row items-center">
        <View className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <Text className="font-manrope-bold flex-1 text-base text-ink">{title}</Text>
        <Text className="font-manrope text-xs text-ink-muted">
          {Math.round(chartData[chartData.length - 1][metric])} {metric === "calories" ? "kcal" : "g"}
        </Text>
      </View>
      <LineChart
        data={{
          labels: chartData.map((item) => item.label),
          datasets: [
            {
              data: chartData.map((item) => Math.round(item[metric])),
              color: lineColor(color),
              strokeWidth: 2,
            },
          ],
        }}
        width={width}
        height={200}
        chartConfig={makeChartConfig(color)}
        bezier
        style={{ borderRadius: 16 }}
      />
    </View>
  );
}

function MacroSplitCard({ bucket, periodLabel }: { bucket: Bucket; periodLabel: string }) {
  const totalGrams = bucket.protein + bucket.carbs + bucket.fats;
  const percent = (value: number) => (totalGrams > 0 ? Math.round((value / totalGrams) * 100) : 0);

  // Donut colors (product preference for the macro split ring):
  // Protein = red, Carbs = green, Fat = yellow. This is a chart-only
  // override — the trend lines & stat tiles keep the Vitality Core colors.
  const segments: MacroDonutSegment[] = [
    { key: "protein", label: "Protein", value: bucket.protein, color: "#DC2626" },
    { key: "carbs", label: "Carbs", value: bucket.carbs, color: COLORS.primary },
    { key: "fats", label: "Fats", value: bucket.fats, color: "#EAB308" },
  ];

  return (
    <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
      <Text className="font-manrope-bold mb-3 text-base text-ink">Macro split · {periodLabel}</Text>
      <View className="flex-row items-center">
        <MacroDonut
          segments={segments}
          centerValue={String(Math.round(bucket.calories))}
          centerLabel="kcal"
          size={132}
          strokeWidth={16}
        />
        <View className="ml-5 flex-1">
          {segments.map((segment) => (
            <View key={segment.key} className="mb-2.5 flex-row items-center">
              <View className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
              <Text className="font-manrope flex-1 text-sm text-ink-muted">{segment.label}</Text>
              <Text className="font-manrope-semibold text-sm text-ink">
                {Math.round(segment.value)}g
              </Text>
              <Text className="font-manrope ml-2 w-9 text-right text-xs text-ink-faint">
                {percent(segment.value)}%
              </Text>
            </View>
          ))}
          {totalGrams === 0 ? (
            <Text className="font-manrope mt-1 text-xs text-ink-faint">
              Nothing logged {periodLabel.toLowerCase()} yet.
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function StatTile({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <View className="mx-1 flex-1 rounded-2xl bg-card p-3" style={SHADOWS.card}>
      <Text className="font-manrope text-[11px] text-ink-muted">{label}</Text>
      <View className="mt-1 flex-row items-baseline">
        <Text className="font-manrope-extrabold text-lg" style={{ color }}>
          {Math.round(value)}
        </Text>
        <Text className="font-manrope ml-1 text-[11px] text-ink-muted">{unit}</Text>
      </View>
    </View>
  );
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
  const chartData = viewMode === "week" ? weeklyData : monthlyData;
  const current = chartData[chartData.length - 1];
  const periodLabel = viewMode === "week" ? "This week" : "This month";
  const periodNoun = viewMode === "week" ? "Weekly" : "Monthly";

  const hasMonthlyData = monthlyData.filter((item) => item.calories > 0).length >= 2;
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

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["left", "right"]}>
      <AppHeader />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: bottomClearance }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="font-manrope-extrabold mb-1 text-2xl text-ink">Analytics</Text>
        <Text className="font-manrope mb-4 text-sm text-ink-muted">
          Calories, protein & fat trends across {viewMode === "week" ? "weeks" : "months"}
        </Text>

        {!hasAnyData ? (
          <View className="rounded-2xl bg-card p-6" style={SHADOWS.card}>
            <Text className="font-manrope text-center text-sm text-ink-muted">
              Not enough data yet. Log a few meals to see trends.
            </Text>
          </View>
        ) : (
          <>
            {/* Period toggle */}
            <View className="mb-4 flex-row rounded-full bg-wash p-1">
              <Pressable
                onPress={() => setViewMode("week")}
                className={`flex-1 rounded-full py-2 ${viewMode === "week" ? "bg-card" : ""}`}
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
              <Text className="font-manrope mb-4 text-center text-xs text-ink-muted">
                Monthly view unlocks after at least 2 months of data.
              </Text>
            ) : null}

            {/* Stat tiles — balanced 3-up row */}
            <View className="mb-4 flex-row justify-between">
              <StatTile label={`${periodLabel} · Calories`} value={current?.calories ?? 0} unit="kcal" color={COLORS.primary} />
              <StatTile label={`${periodLabel} · Protein`} value={current?.protein ?? 0} unit="g" color={COLORS.secondary} />
              <StatTile label={`${periodLabel} · Fat`} value={current?.fats ?? 0} unit="g" color={COLORS.tertiary} />
            </View>

            {/* Macro distribution donut */}
            {current ? (
              <MacroSplitCard bucket={current} periodLabel={periodLabel} />
            ) : null}

            {/* Trend charts */}
            <MetricCard
              title={`Calories · ${periodNoun} totals`}
              color={LINE_COLORS.calories}
              chartData={chartData}
              width={chartWidth}
              metric="calories"
            />
            <MetricCard
              title={`Protein · ${periodNoun} totals`}
              color={LINE_COLORS.protein}
              chartData={chartData}
              width={chartWidth}
              metric="protein"
            />
            <MetricCard
              title={`Fat · ${periodNoun} totals`}
              color={LINE_COLORS.fats}
              chartData={chartData}
              width={chartWidth}
              metric="fats"
            />
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
