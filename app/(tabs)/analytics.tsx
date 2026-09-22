import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
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
type BucketMetric = "calories" | "protein" | "carbs" | "fats";

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

// Trend line colors follow the Vitality palette: Calories = primary green,
// Protein = secondary blue, Carbs & Fat = tertiary orange.
const LINE_COLORS = {
  calories: CHART_COLORS.lineCalories,
  protein: CHART_COLORS.lineProtein,
  carbs: COLORS.tertiary,
  fats: COLORS.tertiary,
};

/**
 * Hero card: the macro split donut with the period's calories in its centre
 * and the protein/carbs/fat breakdown as a compact legend. This replaces the
 * three separate stat tiles + donut + legend stack of the previous build.
 */
function SplitHeroCard({ bucket, periodLabel }: { bucket: Bucket; periodLabel: string }) {
  const totalGrams = bucket.protein + bucket.carbs + bucket.fats;
  const percent = (value: number) => (totalGrams > 0 ? Math.round((value / totalGrams) * 100) : 0);

  // Donut colors (product preference for the macro split ring):
  // Protein = red, Carbs = green, Fat = yellow. This is a chart-only
  // override — the trend lines keep the Vitality Core colors.
  const segments: MacroDonutSegment[] = [
    { key: "protein", label: "Protein", value: bucket.protein, color: "#DC2626" },
    { key: "carbs", label: "Carbs", value: bucket.carbs, color: COLORS.primary },
    { key: "fats", label: "Fats", value: bucket.fats, color: "#EAB308" },
  ];

  return (
    <View className="mb-5 rounded-3xl bg-card p-5" style={SHADOWS.card}>
      <View className="mb-4 flex-row items-baseline justify-between">
        <Text className="text-base font-manrope-bold text-ink">Macro split</Text>
        <Text className="text-xs font-manrope text-ink-muted">{periodLabel}</Text>
      </View>
      <View className="flex-row items-center">
        <MacroDonut
          segments={segments}
          centerValue={String(Math.round(bucket.calories))}
          centerLabel={`kcal · ${periodLabel.toLowerCase()}`}
          size={148}
          strokeWidth={16}
        />
        <View className="ml-4 flex-1">
          {segments.map((segment) => (
            <View key={segment.key} className="mb-3 flex-row items-center">
              <View className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
              <Text className="flex-1 text-sm font-manrope text-ink-muted">{segment.label}</Text>
              <Text className="text-sm font-manrope-semibold text-ink">
                {Math.round(segment.value)}g
              </Text>
              <Text className="ml-2 w-10 text-right text-xs font-manrope text-ink-faint">
                {percent(segment.value)}%
              </Text>
            </View>
          ))}
        </View>
      </View>
      {totalGrams === 0 ? (
        <Text className="mt-4 text-xs font-manrope text-ink-faint">
          Nothing logged {periodLabel.toLowerCase()} yet — the split appears as you log meals.
        </Text>
      ) : null}
    </View>
  );
}

interface TrendPage {
  key: string;
  title: string;
  metric: BucketMetric;
  unit: "kcal" | "g";
  color: string;
}

const TREND_PAGES: TrendPage[] = [
  { key: "calories", title: "Calories", metric: "calories", unit: "kcal", color: LINE_COLORS.calories },
  { key: "protein", title: "Protein", metric: "protein", unit: "g", color: LINE_COLORS.protein },
  { key: "carbs", title: "Carbs", metric: "carbs", unit: "g", color: LINE_COLORS.carbs },
  { key: "fats", title: "Fats", metric: "fats", unit: "g", color: LINE_COLORS.fats },
];

/**
 * One trend chart per page in a swipeable, snap-to-page carousel instead of
 * three line charts stacked vertically. Dots show the active page.
 */
function TrendCarousel({ chartData }: { chartData: Bucket[] }) {
  const { width: windowWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);

  // Pages span the full padded content width (screen − outer 16×2 padding);
  // charts fit inside each page's card gutters (6×2) + card padding (16×2).
  const pageWidth = windowWidth - 32;
  const chartWidth = pageWidth - 12 - 32;
  const latest = chartData[chartData.length - 1];

  function handleMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setActiveIndex(Math.max(0, Math.min(TREND_PAGES.length - 1, index)));
  }

  return (
    <View>
      <ScrollView
        horizontal
        snapToInterval={pageWidth}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
      >
        {TREND_PAGES.map((page) => (
          <View key={page.key} style={{ width: pageWidth }}>
            <View className="mx-1.5 rounded-2xl bg-card p-4" style={SHADOWS.card}>
              <View className="mb-3 flex-row items-center">
                <View className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: page.color }} />
                <Text className="flex-1 text-base font-manrope-bold text-ink">{page.title}</Text>
                <Text className="text-xs font-manrope text-ink-muted">
                  {Math.round(latest[page.metric])} {page.unit}
                </Text>
              </View>
              <LineChart
                data={{
                  labels: chartData.map((item) => item.label),
                  datasets: [
                    {
                      data: chartData.map((item) => Math.round(item[page.metric])),
                    },
                  ],
                }}
                width={chartWidth}
                height={190}
                chartConfig={makeChartConfig(page.color)}
                bezier
                withInnerLines={false}
                withOuterLines={false}
                withShadow={false}
                style={{ borderRadius: 16 }}
              />
            </View>
          </View>
        ))}
      </ScrollView>
      <View className="mt-3 flex-row items-center justify-center">
        {TREND_PAGES.map((page, index) => (
          <View
            key={page.key}
            className={`mr-1.5 h-1.5 rounded-full ${
              index === activeIndex ? "w-5 bg-primary" : "w-1.5 bg-wash-deep"
            }`}
          />
        ))}
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

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["left", "right"]}>
      <AppHeader />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: bottomClearance }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mb-1 text-2xl font-manrope-extrabold text-ink">Analytics</Text>
        <Text className="mb-4 text-sm font-manrope text-ink-muted">
          Totals, macro split & trends — everything on one screen
        </Text>

        {!hasAnyData ? (
          <View className="rounded-2xl bg-card p-6" style={SHADOWS.card}>
            <Text className="text-center text-sm font-manrope text-ink-muted">
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
              <Text className="mb-4 text-center text-xs font-manrope text-ink-muted">
                Monthly view unlocks after at least 2 months of data.
              </Text>
            ) : null}

            {/* Hero: macro split donut with kcal + macro stats in one card */}
            <SplitHeroCard bucket={current} periodLabel={periodLabel} />

            {/* Trend charts: one per swipe, dots instead of a stacked wall */}
            <View className="mb-3 flex-row items-baseline justify-between">
              <Text className="text-base font-manrope-bold text-ink">Trends</Text>
              <Text className="text-xs font-manrope text-ink-muted">
                {periodNoun} totals · swipe to compare
              </Text>
            </View>
            <TrendCarousel chartData={chartData} />
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
