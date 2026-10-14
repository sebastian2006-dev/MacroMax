import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  MealReminderMap,
  parseMealReminders,
} from "@/src/lib/mealReminders";
import {
  hasNotificationPermission,
  isExpoGoClient,
  loadMealReminders,
  notificationsAvailable,
  reconcileMealReminders,
  requestNotificationPermission,
  saveMealReminders,
} from "@/src/lib/notifications";

/**
 * Meal-reminder state for the alarms screens: the stored config, whether the
 * OS will actually show notifications, and the write path (persist + rebuild
 * the OS schedule in one step, so the two can never drift).
 */
export function useMealReminders() {
  const [reminders, setReminders] = useState<MealReminderMap>(() => parseMealReminders(null));
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [loading, setLoading] = useState(true);
  // Computed once: Expo Go cannot import expo-notifications at all, so the
  // screens need to say "use a development build" rather than "notifications
  // are off" — a permission prompt can never fix it there.
  const [delivery, setDelivery] = useState(() => ({
    available: notificationsAvailable(),
    expoGo: isExpoGoClient(),
  }));
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const [map, granted] = await Promise.all([
      loadMealReminders(),
      hasNotificationPermission().catch(() => false),
    ]);
    if (!mountedRef.current) {
      return;
    }
    setReminders(map);
    setPermissionGranted(granted);
    setDelivery({ available: notificationsAvailable(), expoGo: isExpoGoClient() });
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (next: MealReminderMap) => {
    const stamped = await saveMealReminders(next);
    if (mountedRef.current) {
      setReminders(stamped);
    }
    return stamped;
  }, []);

  const requestPermission = useCallback(async () => {
    const granted = await requestNotificationPermission().catch(() => false);
    if (mountedRef.current) {
      setPermissionGranted(granted);
    }
    return granted;
  }, []);

  return {
    reminders,
    permissionGranted,
    loading,
    /** False when this build cannot deliver reminders (Expo Go). */
    deliveryAvailable: delivery.available,
    /** True inside the Expo Go client, which needs a development build. */
    runningInExpoGo: delivery.expoGo,
    save,
    requestPermission,
    refresh,
  };
}

/**
 * Mounted once by the root layout. A one-shot alarm cannot switch itself off
 * at the moment it rings (nothing of ours runs while the app is dead), so the
 * next time the app comes to the foreground we compare what the OS still has
 * pending against storage and flip the reminders that already fired.
 *
 * Runs on mount and on every return to the foreground — deliberately not on a
 * timer: the notification itself is the OS's job, this only tidies up.
 */
export function useMealReminderWatchdog(): void {
  useEffect(() => {
    const run = async () => {
      try {
        await reconcileMealReminders();
      } catch (error) {
        // Never let a scheduling hiccup break app startup; the alarms screen
        // shows its own state and the next foreground retries.
        console.warn("Meal reminder reconcile failed", error);
      }
    };

    void run();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void run();
      }
    });

    return () => subscription.remove();
  }, []);
}
