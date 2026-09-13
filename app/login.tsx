import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/hooks/useAuth";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

/**
 * The MacroMax logo artwork already carries the brand name, so this screen
 * renders the image itself as the headline instead of repeating "MacroMax" in
 * a <Text> underneath it.
 *
 * Both axes are derived from the 844x653 source and pinned explicitly. With
 * only a percentage width, RN sizes the height itself and draws the artwork
 * letterboxed inside a much taller box — that is what produced the large empty
 * band between the logo and the subtitle beneath it. Matching both axes to the
 * artwork's own ratio keeps the image box exactly the logo's shape.
 */
const LOGO_WIDTH = 220;
const LOGO_HEIGHT = (LOGO_WIDTH * 653) / 844;

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
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          className="flex-1"
          // Centring lives here (flexGrow + justifyContent), NOT on an inner
          // `flex: 1` View: an inner flex:1 View pins the scrollable content to
          // the viewport height, so content taller than the screen overflows
          // and gets clipped instead of scrolling.
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              paddingHorizontal: 24,
              paddingVertical: 32,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <Image
                source={require("../assets/logo.png")}
                resizeMode="contain"
                accessibilityRole="image"
                accessibilityLabel="MacroMax"
                // Width AND height, both from the 844x653 artwork. With only a
                // percentage width RN picked the height itself and drew the logo
                // letterboxed in a far taller box - the big empty band between
                // the logo and the subtitle below it.
                style={{ width: LOGO_WIDTH, height: LOGO_HEIGHT }}
              />
              <Text className="font-manrope mt-3 text-center text-base leading-6 text-ink-muted">
                Track macros. Hit goals. Stay consistent.
              </Text>
            </View>

            <View className="rounded-3xl bg-card p-6" style={SHADOWS.cardLg}>
              <Text className="font-manrope-bold mb-1 text-lg leading-7 text-ink">
                What should we call you?
              </Text>
              <Text className="font-manrope mb-4 text-sm leading-5 text-ink-muted">
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
                <Text className="font-manrope mb-3 text-sm leading-5 text-danger">
                  {error}
                </Text>
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
                  <Text className="font-manrope-bold text-center text-base leading-6 text-card">
                    Start Tracking
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
