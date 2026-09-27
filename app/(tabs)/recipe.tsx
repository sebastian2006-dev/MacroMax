import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { IngredientResultsSheet } from "@/components/IngredientResultsSheet";
import { MealTargetSheet } from "@/components/MealTargetSheet";
import { RequireAuth } from "@/components/RequireAuth";
import { SearchBar } from "@/components/SearchBar";
import { defaultServingFor, ServingInput } from "@/components/ServingInput";
import { useTabBarClearance } from "@/components/ScrollableTabBar";
import { useAuth } from "@/src/hooks/useAuth";
import { useDailyLog } from "@/src/hooks/useDailyLog";
import { useFoodSearch } from "@/src/hooks/useFoodSearch";
import { getCustomRecipes, insertCustomRecipe, isDayLocked, unlockDay } from "@/src/lib/db";
import { addMacros, EMPTY_MACROS, scaleMacros, toLocalDateString } from "@/src/lib/nutrition";
import {
  DEFAULT_SERVING_STATE,
  formatServingSize,
  parseQuantity,
  servingStateToGrams,
  ServingMode,
  ServingState,
  ServingUnit,
} from "@/src/lib/servingUnits";
import { CustomRecipe, MealType, RecipeIngredient, SearchResult, ServingPortion } from "@/src/types";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

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

