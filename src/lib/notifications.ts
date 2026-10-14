/**
 * Thin adapter over expo-notifications for the four meal reminders.
 *
 * All the decision-making lives in `src/lib/mealReminders.ts` (pure, tested);
 * this file only talks to the OS: create the Android channel, ask for the
 * notification permission, apply/cancel the schedules and reconcile what the
 * OS actually has pending against what SQLite says.
 *
 * ⚠️ WHY expo-notifications IS LOADED LAZILY (do not turn this back into a
 * top-level `import * as Notifications from "expo-notifications"`):
 * merely importing the package runs its push-token auto-registration side
 * effect (`DevicePushTokenAutoRegistration.fx`), which calls
 * `addPushTokenListener()`, which calls `warnOfExpoGoPushUsage()` — and that
 * function THROWS on Android inside Expo Go ("Android Push notifications ...
 * was removed from Expo Go with the release of SDK 53"). A static import
 * therefore crashed the whole app at startup in Expo Go, at the import line in
 * `app/_layout.tsx`, before any screen ever rendered.
 *
 * Meal reminders only use LOCAL scheduled notifications, so Expo Go is the one
 * environment where they genuinely cannot work; everywhere else (a development
 * build, a release APK) this module loads normally and schedules for real.
 * `loadNotifications()` is the single guarded entry point, and it is never
 * called before `isRunningInExpoGo()` says it is safe.
 *
 * `expo-intent-launcher` is loaded lazily for the same reason: its Android
 * entry point is `requireNativeModule('ExpoIntentLauncher')` evaluated at module
 * scope, so a static import would throw wherever that native module is absent.
 * It is only ever needed when the user taps "Allow exact alarms".
 */

import type * as ExpoNotifications from "expo-notifications";
// Safe as a static import: the `expo` package is always present, and only the
// two native integrations below carry import-time side effects (see the header)
// — both of which are loaded lazily, never here.
import { isRunningInExpoGo } from "expo";
import { Linking, Platform } from "react-native";
import { useEffect, useRef } from "react";
import { getAppPref, setAppPref, USER_PREF_KEYS } from "@/src/lib/db";
import {
  MEAL_KEYS,
  MEAL_REMINDER_CHANNEL_ID,
  MealReminderMap,
  describeSchedules,
  isMealScheduleId,
  parseMealReminders,
  reconcilePlan,
  scheduleIdsFor,
  serializeMealReminders,
} from "@/src/lib/mealReminders";

type NotificationsApi = typeof ExpoNotifications;

/** Android package id, needed to open this app's exact-alarm settings page. */
const ANDROID_PACKAGE = "com.macromax.app";

/**
 * True when the app is running inside the Expo Go client, where the
 * expo-notifications module cannot even be imported (see the header). Reported
 * by the same `expo` helper the library's own guard uses, so the two can never
 * disagree about whether loading it is safe.
 */
export function isExpoGoClient(): boolean {
  try {
    return isRunningInExpoGo() === true;
  } catch {
    // An undeterminable environment degrades to "assume it can work" rather
    // than disabling the feature.
    return false;
  }
}

let cachedModule: NotificationsApi | null | undefined;

/**
 * The notification API, or null when this build cannot deliver reminders.
 *
 * Cached after the first call. Never throws: a missing native module (or Expo
 * Go) is a supported state, not an error — the alarms screen and the reconcile
 * pass both read the null and degrade quietly.
 */
function loadNotifications(): NotificationsApi | null {
  if (cachedModule !== undefined) {
    return cachedModule;
  }

  if (isExpoGoClient()) {
    cachedModule = null;
    return null;
  }

  try {
    // Deliberately not a static import: see the file header. Loading it here,
    // only after the Expo Go guard above, is what keeps the app booting there.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import of this package throws on Android in Expo Go before any screen renders
    cachedModule = require("expo-notifications") as NotificationsApi;
  } catch (error) {
    console.warn("expo-notifications is unavailable in this build", error);
    cachedModule = null;
  }
  return cachedModule;
}

/** True when this build can schedule and show meal reminders. */
export function notificationsAvailable(): boolean {
  return loadNotifications() !== null;
}

/**
 * Foreground presentation. Android's own notification system shows a scheduled
 * notification when the app is dead; this handler decides what happens when
 * the app happens to be open (a heads-up banner, not silence).
 */
