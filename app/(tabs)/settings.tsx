import React, { memo, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { RequireAuth } from "@/components/RequireAuth";
import { AppHeader } from "@/components/AppHeader";
import { useTabBarClearance } from "@/components/ScrollableTabBar";
import { UNIT_GRAM_DEFAULTS } from "@/src/lib/servingUnits";
import { isFatSecretConfigured } from "@/src/lib/fatSecret";
import { useAuth } from "@/src/hooks/useAuth";
import { useProfile } from "@/src/hooks/useProfile";
import { useMealReminders } from "@/src/hooks/useMealReminders";
import { MEAL_KEYS, formatTimeLabel } from "@/src/lib/mealReminders";
import { exportBackup, pickBackupFile } from "@/src/lib/backup";
import { BackupError, summarizeBackup } from "@/src/lib/backupData";
import { readAllUserData, restoreAllData } from "@/src/lib/db";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import * as Updates from "expo-updates";

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

/**
 * Meal reminders entry point: summarizes what is armed and opens the alarms
 * screen. Kept as its own component so the settings form never re-renders on
 * a reminder tick.
 */
const MealRemindersCard = memo(function MealRemindersCard() {
  const router = useRouter();
  const { reminders } = useMealReminders();

  const active = MEAL_KEYS.filter((meal) => reminders[meal].enabled);
  const summary =
    active.length === 0
      ? "No reminders on yet — get a friendly nudge at breakfast, lunch, dinner or snack time."
      : active
          .map((meal) => `${reminders[meal].name} ${formatTimeLabel(reminders[meal].hour, reminders[meal].minute)}`)
          .join(" · ");

  return (
    <Pressable
      onPress={() => router.push("/alarms")}
      android_ripple={null}
      accessibilityRole="button"
      accessibilityLabel="Open meal reminders"
      className="mb-4 rounded-2xl bg-card p-4"
      style={SHADOWS.card}
    >
      <View className="flex-row items-center">
        <View className="flex-1">
          <Text className="font-manrope-bold text-base text-ink">Meal reminders</Text>
          <Text className="font-manrope mt-1 text-sm text-ink-muted">{summary}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.inkFaint} />
      </View>
      {active.length > 0 ? (
        <Text className="font-manrope mt-2 text-xs text-primary-ink">
          {active.length} reminder{active.length === 1 ? "" : "s"} scheduled
        </Text>
      ) : null}
    </Pressable>
  );
});

/**
 * Data Management card: full local backup → share sheet (Task 4 export),
 * restore from a picked backup file (Task 4 import). Import is destructive
 * and confirmed with the file's own summary before anything is touched; the
 * app then offers a reload so every screen re-reads the restored database.
 */
