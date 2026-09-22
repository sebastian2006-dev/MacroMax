import React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { useSyncStatus } from "@/src/hooks/useSyncStatus";
import { SyncMode } from "@/src/lib/syncStatus";
import { COLORS } from "@/src/theme/colors";
import { SHADOWS } from "@/src/theme/shadows";

const MODE_COLORS: Record<SyncMode, string> = {
  idle: COLORS.inkFaint,
  local: COLORS.primary,
  cached: COLORS.inkMuted,
  online: COLORS.secondary,
  mixed: COLORS.tertiary,
  offline: COLORS.danger,
};

/** Brand-gradient stop colors matching the M icon (top → bottom = left → right). */
const BRAND_BLUE = "#1E60E6";
const BRAND_GREEN = "#12963E";
const BRAND_ORANGE = "#EB7D0A";

interface AppHeaderProps {
  /** "dark" for use over the camera scanner; otherwise light. */
  variant?: "light" | "dark";
}

/**
 * Pinned top app header: "MacroMax" branding plus a live data-source status
 * pill (FatSecret / Open Food Facts online lookups vs local/cached data).
 *
 * The wordmark uses an SVG `<LinearGradient>` (Blue → Green → Orange) to match
 * the app icon's three color bands. On dark backgrounds (camera scanner) the
 * text falls back to solid white for legibility.
 */
export function AppHeader({ variant = "light" }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const sync = useSyncStatus();
  const isDark = variant === "dark";

  return (
    <View
      style={{ paddingTop: insets.top }}
      className={isDark ? "bg-transparent" : "bg-surface"}
    >
      <View className="flex-row items-center justify-between px-4 pb-3 pt-3">
        {/*
          The wordmark deliberately carries NO `tracking-*` class. On Android a
          negative letterSpacing is applied around every glyph but the node is
          measured with the (smaller) advance width, so the final glyph is drawn
          outside the clip bounds — which truncated "MacroMax" to "MacroMa".
          `shrink-0` + a single line keep the full wordmark at its natural size
          instead of letting the status pill squeeze it.
        */}
        {isDark ? (
          <Text
            numberOfLines={1}
            className="shrink-0 font-manrope-extrabold text-2xl text-card"
          >
            MacroMax
          </Text>
        ) : (
          <View style={{ height: 30 }} className="shrink-0">
            <Svg height={30} width={155}>
              <Defs>
                <SvgLinearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={BRAND_BLUE} />
                  <Stop offset="0.5" stopColor={BRAND_GREEN} />
                  <Stop offset="1" stopColor={BRAND_ORANGE} />
                </SvgLinearGradient>
              </Defs>
              <SvgText
                fill="url(#brandGrad)"
                fontSize={24}
                fontWeight="800"
                fontFamily="Manrope-ExtraBold"
                x="0"
                y="24"
              >
                MacroMax
              </SvgText>
            </Svg>
          </View>
        )}

        <View
          accessibilityLabel={`Data source: ${sync.label}. ${sync.detail}`}
          className={`ml-3 min-w-0 shrink flex-row items-center rounded-full px-3 py-1.5 ${
            isDark ? "bg-white/15" : "bg-card"
          }`}
          style={SHADOWS.card}
        >
          <View
            className="mr-1.5 h-2 w-2 rounded-full"
            style={{ backgroundColor: MODE_COLORS[sync.mode] }}
          />
          <Text
            numberOfLines={1}
            className={`shrink font-manrope-bold text-xs ${
              isDark ? "text-card" : "text-ink-muted"
            }`}
          >
            {sync.label}
          </Text>
        </View>
      </View>
    </View>
  );
}