export function configureNotificationHandler(): void {
  const Notifications = loadNotifications();
  if (!Notifications) {
    return;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Create the Android channel. Must run BEFORE requesting permission: on
 * Android 13+ the runtime prompt is tied to the app having a channel to enable.
 * Importance HIGH is what makes the reminder a real heads-up pop-up.
 */
export async function ensureMealReminderChannel(): Promise<void> {
  const Notifications = loadNotifications();
  if (!Notifications || Platform.OS !== "android") {
    return;
  }
  await Notifications.setNotificationChannelAsync(MEAL_REMINDER_CHANNEL_ID, {
    name: "Meal reminders",
    description: "Breakfast, lunch, dinner and snack reminders.",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#10B981",
  });
}

/** True when the OS will actually display our notifications. */
export async function hasNotificationPermission(): Promise<boolean> {
  const Notifications = loadNotifications();
  if (!Notifications) {
    return false;
  }
  const settings = await Notifications.getPermissionsAsync();
  return (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

/** Ask for the notification permission (channel must exist first). */
export async function requestNotificationPermission(): Promise<boolean> {
  const Notifications = loadNotifications();
  if (!Notifications) {
    return false;
  }
  await ensureMealReminderChannel();
  const settings = await Notifications.requestPermissionsAsync();
  return (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

/**
 * Open Android's per-app "Alarms & reminders" screen so the user can grant
 * exact-alarm access (Android 14 denies it by default for new installs).
 *
 * SDK 57's expo-notifications has no JS API for this permission — its Android
 * scheduler checks `canScheduleExactAlarms()` itself and falls back to an
 * inexact alarm — so without this deep link the pop-up would still arrive, but
 * potentially a few minutes late under Doze. Any failure (older Android, an
 * OEM that renames the screen) falls back to the app's settings page.
 */
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openSettings();
    return;
  }
  try {
    // Loaded on demand, not at import time — see the file header. If the module
    // or its native half is missing, the catch below still gets the user to a
    // settings page.
    const IntentLauncher = await import("expo-intent-launcher");
    await IntentLauncher.startActivityAsync(
      "android.settings.REQUEST_SCHEDULE_EXACT_ALARM",
      { data: `package:${ANDROID_PACKAGE}` }
    );
  } catch {
    await Linking.openSettings();
  }
}

/** Opens this app's system settings, where Battery → Unrestricted lives. */
export async function openBatterySettings(): Promise<void> {
  await Linking.openSettings();
}

/** The stored reminder config (never throws; falls back to defaults). */
export async function loadMealReminders(): Promise<MealReminderMap> {
  try {
    return parseMealReminders(await getAppPref(USER_PREF_KEYS.mealReminders));
  } catch (error) {
    console.warn("Could not read the meal reminders from SQLite", error);
    return parseMealReminders(null);
  }
}

/** Identifiers of the meal-reminder notifications currently pending in the OS. */
export async function getScheduledMealIds(): Promise<string[]> {
  const Notifications = loadNotifications();
  if (!Notifications) {
    return [];
  }
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.map((request) => request.identifier).filter(isMealScheduleId);
}

async function cancelIds(identifiers: readonly string[]): Promise<void> {
  const Notifications = loadNotifications();
  if (!Notifications) {
    return;
  }
  await Promise.all(
    identifiers.map(async (identifier) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      } catch {
        // Cancelling an id that isn't pending is a no-op, not an error worth
        // surfacing: the reconcile pass cancels by identifier, not by diff.
      }
    })
  );
}

/** Stamp one-shot reminders with the moment they were armed. */
function stampReminders(map: MealReminderMap, now: Date): MealReminderMap {
  const stamped: MealReminderMap = {} as MealReminderMap;
  for (const meal of MEAL_KEYS) {
    const reminder = map[meal];
    stamped[meal] =
      reminder.enabled && reminder.once
        ? { ...reminder, armedAt: now.toISOString() }
        : { ...reminder, armedAt: undefined };
  }
  return stamped;
}

/**
 * Replace the OS-side schedule with exactly what `map` describes. Cancelling
 * every identifier a meal can own (one-shot + all seven weekdays) first means
 * an edit can never leave a stale repeat behind — e.g. unticking Tuesday.
 *
 * One-shot reminders are stamped with `armedAt` so a later reconcile pass can
 * tell "it rang while the app was dead" apart from "it was never armed".
 *
 * With no notification module (Expo Go) the config is still stamped and
 * returned, so storage stays consistent and a later dev/release build schedules
 * it on its next launch — the reminders are simply inert until then.
 */
export async function applyMealReminders(map: MealReminderMap): Promise<MealReminderMap> {
  const Notifications = loadNotifications();
  const now = new Date();
  const stamped = stampReminders(map, now);

  if (!Notifications) {
    return stamped;
  }

  await ensureMealReminderChannel();

  const schedules = describeSchedules(stamped, now);
  await cancelIds(MEAL_KEYS.flatMap((meal) => scheduleIdsFor(meal)));

  await Promise.all(
    schedules.map((entry) => {
      const trigger: ExpoNotifications.NotificationTriggerInput =
        entry.trigger.kind === "date"
          ? {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: entry.trigger.date,
              channelId: MEAL_REMINDER_CHANNEL_ID,
            }
          : {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday: entry.trigger.weekday,
              hour: entry.trigger.hour,
              minute: entry.trigger.minute,
              channelId: MEAL_REMINDER_CHANNEL_ID,
            };

      return Notifications.scheduleNotificationAsync({
        identifier: entry.identifier,
        content: {
          title: entry.title,
          body: entry.body,
          data: entry.data,
          // Category is used by the notification response listener to route
          // a tap; there is no action sheet behind it (blocking actions would
          // defeat the point of a gentle reminder).
          categoryIdentifier: "meal-reminder",
        },
        trigger,
      });
    })
  );

  return stamped;
}

/** Persist the config and rebuild the OS schedule from it. */
export async function saveMealReminders(map: MealReminderMap): Promise<MealReminderMap> {
  const stamped = stampReminders(map, new Date());
  await setAppPref(USER_PREF_KEYS.mealReminders, serializeMealReminders(stamped));
  await applyMealReminders(stamped);
  return stamped;
}

/** Disable every reminder (used when the user turns the feature off wholesale). */
export async function disableAllMealReminders(map: MealReminderMap): Promise<MealReminderMap> {
  const disabled = {} as MealReminderMap;
  for (const meal of MEAL_KEYS) {
    disabled[meal] = { ...map[meal], enabled: false, armedAt: undefined };
  }
  return saveMealReminders(disabled);
}

/**
 * Launch/foreground pass: turn off one-shot alarms that already rang while the
 * app was dead, and re-arm anything the OS no longer has pending (a restored
 * backup, a cleared schedule).
 *
 * Skipped entirely where reminders cannot be delivered: with no OS schedule to
 * compare against, "already rang" cannot be distinguished from "never armed",
 * and guessing would just switch the user's alarm off.
 */
export async function reconcileMealReminders(): Promise<MealReminderMap> {
  if (!notificationsAvailable()) {
    return loadMealReminders();
  }

  const stored = await loadMealReminders();
  const plan = reconcilePlan(stored, await getScheduledMealIds(), new Date());

  if (plan.changed) {
    await setAppPref(USER_PREF_KEYS.mealReminders, serializeMealReminders(plan.next));
  }
  if (plan.needsReschedule) {
    await cancelIds(plan.staleIds);
    await applyMealReminders(plan.next);
  }

  return plan.next;
}

/**
 * Navigate when the user taps a reminder — including the cold start, where the
 * tap happened before any listener could exist (the response is waiting in
 * `getLastNotificationResponseAsync`, and is cleared once handled so a later
 * remount doesn't replay the navigation).
 */
export function useNotificationOpenHandler(onOpen: () => void): void {
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const Notifications = loadNotifications();
    if (!Notifications) {
      return;
    }

    const handle = (response: ExpoNotifications.NotificationResponse | null) => {
      const identifier = response?.notification?.request?.identifier;
      if (!identifier || handledRef.current === identifier) {
        return;
      }
      handledRef.current = identifier;
      onOpen();
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(handle);

    void Notifications.getLastNotificationResponseAsync()
      .then(async (response) => {
        handle(response);
        if (response) {
          await Notifications.clearLastNotificationResponseAsync();
        }
      })
      .catch(() => {
        // A missing "last response" is the normal case, not a failure.
      });

    return () => subscription.remove();
  }, [onOpen]);
}
