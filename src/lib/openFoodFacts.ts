/**
 * Open Food Facts provider client.
 *
 * Responsibilities:
 *  - Barcode lookups through the V2 product endpoint
 *    (https://world.openfoodfacts.org/api/v2/product/{barcode}.json)
 *  - Text searches through the OFF search endpoint
 *    (https://world.openfoodfacts.org/cgi/search.pl)
 *  - Mapping raw OFF products into the app's SearchResult schema, deriving
 *    per-100g macros AND standard serving portions (serving_size text +
 *    serving_quantity in grams) so packaged items can be logged by portion.
 *
 * A custom User-Agent is REQUIRED by Open Food Facts (requests without one
 * are rate-limited aggressively). Override via EXPO_PUBLIC_OFF_USER_AGENT.
 */

import { ServingPortion, SearchResult } from "@/src/types";
import { fetchWithTimeout, parseJson, toNumber } from "@/src/lib/http";

const OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product/";
const OFF_TIMEOUT_MS = 7000;

const OFF_USER_AGENT =
  process.env.EXPO_PUBLIC_OFF_USER_AGENT?.trim() ||
  "MacroMax/1.0 (calorie & protein tracker; contact: macromax-app@users.noreply.github.com)";

/** Open Food Facts v2 product nutriments (values are per 100 g or per serving). */
interface OffNutriments {
  "energy-kcal_100g"?: number;
  "energy_100g"?: number; // kJ fallback when kcal is not present
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  "energy-kcal_serving"?: number;
  "energy_serving"?: number; // kJ fallback
  proteins_serving?: number;
  carbohydrates_serving?: number;
  fat_serving?: number;
}

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  /** Human serving label, e.g. "1 bar (60 g)". */
  serving_size?: string;
  /** Gram weight of one serving. */
  serving_quantity?: number;
  quantity?: string;
  nutriments?: OffNutriments;
}

interface OffSearchPayload {
  products?: OffProduct[];
}

interface OffProductPayload {
  status?: number;
  status_verbose?: string;
  product?: OffProduct;
}

/** kcal from kJ when the kcal field is absent. */
function energyKcal(nutriments: OffNutriments, scope: "100g" | "serving"): number {
  const kcal = nutriments[`energy-kcal_${scope}`];
  if (kcal !== undefined && Number.isFinite(kcal)) {
    return kcal;
  }
  const kj = nutriments[`energy_${scope}`];
  return kj !== undefined && Number.isFinite(kj) ? kj / 4.184 : 0;
}

/**
 * Map one OFF product to a SearchResult. Returns null when the product is
 * unusable (no name or no energy data).
 */
export function mapOffProduct(product: OffProduct): SearchResult | null {
  const name = product.product_name?.trim();
  if (!name) {
    return null;
  }

  const nutriments = product.nutriments ?? {};
  const servingQuantity = toNumber(product.serving_quantity);

  // Preferred: per-100g values as shipped by OFF.
  let calories = energyKcal(nutriments, "100g");
  let protein = toNumber(nutriments.proteins_100g);
  let carbs = toNumber(nutriments.carbohydrates_100g);
  let fats = toNumber(nutriments.fat_100g);

  // Fallback: per-serving values scaled back to 100 g.
  if (calories <= 0 && servingQuantity > 0) {
    const servingCalories = energyKcal(nutriments, "serving");
    if (servingCalories > 0) {
      const factor = 100 / servingQuantity;
      calories = servingCalories * factor;
      protein = toNumber(nutriments.proteins_serving) * factor;
      carbs = toNumber(nutriments.carbohydrates_serving) * factor;
      fats = toNumber(nutriments.fat_serving) * factor;
    }
  }

  if (calories <= 0) {
    return null;
  }

  // Standard portion (when the product declares one with a gram weight).
  const portions: ServingPortion[] = [];
  const servingLabel = product.serving_size?.trim();
  if (servingLabel && servingQuantity > 0) {
    portions.push({
      id: `off-serving-${product.code ?? "product"}`,
      label: servingLabel,
      grams: Math.round(servingQuantity * 10) / 10,
      unit: "g",
    });
  }

  return {
    id: product.code ?? `off-${name.toLowerCase()}`,
    name,
    brand: product.brands?.trim() || null,
    barcode: product.code ?? null,
    externalId: product.code ?? null,
    source: "open_food_facts",
    calories: Math.round(calories * 100) / 100,
    protein: Math.round(protein * 100) / 100,
    carbs: Math.round(carbs * 100) / 100,
    fats: Math.round(fats * 100) / 100,
    servingSize: "100 g",
    portions,
  };
}

/** Text search for packaged products (search.pl + custom User-Agent). */
export async function searchOpenFoodFacts(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const url = new URL(OFF_SEARCH_URL);
  url.searchParams.set("search_terms", trimmed);
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "12");
  url.searchParams.set("fields", "code,product_name,brands,serving_size,serving_quantity,nutriments");

  const response = await fetchWithTimeout(
    url.toString(),
    { headers: { "User-Agent": OFF_USER_AGENT } },
    OFF_TIMEOUT_MS
  );
  if (!response.ok) {
    return [];
  }

  const payload = await parseJson<OffSearchPayload>(response);
  return (payload?.products ?? []).flatMap((product) => {
    const result = mapOffProduct(product);
    return result ? [result] : [];
  });
}

/**
 * Barcode lookup through the V2 endpoint:
 * https://world.openfoodfacts.org/api/v2/product/{barcode}.json
 */
export async function searchOpenFoodFactsByBarcode(barcode: string): Promise<SearchResult | null> {
  const cleaned = barcode.trim();
  if (!cleaned) {
    return null;
  }

  const url = new URL(`${OFF_PRODUCT_URL}${encodeURIComponent(cleaned)}.json`);
  url.searchParams.set(
    "fields",
    "code,product_name,brands,serving_size,serving_quantity,quantity,nutriments"
  );

  const response = await fetchWithTimeout(
    url.toString(),
    { headers: { "User-Agent": OFF_USER_AGENT } },
    OFF_TIMEOUT_MS
  );
  if (!response.ok) {
    return null;
  }

  const payload = await parseJson<OffProductPayload>(response);
  if (payload?.status !== 1 || !payload.product) {
    return null;
  }

  return mapOffProduct(payload.product);
}
