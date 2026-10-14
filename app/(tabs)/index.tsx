import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { RequireAuth } from "@/components/RequireAuth";
import { AppHeader } from "@/components/AppHeader";
import { DynamicGreeting } from "@/components/DynamicGreeting";
import { MonthCalendar } from "@/components/MonthCalendar";
import { MacroRing } from "@/components/MacroRing";
import { MacroCard } from "@/components/MacroCard";
import { LowIntakeAlertCard } from "@/components/LowIntakeAlertCard";
import { LimitAlertCard } from "@/components/LimitAlertCard";
import { useTabBarClearance } from "@/components/ScrollableTabBar";
import { useAuth } from "@/src/hooks/useAuth";
import { useProfile } from "@/src/hooks/useProfile";
import { useDailyLog } from "@/src/hooks/useDailyLog";
import { useLoggedDatesInMonth } from "@/src/hooks/useLoggedDatesInMonth";
import { weekOf } from "@/src/lib/monthGrid";
import {
  calculateTotals,
  getGoalTargets,
  getLimitAlerts,
  getLowIntakeAlerts,
  resolveGoalTargets,
  toLocalDateString,
} from "@/src/lib/nutrition";
import { COLORS, RING_COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

const ZERO_PROFILE = {
  target_calories: 0,
  target_protein: 0,
  target_carbs: 0,
  target_fats: 0,
};

type IoniconName = keyof typeof Ionicons.glyphMap;

/** The hour from which "gentle nudges" are allowed to appear. */
const NUDGE_START_HOUR = 22; // 10:00 PM

/** Quick-action tile row — memoized so dashboard re-renders skip it entirely. */
const QuickActionsCard = memo(function QuickActionsCard({
  actions,
}: {
  actions: { label: string; icon: IoniconName; onPress: () => void }[];
}) {
  return (
    <View className="mb-2 rounded-2xl bg-card p-4" style={SHADOWS.card}>
      <View className="flex-row">
        {actions.map((action, index) => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            className={`flex-1 items-center justify-center rounded-2xl bg-primary-soft px-2 py-4 ${
              index < actions.length - 1 ? "mr-2" : ""
            }`}
          >
            {/* Dark ink sibling: bright mint on a pale mint chip is 1.4:1. */}
            <Ionicons name={action.icon} size={24} color={COLORS.primaryInk} />
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
  );
});

function DashboardContent() {
  const router = useRouter();
  const { userId, name } = useAuth();
  const { profile, refresh: refreshProfile } = useProfile(userId);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { items, locked, refresh: refreshLog } = useDailyLog(userId, selectedDate);
  const tabBarClearance = useTabBarClearance();

  // Minute-granularity clock so time-gated UI (nudges after 22:00) flips
  // without user interaction, yet only re-renders once per minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const todayString = useMemo(() => toLocalDateString(new Date()), []);

  // The strip follows the SELECTED day (not "today"), because the expanded
  // month grid can select any day of the month — a strip pinned to this week
  // would then highlight nothing. The Today pill jumps the strip back.
  const weekDates = useMemo(() => weekOf(selectedDate), [selectedDate]);

  const { loggedDates, refresh: refreshLoggedDates } = useLoggedDatesInMonth(
    userId,
    selectedDate
  );

  useFocusEffect(
    useCallback(() => {
      void refreshLog();
      void refreshProfile();
      void refreshLoggedDates();
    }, [refreshLog, refreshProfile, refreshLoggedDates])
  );

  const totals = useMemo(() => calculateTotals(items), [items]);
  // Rings need a denominator even before goals are configured, so they use the
  // resolved (defaulted) goals; the alert helpers below keep the CONFIGURED
  // ones — falling short of a default the user never chose shouldn't nag.
  const goals = useMemo(() => resolveGoalTargets(profile ?? ZERO_PROFILE), [profile]);
  const targets = useMemo(() => getGoalTargets(profile ?? ZERO_PROFILE), [profile]);
  const alerts = useMemo(() => getLowIntakeAlerts(totals, targets), [totals, targets]);
  // Fats is an upper limit, not a goal, so it is checked separately from the
  // "eat more" nudges above: staying under it is never worth flagging.
  const limitAlerts = useMemo(() => getLimitAlerts(totals, targets), [totals, targets]);

  const isToday = toLocalDateString(selectedDate) === todayString;

  // TIME-GATED NUDGES: hidden all day; they only surface once the clock has
  // passed 10:00 PM (and the user still has unmet goals — `alerts` already
  // encodes that). No full-day nagging, just a late-evening catch-up hint.
  const showNudges = now.getHours() >= NUDGE_START_HOUR;
  const visibleAlerts = useMemo(
    () => (showNudges ? alerts : []),
    [showNudges, alerts]
  );

  const quickActions = useMemo(
    () => [
      {
        label: "Add Food",
        icon: "search" as IoniconName,
        onPress: () =>
          router.push({
            pathname: "/search",
            params: { date: toLocalDateString(selectedDate) },
          }),
      },
      {
        label: "Scan Barcode",
        icon: "barcode-outline" as IoniconName,
        onPress: () =>
          router.push({
            pathname: "/scanner",
            params: { date: toLocalDateString(selectedDate) },
          }),
      },
      {
        label: "Custom Dish",
        icon: "add-circle-outline" as IoniconName,
        onPress: () => router.push({ pathname: "/recipe", params: {} }),
      },
    ],
    [router, selectedDate]
  );

  // No full-screen spinner: local SQLite reads land in milliseconds and the
  // UI renders instantly with empty state, filling in as data arrives.

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["left", "right"]}>
      <AppHeader />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: tabBarClearance }}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting tablet — session-static phrase inside an animated
            gradient pill; the date line lives inside the tablet now. */}
        <DynamicGreeting name={name} date={selectedDate} />

        {/* Completed badge for the selected (locked) day */}
        {locked ? (
          <View className="mb-2 flex-row justify-end">
            <View
              className="flex-row items-center rounded-full bg-primary-soft px-2.5 py-1"
              accessibilityLabel="Day completed"
            >
              <Ionicons name="checkmark-circle" size={13} color={COLORS.primaryInk} />
              <Text className="font-manrope-bold ml-1 text-xs text-primary-ink">Completed</Text>
            </View>
          </View>
        ) : null}

        {/* Week strip + collapsible whole-month view (see MonthCalendar). The
            expanded grid is laid out in normal flow with fixed pixel rows, so
            it pushes the rings below it down instead of colliding with them. */}
        <MonthCalendar
          anchor={selectedDate}
          weekDates={weekDates}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          isToday={isToday}
          loggedDates={loggedDates}
        />

        {/* Rings: strict, non-collapsing flex row. The explicit minHeight
            guarantees the row can never measure to 0 during a re-render
            (which is what let the rings overlap the calendar above), and the
            ring cards themselves are NOT flex-1-height — their height comes
            from the fixed-size SVG box inside (see MacroRing). */}
        <View className="mb-4 w-full flex-row" style={{ minHeight: 200 }}>
          <View className="mr-2 flex-1">
            <MacroRing
              label="Calories"
              value={totals.calories}
              unit="kcal"
              target={goals.targets.calories}
              isDefaultGoal={goals.usingDefault.calories}
              color={RING_COLORS.calories}
            />
          </View>
          <View className="ml-2 flex-1">
            <MacroRing
              label="Protein"
              value={totals.protein}
              unit="g"
              target={goals.targets.protein}
              isDefaultGoal={goals.usingDefault.protein}
              color={RING_COLORS.protein}
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

        {/* Daily summary numbers — carries the fats-over-limit warning inline,
            replacing the old separate "Today's Macros" progress-bar card. */}
        <View className="mb-4">
          <MacroCard title="Daily Summary" macros={totals} fatsTarget={targets.fats} />
        </View>

        {/* Breached limits first — these ask for action, the nudges below don't */}
        {limitAlerts.length > 0 ? (
          <View className="mb-4">
            <Text className="mb-2 text-base font-manrope-bold text-ink">Watch your limits</Text>
            {limitAlerts.map((alert) => (
              <LimitAlertCard key={alert.key} alert={alert} />
            ))}
          </View>
        ) : null}

        {/* Gentle nudges — ONLY after 10 PM, and only when goals are unmet */}
        {visibleAlerts.length > 0 ? (
          <View className="mb-4">
            <Text className="mb-2 text-base font-manrope-bold text-ink">Gentle nudges</Text>
            {visibleAlerts.map((alert) => (
              <LowIntakeAlertCard key={alert.key} alert={alert} />
            ))}
          </View>
        ) : null}

        {/* Quick actions (memoized — skipped on unrelated dashboard updates) */}
        <QuickActionsCard actions={quickActions} />
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