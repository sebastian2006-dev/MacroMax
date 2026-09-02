import React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSyncStatus } from "@/src/hooks/useSyncStatus";
import { SyncMode } from "@/src/lib/syncStatus";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

const MODE_COLORS: Record<SyncMode, string> = {
  idle: COLORS.inkFaint,
  local: COLORS.primary,
  cached: COLORS.inkMuted,
  online: COLORS.secondary,
  mixed: COLORS.tertiary,
  offline: COLORS.danger,
};

interface AppHeaderProps {
  /** "dark" for use over the camera scanner; otherwise light. */
  variant?: "light" | "dark";
}

/**
 * Pinned top app header: "MacroMax" branding plus a live data-source status
 * pill (FatSecret / Open Food Facts online lookups vs local/cached data).
 */
export function AppHeader({ variant = "light" }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const sync = useSyncStatus();
  const isDark = variant === "dark";

  return (
    <View
      style={{ paddingTop: insets.top }}
      className={isDark ? "bg-transparent" : "bg-surface"}
    >
      <View className="flex-row items-center justify-between px-4 pb-3 pt-3">
        <Text
          className={`font-manrope-extrabold text-2xl tracking-tight ${
            isDark ? "text-card" : "text-ink"
          }`}
        >
          MacroMax
        </Text>

        <View
          accessibilityLabel={`Data source: ${sync.label}. ${sync.detail}`}
          className={`flex-row items-center rounded-full px-3 py-1.5 ${
            isDark ? "bg-white/15" : "bg-card"
          }`}
          style={SHADOWS.card}
        >
          <View
            className="mr-1.5 h-2 w-2 rounded-full"
            style={{ backgroundColor: MODE_COLORS[sync.mode] }}
          />
          <Text
            className={`font-manrope-bold text-xs ${
              isDark ? "text-card" : "text-ink-muted"
            }`}
          >
            {sync.label}
          </Text>
        </View>
      </View>
    </View>
  );
}
