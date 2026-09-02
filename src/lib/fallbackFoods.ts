import { SearchResult } from "@/src/types";

interface FallbackFood {
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

const FALLBACK_FOODS: FallbackFood[] = [
  { name: "Rice (cooked)", brand: "Generic", calories: 130, protein: 2.7, carbs: 28, fats: 0.3 },
  { name: "Rice (raw)", brand: "Generic", calories: 365, protein: 7, carbs: 80, fats: 0.7 },
  { name: "Chicken breast (cooked)", brand: "Generic", calories: 165, protein: 31, carbs: 0, fats: 3.6 },
  { name: "Chicken breast (raw)", brand: "Generic", calories: 120, protein: 23, carbs: 0, fats: 1.2 },
  { name: "Egg (whole)", brand: "Generic", calories: 155, protein: 13, carbs: 1.1, fats: 11 },
  { name: "Egg white", brand: "Generic", calories: 52, protein: 11, carbs: 0.7, fats: 0.2 },
  { name: "Moong dal (cooked)", brand: "Generic", calories: 116, protein: 9, carbs: 20, fats: 0.4 },
  { name: "Rajma (cooked)", brand: "Generic", calories: 127, protein: 8, carbs: 22, fats: 0.5 },
  { name: "Paneer", brand: "Generic", calories: 265, protein: 18, carbs: 4, fats: 20 },
  { name: "Milk (toned)", brand: "Generic", calories: 58, protein: 3.2, carbs: 4.8, fats: 3.5 },
  { name: "Curd / Yogurt", brand: "Generic", calories: 60, protein: 3.5, carbs: 5, fats: 3 },
  { name: "Banana", brand: "Generic", calories: 89, protein: 1.1, carbs: 23, fats: 0.3 },
  { name: "Apple", brand: "Generic", calories: 52, protein: 0.3, carbs: 14, fats: 0.2 },
  { name: "Oats (dry)", brand: "Generic", calories: 389, protein: 16.9, carbs: 66, fats: 6.9 },
  { name: "Brown bread", brand: "Generic", calories: 247, protein: 8, carbs: 44, fats: 3 },
  { name: "Peanut butter", brand: "Generic", calories: 588, protein: 25, carbs: 20, fats: 50 },
  { name: "Whey protein powder", brand: "Generic", calories: 400, protein: 80, carbs: 10, fats: 5 },
  { name: "Sweet potato (cooked)", brand: "Generic", calories: 86, protein: 1.6, carbs: 20, fats: 0.1 },
  { name: "Potato (boiled)", brand: "Generic", calories: 77, protein: 2, carbs: 17, fats: 0.1 },
  { name: "Spinach", brand: "Generic", calories: 23, protein: 2.9, carbs: 3.6, fats: 0.4 },
  { name: "Broccoli", brand: "Generic", calories: 34, protein: 2.8, carbs: 6.6, fats: 0.4 },
  { name: "Idli", brand: "Generic", calories: 78, protein: 2, carbs: 15, fats: 0.5 },
  { name: "Dosa", brand: "Generic", calories: 165, protein: 3, carbs: 25, fats: 5 },
  { name: "Chapati / Roti", brand: "Generic", calories: 297, protein: 8, carbs: 50, fats: 5 },
  { name: "Chicken curry", brand: "Generic", calories: 180, protein: 20, carbs: 6, fats: 9 },
  { name: "French fries", brand: "Generic", calories: 312, protein: 3.4, carbs: 41, fats: 15 },
  { name: "Almonds", brand: "Generic", calories: 579, protein: 21, carbs: 22, fats: 50 },
  { name: "Mixed nuts", brand: "Generic", calories: 607, protein: 20, carbs: 20, fats: 54 },
];

export function searchFallbackFoods(query: string): SearchResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  return FALLBACK_FOODS.filter((food) => food.name.toLowerCase().includes(normalized))
    .map((food, index) => ({
      id: `fallback-${index}`,
      name: food.name,
      brand: food.brand,
      source: "fallback" as const,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fats: food.fats,
      servingSize: "100 g",
    }));
}
