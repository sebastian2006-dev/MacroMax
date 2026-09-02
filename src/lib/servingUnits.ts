/**
 * Smart serving units & quantity conversion.
 *
 * Three logging modes:
 *  - "grams": manual weight (default for most foods).
 *  - "units": discrete pieces with a known gram weight (egg, roti, banana…),
 *    resolved from the fuzzy unit table below.
 *  - "portion": standard serving portions shipped by the food providers
 *    (FatSecret servings / Open Food Facts serving sizes), e.g.
 *    "1 cup (244 g)" or "250 ml". Liquids are converted 1 ml ≈ 1 g.
 */

import { ServingPortion } from "@/src/types";

export interface ServingUnit {
  /** Singular label, e.g. "egg" or "slice". */
  unit: string;
  /** Approximate grams for one unit/piece. */
  gramsPerUnit: number;
}

export type ServingMode = "grams" | "units" | "portion";

/** Full quantity state shared by every serving input in the app. */
export interface ServingState {
  mode: ServingMode;
  /** Raw user-typed quantity, e.g. "2" or "150". */
  quantity: string;
  /** Piece-size unit — only used in "units" mode. */
  unit: ServingUnit | null;
  /** Provider standard portion — only used in "portion" mode. */
  portion: ServingPortion | null;
}

export const DEFAULT_SERVING_STATE: ServingState = {
  mode: "grams",
  quantity: "100",
  unit: null,
  portion: null,
};

interface UnitRule {
  /** Food matches when EVERY keyword is found in the normalized name. */
  keywords: string[];
  unit: string;
  gramsPerUnit: number;
}

/**
 * Default conversion table. Rules are ordered most-specific first so that
 * "egg white" wins over "egg" and "bread slice" wins over generic "bread".
 */
const UNIT_RULES: UnitRule[] = [
  { keywords: ["egg", "white"], unit: "egg white", gramsPerUnit: 33 },
  { keywords: ["egg", "yolk"], unit: "egg yolk", gramsPerUnit: 17 },
  { keywords: ["egg"], unit: "egg", gramsPerUnit: 50 }, // 1 whole egg ≈ 50 g
  { keywords: ["bread", "slice"], unit: "slice", gramsPerUnit: 30 },
  { keywords: ["slice"], unit: "slice", gramsPerUnit: 30 }, // toast, sliced bread
  { keywords: ["bread"], unit: "slice", gramsPerUnit: 30 }, // 1 slice bread ≈ 30 g
  { keywords: ["roti"], unit: "roti", gramsPerUnit: 40 }, // 1 roti ≈ 40 g
  { keywords: ["chapati"], unit: "roti", gramsPerUnit: 40 },
  { keywords: ["phulka"], unit: "roti", gramsPerUnit: 40 },
  { keywords: ["paratha"], unit: "paratha", gramsPerUnit: 80 },
  { keywords: ["idli"], unit: "idli", gramsPerUnit: 40 },
  { keywords: ["dosa"], unit: "dosa", gramsPerUnit: 55 },
  { keywords: ["banana"], unit: "banana", gramsPerUnit: 118 }, // 1 medium banana ≈ 118 g
  { keywords: ["apple"], unit: "apple", gramsPerUnit: 182 },
  { keywords: ["orange"], unit: "orange", gramsPerUnit: 131 },
  { keywords: ["guava"], unit: "guava", gramsPerUnit: 90 },
];

/** User-facing reference table (shown in Settings for transparency). */
export const UNIT_GRAM_DEFAULTS: { label: string; unit: string; gramsPerUnit: number }[] = [
  { label: "Whole Egg", unit: "egg", gramsPerUnit: 50 },
  { label: "Bread Slice", unit: "slice", gramsPerUnit: 30 },
  { label: "Roti / Chapati", unit: "roti", gramsPerUnit: 40 },
  { label: "Medium Banana", unit: "banana", gramsPerUnit: 118 },
  { label: "Paratha", unit: "paratha", gramsPerUnit: 80 },
  { label: "Idli", unit: "idli", gramsPerUnit: 40 },
  { label: "Dosa", unit: "dosa", gramsPerUnit: 55 },
  { label: "Apple", unit: "apple", gramsPerUnit: 182 },
  { label: "Orange", unit: "orange", gramsPerUnit: 131 },
];

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Suggest a piece-size serving unit for a food name, or null. */
export function getServingUnitForFood(name: string): ServingUnit | null {
  const normalized = normalizeName(name);
  if (!normalized) {
    return null;
  }

  for (const rule of UNIT_RULES) {
    if (rule.keywords.every((keyword) => normalized.includes(keyword))) {
      return { unit: rule.unit, gramsPerUnit: rule.gramsPerUnit };
    }
  }

  return null;
}

function formatQuantityNumber(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : String(Math.round(quantity * 10) / 10);
}

/** "2 eggs", "1 slice", "1.5 bananas"… */
export function formatUnitQuantity(quantity: number, unit: ServingUnit): string {
  const label = quantity === 1 ? unit.unit : `${unit.unit}s`;
  return `${formatQuantityNumber(quantity)} ${label}`;
}

/** Convert a unit/piece count into its gram equivalent (0 when invalid). */
export function unitsToGrams(quantity: number, unit: ServingUnit): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return 0;
  }
  return quantity * unit.gramsPerUnit;
}

export function parseQuantity(quantity: string): number {
  const parsed = Number.parseFloat(quantity);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/** Gram equivalent of the whole state (0 when invalid). */
export function servingStateToGrams(state: ServingState): number {
  const qty = parseQuantity(state.quantity);
  if (state.mode === "units" && state.unit) {
    return unitsToGrams(qty, state.unit);
  }
  if (state.mode === "portion" && state.portion) {
    return qty * state.portion.grams;
  }
  return qty; // grams mode
}

/** Human label of the unit side of the input, e.g. "grams", "eggs", "1 cup (244 g)". */
export function servingUnitLabel(state: ServingState): string {
  const qty = parseQuantity(state.quantity);
  if (state.mode === "units" && state.unit) {
    return qty === 1 ? state.unit.unit : `${state.unit.unit}s`;
  }
  if (state.mode === "portion" && state.portion) {
    return state.portion.label;
  }
  return "grams";
}

/**
 * Human description of the logged quantity for storage & lists:
 * "150 g", "2 eggs", "1 cup (244 g)", "2 × 250 ml".
 */
export function formatServingSize(state: ServingState): string {
  const qty = parseQuantity(state.quantity);
  if (state.mode === "units" && state.unit) {
    return formatUnitQuantity(qty, state.unit);
  }
  if (state.mode === "portion" && state.portion) {
    const label = state.portion.label;
    if (qty === 1) {
      return label;
    }
    return `${formatQuantityNumber(qty)} × ${label}`;
  }
  return `${qty} g`;
}
