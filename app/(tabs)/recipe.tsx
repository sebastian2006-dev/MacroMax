import React, { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { SearchBar } from "@/components/SearchBar";
import { defaultServingFor, ServingInput } from "@/components/ServingInput";
import { useTabBarClearance } from "@/components/ScrollableTabBar";
import { useAuth } from "@/src/hooks/useAuth";
import { useDailyLog } from "@/src/hooks/useDailyLog";
import { useFoodSearch } from "@/src/hooks/useFoodSearch";
import { getCustomRecipes, insertCustomRecipe } from "@/src/lib/db";
import { addMacros, EMPTY_MACROS, scaleMacros } from "@/src/lib/nutrition";
import {
  DEFAULT_SERVING_STATE,
  formatServingSize,
  parseQuantity,
  servingStateToGrams,
  ServingMode,
  ServingState,
  ServingUnit,
} from "@/src/lib/servingUnits";
import { CustomRecipe, RecipeIngredient, SearchResult, ServingPortion } from "@/src/types";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

/** Provider/source line for a search result row. */
function sourceLabel(result: SearchResult): string {
  switch (result.source) {
    case "custom_recipe":
      return "Saved dish · full saved batch";
    case "fatsecret":
      return "FatSecret · per 100 g";
    case "open_food_facts":
      return "Open Food Facts · per 100 g";
    case "fallback":
      return "Built-in reference · per 100 g";
    default:
      return "Custom food";
  }
}

interface DraftIngredient {
  food: SearchResult;
  /** Raw quantity the user typed, e.g. "2" or "150" (for display). */
  quantityText: string;
  /** Gram equivalent used for all nutrition math and storage. */
  quantityGrams: number;
  mode: ServingMode;
  unit: ServingUnit | null;
  portion: ServingPortion | null;
}

/** Reconstruct the ServingState used when the ingredient was added. */
function ingredientServingState(ingredient: DraftIngredient): ServingState {
  return {
    mode: ingredient.mode,
    quantity: ingredient.quantityText,
    unit: ingredient.unit,
    portion: ingredient.portion,
  };
}

interface IngredientResultsListProps {
  results: SearchResult[];
  selectedId: string | null;
  onSelect: (result: SearchResult) => void;
}

/**
 * Memoized search-results list. The parent only gives it a new `results`
 * identity when the debounced query completes, so typing inside the
 * SearchBar / ServingInput never re-renders the list.
 */
const IngredientResultsList = memo(function IngredientResultsList({
  results,
  selectedId,
  onSelect,
}: IngredientResultsListProps) {
  return (
    <>
      {results.map((result) => {
        const isSelected = selectedId === result.id;
        return (
          <Pressable
            key={result.id}
            onPress={() => onSelect(result)}
            className={`mb-1.5 rounded-xl px-3 py-2.5 ${
              isSelected ? "bg-primary-soft" : "bg-wash"
            }`}
          >
            <Text
              className="font-manrope-semibold text-sm text-ink"
              numberOfLines={1}
            >
              {result.name}
            </Text>
            <Text className="font-manrope text-xs text-ink-muted">
              {sourceLabel(result)} · {Math.round(result.calories)} kcal / 100 g
            </Text>
          </Pressable>
        );
      })}
    </>
  );
});

function RecipeContent() {
  const { userId } = useAuth();
  const { addMealItem } = useDailyLog(userId);
  const { query, setQuery, results, loading } = useFoodSearch(userId);
  const clearance = useTabBarClearance();

  const ingredientResults = useMemo(
    () => results.filter((result) => result.source !== "custom_recipe"),
    [results]
  );

  const [recipeName, setRecipeName] = useState("");
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<CustomRecipe[]>([]);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [serving, setServing] = useState<ServingState>(DEFAULT_SERVING_STATE);

  // Totals fold: scale each ingredient by its gram quantity, then add.
  const totals = useMemo(() => {
    return ingredients.reduce(
      (acc, ingredient) =>
        addMacros(acc, scaleMacros(ingredient.food, ingredient.quantityGrams)),
      EMPTY_MACROS
    );
  }, [ingredients]);

  const loadRecipes = useCallback(async () => {
    const recipes = await getCustomRecipes();
    setSavedRecipes(recipes);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRecipes();
    }, [loadRecipes])
  );

  const handleSelectResult = useCallback((result: SearchResult) => {
    setSelected(result);
    setServing(defaultServingFor(result));
  }, []);

  function addIngredient() {
    if (!selected) {
      return;
    }

    const qty = parseQuantity(serving.quantity);
    if (qty <= 0) {
      return;
    }

    setIngredients((current) => [
      ...current,
      {
        food: selected,
        quantityText: serving.quantity,
        quantityGrams: servingStateToGrams(serving),
        mode: serving.mode,
        unit: serving.unit,
        portion: serving.portion,
      },
    ]);
    setSelected(null);
    setServing(DEFAULT_SERVING_STATE);
    setQuery("");
  }

  function removeIngredient(index: number) {
    setIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function saveRecipe() {
    if (!userId || !recipeName.trim() || ingredients.length === 0) {
      return;
    }

    setSaving(true);
    try {
      const ingredientRows: Omit<RecipeIngredient, "id" | "recipe_id">[] = ingredients.map(
        (ingredient) => {
          const macros = scaleMacros(ingredient.food, ingredient.quantityGrams);
          return {
            food_name: ingredient.food.name,
            quantity_grams_or_units: ingredient.quantityGrams,
            calories: Math.round(macros.calories),
            protein: Math.round(macros.protein),
            carbs: Math.round(macros.carbs),
            fats: Math.round(macros.fats),
          };
        }
      );

      await insertCustomRecipe(
        {
          recipe_name: recipeName.trim(),
          total_calories: Math.round(totals.calories),
          total_protein: Math.round(totals.protein),
          total_carbs: Math.round(totals.carbs),
          total_fats: Math.round(totals.fats),
        },
        ingredientRows
      );

      setRecipeName("");
      setIngredients([]);
      await loadRecipes();
    } catch (err) {
      console.warn(err instanceof Error ? err.message : "Failed to save recipe");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["left", "right"]}>
      <AppHeader />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: clearance }}
      >
        <View className="mb-4">
          <Text className="font-manrope-extrabold text-2xl text-ink">Custom Dish</Text>
          <Text className="font-manrope mt-1 text-sm text-ink-muted">
            Name it, weigh it, save it — log the whole batch anytime
          </Text>
        </View>

        {/* Builder */}
        <View className="mb-4 rounded-2xl bg-card p-4" style={SHADOWS.card}>
          <TextInput
            value={recipeName}
            onChangeText={setRecipeName}
            placeholder="Dish name (e.g. 2 eggs + 300 g rice)"
            placeholderTextColor={COLORS.inkFaint}
            className="font-manrope mb-4 rounded-3xl bg-wash px-4 py-3 text-ink"
          />

          <Text className="font-manrope-semibold mb-1 text-sm text-ink-muted">
            Search ingredients
          </Text>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search ingredient (FatSecret / Open Food Facts)"
          />

          {loading ? (
            <View className="mb-2 items-start">
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : null}

          <IngredientResultsList
            results={ingredientResults}
            selectedId={selected?.id ?? null}
            onSelect={handleSelectResult}
          />

          {selected ? (
            <View className="mt-3 mb-4 rounded-2xl bg-wash p-3">
              <Text className="font-manrope-bold mb-3 text-sm text-ink">
                {selected.name}
              </Text>
              <ServingInput food={selected} state={serving} onChange={setServing} />
              <Pressable
                onPress={addIngredient}
                className="mt-3 rounded-3xl bg-primary py-3"
              >
                <Text className="font-manrope-bold text-center text-card">
                  Add Ingredient
                </Text>
              </Pressable>
            </View>
          ) : null}

          {ingredients.length > 0 ? (
            <View className="mb-4">
              {ingredients.map((ingredient, index) => {
                const macros = scaleMacros(ingredient.food, ingredient.quantityGrams);
                return (
                  <View
                    key={`${ingredient.food.id}-${index}`}
                    className="mb-1 flex-row items-center justify-between rounded-xl bg-wash px-3 py-2"
                  >
                    <View className="flex-1 pr-3">
                      <Text className="font-manrope text-sm text-ink" numberOfLines={1}>
                        {`${ingredient.food.name} · ${formatServingSize(
                          ingredientServingState(ingredient)
                        )} (~${Math.round(ingredient.quantityGrams)}g)`}
                      </Text>
                      <Text className="font-manrope text-xs text-ink-faint">
                        {Math.round(macros.calories)} kcal · {Math.round(macros.protein)}g P
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => removeIngredient(index)}
                      hitSlop={8}
                      className="rounded-lg bg-danger-soft px-2 py-1"
                    >
                      <Text className="font-manrope-bold text-danger">✕</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View className="mb-3 flex-row items-center justify-between rounded-2xl bg-primary-soft px-4 py-3">
            <Text className="font-manrope-semibold text-sm text-ink-muted">Totals</Text>
            <Text className="font-manrope-semibold text-sm text-ink">
              {Math.round(totals.calories)} kcal · {Math.round(totals.protein)}g P ·{" "}
              {Math.round(totals.carbs)}g C · {Math.round(totals.fats)}g F
            </Text>
          </View>

          <Pressable
            onPress={() => void saveRecipe()}
            disabled={saving || !recipeName.trim() || ingredients.length === 0}
            className="rounded-3xl bg-primary py-3.5 disabled:opacity-50"
          >
            {saving ? (
              <ActivityIndicator color={COLORS.card} />
            ) : (
              <Text className="font-manrope-bold text-center text-card">Save Dish</Text>
            )}
          </Pressable>
        </View>

        {/* Saved dishes */}
        <Text className="font-manrope-bold mb-2 text-lg text-ink">Saved Dishes</Text>
        {savedRecipes.length === 0 ? (
          <Text className="font-manrope text-ink-faint">
            No custom dishes yet. Build your first above.
          </Text>
        ) : (
          savedRecipes.map((recipe) => (
            <View key={recipe.id} className="mb-2 rounded-2xl bg-card p-4" style={SHADOWS.card}>
              <Text className="font-manrope-bold text-base text-ink">
                {recipe.recipe_name}
              </Text>
              <Text className="font-manrope text-sm text-ink-muted">
                {Math.round(recipe.total_calories)} kcal · {Math.round(recipe.total_protein)}g
                P · {Math.round(recipe.total_carbs)}g C · {Math.round(recipe.total_fats)}g F
              </Text>
              <Text className="font-manrope mt-1 text-xs text-ink-faint">
                Full saved batch · tap to log to today's log
              </Text>
              <Pressable
                onPress={() =>
                  void addMealItem({
                    meal_type: "Snacks/Extra",
                    item_name: recipe.recipe_name,
                    serving_size: "1 recipe",
                    calories: Math.round(recipe.total_calories),
                    protein: Math.round(recipe.total_protein),
                    carbs: Math.round(recipe.total_carbs),
                    fats: Math.round(recipe.total_fats),
                  })
                }
                className="mt-2 rounded-3xl bg-primary py-2.5"
              >
                <Text className="font-manrope-bold text-center text-sm text-card">
                  Add to Today
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function RecipeScreen() {
  return (
    <RequireAuth>
      <RecipeContent />
    </RequireAuth>
  );
}
