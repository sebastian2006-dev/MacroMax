/**
 * FatSecret Platform API client (OAuth 2.0, client-credentials grant).
 *
 * Wire contract (verified against platform.fatsecret.com docs):
 *  1. Token:  POST https://oauth.fatsecret.com/connect/token
 *             Basic auth (client_id:client_secret), body
 *             grant_type=client_credentials&scope=basic
 *             → { access_token, token_type: "Bearer", expires_in: 86400 }
 *  2. API:    POST https://platform.fatsecret.com/rest/server.api
 *             Header: Authorization: Bearer <token>
 *             Body: method=food.get|foods.search&format=json&...
 *
 *  - food.search (singular) is accepted as an alias of foods.search; the
 *    client tries the documented plural method first and falls back to the
 *    singular form if the platform answers "unknown method".
 *  - food.get returns `servings.serving[]`, where every serving carries
 *    per-serving macros plus metric_serving_amount/unit (g or ml). Those
 *    become the app's standard serving portions.
 *  - JSON quirk: single-item collections are OBJECTS, not arrays.
 *
 * NOTE ON SECURITY: FatSecret requires client credentials to be exchanged
 * for tokens from a fixed set of registered IPs, so in production the token
 * exchange must live on a proxy server. This client keeps the exchange
 * client-side (EXPO_PUBLIC_FATSECRET_*) for local development; ship a proxy
 * before releasing.
 */

import { ServingPortion, SearchResult } from "@/src/types";
import { fetchWithTimeout, parseJson, safeResolve, toBase64, toNumber } from "@/src/lib/http";

const FATSECRET_TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
const FATSECRET_API_URL = "https://platform.fatsecret.com/rest/server.api";
const FATSECRET_TIMEOUT_MS = 7000;

const FS_CLIENT_ID = process.env.EXPO_PUBLIC_FATSECRET_CLIENT_ID?.trim() ?? "";
const FS_CLIENT_SECRET = process.env.EXPO_PUBLIC_FATSECRET_CLIENT_SECRET?.trim() ?? "";
const FS_REGION = process.env.EXPO_PUBLIC_FATSECRET_REGION?.trim() || undefined;

/** Enrichment cap: only the top unscored matches get a food.get round-trip. */
const FS_DETAIL_LIMIT = 5;
const FS_MAX_RESULTS = 25;

// ---------------------------------------------------------------------------
// OAuth 2.0 token handling (cached in memory; 24h lifetime server-side).
// ---------------------------------------------------------------------------

interface TokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let tokenCache: TokenCache | null = null;
let tokenRequestInFlight: Promise<string> | null = null;

function isConfigured(): boolean {
  return Boolean(FS_CLIENT_ID && FS_CLIENT_SECRET);
}

/** Whether FatSecret credentials are present (used by Settings UI). */
export function isFatSecretConfigured(): boolean {
  return isConfigured();
}

