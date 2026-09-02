import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/hooks/useAuth";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

export default function LoginScreen() {
  const router = useRouter();
  const { setName } = useAuth();
  const [name, setNameInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter your name.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await setName(trimmed);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your name.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-center bg-surface px-6"
      >
        <View className="mb-8 items-center">
          <View className="mb-4 h-16 w-16 items-center justify-center self-center rounded-3xl bg-primary-soft">
            <Ionicons name="pie-chart" size={30} color={COLORS.primary} />
          </View>
          <Text className="font-manrope-extrabold text-4xl text-ink">MacroMax</Text>
          <Text className="font-manrope mt-2 text-base text-ink-muted">
            Track macros. Hit goals. Stay consistent.
          </Text>
        </View>

        <View className="rounded-3xl bg-card p-6" style={SHADOWS.cardLg}>
          <Text className="font-manrope-bold mb-1 text-lg text-ink">
            What should we call you?
          </Text>
          <Text className="font-manrope mb-4 text-sm text-ink-muted">
            We'll use your name for a personal greeting. No account needed.
          </Text>

          <TextInput
            value={name}
            onChangeText={setNameInput}
            placeholder="Your name"
            placeholderTextColor={COLORS.inkFaint}
            autoCapitalize="words"
            className="mb-4 rounded-3xl bg-wash px-4 py-3 font-manrope text-ink"
          />

          {error ? (
            <Text className="font-manrope mb-3 text-sm text-danger">{error}</Text>
          ) : null}

          <Pressable
            onPress={() => void handleSubmit()}
            disabled={loading}
            className="rounded-3xl bg-primary py-3.5 disabled:opacity-60"
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color={COLORS.card} />
            ) : (
              <Text className="font-manrope-bold text-center text-base text-card">
                Start Tracking
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
