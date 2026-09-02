/**
 * Ambient shadow styles (Vitality Core "Level 1" elevation).
 *
 * IMPORTANT: these shadows are applied as plain React Native style objects,
 * NOT as NativeWind `shadow-*` classes. NativeWind's CSS-runtime shadow
 * utilities crash React Navigation screens with a bogus
 * "Couldn't find a navigation context" render error (see
 * https://github.com/expo/expo/issues/38423 — a NativeWind bug, closed as
 * such). Platform-safe legacy shadow props (elevation on Android, soft
 * shadows on iOS/web) have the same visual result with zero risk.
 */

import { Platform, ViewStyle } from "react-native";

function softShadow(y: number, blur: number, opacity: number): ViewStyle {
  return {
    shadowColor: "#111C2D",
    shadowOffset: { width: 0, height: y },
    shadowOpacity: opacity,
    shadowRadius: blur,
  };
}

export const SHADOWS: Record<"card" | "cardLg" | "nav" | "sheet", ViewStyle> = {
  /** Default card elevation. */
  card: Platform.select<ViewStyle>({
    android: { elevation: 3 },
    default: softShadow(2, 6, 0.09),
  })!,
  /** Large surfaces (modals, hero cards). */
  cardLg: Platform.select<ViewStyle>({
    android: { elevation: 6 },
    default: softShadow(4, 14, 0.12),
  })!,
  /** Bottom navigation bar (shadow cast upward). */
  nav: Platform.select<ViewStyle>({
    android: { elevation: 8 },
    default: softShadow(-2, 10, 0.07),
  })!,
  /** Bottom sheet. */
  sheet: Platform.select<ViewStyle>({
    android: { elevation: 12 },
    default: softShadow(-6, 18, 0.12),
  })!,
};
