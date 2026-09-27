import React, { useEffect } from "react";
import { Stack } from "expo-router";
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

export default function RootLayout() {
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
      </Stack>
    </SafeAreaProvider>
  );
}
