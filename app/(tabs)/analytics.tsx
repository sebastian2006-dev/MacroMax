import React, { useCallback, useMemo, useState } from "react";
import {
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
import { getDateNDaysAgo } from "@/src/lib/nutrition";
import {
  AXIS_MIN_STEP,
  AXIS_SEGMENTS,
  buildDailyWindow,
  buildMonthlyWindow,
  computeAxisMax,
  formatAxisTick,
  TREND_DAY_COUNT,
  TREND_MONTH_COUNT,
  TrendMetric,
  TrendRange,
  TrendTotals,
  TrendWindow,
} from "@/src/lib/trendSeries";
import { CHART_COLORS, COLORS, MACRO_CHART_COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import { DailyLog } from "@/src/types";

/** Hex (#RRGGBB) → rgba() string for react-native-chart-kit callbacks. */
function rgba(hex: string, opacity: number): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const CHART_HEIGHT = 190;
/**
 * react-native-chart-kit insets the plot with `style.paddingRight` (default 64)
 * and draws the Y labels at `paddingRight − yLabelsOffset`. 48px keeps four
 * digits clear while handing each of the 7 date labels ~34px on a 360dp phone
 * — the default left them ~28px, which is where the collisions came from.
 */
const CHART_PADDING_RIGHT = 48;
const CHART_PADDING_TOP = 18;

function makeChartConfig(lineColor: string) {
  return {
    backgroundGradientFrom: COLORS.surface,
    backgroundGradientTo: COLORS.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => rgba(lineColor, opacity),
    labelColor: (opacity = 1) => rgba(CHART_COLORS.label, opacity),
    propsForDots: { r: "4", strokeWidth: "2", stroke: lineColor },
    // Chart-kit's 12px axis text was too wide for 7 date labels, so each one
    // collided with its neighbour and the dates read as "missing".
    propsForLabels: { fontSize: 10 },
    // A faint dashed band per axis step: without gridlines the line had no
    // scale to be read against, which is half of "the trend never changes".
    propsForBackgroundLines: {
      stroke: CHART_COLORS.grid,
      strokeWidth: 1,
      strokeDasharray: "4, 6",
    },
  };
}

// Trend line colors come from the high-contrast CHART_SERIES ramp: Calories
// = vivid violet, Protein = electric blue, Carbs = neon mint, Fats = bright
// amber. (The old MACRO_COLORS inks were text-safe but chart-invisible.)
const LINE_COLORS = {
  calories: MACRO_CHART_COLORS.calories,
  protein: MACRO_CHART_COLORS.protein,
  carbs: MACRO_CHART_COLORS.carbs,
  fats: MACRO_CHART_COLORS.fats,
};

/**
 * Hero card: the macro split donut with the period's calories in its centre
 * and the protein/carbs/fat breakdown as a compact legend. This replaces the
 * three separate stat tiles + donut + legend stack of the previous build.
 */
function SplitHeroCard({
  totals,
  periodLabel,
  periodShortLabel,
}: {
  totals: TrendTotals;
  periodLabel: string;
  periodShortLabel: string;
}) {
  const totalGrams = totals.protein + totals.carbs + totals.fats;
  const percent = (value: number) => (totalGrams > 0 ? Math.round((value / totalGrams) * 100) : 0);

  // Macro split ring: same CHART_SERIES hues as the trend lines, so a macro
  // keeps ONE color identity across every chart in the app.
  const segments: MacroDonutSegment[] = [
    { key: "protein", label: "Protein", value: totals.protein, color: MACRO_CHART_COLORS.protein },
    { key: "carbs", label: "Carbs", value: totals.carbs, color: MACRO_CHART_COLORS.carbs },
    { key: "fats", label: "Fats", value: totals.fats, color: MACRO_CHART_COLORS.fats },
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
          centerValue={String(Math.round(totals.calories))}
          centerLabel={`kcal · ${periodShortLabel}`}
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
          Nothing logged in the {periodLabel.toLowerCase()} yet — the split appears as you log
          meals.
        </Text>
      ) : null}
    </View>
  );
}

