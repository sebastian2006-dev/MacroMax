/**
 * Ambient elevation styles (Emerald Ring, light theme).
 *
 * IMPORTANT: these are applied as plain React Native style objects, NOT as
 * NativeWind `shadow-*` classes. NativeWind's CSS-runtime shadow utilities
 * crash React Navigation screens with a bogus
 * "Couldn't find a navigation context" render error (see
 * https://github.com/expo/expo/issues/38423 — a NativeWind bug, closed as
 * such). Platform-safe legacy shadow props (elevation on Android, soft
 * shadows on iOS/web) have the same visual result with zero risk.
 *
 * The 1px `edge` border rides along here on purpose: white cards on a #F4F9F6
 * background are only 1.06:1 apart, so the hairline — not the shadow — is what
 * actually separates a card from the page. Routing it through the shared
 * elevation objects keeps every card, sheet and the tab bar consistent without
 * touching 30 call sites.
 */

import { Platform, ViewStyle } from "react-native";
import { COLORS } from "@/src/theme/colors";

const HAIRLINE: ViewStyle = { borderWidth: 1, borderColor: COLORS.edge };

function softShadow(y: number, blur: number, opacity: number): ViewStyle {
  return {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: y },
    shadowOpacity: opacity,
    shadowRadius: blur,
  };
}

export const SHADOWS: Record<"card" | "cardLg" | "nav" | "sheet", ViewStyle> = {
  /** Default card elevation. */
  card: Platform.select<ViewStyle>({
    android: { elevation: 2, ...HAIRLINE },
    default: { ...softShadow(2, 8, 0.06), ...HAIRLINE },
  })!,
  /** Large surfaces (modals, hero cards). */
  cardLg: Platform.select<ViewStyle>({
    android: { elevation: 4, ...HAIRLINE },
    default: { ...softShadow(6, 16, 0.1), ...HAIRLINE },
  })!,
  /** Bottom navigation bar — top edge only, cast upward. */
  nav: Platform.select<ViewStyle>({
    android: { elevation: 8, borderTopWidth: 1, borderTopColor: COLORS.edge },
    default: { ...softShadow(-2, 12, 0.07), borderTopWidth: 1, borderTopColor: COLORS.edge },
  })!,
  /** Bottom sheet. */
  sheet: Platform.select<ViewStyle>({
    android: { elevation: 12 },
    default: softShadow(-8, 22, 0.14),
  })!,
};
