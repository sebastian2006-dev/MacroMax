import React from "react";
import { Text, View } from "react-native";
import { LowIntakeAlert } from "@/src/types";

export const LowIntakeAlertCard = React.memo(function LowIntakeAlertCard({ alert }: { alert: LowIntakeAlert }) {
  return (
    <View className="mb-2 rounded-2xl bg-tertiary-soft p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-manrope-bold text-tertiary-deep">⚠️ {alert.label} low</Text>
        <Text className="text-xs font-manrope-semibold text-tertiary-deep">{alert.percent}%</Text>
      </View>
      <Text className="mt-1 text-sm font-manrope text-ink-muted">{alert.message}</Text>
    </View>
  );
});
