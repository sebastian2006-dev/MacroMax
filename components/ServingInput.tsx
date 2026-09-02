import React, { memo } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  getServingUnitForFood,
  parseQuantity,
  ServingMode,
  ServingState,
  servingStateToGrams,
  servingUnitLabel,
} from "@/src/lib/servingUnits";
import { scaleMacros } from "@/src/lib/nutrition";
import { SearchResult } from "@/src/types";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

export type { ServingMode, ServingState } from "@/src/lib/servingUnits";

interface ServingInputProps {
  food: SearchResult;
  state: ServingState;
  onChange: (next: ServingState) => void;
}

/**
 * Macro totals for the entered quantity, in the active unit mode.
 * `food` carries per-100g macros; grams are derived from the state.
 */
export function computeServingMacros(food: SearchResult, state: ServingState) {
  return scaleMacros(food, servingStateToGrams(state));
}

/**
 * Default serving state for a food:
 *  1. Known piece size (egg, banana, roti…) → units.
 *  2. Provider standard portions → portion mode.
 *  3. Otherwise grams.
 */
export function defaultServingFor(food: SearchResult): ServingState {
  const unit = getServingUnitForFood(food.name);
  if (unit) {
    return { mode: "units", quantity: "1", unit, portion: null };
  }
  if (food.portions && food.portions.length > 0) {
    return {
      mode: "portion",
      quantity: "1",
      unit: null,
      portion: food.portions[0],
    };
  }
  return { mode: "grams", quantity: "100", unit: null, portion: null };
}

interface SegmentProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}

function Segment({ label, active, disabled, onPress }: SegmentProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-1 rounded-full py-2 ${active ? "bg-card" : ""} ${
        disabled ? "opacity-40" : ""
      }`}
      style={SHADOWS.card}
    >
      <Text
        className={`text-center text-[13px] ${
          active ? "font-manrope-bold text-primary" : "font-manrope-semibold text-ink-muted"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function servingStateEqual(a: ServingState, b: ServingState): boolean {
  return (
    a.mode === b.mode &&
    a.quantity === b.quantity &&
    a.unit?.unit === b.unit?.unit &&
    a.portion?.id === b.portion?.id
  );
}

/**
 * Quantity input with Grams / Pieces / Portion modes. Fully controlled via
 * `state` + `onChange`. Callers that want zero typing latency should own the
 * state locally (see AddFoodSheet / scanner result card) so keystrokes never
 * bubble up to heavy parent trees.
 */
export const ServingInput = memo(
  function ServingInput({ food, state, onChange }: ServingInputProps) {
    const canUseUnits = state.unit !== null;
    const canUsePortions = Boolean(food.portions && food.portions.length > 0);
    const qty = parseQuantity(state.quantity);
    const grams = servingStateToGrams(state);
    const macros = scaleMacros(food, grams);

    const effectiveMode: ServingMode =
      state.mode === "units" && !canUseUnits
        ? "grams"
        : state.mode === "portion" && !canUsePortions
        ? "grams"
        : state.mode;

    const unitLabel = servingUnitLabel({ ...state, mode: effectiveMode });

    function setMode(mode: ServingMode) {
      if (mode === "portion") {
        const portion = food.portions?.[0] ?? state.portion;
        if (portion) {
          onChange({ ...state, mode, portion, quantity: "1", unit: null });
        }
        return;
      }
      if (mode === "units" && canUseUnits) {
        onChange({ ...state, mode, quantity: "1", portion: null });
        return;
      }
      onChange({ ...state, mode: "grams", portion: null, unit: null });
    }

    return (
      <View>
        {/* Mode segmented control */}
        <View className="mb-3 flex-row rounded-full bg-wash p-1">
          <Segment
            label="Grams"
            active={effectiveMode === "grams"}
            onPress={() => setMode("grams")}
          />
          <Segment
            label="Pieces"
            active={effectiveMode === "units"}
            disabled={!canUseUnits}
            onPress={() => setMode("units")}
          />
          <Segment
            label="Portion"
            active={effectiveMode === "portion"}
            disabled={!canUsePortions}
            onPress={() => setMode("portion")}
          />
        </View>

        {effectiveMode === "portion" && food.portions ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-2"
            contentContainerStyle={{ paddingRight: 8 }}
          >
            {food.portions.map((portion) => {
              const selected = state.portion?.id === portion.id;
              return (
                <Pressable
                  key={portion.id}
                  onPress={() => onChange({ ...state, mode: "portion", portion, quantity: "1" })}
                  className={`mr-2 rounded-full px-3 py-1.5 ${
                    selected ? "bg-secondary-soft" : "bg-wash"
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      selected ? "font-manrope-bold text-secondary" : "font-manrope-medium text-ink-muted"
                    }`}
                  >
                    {portion.label}
                    {portion.unit === "ml" ? ` · ${portion.grams} g` : ""}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* Quantity row */}
        <View className="flex-row items-center">
          <View className="mr-3 rounded-3xl bg-card px-2" style={SHADOWS.card}>
            <TextInput
              value={state.quantity}
              onChangeText={(quantity) => onChange({ ...state, quantity })}
              keyboardType="numeric"
              selectTextOnFocus
              className="font-manrope-bold w-24 rounded-3xl py-2.5 text-center text-base text-ink"
              accessibilityLabel="Quantity"
            />
          </View>
          <Text className="font-manrope-semibold flex-1 text-sm text-ink-muted">{unitLabel}</Text>
          <Text className="font-manrope-semibold text-sm text-ink">
            {Math.round(macros.calories)} kcal · {Math.round(macros.protein)}g P
          </Text>
        </View>

        {/* Helper text */}
        {effectiveMode === "units" && state.unit ? (
          <Text className="font-manrope mt-1.5 text-xs text-ink-faint">
            1 {state.unit.unit} ≈ {state.unit.gramsPerUnit} g
          </Text>
        ) : null}
        {effectiveMode === "portion" && state.portion ? (
          <Text className="font-manrope mt-1.5 text-xs text-ink-faint">
            {state.portion.unit === "ml" ? "≈ 1 g per ml · " : ""}
            {qty === 1
              ? `1 portion ≈ ${Math.round(state.portion.grams)} g`
              : `≈ ${Math.round(qty * state.portion.grams)} g total`}
          </Text>
        ) : null}
        {!canUseUnits && !canUsePortions ? (
          <Text className="font-manrope mt-1.5 text-xs text-ink-faint">
            No standard piece or portion sizes for this item — log by grams.
          </Text>
        ) : null}
        {qty === 0 ? (
          <Text className="font-manrope mt-1.5 text-xs text-danger">Enter a quantity above 0.</Text>
        ) : null}
      </View>
    );
  },
  (prev, next) =>
    prev.food.id === next.food.id && servingStateEqual(prev.state, next.state) && prev.onChange === next.onChange
);

export const SERVING_INPUT_HINT_COLOR = COLORS.inkFaint;
