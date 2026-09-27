import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/hooks/useAuth";
import { parseGoalInputs } from "@/src/lib/nutrition";
import { WALKTHROUGH_SLIDES } from "@/src/lib/walkthrough";
import { updateProfileTargets } from "@/src/lib/db";
import { BRAND, COLORS, PALETTE } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import { LinearGradient } from "expo-linear-gradient";

/**
 * The first-run experience, three sequential steps:
 *   1. Name        → who are we greeting?
 *   2. Goals       → daily targets, with a prominent "Set it later / Skip".
 *   3. Walkthrough → 3 swipeable slides introducing Search / Log / Track.
 *
 * WHY PLAIN STEP SWITCHING, NOT A HORIZONTAL STEP PAGER: the previous build
 * nested the walkthrough's horizontal pager INSIDE a horizontal step pager.
 * Same-direction nested ScrollViews contest every gesture — the outer pager
 * swallowed the swipes meant for the walkthrough slides — and sizing the
 * outer pages from useWindowDimensions misaligned them on real devices
 * (cards torn across the screen edge, the neighbour page leaking in). Now
 * only ONE horizontal pager exists on screen (the walkthrough, step 3), and
 * its slides are width: "100%" of the pager itself — no window math at all.
 *
 * Step components unmount between steps, but that loses nothing: the name and
 * goal values all live in THIS component's state and are passed down as
 * props. The persistent "onboarding complete" flag flips only at the END of
 * step 3 — quitting mid-flow replays the flow (name already saved), while
 * finishing it once means it never appears again on any later launch.
 */

const LOGO_SIZE = 132;
const LOGO_RADIUS = LOGO_SIZE / 2;

type Step = 0 | 1 | 2;

const STEP_LABELS = ["Welcome", "Your goals", "How it works"] as const;

/** Devices at least this wide (Android's sw600dp tablet threshold) get the tablet layout: cards cap their width, center, and scale the type up. */
const TABLET_BREAKPOINT = 600;