interface TrendPage {
  key: TrendMetric;
  title: string;
  metric: TrendMetric;
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
function TrendCarousel({ trendWindow }: { trendWindow: TrendWindow }) {
  const { width: windowWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);

  // Pages span the full padded content width (screen − outer 16×2 padding);
  // charts fit inside each page's card gutters (6×2) + card padding (16×2).
  const pageWidth = windowWidth - 32;
  const chartWidth = pageWidth - 12 - 32;
  const points = trendWindow.points;
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  // One honest caption per range: in the day view the final point is TODAY and
  // is still filling up, which reads as "the chart stopped updating" unless it
  // is spelled out.
  const caption =
    trendWindow.range === "days"
      ? lastPoint?.isCurrent
        ? "Today is still filling up — every meal you log lifts the last point."
        : `${firstPoint?.label} – ${lastPoint?.label}`
      : "Each point is that month's total.";

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
        {TREND_PAGES.map((page) => {
          // The plotted values, plus our own explicit Y ceiling: chart-kit
          // otherwise scales the axis to exactly the tallest value, which pins
          // the peak to the top edge and flattens the apparent swing.
          const values = points.map((point) => Math.round(point[page.metric]));
          const axisMax = computeAxisMax(values, AXIS_MIN_STEP[page.metric]);
          const average = Math.round(trendWindow.average[page.metric]);

          return (
          <View key={page.key} style={{ width: pageWidth }}>
            <View className="mx-1.5 rounded-2xl bg-card p-4" style={SHADOWS.card}>
              <View className="mb-3 flex-row items-center">
                <View className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: page.color }} />
                <Text className="flex-1 text-base font-manrope-bold text-ink">{page.title}</Text>
                <Text className="text-xs font-manrope text-ink-muted">
                  avg {average} {page.unit}
                </Text>
              </View>
              <LineChart
                data={{
                  labels: points.map((point) => point.label),
                  datasets: [{ data: values }],
                }}
                width={chartWidth}
                height={CHART_HEIGHT}
                chartConfig={makeChartConfig(page.color)}
                bezier
                // fromZero + fromNumber pin the axis: 0 at the bottom, our
                // headroom ceiling at the top, in AXIS_SEGMENTS equal bands.
                fromZero
                fromNumber={axisMax}
                segments={AXIS_SEGMENTS}
                formatYLabel={formatAxisTick}
                withVerticalLines={false}
                withOuterLines={false}
                withShadow={false}
                style={{
                  borderRadius: 16,
                  paddingRight: CHART_PADDING_RIGHT,
                  paddingTop: CHART_PADDING_TOP,
                }}
              />
              <Text className="mt-2 text-xs font-manrope text-ink-faint">{caption}</Text>
            </View>
          </View>
          );
        })}
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
  const [range, setRange] = useState<TrendRange>("days");
  const bottomClearance = useTabBarClearance();

  const loadLogs = useCallback(async () => {
    if (!userId) {
      setLogs([]);
      return;
    }

    try {
      const startDate = getDateNDaysAgo(120);
      const data = await getDailyLogs(startDate);
      setLogs(data);
    } catch (error) {
      // The tab is a read-only view; a failed read leaves the previous data
      // on screen instead of blanking it.
      console.warn("Failed to load daily logs for analytics", error);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void loadLogs();
    }, [loadLogs])
  );

  // Two windows over the same 120 days of history: per-day for "did today move
  // the line?", per-month for the long arc. Both come from pure helpers, so the
  // bucketing itself is unit-tested (test/trendSeries.test.ts).
  const daysWindow = useMemo(() => buildDailyWindow(logs, TREND_DAY_COUNT), [logs]);
  const monthsWindow = useMemo(() => buildMonthlyWindow(logs, TREND_MONTH_COUNT), [logs]);
  const trendWindow = range === "days" ? daysWindow : monthsWindow;
  const periodLabel =
    range === "days" ? `Last ${TREND_DAY_COUNT} days` : `Last ${TREND_MONTH_COUNT} months`;
  const periodShortLabel = range === "days" ? `${TREND_DAY_COUNT} days` : `${TREND_MONTH_COUNT} months`;
  const periodNoun = range === "days" ? "Daily" : "Monthly";

  const hasMonthlyData = monthsWindow.points.filter((point) => point.calories > 0).length >= 2;
  const hasAnyData = logs.some(
    (log) =>
      log.total_calories > 0 ||
      log.total_protein > 0 ||
      log.total_carbs > 0 ||
      log.total_fats > 0
  );

  // No full-screen spinner — the local query is fast and the empty state
  // below is itself the natural loading state for a brand-new install.

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
                onPress={() => setRange("days")}
                className={`flex-1 rounded-full py-2 ${range === "days" ? "bg-card" : ""}`}
                style={SHADOWS.card}
              >
                <Text
                  className={`text-center text-sm ${
                    range === "days"
                      ? "font-manrope-bold text-primary-ink"
                      : "font-manrope-semibold text-ink-muted"
                  }`}
                >
                  {TREND_DAY_COUNT} days
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setRange("months")}
                disabled={!hasMonthlyData}
                className={`flex-1 rounded-full py-2 ${
                  range === "months" ? "bg-card" : ""
                } ${!hasMonthlyData ? "opacity-50" : ""}`}
                style={SHADOWS.card}
              >
                <Text
                  className={`text-center text-sm ${
                    range === "months"
                      ? "font-manrope-bold text-primary-ink"
                      : "font-manrope-semibold text-ink-muted"
                  }`}
                >
                  {TREND_MONTH_COUNT} months
                </Text>
              </Pressable>
            </View>
            {!hasMonthlyData ? (
              <Text className="mb-4 text-center text-xs font-manrope text-ink-muted">
                The {TREND_MONTH_COUNT}-month view unlocks once two months have data.
              </Text>
            ) : null}

            {/* Hero: macro split donut with kcal + macro stats in one card */}
            <SplitHeroCard
              totals={trendWindow.totals}
              periodLabel={periodLabel}
              periodShortLabel={periodShortLabel}
            />

            {/* Trend charts: one per swipe, dots instead of a stacked wall */}
            <View className="mb-3 flex-row items-baseline justify-between">
              <Text className="text-base font-manrope-bold text-ink">Trends</Text>
              <Text className="text-xs font-manrope text-ink-muted">
                {periodNoun} totals · swipe to compare
              </Text>
            </View>
            <TrendCarousel trendWindow={trendWindow} />
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
