import React, { memo, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  computeServingMacros,
  defaultServingFor,
  ServingInput,
} from "@/components/ServingInput";
import { formatServingSize, ServingState } from "@/src/lib/servingUnits";
import { MEAL_TYPES, MealType, SearchResult } from "@/src/types";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

/** Payload shape consumed by useDailyLog().addMealItem. */
export interface AddFoodPayload {
  meal_type: MealType;
  item_name: string;
  serving_size: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

interface AddFoodSheetProps {
  /** Selected food; null hides the sheet. */
  food: SearchResult | null;
  /** Meal preselected when the sheet is first opened (from route params). */
  initialMealType?: MealType;
  onClose: () => void;
  /** Performs the actual log write; return false to keep the sheet open. */
  onAdd: (payload: AddFoodPayload) => Promise<boolean>;
}

/**
 * Bottom sheet for logging the selected food.
 *
 * The sheet OWNS the serving quantity + meal type state locally, so typing a
 * quantity only re-renders this subtree — the parent screen's result list and
 * macro engine are completely untouched per keystroke (input-latency fix).
 */
export const AddFoodSheet = memo(
  function AddFoodSheet({ food, initialMealType, onClose, onAdd }: AddFoodSheetProps) {
    const insets = useSafeAreaInsets();
    const [mealType, setMealType] = useState<MealType>(initialMealType ?? "Breakfast");
    const [serving, setServing] = useState<ServingState>({
      mode: "grams",
      quantity: "100",
      unit: null,
      portion: null,
    });
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const previousFoodId = useRef<string | null>(null);

    // Reset local state whenever a different food gets selected.
    useEffect(() => {
      if (food && food.id !== previousFoodId.current) {
        previousFoodId.current = food.id;
        setServing(defaultServingFor(food));
        setError(null);
        setAdding(false);
      }
    }, [food]);

    if (!food) {
      return null;
    }

    // Const local so TypeScript keeps the narrowing inside the closures below.
    const activeFood = food;
    const isRecipe = activeFood.source === "custom_recipe";
    const macros = isRecipe
      ? activeFood
      : computeServingMacros(activeFood, serving);

    async function handleAdd() {
      setError(null);
      setAdding(true);
      const ok = await onAdd({
        meal_type: mealType,
        item_name: activeFood.name,
        serving_size: isRecipe
          ? (activeFood.servingSize ?? "1 dish")
          : formatServingSize(serving),
        calories: Math.round(macros.calories),
        protein: Math.round(macros.protein),
        carbs: Math.round(macros.carbs),
        fats: Math.round(macros.fats),
      });
      setAdding(false);
      if (!ok) {
        setError("Could not add food. Please try again.");
      }
    }

    return (
      <View
        className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-card px-5 pt-4"
        style={[{ paddingBottom: Math.max(insets.bottom, 12) + 8 }, SHADOWS.sheet]}
      >
        <View className="mb-1 flex-row items-start">
          <View className="flex-1 pr-2">
            <Text className="font-manrope-bold text-lg text-ink" numberOfLines={2}>
              {food.name}
            </Text>
            {food.brand ? (
              <Text className="font-manrope text-xs text-ink-muted">{food.brand}</Text>
            ) : null}
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityLabel="Close"
            className="rounded-full bg-wash p-2"
          >
            <Ionicons name="close" size={16} color={COLORS.inkMuted} />
          </Pressable>
        </View>

        {/* Meal type chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="my-3"
          contentContainerStyle={{ paddingRight: 8 }}
        >
          {MEAL_TYPES.map((type) => {
            const active = mealType === type;
            return (
              <Pressable
                key={type}
                onPress={() => setMealType(type)}
                className={`mr-2 rounded-full px-4 py-2 ${
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

        {isRecipe ? (
          <Text className="font-manrope mb-2 text-sm text-ink-muted">
            Adds the full saved dish · {food.servingSize ?? "1 dish"}
          </Text>
        ) : (
          <View className="mb-2">
            <ServingInput food={food} state={serving} onChange={setServing} />
          </View>
        )}

        {error ? (
          <Text className="font-manrope mb-2 text-sm text-danger">{error}</Text>
        ) : null}

        <Pressable
          onPress={() => void handleAdd()}
          disabled={adding}
          className="rounded-3xl bg-primary py-3.5 disabled:opacity-60"
          accessibilityRole="button"
        >
          {adding ? (
            <ActivityIndicator color={COLORS.card} />
          ) : (
            <Text className="font-manrope-bold text-center text-base text-card">
              Add to {mealType}
            </Text>
          )}
        </Pressable>
      </View>
    );
  },
  (prev, next) => prev.food?.id === next.food?.id && prev.onAdd === next.onAdd && prev.onClose === next.onClose
);