export default function LoginScreen() {
  const router = useRouter();
  const { finishOnboarding, setName } = useAuth();

  const [step, setStep] = useState<Step>(0);
  const [name, setNameInput] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goalsAreBlank = useMemo(
    () =>
      calories.trim() === "" &&
      protein.trim() === "" &&
      carbs.trim() === "" &&
      fats.trim() === "",
    [calories, protein, carbs, fats]
  );

  async function handleStart() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter your name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Persist the name FIRST: identity must survive even if the flow stops
      // on a later step (the onboarding flag only flips at the very end).
      await setName(trimmed);
      setError(null);
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your name.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      // Whatever was typed — or nothing at all on skip. parseGoalInputs maps
      // blanks to 0 = "not configured" (no rings, no nudges, no defaults).
      await updateProfileTargets(parseGoalInputs({ calories, protein, carbs, fats }));
      await finishOnboarding();
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your goals.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom", "left", "right"]}>
      {/* Airy boot gradient — the same field the native splash paints (#F4F9F6). */}
      <LinearGradient
        colors={[COLORS.surface, COLORS.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <StepDots step={step} />
        {step === 0 ? (
          <StepShell>
            <NameStep
              name={name}
              onChangeName={setNameInput}
              onStart={() => void handleStart()}
              saving={saving}
              error={error}
            />
          </StepShell>
        ) : step === 1 ? (
          <StepShell>
            <GoalsStep
              values={{ calories, protein, carbs, fats }}
              onChange={{
                calories: setCalories,
                protein: setProtein,
                carbs: setCarbs,
                fats: setFats,
              }}
              onContinue={() => setStep(2)}
              goalsAreBlank={goalsAreBlank}
            />
          </StepShell>
        ) : (
          <StepShell>
            <WalkthroughStep onFinish={() => void handleFinish()} saving={saving} error={error} />
          </StepShell>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Progress indicator: three labeled dots, one per onboarding step. */
function StepDots({ step }: { step: Step }) {
  return (
    <View className="items-center pt-2">
      <View className="mb-1 flex-row items-center">
        {STEP_LABELS.map((label, index) => (
          <View
            key={label}
            className={`mx-1 h-1.5 rounded-full ${
              index === step ? "w-6 bg-primary" : index < step ? "w-1.5 bg-primary-soft" : "w-1.5 bg-wash-deep"
            }`}
          />
        ))}
      </View>
      <Text className="font-manrope text-xs text-ink-faint">{STEP_LABELS[step]}</Text>
    </View>
  );
}

/** Shared chrome for one onboarding step. */
function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-1" style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
      {children}
    </View>
  );
}

// ── Shared primary button ────────────────────────────────────────────────────

function PrimaryButton({
  onPress,
  disabled,
  label,
  loading = false,
}: {
  onPress: () => void;
  disabled?: boolean;
  label: string;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="rounded-3xl disabled:opacity-60"
      accessibilityRole="button"
    >
      {/* Mint family only: the label is deep emerald (6:1+); white on mint is 1.9:1. */}
      <LinearGradient
        colors={[BRAND.mint, BRAND.mintGreen]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ borderRadius: 24, paddingVertical: 14 }}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.ink} />
        ) : (
          <Text className="font-manrope-bold text-center text-base leading-6 text-ink">
            {label}
          </Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

// ── Step 1: Name ─────────────────────────────────────────────────────────────

function NameStep({
  name,
  onChangeName,
  onStart,
  saving,
  error,
}: {
  name: string;
  onChangeName: (value: string) => void;
  onStart: () => void;
  saving: boolean;
  error: string | null;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= TABLET_BREAKPOINT;
  return (
    <View className="flex-1 justify-center">
      <View style={{ alignItems: "center", marginBottom: 24 }}>
        {/*
          The artwork is a full-bleed square of dark emerald; a circular mask
          turns it into a badge echoing the ring motif. The clip lives on an
          INNER view (overflow hidden drops the view's own iOS shadow), while
          the outer view carries radius + shadow.
        */}
        <View
          style={{
            borderRadius: LOGO_RADIUS,
            backgroundColor: PALETTE.emeraldField,
            shadowColor: "#0F172A",
            shadowOpacity: 0.18,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
          }}
        >
          <View
            style={{
              width: LOGO_SIZE,
              height: LOGO_SIZE,
              borderRadius: LOGO_RADIUS,
              overflow: "hidden",
            }}
          >
            <Image
              source={require("../assets/macromax_A_ring_1024.png")}
              resizeMode="cover"
              accessibilityRole="image"
              accessibilityLabel="MacroMax"
              style={{ width: LOGO_SIZE, height: LOGO_SIZE }}
            />
          </View>
        </View>
        <Text className="font-manrope mt-4 text-center text-base leading-6 text-ink-muted">
          Track macros. Hit goals. Stay consistent.
        </Text>
      </View>

      <View
        className="w-full self-center rounded-3xl bg-card p-6"
        style={[SHADOWS.cardLg, isTablet ? { maxWidth: 560 } : null]}
      >
        <Text className="font-manrope-bold mb-1 text-lg leading-7 text-ink">
          What should we call you?
        </Text>
        <Text className="font-manrope mb-4 text-sm leading-5 text-ink-muted">
          We&apos;ll use your name for a personal greeting. No account needed.
        </Text>

        <TextInput
          value={name}
          onChangeText={onChangeName}
          placeholder="Your name"
          placeholderTextColor={COLORS.inkFaint}
          autoCapitalize="words"
          className="mb-4 rounded-3xl bg-wash px-4 py-3 font-manrope text-ink"
          onSubmitEditing={onStart}
          returnKeyType="go"
        />

        {error ? (
          <Text className="font-manrope mb-3 text-sm leading-5 text-danger">{error}</Text>
        ) : null}

        <PrimaryButton onPress={onStart} disabled={saving} label="Continue" loading={saving} />
      </View>
    </View>
  );
}

// ── Step 2: Goals ────────────────────────────────────────────────────────────

const GOAL_FIELDS: { key: "calories" | "protein" | "carbs" | "fats"; label: string }[] = [
  { key: "calories", label: "Calories (kcal)" },
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fats", label: "Fats (g, daily limit)" },
];

function GoalsStep({
  values,
  onChange,
  onContinue,
  goalsAreBlank,
}: {
  values: Record<"calories" | "protein" | "carbs" | "fats", string>;
  onChange: Record<"calories" | "protein" | "carbs" | "fats", (value: string) => void>;
  onContinue: () => void;
  goalsAreBlank: boolean;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= TABLET_BREAKPOINT;
  return (
    <View className="flex-1 justify-center">
      <ScrollView
        contentContainerStyle={{ paddingVertical: 8 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          className="w-full self-center rounded-3xl bg-card p-6"
          style={[SHADOWS.cardLg, isTablet ? { maxWidth: 560 } : null]}
        >
          <Text className="font-manrope-bold mb-1 text-lg leading-7 text-ink">
            Set your daily goals
          </Text>
          <Text className="font-manrope mb-4 text-sm leading-5 text-ink-muted">
            These power the rings and nudges on your dashboard. Not sure yet?
            Leave them blank — you can set or change them any time in Settings.
          </Text>

          {GOAL_FIELDS.map((field) => (
            <View key={field.key} className="mb-3">
              <Text className="font-manrope mb-1 text-sm text-ink-muted">{field.label}</Text>
              <TextInput
                value={values[field.key]}
                onChangeText={onChange[field.key]}
                keyboardType="number-pad"
                placeholder="Not sure yet"
                placeholderTextColor={COLORS.inkFaint}
                className="rounded-3xl bg-wash px-4 py-3 font-manrope text-ink"
              />
            </View>
          ))}

          {goalsAreBlank ? (
            <Text className="font-manrope mb-3 text-xs leading-4 text-ink-faint">
              Skipping is fine — MacroMax will show sensible default rings and
              never nag you about goals you didn&apos;t choose.
            </Text>
          ) : null}

          <PrimaryButton onPress={onContinue} label="Continue" />

          <Pressable onPress={onContinue} accessibilityRole="button" className="mt-3 py-2">
            <Text className="font-manrope-bold text-center text-base text-primary-ink">
              Set it later / Skip
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}// ── Step 3: Walkthrough ──────────────────────────────────────────────────────────

function WalkthroughStep({
  onFinish,
  saving,
  error,
}: {
  onFinish: () => void;
  saving: boolean;
  error: string | null;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= TABLET_BREAKPOINT;
  const [index, setIndex] = useState(0);
  /**
   * The pager's REAL width, measured from its own frame. Slide children must
   * size to this PIXEL value: `width: "100%"` inside a horizontal ScrollView
   * resolves against the growing content container, not the viewport — the
   * slides rendered wider than the card, text escaped its edges, and
   * pagingEnabled landed on misaligned offsets (the blank-card / clipped-text
   * bug from the device screenshots).
   */
  const [pagerWidth, setPagerWidth] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  const isLast = index >= WALKTHROUGH_SLIDES.length - 1;

  const goTo = useCallback(
    (slideIndex: number) => {
      const clamped = Math.max(0, Math.min(WALKTHROUGH_SLIDES.length - 1, slideIndex));
      setIndex(clamped);
      if (pagerWidth > 0) {
        pagerRef.current?.scrollTo({ x: clamped * pagerWidth, animated: true });
      }
    },
    [pagerWidth]
  );

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const width = event.nativeEvent.layoutMeasurement.width;
    if (width > 0) {
      setIndex(
        Math.min(
          WALKTHROUGH_SLIDES.length - 1,
          Math.max(0, Math.round(event.nativeEvent.contentOffset.x / width))
        )
      );
    }
  }

  const slideMinHeight = isTablet ? 380 : 300;

  return (
    <View className="flex-1 justify-center">
      { /*
          The ONLY horizontal pager in the flow (the step pager was removed —
          see the module comment), so nothing contests its swipes anymore.
      */ }
      <View
        onLayout={(event) => setPagerWidth(event.nativeEvent.layout.width)}
        className="w-full self-center overflow-hidden rounded-3xl bg-card"
        style={[SHADOWS.cardLg, isTablet ? { maxWidth: 680 } : null]}
      >
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
        >
          {WALKTHROUGH_SLIDES.map((slide, slideIndex) => (
            <View
              key={slide.id}
              style={{ width: pagerWidth, minHeight: slideMinHeight }}
              className="items-center justify-center px-8 py-10"
            >
              <View
                className="mb-5 items-center justify-center rounded-3xl bg-primary-soft"
                style={{ width: isTablet ? 92 : 64, height: isTablet ? 92 : 64 }}
              >
                <Ionicons
                  name={slide.icon as keyof typeof Ionicons.glyphMap}
                  size={isTablet ? 44 : 30}
                  color={COLORS.primaryInk}
                />
              </View>
              <Text
                className="font-manrope-bold mb-3 text-center text-ink"
                style={{ fontSize: isTablet ? 26 : 18, lineHeight: isTablet ? 34 : 26 }}
              >
                {slide.title}
              </Text>
              <Text
                className="font-manrope text-center text-ink-muted"
                style={{
                  fontSize: isTablet ? 17 : 14,
                  lineHeight: isTablet ? 26 : 20,
                  // Comfy measure on wide screens instead of full-bleed lines.
                  maxWidth: 460,
                }}
              >
                {slide.body}
              </Text>
              {slideIndex === WALKTHROUGH_SLIDES.length - 1 ? null : (
                <Text className="font-manrope mt-6 text-xs text-ink-faint">Swipe →</Text>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Tappable dots — swipe OR tap to move between slides. */}
        <View className="flex-row items-center justify-center pb-3 pt-1">
          {WALKTHROUGH_SLIDES.map((slide, slideIndex) => (
            <Pressable
              key={slide.id}
              onPress={() => goTo(slideIndex)}
              accessibilityRole="button"
              accessibilityLabel={`Go to slide ${slideIndex + 1} of ${WALKTHROUGH_SLIDES.length}`}
              className="px-1.5 py-1.5"
              hitSlop={6}
            >
              <View
                className={`h-1.5 rounded-full ${
                  slideIndex === index ? "w-5 bg-primary" : "w-1.5 bg-wash-deep"
                }`}
              />
            </Pressable>
          ))}
        </View>
      </View>

      {error ? (
        <Text className="font-manrope mb-3 mt-4 text-center text-sm leading-5 text-danger">
          {error}
        </Text>
      ) : null}

      <View
        className="mt-6 self-center"
        style={isTablet ? { width: "100%", maxWidth: 420 } : undefined}
      >
        <PrimaryButton
          onPress={() => (isLast ? onFinish() : goTo(index + 1))}
          disabled={saving}
          label={isLast ? "Start Tracking" : "Next"}
          loading={saving}
        />
        {!isLast ? (
          <Pressable onPress={onFinish} accessibilityRole="button" className="mt-3 py-2">
            <Text className="font-manrope-bold text-center text-sm text-ink-muted">
              Skip walkthrough
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
