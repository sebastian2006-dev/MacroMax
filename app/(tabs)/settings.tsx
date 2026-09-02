import React, { memo, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RequireAuth } from "@/components/RequireAuth";
import { AppHeader } from "@/components/AppHeader";
import { useTabBarClearance } from "@/components/ScrollableTabBar";
import { UNIT_GRAM_DEFAULTS } from "@/src/lib/servingUnits";
import { isFatSecretConfigured } from "@/src/lib/fatSecret";
import { useAuth } from "@/src/hooks/useAuth";
import { useProfile } from "@/src/hooks/useProfile";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

interface GoalFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
}

/**
 * One labeled numeric target input. Memoized with a stable onChange from the
 * parent, so typing in a sibling goal field never re-renders this one.
 */
const GoalField = memo(function GoalField({ label, value, onChange }: GoalFieldProps) {
  return (
    <View className="mb-3">
      <Text className="font-manrope mb-1 text-sm text-ink-muted">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="Not set"
        placeholderTextColor={COLORS.inkFaint}
        className="rounded-3xl bg-wash px-4 py-3 font-manrope text-ink"
      />
    </View>
  );
});

function SettingsContent() {
  const { userId, name, setName } = useAuth();
  const { profile, loading, updateTargets } = useProfile(userId);
  const bottomClearance = useTabBarClearance();
  const fatSecretConnected = isFatSecretConfigured();
  const [displayName, setDisplayName] = useState(name ?? "");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);

  const onCaloriesChange = useCallback((value: string) => setCalories(value), []);
  const onProteinChange = useCallback((value: string) => setProtein(value), []);
  const onCarbsChange = useCallback((value: string) => setCarbs(value), []);
  const onFatsChange = useCallback((value: string) => setFats(value), []);

  useEffect(() => {
    if (name) {
      setDisplayName(name);
    }
  }, [name]);

  useEffect(() => {
    if (profile) {
      // 0 (or null) means "not configured" — show an empty field so the user
      // can leave a goal unset on purpose.
      setCalories(profile.target_calories > 0 ? String(profile.target_calories) : "");
      setProtein(profile.target_protein > 0 ? String(profile.target_protein) : "");
      setCarbs((profile.target_carbs ?? 0) > 0 ? String(profile.target_carbs) : "");
      setFats((profile.target_fats ?? 0) > 0 ? String(profile.target_fats) : "");
    }
  }, [profile]);

  async function handleSaveName() {
    if (!displayName.trim()) {
      return;
    }
    setNameSaving(true);
    await setName(displayName);
    setNameSaving(false);
  }

  async function handleSave() {
    const numeric = {
      target_calories: Number.parseInt(calories, 10) || 0,
      target_protein: Number.parseInt(protein, 10) || 0,
      target_carbs: Number.parseInt(carbs, 10) || 0,
      target_fats: Number.parseInt(fats, 10) || 0,
    };

    setSaving(true);
    const ok = await updateTargets(numeric);
    setSaving(false);
    setSaved(ok);
    if (ok) {
      setTimeout(() => setSaved(false), 2000);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["left", "right"]}>
      <AppHeader />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: bottomClearance }}
      >
        <Text className="font-manrope-extrabold mb-4 text-2xl text-ink">
          Profile & Settings
        </Text>

        {/* Your Name */}
        <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
          <Text className="font-manrope-bold mb-3 text-base text-ink">Your Name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={COLORS.inkFaint}
            autoCapitalize="words"
            className="rounded-3xl bg-wash px-4 py-3 font-manrope text-ink"
          />
          <Pressable
            onPress={() => void handleSaveName()}
            disabled={nameSaving || !displayName.trim()}
            className="mt-3 rounded-3xl bg-primary py-3.5 disabled:opacity-60"
            accessibilityRole="button"
          >
            {nameSaving ? (
              <ActivityIndicator color={COLORS.card} />
            ) : (
              <Text className="font-manrope-bold text-center text-card">Save Name</Text>
            )}
          </Pressable>
        </View>

        {/* Daily Goal Targets */}
        <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
          <Text className="font-manrope-bold mb-3 text-base text-ink">
            Daily Goal Targets
          </Text>
          <Text className="font-manrope mb-3 text-sm text-ink-muted">
            Goals show on the dashboard rings only once set. Leave a field blank
            to disable that goal.
          </Text>

          <GoalField label="Calories (kcal)" value={calories} onChange={onCaloriesChange} />
          <GoalField label="Protein (g)" value={protein} onChange={onProteinChange} />
          <GoalField label="Carbs (g)" value={carbs} onChange={onCarbsChange} />
          <GoalField label="Fats (g)" value={fats} onChange={onFatsChange} />

          {saved ? (
            <Text className="font-manrope mb-3 text-sm text-primary">
              Saved successfully.
            </Text>
          ) : null}

          <Pressable
            onPress={() => void handleSave()}
            disabled={saving}
            className="rounded-3xl bg-primary py-3.5 disabled:opacity-60"
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color={COLORS.card} />
            ) : (
              <Text className="font-manrope-bold text-center text-card">
                Save Targets
              </Text>
            )}
          </Pressable>
        </View>

        {/* Serving unit conversions */}
        <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
          <Text className="font-manrope-bold mb-3 text-base text-ink">
            Serving unit conversions
          </Text>
          <Text className="font-manrope mb-2 text-sm text-ink-muted">
            When you log by units or pieces, MacroMax converts using these
            default weights:
          </Text>
          {UNIT_GRAM_DEFAULTS.map((item) => (
            <View key={item.label} className="py-1">
              <View className="flex-row items-center justify-between">
                <Text className="font-manrope text-sm text-ink-muted">
                  1 {item.label}
                </Text>
                <Text className="font-manrope-semibold text-sm text-ink">
                  ≈ {item.gramsPerUnit} g
                </Text>
              </View>
            </View>
          ))}
          <Text className="font-manrope mt-2 text-xs text-ink-faint">
            Scanned & searched foods may also offer standard portions (1 cup, 1
            bar…) from the provider.
          </Text>
        </View>

        {/* Data sources */}
        <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
          <Text className="font-manrope-bold mb-3 text-base text-ink">
            Data sources
          </Text>
          <Text className="font-manrope text-sm text-ink-muted">
            Food lookups combine several sources, each individually guarded so a
            timeout or missing key never blocks a search:
          </Text>
          <Text className="font-manrope mt-2 text-sm text-ink-muted">
            • Text search → FatSecret Platform API (raw ingredients & dishes) +
            Open Food Facts (packaged products).
          </Text>
          <Text className="font-manrope mt-2 text-sm text-ink-muted">
            • Barcode scanning → Open Food Facts V2 product endpoint.
          </Text>
          <Text className="font-manrope mt-2 text-sm text-ink-muted">
            • Offline repeats → on-device cache of earlier lookups.
          </Text>
          <Text className="font-manrope mt-2 text-sm text-ink-muted">
            • Last resort → built-in reference list so searches never hang
            empty.
          </Text>

          <View className="mt-4 rounded-xl bg-wash px-3 py-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-manrope-semibold text-sm text-ink">
                FatSecret
              </Text>
              {fatSecretConnected ? (
                <Text className="font-manrope-semibold text-sm text-primary">
                  Connected
                </Text>
              ) : null}
            </View>
            {!fatSecretConnected ? (
              <Text className="font-manrope mt-1 text-xs text-ink-faint">
                Add EXPO_PUBLIC_FATSECRET_CLIENT_ID / CLIENT_SECRET in .env
              </Text>
            ) : null}
          </View>

          <View className="mt-2 flex-row items-center justify-between rounded-xl bg-wash px-3 py-3">
            <Text className="font-manrope-semibold text-sm text-ink">
              Open Food Facts
            </Text>
            <Text className="font-manrope text-xs text-ink-faint">
              No key required · custom User-Agent
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function SettingsScreen() {
  return (
    <RequireAuth>
      <SettingsContent />
    </RequireAuth>
  );
}
