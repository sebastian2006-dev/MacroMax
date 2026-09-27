import React from "react";
import { Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/src/hooks/useAuth";

/**
 * Route gate for every authenticated screen.
 *
 * Gates on the PERSISTENT onboarding flag (not merely "a name exists"), which
 * is what fixes the onboarding loop: once the greeting flow is completed the
 * flag survives restarts and the greeting screen is bypassed entirely on
 * every later launch.
 *
 * While the one-time storage read settles, a quiet branded placeholder is
 * shown instead of a full-screen spinner — SQLite answers in
 * milliseconds, so this is a first-frame flash guard, not a loading state.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { hasCompletedOnboarding, initializing } = useAuth();

  if (initializing) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <Text className="font-manrope-extrabold text-2xl text-primary-ink">MacroMax</Text>
      </View>
    );
  }

  if (!hasCompletedOnboarding) {
    return <Redirect href="/login" />;
  }

  return <>{children}</>;
}
