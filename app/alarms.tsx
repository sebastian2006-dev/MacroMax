import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { RequireAuth } from "@/components/RequireAuth";
import { useMealReminders } from "@/src/hooks/useMealReminders";
import {
  MEAL_KEYS,
  MealKey,
  MealReminder,
  formatRepeatLabel,
  formatTimeLabel,
  nextRingLabel,
} from "@/src/lib/mealReminders";
import { openBatterySettings, openExactAlarmSettings } from "@/src/lib/notifications";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

/** One meal reminder row: time + name on the left, on/off switch on the right. */
function ReminderCard({
  reminder,
  now,
  onToggle,
  onEdit,
}: {
  reminder: MealReminder;
  now: Date;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
}) {
  const nextRing = nextRingLabel(reminder, now);
  const repeat = formatRepeatLabel(reminder);

  return (
    <View className="mb-3 rounded-2xl bg-card p-4" style={SHADOWS.card}>
      <View className="flex-row items-center">
        <Pressable
          onPress={onEdit}
          android_ripple={null}
          accessibilityRole="button"
          accessibilityLabel={`Edit the ${reminder.name} reminder`}
          className="flex-1 flex-row items-center"
        >
          <Text
            maxFontSizeMultiplier={1.5}
            className={`text-3xl font-manrope-extrabold ${
              reminder.enabled ? "text-ink" : "text-ink-faint"
            }`}
          >
            {formatTimeLabel(reminder.hour, reminder.minute)}
          </Text>
          <View className="ml-3 flex-1">
            <Text numberOfLines={1} className="font-manrope-semibold text-sm text-ink">
              {reminder.name}
            </Text>
            <Text numberOfLines={1} className="font-manrope text-xs text-ink-muted">
              {repeat}
              {nextRing ? ` · next ${nextRing}` : ""}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.inkFaint} />
        </Pressable>

        <Switch
          value={reminder.enabled}
          onValueChange={onToggle}
          accessibilityLabel={`${reminder.name} reminders`}
          trackColor={{ false: COLORS.washDeep, true: COLORS.primary }}
          thumbColor={COLORS.card}
          style={{ marginLeft: 8 }}
        />
      </View>
    </View>
  );
}

function AlarmsContent() {
  const router = useRouter();
  const {
    reminders,
    permissionGranted,
    loading,
    deliveryAvailable,
    runningInExpoGo,
    save,
    requestPermission,
  } = useMealReminders();
  const [now, setNow] = useState(() => new Date());

  // Minute clock so "next 8:00 am" flips to tomorrow without a tap, and
  // whatever is currently ringing stops showing as "next".
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const handleToggle = useCallback(
    async (meal: MealKey, enabled: boolean) => {
      if (enabled && deliveryAvailable && !permissionGranted) {
        // Ask at the moment it matters, not on first launch.
        await requestPermission();
      }
      await save({ ...reminders, [meal]: { ...reminders[meal], enabled } });
    },
    [deliveryAvailable, permissionGranted, reminders, requestPermission, save]
  );

  const anyEnabled = useMemo(
    () => MEAL_KEYS.some((meal) => reminders[meal].enabled),
    [reminders]
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["left", "right"]}>
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
        <Text className="font-manrope-extrabold text-xl text-ink">Meal reminders</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="font-manrope mb-4 text-sm text-ink-muted">
          A friendly nudge at each meal time — breakfast, lunch, dinner and snacks.
          Reminders are scheduled by Android itself, so they still arrive when
          MacroMax is closed or swiped away.
        </Text>

        {/* Two different problems, two different cures: a missing permission is
            fixable here, but Expo Go cannot load expo-notifications at all, so
            there the only answer is a development (or release) build. */}
        {!deliveryAvailable ? (
          <View className="mb-4 rounded-2xl bg-tertiary-soft p-4" style={SHADOWS.card}>
            <Text className="font-manrope-bold text-base text-ink">
              {runningInExpoGo
                ? "Reminders need a development build"
                : "Reminders are not available in this build"}
            </Text>
            <Text className="font-manrope mt-1 text-sm text-ink-muted">
              {runningInExpoGo
                ? "Expo Go stopped supporting expo-notifications on Android in SDK 53, so scheduled reminders cannot run here. Your times and days are saved — install a development build (npx expo run:android) or the release APK and they start firing straight away."
                : "This build cannot schedule notifications, so reminders will not fire. Your times and days are still saved."}
            </Text>
          </View>
        ) : !permissionGranted ? (
          <View className="mb-4 rounded-2xl bg-tertiary-soft p-4" style={SHADOWS.card}>
            <Text className="font-manrope-bold text-base text-ink">
              Notifications are turned off
            </Text>
            <Text className="font-manrope mt-1 text-sm text-ink-muted">
              Without the notification permission Android will not show a
              reminder. Turn it on to let the pop-ups through.
            </Text>
            <Pressable
              onPress={() => void requestPermission()}
              accessibilityRole="button"
              className="mt-3 rounded-3xl bg-primary py-3"
            >
              <Text className="font-manrope-bold text-center text-ink">
                Allow notifications
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void Linking.openSettings()}
              accessibilityRole="button"
              className="mt-2 rounded-3xl border border-edge bg-card py-3"
            >
              <Text className="font-manrope-bold text-center text-ink">Open app settings</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator className="my-6" color={COLORS.primary} />
        ) : (
          MEAL_KEYS.map((meal) => (
            <ReminderCard
              key={meal}
              reminder={reminders[meal]}
              now={now}
              onToggle={(enabled) => void handleToggle(meal, enabled)}
              onEdit={() => router.push({ pathname: "/alarm-edit", params: { meal } })}
            />
          ))
        )}

        {anyEnabled ? (
          <Text className="font-manrope mb-4 text-center text-xs text-ink-faint">
            A reminder set to <Text className="font-manrope-semibold">Once</Text> turns
            itself off after it rings — switch it back on for the next day.
          </Text>
        ) : null}

        {/* Reliability: Android may hold a reminder back under Doze unless the
            app is allowed exact alarms, and OEM battery savers can hold it back
            further. Both fixes live in system settings, so they are offered as
            plain links rather than silently failing. */}
        <View className="rounded-2xl bg-card p-4" style={SHADOWS.card}>
          <Text className="font-manrope-bold mb-2 text-base text-ink">
            Arriving on time
          </Text>
          <Text className="font-manrope text-sm text-ink-muted">
            Android can deliver a reminder a few minutes late when it is saving
            power and MacroMax is not allowed exact alarms. Allowing it makes
            meal times land on the minute.
          </Text>
          <Pressable
            onPress={() => void openExactAlarmSettings()}
            accessibilityRole="button"
            className="mt-3 rounded-3xl bg-primary-soft py-3"
          >
            <Text className="font-manrope-semibold text-center text-primary-ink">
              Allow exact alarms
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void openBatterySettings()}
            accessibilityRole="button"
            className="mt-2 rounded-3xl border border-edge bg-card py-3"
          >
            <Text className="font-manrope-semibold text-center text-ink">
              Battery settings (set to Unrestricted)
            </Text>
          </Pressable>
          <Text className="font-manrope mt-3 text-xs text-ink-faint">
            Reminders cannot fire while the phone is powered off, or if MacroMax
            is force-stopped — a normal swipe from Recents is fine, and pending
            reminders are re-armed automatically after a restart.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function AlarmsScreen() {
  return (
    <RequireAuth>
      <AlarmsContent />
    </RequireAuth>
  );
}