/** Compact single-line macro summary shared by the save button & saved cards. */
function macroSummary(calories: number, protein: number, carbs: number, fats: number): string {
  return `${Math.round(calories)} kcal · ${Math.round(protein)}g P · ${Math.round(carbs)}g C · ${Math.round(fats)}g F`;
}

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
  // Lets the user dismiss the sliding results window; a new query re-opens it.
  const [resultsDismissed, setResultsDismissed] = useState(false);
  // Brief ✓ feedback on the saved-dish card whose "+" was just tapped.
  const [addedRecipeId, setAddedRecipeId] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The dish whose "+" was tapped — opens the meal-target bottom sheet.
  const [targetDish, setTargetDish] = useState<CustomRecipe | null>(null);
  // null = unknown (not yet loaded); otherwise whether today is locked.
  const [locked, setLocked] = useState<boolean | null>(null);

  useEffect(() => {
    setResultsDismissed(false);
  }, [query]);

  useEffect(() => {
    return () => {
      if (addedTimer.current) {
        clearTimeout(addedTimer.current);
      }
    };
  }, []);

  // Sliding window visibility: only while a search is active and the user
  // has not dismissed it (loading shows the spinner inside the window).
  const showResultsWindow =
    !resultsDismissed &&
    query.trim().length >= 2 &&
    (loading || ingredientResults.length > 0);

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
    const lockTimestamp = await isDayLocked(toLocalDateString(new Date()));
    setLocked(lockTimestamp !== null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRecipes();
    }, [loadRecipes])
  );

  const handleSelectResult = useCallback((result: SearchResult) => {
    setSelected(result);
    setServing(defaultServingFor(result));
    setResultsDismissed(true); // close the sliding window; quantity panel opens below
  }, []);

  const handleCloseResults = useCallback(() => {
    setResultsDismissed(true);
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

  /** Opens the "where to log it?" sheet for a saved dish. */
  function requestMealTarget(recipe: CustomRecipe) {
    if (locked) {
      return; // Day is locked — writes are refused (data layer guards too).
    }
    setTargetDish(recipe);
  }

  /** Logs the whole saved batch to the chosen meal and flashes a ✓ on the card. */
  async function handleConfirmTarget(mealType: MealType): Promise<boolean> {
    const recipe = targetDish;
    if (!recipe || locked) {
      setTargetDish(null);
      return false;
    }

    const added = await addMealItem({
      meal_type: mealType,
      item_name: recipe.recipe_name,
      serving_size: "1 recipe",
      calories: Math.round(recipe.total_calories),
      protein: Math.round(recipe.total_protein),
      carbs: Math.round(recipe.total_carbs),
      fats: Math.round(recipe.total_fats),
    });
    if (!added) {
      setTargetDish(null);
      return false;
    }

    setTargetDish(null);
    setAddedRecipeId(recipe.id);
    if (addedTimer.current) {
      clearTimeout(addedTimer.current);
    }
    addedTimer.current = setTimeout(() => setAddedRecipeId(null), 1400);
    return true;
  }

  const handleDismissTarget = useCallback(() => setTargetDish(null), []);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["left", "right"]}>
      <AppHeader />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: clearance }}
        >
          <View className="mb-4">
            <Text className="text-2xl font-manrope-extrabold text-ink">Custom Dish</Text>
            <Text className="mt-1 text-sm font-manrope text-ink-muted">
              Build once — log the whole batch anytime
            </Text>
          </View>

          {/* Builder — one cohesive form card */}
          <View className="mb-5 rounded-3xl bg-card p-4" style={SHADOWS.card}>
            <TextInput
              value={recipeName}
              onChangeText={setRecipeName}
              placeholder="Dish name (e.g. 2 eggs + 300 g rice)"
              placeholderTextColor={COLORS.inkFaint}
              className="mb-3 rounded-3xl bg-wash px-4 py-3 font-manrope text-ink"
            />

            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="Search ingredients (FatSecret / Open Food Facts)"
            />

            {selected ? (
              <View className="mb-3 rounded-2xl bg-wash p-3">
                <Text className="mb-3 text-sm font-manrope-bold text-ink">{selected.name}</Text>
                <ServingInput food={selected} state={serving} onChange={setServing} />
                <Pressable
                  onPress={addIngredient}
                  className="mt-3 rounded-3xl bg-primary py-2.5"
                >
                  <Text className="text-center font-manrope-bold text-ink">
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
                        <Text className="text-sm font-manrope text-ink" numberOfLines={1}>
                          {`${ingredient.food.name} · ${formatServingSize(
                            ingredientServingState(ingredient)
                          )} (~${Math.round(ingredient.quantityGrams)}g)`}
                        </Text>
                        <Text className="text-xs font-manrope text-ink-faint">
                          {Math.round(macros.calories)} kcal · {Math.round(macros.protein)}g P
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => removeIngredient(index)}
                        hitSlop={8}
                        accessibilityLabel={`Remove ${ingredient.food.name}`}
                        className="rounded-lg bg-danger-soft px-2 py-1"
                      >
                        <Text className="font-manrope-bold text-danger">✕</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : selected ? null : (
              <Text className="mb-3 text-xs font-manrope text-ink-faint">
                Search an ingredient above to start building your dish.
              </Text>
            )}

            {/* Save button doubles as the totals bar */}
            <Pressable
              onPress={() => void saveRecipe()}
              disabled={saving || !recipeName.trim() || ingredients.length === 0}
              accessibilityLabel={
                ingredients.length > 0
                  ? `Save dish, ${macroSummary(
                      totals.calories,
                      totals.protein,
                      totals.carbs,
                      totals.fats
                    )}`
                  : "Save dish"
              }
              className="flex-row items-center justify-between rounded-3xl bg-primary px-5 py-3.5 disabled:opacity-50"
            >
              {saving ? (
                <ActivityIndicator color={COLORS.ink} />
              ) : (
                <Text className="font-manrope-bold text-ink">Save Dish</Text>
              )}
              {!saving && ingredients.length > 0 ? (
                <Text className="ml-3 shrink text-xs font-manrope-semibold text-ink/70">
                  {macroSummary(totals.calories, totals.protein, totals.carbs, totals.fats)}
                </Text>
              ) : null}
            </Pressable>
          </View>

          {/* Saved dishes — compact cards, "+" opens the meal-target sheet */}
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-lg font-manrope-bold text-ink">Saved Dishes</Text>
            {locked ? (
              <Pressable
                onPress={() =>
                  void unlockDay(toLocalDateString(new Date())).then(() => setLocked(false))
                }
                className="flex-row items-center rounded-full bg-wash px-3 py-1.5"
                accessibilityLabel="Unlock today for editing"
              >
                <Ionicons name="open-outline" size={13} color={COLORS.inkMuted} />
                <Text className="font-manrope-semibold ml-1 text-xs text-ink-muted">
                  Unlock day
                </Text>
              </Pressable>
            ) : null}
          </View>
          {locked ? (
            <Text className="font-manrope mb-2 text-xs text-ink-faint">
              Today is locked — unlock to log dishes.
            </Text>
          ) : null}
          {savedRecipes.length === 0 ? (
            <Text className="font-manrope text-ink-faint">
              No custom dishes yet. Build your first above.
            </Text>
          ) : (
            savedRecipes.map((recipe) => {
              const justAdded = addedRecipeId === recipe.id;
              return (
                <View
                  key={recipe.id}
                  className="mb-2 flex-row items-center rounded-2xl bg-card p-4"
                  style={SHADOWS.card}
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-manrope-bold text-ink" numberOfLines={1}>
                      {recipe.recipe_name}
                    </Text>
                    <Text className="mt-0.5 text-xs font-manrope text-ink-muted" numberOfLines={1}>
                      {macroSummary(
                        recipe.total_calories,
                        recipe.total_protein,
                        recipe.total_carbs,
                        recipe.total_fats
                      )}{" "}
                      · full batch
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => requestMealTarget(recipe)}
                    disabled={locked === true}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose a meal for ${recipe.recipe_name}`}
                    className={`h-10 w-10 items-center justify-center rounded-full disabled:opacity-40 ${
                      justAdded ? "bg-primary" : "bg-primary-soft"
                    }`}
                  >
                    <Ionicons
                      name={justAdded ? "checkmark" : "add"}
                      size={20}
                      color={justAdded ? COLORS.ink : COLORS.primaryInk}
                    />
                  </Pressable>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Sliding window with ranked ingredient results */}
        <IngredientResultsSheet
          visible={showResultsWindow}
          loading={loading}
          results={ingredientResults}
          onSelect={handleSelectResult}
          onClose={handleCloseResults}
        />

        {/* "Where should this go?" sheet for the Saved Dishes "+" button */}
        <MealTargetSheet
          dishName={targetDish?.recipe_name ?? null}
          onPick={handleConfirmTarget}
          onDismiss={handleDismissTarget}
        />
      </KeyboardAvoidingView>
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
