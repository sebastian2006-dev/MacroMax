import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AddFoodPayload, AddFoodSheet } from "@/components/AddFoodSheet";
import { AppHeader } from "@/components/AppHeader";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { RequireAuth } from "@/components/RequireAuth";
import { SearchBar } from "@/components/SearchBar";
import { useAuth } from "@/src/hooks/useAuth";
import { useDailyLog } from "@/src/hooks/useDailyLog";
import { useFoodSearch } from "@/src/hooks/useFoodSearch";
import { searchFoodByBarcode } from "@/src/lib/api";
import { getCustomRecipes } from "@/src/lib/db";
import { CustomRecipe, MealType, SearchResult } from "@/src/types";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

function parseDateParam(value?: string): Date {
  if (!value) {
    return new Date();
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/** Map a saved CustomRecipe row onto the shared SearchResult shape. */
function recipeToResult(recipe: CustomRecipe): SearchResult {
  return {
    id: `recipe-${recipe.id}`,
    name: recipe.recipe_name,
    brand: null,
    barcode: null,
    externalId: null,
    source: "custom_recipe",
    calories: recipe.total_calories,
    protein: recipe.total_protein,
    carbs: recipe.total_carbs,
    fats: recipe.total_fats,
    servingSize: "1 dish",
    portions: [],
  };
}

/** Provider/source line for a result row. */
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

type SearchTab = "dishes" | "database";

function SearchContent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mealType?: string; date?: string }>();
  const initialMealType = (params.mealType as MealType | undefined) ?? undefined;
  const { userId } = useAuth();
  const { addMealItem } = useDailyLog(userId, parseDateParam(params.date));
  const { query, setQuery, results, loading, error } = useFoodSearch(userId);

  const [tab, setTab] = useState<SearchTab>("dishes");
  const [dishes, setDishes] = useState<CustomRecipe[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  const loadDishes = useCallback(async () => {
    const recipes = await getCustomRecipes();
    setDishes(recipes);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDishes();
    }, [loadDishes])
  );

  const handleCloseSheet = useCallback(() => setSelected(null), []);

  // Saved dishes already live on the "My Dishes" tab — never list them again
  // here (they are also not per-100g, so a macro row would be misleading).
  const databaseResults = useMemo(
    () => results.filter((result) => result.source !== "custom_recipe"),
    [results]
  );

  // The sheet owns its own spinner + serving state; we only write the log.
  const handleAddFromSheet = useCallback(
    async (payload: AddFoodPayload): Promise<boolean> => {
      const ok = await addMealItem(payload);
      if (ok) {
        setSelected(null);
        router.back();
        return true;
      }
      return false;
    },
    [addMealItem, router]
  );

  async function handleBarcodeScanned(barcode: string) {
    setScannerVisible(false);
    const food = await searchFoodByBarcode(barcode);
    if (food) {
      setSelected(food);
    } else {
      console.warn("Barcode not found in cache or Open Food Facts");
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["left", "right"]}>
      <AppHeader />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-surface"
      >
        <View className="px-4 pt-1">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-manrope-extrabold text-2xl text-ink">Add Food</Text>
            <Pressable
              onPress={() => setScannerVisible(true)}
              className="flex-row items-center rounded-full bg-card px-4 py-2"
              style={SHADOWS.card}
            >
              <Ionicons name="barcode-outline" size={14} color={COLORS.primary} />
              <Text className="font-manrope-semibold ml-1.5 text-xs text-primary">Scan</Text>
            </Pressable>
          </View>

          <View className="mb-3 flex-row rounded-full bg-wash p-1">
            <Pressable
              onPress={() => setTab("dishes")}
              className={`flex-1 rounded-full py-2 ${tab === "dishes" ? "bg-card" : ""}`}
              style={SHADOWS.card}
            >
              <Text
                className={`text-center text-sm ${
                  tab === "dishes" ? "font-manrope-bold text-primary" : "font-manrope-semibold text-ink-muted"
                }`}
              >
                My Dishes ({dishes.length})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTab("database")}
              className={`flex-1 rounded-full py-2 ${tab === "database" ? "bg-card" : ""}`}
              style={SHADOWS.card}
            >
              <Text
                className={`text-center text-sm ${
                  tab === "database" ? "font-manrope-bold text-primary" : "font-manrope-semibold text-ink-muted"
                }`}
              >
                Search Database
              </Text>
            </Pressable>
          </View>

          {tab === "database" ? (
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="Search food, ingredient, or dish"
              autoFocus
            />
          ) : null}
        </View>

        <ScrollView
          className="flex-1 px-4"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 160 }}
        >
          {tab === "dishes" ? (
            dishes.length === 0 ? (
              <View className="rounded-2xl bg-card p-6" style={SHADOWS.card}>
                <Text className="font-manrope-semibold text-center text-ink">
                  No saved dishes yet
                </Text>
                <Text className="font-manrope mt-1 text-center text-sm text-ink-muted">
                  Build reusable dishes in the Custom Dish tab — saved batches appear here for
                  one-tap logging.
                </Text>
                <Pressable
                  onPress={() => router.push("/recipe")}
                  className="mt-4 rounded-3xl bg-primary py-3"
                >
                  <Text className="font-manrope-bold text-center text-card">
                    Go to Custom Dish
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setTab("database")}
                  className="mt-2 rounded-3xl bg-primary-soft py-3"
                >
                  <Text className="font-manrope-semibold text-center text-primary">
                    Or search the food database
                  </Text>
                </Pressable>
              </View>
            ) : (
              dishes.map((recipe) => {
                const result = recipeToResult(recipe);
                const isSelected = selected?.id === result.id;
                return (
                  <Pressable
                    key={recipe.id}
                    onPress={() => setSelected(result)}
                    className={`mb-2 rounded-2xl p-4 ${
                      isSelected ? "bg-primary-soft" : "bg-card"
                    }`}
                    style={SHADOWS.card}
                  >
                    <Text className="font-manrope-bold text-base text-ink">
                      {recipe.recipe_name}
                    </Text>
                    <Text className="font-manrope text-xs text-ink-faint">
                      Saved Dish · full saved batch
                    </Text>
                    <Text className="font-manrope mt-1 text-sm text-ink-muted">
                      {Math.round(recipe.total_calories)} kcal · P{" "}
                      {Math.round(recipe.total_protein)}g · C {Math.round(recipe.total_carbs)}g ·
                      F {Math.round(recipe.total_fats)}g
                    </Text>
                  </Pressable>
                );
              })
            )
          ) : (
            <>
              {loading ? (
                <View className="mt-8 items-center">
                  <ActivityIndicator color={COLORS.primary} />
                </View>
              ) : null}

              {error ? (
                <Text className="font-manrope mt-4 text-danger">{error}</Text>
              ) : null}

              {!loading && !error && databaseResults.length === 0 && query.trim().length >= 2 ? (
                <Text className="font-manrope mt-8 text-center text-ink-muted">
                  No matches in FatSecret or Open Food Facts. Try a different search.
                </Text>
              ) : null}

              {databaseResults.map((result) => {
                const isSelected = selected?.id === result.id;
                return (
                  <Pressable
                    key={result.id}
                    onPress={() => setSelected(result)}
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
                      {result.brand ? `${result.brand} · ` : ""}
                      {sourceLabel(result)}
                    </Text>
                    <Text className="font-manrope mt-0.5 text-sm text-ink-muted">
                      {Math.round(result.calories)} kcal · P {Math.round(result.protein)}g · C{" "}
                      {Math.round(result.carbs)}g · F {Math.round(result.fats)}g / 100 g
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => router.push("/recipe")}
                className="mt-2 rounded-2xl bg-card p-4"
                style={SHADOWS.card}
              >
                <Text className="font-manrope-semibold text-center text-primary">
                  Build a custom dish from ingredients
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>

        <AddFoodSheet
          food={selected}
          initialMealType={initialMealType}
          onClose={handleCloseSheet}
          onAdd={handleAddFromSheet}
        />

        <BarcodeScannerModal
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onScanned={(barcode) => void handleBarcodeScanned(barcode)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function SearchScreen() {
  return (
    <RequireAuth>
      <SearchContent />
    </RequireAuth>
  );
}