function formEncode(entries: Record<string, string>): string {
  return Object.entries(entries)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

/** Fetch a fresh bearer token (one in-flight request shared by callers). */
async function requestAccessToken(): Promise<string> {
  if (!isConfigured()) {
    throw new Error("FatSecret is not configured (missing EXPO_PUBLIC_FATSECRET_CLIENT_ID/SECRET)");
  }

  if (!tokenRequestInFlight) {
    tokenRequestInFlight = (async () => {
      const response = await fetchWithTimeout(
        FATSECRET_TOKEN_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${toBase64(`${FS_CLIENT_ID}:${FS_CLIENT_SECRET}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formEncode({ grant_type: "client_credentials", scope: "basic" }),
        },
        FATSECRET_TIMEOUT_MS
      );

      if (!response.ok) {
        throw new Error(`FatSecret token request failed (HTTP ${response.status})`);
      }

      const payload = await parseJson<{ access_token?: string; expires_in?: number }>(response);
      if (!payload?.access_token) {
        throw new Error("FatSecret token response missing access_token");
      }

      const expiresIn = toNumber(payload.expires_in) || 86400;
      tokenCache = {
        accessToken: payload.access_token,
        // Refresh a little early so clock skew never bites.
        expiresAt: Date.now() + (expiresIn - 60) * 1000,
      };
      return payload.access_token;
    })().finally(() => {
      tokenRequestInFlight = null;
    });
  }

  return tokenRequestInFlight;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.accessToken;
  }
  tokenCache = null;
  return requestAccessToken();
}

// ---------------------------------------------------------------------------
// Raw API calls
// ---------------------------------------------------------------------------

interface FatSecretErrorPayload {
  error?: { code?: number; message?: string };
}

/**
 * Call the FatSecret REST API. Retries once with a fresh token when the
 * platform rejects the cached token (OAuth 2.0 error code 13).
 */
async function callApi<T>(method: string, params: Record<string, string> = {}): Promise<T | null> {
  const attempt = async (retry: boolean): Promise<T | null> => {
    const token = await getAccessToken(retry);
    const response = await fetchWithTimeout(
      FATSECRET_API_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formEncode({ method, format: "json", ...params }),
      },
      FATSECRET_TIMEOUT_MS
    );

    if (!response.ok) {
      return null;
    }

    const payload = await parseJson<T & FatSecretErrorPayload>(response);
    if (payload && "error" in payload) {
      const errorCode = (payload as FatSecretErrorPayload).error?.code;
      if (errorCode === 13 && !retry) {
        // Expired/invalid token — refresh once and retry.
        return attempt(true);
      }
      if (errorCode === 1 && !retry && method === "foods.search") {
        // Unknown method — the platform edition may expose food.search.
        return callApi<T>("food.search", params);
      }
      console.warn("FatSecret API error", (payload as FatSecretErrorPayload).error);
      return null;
    }

    return payload ?? null;
  };

  return safeResolve(() => attempt(false), null);
}

// ---------------------------------------------------------------------------
// Response mapping
// ---------------------------------------------------------------------------

interface FatSecretServing {
  serving_id?: string;
  serving_description?: string;
  metric_serving_amount?: string;
  metric_serving_unit?: string;
  number_of_units?: string;
  measurement_description?: string;
  is_default?: string;
  calories?: string;
  carbohydrate?: string;
  protein?: string;
  fat?: string;
}

export interface FatSecretFoodDetail {
  food_id: string;
  food_name: string;
  brand_name?: string;
  food_type?: string;
  food_url?: string;
  servings?: { serving?: FatSecretServing | FatSecretServing[] };
}

export interface FatSecretSearchItem {
  food_id: string;
  food_name: string;
  brand_name?: string;
  food_type?: string;
  food_url?: string;
  /** e.g. "Per 100g - Calories: 22kcal | Fat: 0.34g | Carbs: 3.28g | Protein: 3.09g" */
  food_description?: string;
}

interface FoodSearchPayload {
  foods?: {
    food?: FatSecretSearchItem | FatSecretSearchItem[];
    max_results?: string;
    total_results?: string;
    page_number?: string;
  };
}

interface FoodGetPayload {
  food?: FatSecretFoodDetail;
}

/** FatSecret returns a single object instead of a 1-element array. */
function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/** "Per 100g - Calories: 22kcal | Fat: 0.34g | ..." → per-100g macros. */
export function parseDescriptionMacros(
  description: string | undefined
): { calories: number; protein: number; carbs: number; fats: number } | null {
  if (!description) {
    return null;
  }
  const segment = description.split("|").map((part) => part.trim());
  const per100 = segment.some((part) => /per\s*100\s*g/i.test(part));
  if (!per100) {
    return null;
  }

  const find = (label: string): number => {
    // No ^ anchor: "Calories" usually shares its |-segment with the
    // "Per 100g -" prefix (e.g. "Per 100g - Calories: 22kcal | …").
    const match = segment.find((part) => new RegExp(`${label}\\s*:`).test(part));
    if (!match) {
      return 0;
    }
    const value = Number.parseFloat(match.replace(/^[^:]*:\s*/, "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(value) ? value : 0;
  };

  return {
    calories: find("Calories"),
    protein: find("Protein"),
    carbs: find("Carbs"),
    fats: find("Fat"),
  };
}

/** Derive per-100g macros from the food's servings, preferring "100 g". */
function macrosFromServings(
  servings: FatSecretServing[]
): { calories: number; protein: number; carbs: number; fats: number; basis: FatSecretServing | null } {
  const metric = (serving: FatSecretServing) => ({
    amount: toNumber(serving.metric_serving_amount),
    unit: (serving.metric_serving_unit ?? "").toLowerCase(),
  });

  const per100Serving =
    servings.find((serving) => {
      const { amount, unit } = metric(serving);
      const label = (serving.serving_description ?? "").toLowerCase();
      return unit === "g" && amount >= 99 && amount <= 101 && label.includes("100 g");
    }) ??
    servings.find((serving) => {
      const { amount, unit } = metric(serving);
      return unit === "g" && Math.abs(amount - 100) < 0.5;
    });

  if (per100Serving) {
    return {
      calories: toNumber(per100Serving.calories),
      protein: toNumber(per100Serving.protein),
      carbs: toNumber(per100Serving.carbohydrate),
      fats: toNumber(per100Serving.fat),
      basis: per100Serving,
    };
  }

  // No 100 g serving → scale the default (or first metric) serving to 100 g.
  const defaultServing =
    servings.find((serving) => serving.is_default === "1") ??
    servings.find((serving) => {
      const { amount, unit } = metric(serving);
      return unit === "g" && amount > 0;
    });

  if (defaultServing) {
    const { amount, unit } = metric(defaultServing);
    if (unit === "g" && amount > 0 && toNumber(defaultServing.calories) > 0) {
      const factor = 100 / amount;
      return {
        calories: toNumber(defaultServing.calories) * factor,
        protein: toNumber(defaultServing.protein) * factor,
        carbs: toNumber(defaultServing.carbohydrate) * factor,
        fats: toNumber(defaultServing.fat) * factor,
        basis: defaultServing,
      };
    }
  }

  return { calories: 0, protein: 0, carbs: 0, fats: 0, basis: null };
}

/**
 * Map the servings payload onto standard portions.
 * Liquids in ml are converted 1 ml ≈ 1 g (density ≈ 1 for milk/juice).
 */
function portionsFromServings(servings: FatSecretServing[]): ServingPortion[] {
  const seenLabels = new Set<string>();
  const portions: ServingPortion[] = [];

  for (const serving of servings) {
    const label = serving.serving_description?.trim();
    const amount = toNumber(serving.metric_serving_amount);
    const unit = (serving.metric_serving_unit ?? "").toLowerCase();
    if (!label || amount <= 0 || (unit !== "g" && unit !== "ml")) {
      continue;
    }
    // The plain "100 g" reference serving duplicates the grams mode.
    if (unit === "g" && Math.abs(amount - 100) < 0.5 && /^100\s*g$/i.test(label)) {
      continue;
    }
    if (seenLabels.has(label)) {
      continue;
    }
    seenLabels.add(label);
    portions.push({
      id: `fs-serving-${serving.serving_id ?? label}`,
      label,
      grams: Math.round(amount * 10) / 10,
      unit,
    });
    if (portions.length >= 8) {
      break;
    }
  }

  return portions;
}

/** Build the final SearchResult for a detailed food. */
export function mapFatSecretFood(food: FatSecretFoodDetail): SearchResult | null {
  const name = food.food_name?.trim();
  if (!name) {
    return null;
  }

  const servings = asArray(food.servings?.serving);
  const per100 = macrosFromServings(servings);

  // No metric serving with macros → nothing reliable to log. (Search items
  // without metrics never reach food.get, so this only drops unusable foods.)
  if (per100.calories <= 0) {
    return null;
  }

  return {
    id: `fatsecret-${food.food_id}`,
    name,
    brand: food.brand_name?.trim() || null,
    externalId: food.food_id,
    barcode: null,
    source: "fatsecret",
    calories: Math.round(per100.calories * 100) / 100,
    protein: Math.round(per100.protein * 100) / 100,
    carbs: Math.round(per100.carbs * 100) / 100,
    fats: Math.round(per100.fats * 100) / 100,
    servingSize: "100 g",
    portions: portionsFromServings(servings),
  };
}

/** Lightweight result built purely from the search description (per 100 g). */
export function mapFatSecretSearchItem(item: FatSecretSearchItem): SearchResult | null {
  const name = item.food_name?.trim();
  if (!name) {
    return null;
  }
  const macros = parseDescriptionMacros(item.food_description);
  if (!macros || macros.calories <= 0) {
    return null;
  }
  return {
    id: `fatsecret-${item.food_id}`,
    name,
    brand: item.brand_name?.trim() || null,
    externalId: item.food_id,
    barcode: null,
    source: "fatsecret",
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fats: macros.fats,
    servingSize: "100 g",
    portions: [],
  };
}

// ---------------------------------------------------------------------------
// Public search API
// ---------------------------------------------------------------------------

async function searchFoodGet(foodId: string): Promise<FatSecretFoodDetail | null> {
  const payload = await callApi<FoodGetPayload>("food.get", { food_id: foodId });
  return payload?.food ?? null;
}

/**
 * Text search for raw ingredients & dishes. Returns results ordered by
 * relevance; entries without per-100g data in the search response are
 * enriched with food.get (bounded, parallel).
 */
export async function searchFatSecret(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed || !isConfigured()) {
    return [];
  }

  const params: Record<string, string> = {
    search_expression: trimmed,
    page_number: "0",
    max_results: String(FS_MAX_RESULTS),
  };
  if (FS_REGION) {
    params.region = FS_REGION;
  }

  const payload = await callApi<FoodSearchPayload>("foods.search", params);
  const items = asArray(payload?.foods?.food);
  if (items.length === 0) {
    return [];
  }

  // 1) Items whose description already gives per-100g values can skip the
  //    detail round-trip; enrich only the top matches that still lack macros.
  const needsDetail = items.filter((item) => !parseDescriptionMacros(item.food_description));

  // 2) Enrich the top matches that still lack macros (brands, dishes).
  const enriched = new Map<string, SearchResult>();
  const detailTargets = needsDetail.slice(0, FS_DETAIL_LIMIT);
  await Promise.allSettled(
    detailTargets.map(async (item) => {
      const detail = await searchFoodGet(item.food_id);
      if (detail) {
        const mapped = mapFatSecretFood(detail);
        if (mapped) {
          enriched.set(item.food_id, mapped);
        }
      }
    })
  );

  // 3) Reassemble in provider order.
  const results: SearchResult[] = [];
  for (const item of items) {
    const detailed = enriched.get(item.food_id);
    if (detailed) {
      results.push(detailed);
      continue;
    }
    const fromDescription = mapFatSecretSearchItem(item);
    if (fromDescription) {
      results.push(fromDescription);
    }
  }

  return results;
}
