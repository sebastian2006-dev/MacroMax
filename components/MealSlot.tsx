import React from "react";
import { Pressable, Text, View } from "react-native";
import { MealItem, MealType } from "@/src/types";
import { calculateTotals } from "@/src/lib/nutrition";
import { SHADOWS } from "@/src/theme/shadows";

interface MealSlotProps {
  mealType: MealType;
  items: MealItem[];
  onAdd: (mealType: MealType) => void;
  onRemove?: (mealItemId: string) => void;
}

function mealItemsEqual(a: MealItem[], b: MealItem[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.meal_type !== y.meal_type ||
      x.item_name !== y.item_name ||
      x.serving_size !== y.serving_size ||
      x.calories !== y.calories ||
      x.protein !== y.protein ||
      x.carbs !== y.carbs ||
      x.fats !== y.fats
    ) {
      return false;
    }
  }
  return true;
}

function mealSlotPropsEqual(prev: MealSlotProps, next: MealSlotProps) {
  return (
    prev.mealType === next.mealType &&
    prev.onAdd === next.onAdd &&
    prev.onRemove === next.onRemove &&
    mealItemsEqual(prev.items, next.items)
  );
}

function MealSlotComponent({ mealType, items, onAdd, onRemove }: MealSlotProps) {
  const totals = calculateTotals(items);

  return (
    <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-base font-manrope-bold text-ink">{mealType}</Text>
        <Text className="text-xs font-manrope text-ink-muted">
          {Math.round(totals.calories)} kcal · {Math.round(totals.protein)}g P
        </Text>
      </View>

      {items.length === 0 ? (
        <Text className="mb-2 text-sm font-manrope text-ink-faint">No items logged yet.</Text>
      ) : (
        items.map((item) => (
          <View
            key={item.id}
            className="mb-1 flex-row items-center justify-between rounded-xl bg-wash px-3 py-2"
          >
            <View className="flex-1 pr-2">
              <Text className="text-sm font-manrope-medium text-ink">{item.item_name}</Text>
              <Text className="text-xs font-manrope text-ink-faint">{item.serving_size}</Text>
            </View>
            <Text className="mr-2 text-xs font-manrope-semibold text-ink-muted">
              {Math.round(item.calories)} kcal · {Math.round(item.protein)}g P
            </Text>
            {onRemove ? (
              <Pressable
                onPress={() => onRemove(item.id)}
                className="rounded-lg bg-danger-soft px-2 py-1"
              >
                <Text className="text-xs font-manrope-bold text-danger">✕</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}

      <Pressable
        onPress={() => onAdd(mealType)}
        className="mt-2 rounded-xl border border-dashed border-primary/40 py-2.5"
      >
        <Text className="text-center text-sm font-manrope-semibold text-primary">
          + Add {mealType}
        </Text>
      </Pressable>
    </View>
  );
}
export const MealSlot = React.memo(MealSlotComponent, mealSlotPropsEqual);