function DataManagementCard() {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  async function handleExport() {
    setBusy("export");
    try {
      const payload = await readAllUserData();
      await exportBackup(payload);
    } catch (error) {
      Alert.alert(
        "Export failed",
        error instanceof BackupError
          ? error.message
          : "Something went wrong while writing your backup."
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    setBusy("import");
    try {
      const picked = await pickBackupFile();
      if (!picked) return; // user cancelled the picker

      const summary = summarizeBackup(picked.payload);
      const exportedAt = picked.payload.exported_at;
      const exportedLabel =
        exportedAt && exportedAt !== new Date(0).toISOString()
          ? new Date(exportedAt).toLocaleString()
          : "unknown date";

      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Restore backup?",
          `"${picked.filename}" (${exportedLabel}) contains ${summary}.\n\n` +
            `Restoring REPLACES everything currently on this device — ` +
            `logs, recipes, goals and settings.`,
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Restore", style: "destructive", onPress: () => resolve(true) },
          ]
        );
      });
      if (!confirmed) return;

      await restoreAllData(picked.payload);

      Alert.alert(
        "Backup restored",
        "Your data has been replaced with the backup. Reload the app now?",
        [
          {
            text: "Later",
            style: "cancel",
          },
          {
            text: "Reload",
            onPress: () => {
              // expo-updates' reload restarts the JS runtime, which reopens
              // the restored database from scratch in every screen/hook.
              void Updates.reloadAsync().catch(() => {
                // A refused reload is cosmetic — data is already restored.
              });
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        "Import failed",
        error instanceof BackupError
          ? error.message
          : "That file could not be restored."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
      <Text className="font-manrope-bold mb-2 text-base text-ink">Data management</Text>
      <Text className="font-manrope mb-4 text-sm text-ink-muted">
        Everything lives on this device. Save a backup to your files or cloud,
        and restore it here — for example after switching phones or reinstalling.
      </Text>

      <Pressable
        onPress={() => void handleExport()}
        disabled={busy !== null}
        className="mb-2 rounded-3xl bg-primary py-3.5 disabled:opacity-60"
        accessibilityRole="button"
      >
        {busy === "export" ? (
          <ActivityIndicator color={COLORS.ink} />
        ) : (
          <Text className="font-manrope-bold text-center text-ink">Export backup</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => void handleImport()}
        disabled={busy !== null}
        className="rounded-3xl border border-edge bg-card py-3.5 disabled:opacity-60"
        accessibilityRole="button"
      >
        {busy === "import" ? (
          <ActivityIndicator color={COLORS.ink} />
        ) : (
          <Text className="font-manrope-bold text-center text-ink">Import backup</Text>
        )}
      </Pressable>

      <Text className="font-manrope mt-3 text-xs leading-4 text-ink-faint">
        A backup includes your logs, meals, recipes, goals, name and settings —
        as a JSON file you can keep anywhere. Importing one replaces what is on
        this device.
      </Text>
    </View>
  );
}

function SettingsContent() {
  const { userId, name, setName } = useAuth();
  const { profile, updateTargets } = useProfile(userId);
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

  // No full-screen spinner: the profile is a local SQLite read that lands in
  // milliseconds — render instantly, fill in as data arrives.

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
              <ActivityIndicator color={COLORS.ink} />
            ) : (
              <Text className="font-manrope-bold text-center text-ink">Save Name</Text>
            )}
          </Pressable>
        </View>

        {/* Daily Goal Targets + the fat limit */}
        <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
          <Text className="font-manrope-bold mb-3 text-base text-ink">
            Daily Goals & Limits
          </Text>
          <Text className="font-manrope mb-3 text-sm text-ink-muted">
            Goals show on the dashboard rings only once set. Leave a field blank
            to disable that goal.
          </Text>

          <GoalField label="Calories (kcal)" value={calories} onChange={onCaloriesChange} />
          <GoalField label="Protein (g)" value={protein} onChange={onProteinChange} />
          <GoalField label="Carbs (g)" value={carbs} onChange={onCarbsChange} />

          <View className="mb-3 mt-1 h-px w-full bg-wash-deep" />

          <Text className="font-manrope mb-3 text-sm text-ink-muted">
            Fats is an upper limit rather than a goal, so it never nudges you to
            eat more — you are only warned once you go over it. Set whatever
            ceiling suits you, or leave it blank to stop tracking it.
          </Text>
          <GoalField label="Fats (g) — daily limit" value={fats} onChange={onFatsChange} />

          {saved ? (
            <Text className="font-manrope mb-3 text-sm text-primary-ink">
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
              <ActivityIndicator color={COLORS.ink} />
            ) : (
              <Text className="font-manrope-bold text-center text-ink">
                Save Targets
              </Text>
            )}
          </Pressable>
        </View>

        {/* Meal reminders: breakfast / lunch / dinner / snacks */}
        <MealRemindersCard />

        {/* Data management: local backup export / import (Task 4) */}
        <DataManagementCard />

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
                <Text className="font-manrope-semibold text-sm text-primary-ink">
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
