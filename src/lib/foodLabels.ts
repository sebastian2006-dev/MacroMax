/**
 * Human-readable provider/source lines for food search results.
 * Shared by every screen that renders result rows (search, custom dish,
 * ingredient results sheet) so labels never drift apart.
 */

import type { SearchResult } from "@/src/types";

export function sourceLabel(result: SearchResult): string {
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
