import React from "react";
import { Text, View } from "react-native";
import { LimitAlert } from "@/src/types";

/**
 * Warning card for a macro the user tracks as an upper LIMIT that has been
 * exceeded.
 *
 * Deliberately mirrors LowIntakeAlertCard's layout but uses the destructive
 * palette instead of the tertiary one, so "you went over your fat limit" does
 * not read like "you have not eaten enough yet".
 */
export const LimitAlertCard = React.memo(function LimitAlertCard({ alert }: { alert: LimitAlert }) {
  return (
    <View className="mb-2 rounded-2xl bg-danger-soft p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-manrope-bold text-danger">
          ⚠️ {alert.label} limit exceeded
        </Text>
        <Text className="text-xs font-manrope-semibold text-danger">{alert.percent}%</Text>
      </View>
      <Text className="mt-1 text-sm font-manrope text-ink-muted">{alert.message}</Text>
    </View>
  );
});
