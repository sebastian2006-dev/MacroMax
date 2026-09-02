import React from "react";
import { Tabs } from "expo-router";
import { ScrollableTabBar } from "@/components/ScrollableTabBar";

/**
 * Bottom navigation — a horizontal sliding window (ScrollableTabBar) because
 * the app now carries five destinations (Today's Overview, Daily Log, Custom
 * Dish, Analytics, Profile). The custom bar owns its bottom safe-area inset
 * so nothing gets truncated by gesture-nav bars. The barcode scanner lives
 * on the root stack (full-screen camera), reached from Today / Daily Log.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <ScrollableTabBar {...props} />}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Today", tabBarLabel: "Today" }}
      />
      <Tabs.Screen
        name="log"
        options={{ title: "Daily Log", tabBarLabel: "Daily Log" }}
      />
      <Tabs.Screen
        name="recipe"
        options={{ title: "Custom Dish", tabBarLabel: "Custom Dish" }}
      />
      <Tabs.Screen
        name="analytics"
        options={{ title: "Analytics", tabBarLabel: "Analytics" }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Profile", tabBarLabel: "Profile" }}
      />
    </Tabs>
  );
}
