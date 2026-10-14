import React, { useCallback, useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import "../global.css";
import { COLORS } from "@/src/theme/colors";
import { configureNotificationHandler, useNotificationOpenHandler } from "@/src/lib/notifications";
import { useMealReminderWatchdog } from "@/src/hooks/useMealReminders";

/*
 * Foreground presentation for meal reminders: while the app IS open the OS
 * hands the notification to this handler, so it has to opt into showing a
 * banner. When the app is closed the OS shows it on its own — no JS needed.
 *
 * Safe at module scope: it loads expo-notifications lazily and no-ops where the
 * module cannot be imported at all (Expo Go) instead of throwing on import.
 */
configureNotificationHandler();

export default function RootLayout() {
  const router = useRouter();

  // Start loading Manrope, but never let it gate the first paint: if the fonts
  // are slow or fail to load, the app used to sit on a full-screen spinner
  // forever. Text falls back to the system font and swaps in when ready.
  const [, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontError) {
      console.warn("Manrope could not be loaded; using the system font.", fontError);
    }
  }, [fontError]);

  /*
   * Reconcile meal reminders on launch and on every return to the foreground:
   * a one-shot alarm cannot un-set itself while the app is dead, so this is
   * where "it already rang" is noticed and the switch is turned off.
   */
  useMealReminderWatchdog();

  // Tapping a reminder lands on the Daily Log, where the meal is logged. The
  // handler also covers the cold start (see useNotificationOpenHandler), and
  // is a no-op where reminders cannot be delivered.
  const openDailyLog = useCallback(() => {
    router.push("/log");
  }, [router]);
  useNotificationOpenHandler(openDailyLog);

  return (
    /*
      initialMetrics seeds the provider with the real window insets from the
      first frame. Without it, Android (edge-to-edge) reports a zero bottom
      inset on the initial render and only corrects it later — which let the
      custom tab bar paint under/over the system gesture bar and glitch.
    */
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {/* Dark glyphs: every surface behind the status bar is light. */}
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.surface },
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="search" />
        <Stack.Screen name="scanner" />
        <Stack.Screen name="alarms" />
        <Stack.Screen name="alarm-edit" />
      </Stack>
    </SafeAreaProvider>
  );
}
