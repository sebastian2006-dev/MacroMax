import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { RequireAuth } from "@/components/RequireAuth";
import { AppHeader } from "@/components/AppHeader";
import {
  computeServingMacros,
  defaultServingFor,
  ServingInput,
} from "@/components/ServingInput";
import { formatServingSize, ServingState } from "@/src/lib/servingUnits";
import { useAuth } from "@/src/hooks/useAuth";
import { useDailyLog } from "@/src/hooks/useDailyLog";
import { searchFoodByBarcode } from "@/src/lib/api";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";
import { MEAL_TYPES, MealType, SearchResult } from "@/src/types";

function parseDateParam(value?: string): Date {
  if (!value) {
    return new Date();
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/** Payload consumed by useDailyLog().addMealItem. */
interface AddPayload {
  meal_type: MealType;
  item_name: string;
  serving_size: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

interface ScanResultCardProps {
  result: SearchResult;
  mealTypeFromParams?: string;
  onAdd: (payload: AddPayload) => Promise<boolean>;
  /** Dismiss the result card and resume scanning (Rescan button). */
  onDismiss?: () => void;
}

/**
 * Bottom card shown after a successful barcode lookup.
 *
 * The card OWNS its serving quantity + meal type + add state locally, so
 * typing a quantity re-renders only this subtree — the CameraView and the
 * rest of the scanner screen stay completely untouched per keystroke.
 */
function ScanResultCard({ result, mealTypeFromParams, onAdd, onDismiss }: ScanResultCardProps) {
  const [mealType, setMealType] = useState<MealType>(
    (mealTypeFromParams as MealType | undefined) ?? "Snacks/Extra"
  );
  const [serving, setServing] = useState<ServingState>(() => defaultServingFor(result));
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // If a different product ever lands here without an unmount, reset the
  // serving state to that food's defaults.
  useEffect(() => {
    setServing(defaultServingFor(result));
    setAddError(null);
    setAdding(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.id]);

  async function handleAdd() {
    const macros = computeServingMacros(result, serving);

    setAddError(null);
    setAdding(true);
    const ok = await onAdd({
      meal_type: mealType,
      item_name: result.name,
      serving_size: formatServingSize(serving),
      calories: Math.round(macros.calories),
      protein: Math.round(macros.protein),
      carbs: Math.round(macros.carbs),
      fats: Math.round(macros.fats),
    });
    setAdding(false);

    if (!ok) {
      setAddError("Could not add food. Please try again.");
    }
  }

  return (
    <View className="rounded-3xl bg-card p-5" style={SHADOWS.sheet}>
      <Text className="font-manrope-bold mb-1 text-lg text-ink" numberOfLines={2}>
        {result.name}
      </Text>
      <Text className="font-manrope mb-3 text-xs text-ink-muted">
        {result.brand ?? "Product"} · {result.source.replace(/_/g, " ")}
      </Text>

      {/* Meal type chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-3"
        contentContainerStyle={{ paddingRight: 8 }}
      >
        {MEAL_TYPES.map((type) => {
          const active = mealType === type;
          return (
            <Pressable
              key={type}
              onPress={() => setMealType(type)}
              className={`mr-2 rounded-full px-3 py-1.5 ${
                active ? "bg-primary" : "bg-wash"
              }`}
            >
              <Text
                className={`text-xs ${
                  active
                    ? "font-manrope-bold text-card"
                    : "font-manrope-semibold text-ink-muted"
                }`}
              >
                {type}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="mb-3">
        <ServingInput food={result} state={serving} onChange={setServing} />
      </View>

      {addError ? (
        <Text className="font-manrope mb-2 text-sm text-danger">{addError}</Text>
      ) : null}

      <View className="mt-1 flex-row">
        <Pressable
          onPress={onDismiss}
          className="mr-3 flex-1 rounded-3xl bg-wash py-3"
          accessibilityRole="button"
        >
          <Text className="font-manrope-semibold text-center text-ink">Rescan</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleAdd()}
          disabled={adding}
          className="flex-1 rounded-3xl bg-primary py-3 disabled:opacity-60"
          accessibilityRole="button"
        >
          {adding ? (
            <ActivityIndicator color={COLORS.card} />
          ) : (
            <Text className="font-manrope-bold text-center text-card">
              Add to {mealType}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function ScannerContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string; mealType?: string }>();
  const { userId } = useAuth();
  const { addMealItem } = useDailyLog(userId, parseDateParam(params.date));
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  function resumeScanning() {
    setResult(null);
    setScanned(false);
    setNotFound(false);
  }

  async function handleBarcodeScanned(data: string) {
    if (scanned) {
      return;
    }

    setScanned(true);
    setNotFound(false);
    const food = await searchFoodByBarcode(data);
    if (food) {
      setResult(food);
      setNotFound(false);
    } else {
      setNotFound(true);
      setTimeout(() => {
        setScanned(false);
        setNotFound(false);
      }, 2000);
    }
  }

  // Wraps addMealItem: on success the parent clears the result card and
  // re-enables scanning; ScanResultCard keeps its own adding/error state.
  async function handleAdd(payload: AddPayload): Promise<boolean> {
    const ok = await addMealItem(payload);
    if (ok) {
      resumeScanning();
    }
    return ok;
  }

  if (!permission?.granted) {
    return (
      <View className="flex-1 items-center justify-center bg-surface px-6">
        <View className="w-full rounded-3xl bg-card p-6" style={SHADOWS.card}>
          <Text className="font-manrope mb-4 text-center text-base text-ink">
            Camera permission is required to scan product barcodes.
          </Text>
          <Pressable
            onPress={() => void requestPermission()}
            className="rounded-3xl bg-primary py-3.5"
            accessibilityRole="button"
          >
            <Text className="font-manrope-bold text-center text-card">
              Grant Permission
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      {/* Camera is a sibling of the result card so typing a serving quantity
          never re-renders (or re-suspends) the camera preview. */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
        onBarcodeScanned={({ data }) => void handleBarcodeScanned(data)}
      />

      <View className="flex-1">
        <AppHeader variant="dark" />

        {/* Dismiss (back) affordance — the scanner is a pushed stack screen */}
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Close scanner"
          className="absolute right-4 rounded-full bg-card/15 p-2.5"
          style={{ top: insets.top + 52 }}
        >
          <Ionicons name="close" size={18} color={COLORS.card} />
        </Pressable>

        <View className="flex-1 justify-end px-5" style={{ paddingBottom: 60 }}>
          {result ? (
            <ScanResultCard
              result={result}
              mealTypeFromParams={params.mealType}
              onAdd={handleAdd}
              onDismiss={resumeScanning}
            />
          ) : (
            <View className="mb-6 items-center">
              <Text className="font-manrope-semibold text-center text-card">
                {notFound
                  ? "Product not found on Open Food Facts. Try another barcode."
                  : scanned
                  ? "Searching product..."
                  : "Point camera at a barcode"}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ScannerScreen() {
  return (
    <RequireAuth>
      <ScannerContent />
    </RequireAuth>
  );
}
