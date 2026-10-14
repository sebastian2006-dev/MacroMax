import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { RequireAuth } from "@/components/RequireAuth";
import { TimeWheel } from "@/components/TimeWheel";
import { WeekdayChips } from "@/components/WeekdayChips";
import { useMealReminders } from "@/src/hooks/useMealReminders";
import {
  ALL_DAYS,
  MAX_REMINDER_NAME_LENGTH,
  MEAL_LABELS,
  MealKey,
  MealReminder,
  formatNextLabel,
  formatRepeatLabel,
  formatTimeLabel,
  isMealKey,
  nextOccurrence,
} from "@/src/lib/mealReminders";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

/** One label/subtitle row with a trailing control, Samsung-editor style. */
function SettingRow({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between py-3">
      <View className="mr-3 flex-1">
        <Text className="font-manrope-semibold text-base text-ink">{title}</Text>
        <Text className="font-manrope text-xs text-ink-muted">{subtitle}</Text>
      </View>
      {children}
    </View>
  );
}

function EditorContent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string }>();
  const meal: MealKey = isMealKey(params.meal) ? params.meal : "breakfast";

  const { reminders, permissionGranted, loading, save, requestPermission } = useMealReminders();
  const [draft, setDraft] = useState<MealReminder | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Seed the draft once storage has answered. After that the draft is the
  // single source of truth for this screen, so the list's state can't fight
  // an in-progress edit.
  useEffect(() => {
    if (!loading && draft === null) {
      setDraft(reminders[meal]);
    }
  }, [loading, draft, reminders, meal]);

  // "No days ticked" IS the one-shot mode (Samsung's own behaviour), so the
  // switch reflects either the explicit flag or an empty weekday row.
  const isOnce = draft ? draft.once || draft.days.length === 0 : false;
  const nextLabel = useMemo(() => {
    if (!draft) {
      return "";
    }
    return formatNextLabel(nextOccurrence({ ...draft, once: isOnce }, now), now);
  }, [draft, isOnce, now]);

  const setDays = useCallback((days: number[]) => {
    setDraft((previous) => (previous ? { ...previous, days, once: false } : previous));
  }, []);

  const setOnce = useCallback((once: boolean) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }
      // Turning the one-shot switch off needs something to repeat on, so an
      // empty weekday row becomes "every day" rather than a dead alarm.
      return { ...previous, once, days: once ? previous.days : previous.days.length > 0 ? previous.days : [...ALL_DAYS] };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) {
      return;
    }
    setSaving(true);
    if (!permissionGranted) {
      await requestPermission();
    }
    await save({
      ...reminders,
      [meal]: {
        ...draft,
        once: isOnce,
        // Saving an alarm is how you turn it on — same as the system clock app.
        enabled: true,
      },
    });
    setSaving(false);
    router.back();
  }, [draft, isOnce, meal, permissionGranted, reminders, requestPermission, router, save]);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["left", "right"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center px-4 pb-2 pt-3">
          <Pressable
            onPress={() => router.back()}
            android_ripple={null}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="mr-2 h-10 w-10 items-center justify-center rounded-full bg-card"
            style={SHADOWS.card}
          >
            <Ionicons name="chevron-back" size={20} color={COLORS.ink} />
          </Pressable>
          <Text className="font-manrope-extrabold text-xl text-ink">
            {MEAL_LABELS[meal]} reminder
          </Text>
        </View>

        {draft === null ? (
          <ActivityIndicator className="my-10" color={COLORS.primary} />
        ) : (
          <>
            {/* The wheel: hour / minute / am-pm, keyed by meal so switching
                reminders re-seeds it instead of reusing the old scroll. */}
            <TimeWheel
              key={meal}
              hour={draft.hour}
              minute={draft.minute}
              onChange={({ hour, minute }) =>
                setDraft((previous) => (previous ? { ...previous, hour, minute } : previous))
              }
            />

            {/* The sheet card — same structure as the system alarm editor,
                restyled into the app's light Emerald Ring theme. */}
            <View className="mx-4 mt-2 rounded-3xl bg-card p-4" style={SHADOWS.sheet}>
              <View className="flex-row items-center justify-between">
                <Text className="font-manrope-semibold text-base text-ink">{nextLabel}</Text>
                <Ionicons name="calendar-outline" size={20} color={COLORS.primaryInk} />
              </View>

              <View className="mt-4">
                <WeekdayChips days={draft.days} onChange={setDays} muted={isOnce} />
              </View>

              {/* Alarm name — the system editor's underlined field. */}
              <View className="mt-4 border-b border-edge pb-1">
                <TextInput
                  value={draft.name}
                  onChangeText={(name) =>
                    setDraft((previous) => (previous ? { ...previous, name } : previous))
                  }
                  placeholder="Alarm name"
                  placeholderTextColor={COLORS.inkFaint}
                  maxLength={MAX_REMINDER_NAME_LENGTH}
                  accessibilityLabel="Alarm name"
                  className="py-1 font-manrope text-base text-ink"
                />
              </View>

              <View className="mt-2">
                <SettingRow
                  title="Ring once"
                  subtitle="Turns off after it rings"
                >
                  <Switch
                    value={isOnce}
                    onValueChange={setOnce}
                    accessibilityLabel="Ring once and turn off"
                    trackColor={{ false: COLORS.washDeep, true: COLORS.primary }}
                    thumbColor={COLORS.card}
                  />
                </SettingRow>

                <View className="h-px w-full bg-wash-deep" />

                <SettingRow
                  title="Meal"
                  subtitle={`Ties this reminder to ${MEAL_LABELS[meal]} in your log`}
                >
                  <Text className="font-manrope-semibold text-sm text-primary-ink">
                    {MEAL_LABELS[meal]}
                  </Text>
                </SettingRow>

                <View className="h-px w-full bg-wash-deep" />

                <SettingRow
                  title="Repeats"
                  subtitle={
                    isOnce
                      ? `Once, at ${formatTimeLabel(draft.hour, draft.minute)}`
                      : `${formatRepeatLabel(draft)} at ${formatTimeLabel(draft.hour, draft.minute)}`
                  }
                >
                  <Ionicons name="time-outline" size={18} color={COLORS.inkFaint} />
                </SettingRow>
              </View>
            </View>

            {/* Cancel / Save, mirroring the system editor's footer. */}
            <View className="mt-4 flex-row items-center justify-between px-6">
              <Pressable
                onPress={() => router.back()}
                android_ripple={null}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                className="px-4 py-3"
              >
                <Text className="font-manrope-semibold text-base text-ink-muted">Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => void handleSave()}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Save"
                className="rounded-3xl bg-primary px-8 py-3 disabled:opacity-60"
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.ink} />
                ) : (
                  <Text className="font-manrope-bold text-base text-ink">Save</Text>
                )}
              </Pressable>
            </View>

            <Text className="font-manrope mt-3 px-6 text-center text-xs text-ink-faint">
              Saving turns this reminder on. It arrives as a notification even when
              MacroMax is closed.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function AlarmEditScreen() {
  return (
    <RequireAuth>
      <EditorContent />
    </RequireAuth>
  );
}
