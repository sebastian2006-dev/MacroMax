/**
 * @file themeContrast.test.ts
 * Legibility guard for the light "Emerald Ring" palette.
 *
 * The brand emerald (#10B981) is a BRIGHT color: 2.54:1 against white as text,
 * and the same as a background for white text. The palette therefore splits the
 * roles — bright hues fill, their `.ink` siblings carry text — and this suite
 * is what enforces the split. A palette edit that breaks it fails here instead
 * of shipping unreadable UI.
 *
 * Thresholds: 4.5:1 for body text, 3:1 for large/bold text and UI graphics
 * (rings, chart lines). Hairlines and decorative brand arcs are asserted
 * separately with an explicit rationale.
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BRAND,
  CHART_SERIES,
  COLORS,
  MACRO_CHART_COLORS,
  MACRO_COLORS,
  PALETTE,
  RING_COLORS,
} from "../src/theme/colors";

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #RRGGBB color. */
function luminance(hex: string): number {
  const [r, g, b] = (hex.replace("#", "").match(/../g) ?? []).map((pair) =>
    Number.parseInt(pair, 16)
  );
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two #RRGGBB colors (1 … 21). */
function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const AA_BODY = 4.5;
const AA_LARGE = 3;

function assertRatio(foreground: string, background: string, minimum: number, label: string) {
  const ratio = contrast(foreground, background);
  assert.ok(
    ratio >= minimum,
    `${label}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`
  );
}

describe("light palette — body text", () => {
  it("ink, ink-muted and ink-faint read on both the page and cards", () => {
    for (const background of [COLORS.surface, COLORS.card]) {
      assertRatio(COLORS.ink, background, AA_BODY, "primary text");
      assertRatio(COLORS.inkMuted, background, AA_BODY, "muted text");
      assertRatio(COLORS.inkFaint, background, AA_BODY, "faint text");
    }
  });

  it("brand labels use the text-safe ink siblings, not the bright fills", () => {
    // The requested #10B981 measures 2.54:1 on white — fine as a button, never
    // as a label. `.ink` keeps the hue and clears AA.
    assertRatio(COLORS.primaryInk, COLORS.card, AA_BODY, "emerald label");
    assertRatio(COLORS.secondaryInk, COLORS.card, AA_BODY, "blue label");
    assertRatio(COLORS.tertiaryInk, COLORS.card, AA_BODY, "amber label");
    assertRatio(MACRO_COLORS.carbs, COLORS.card, AA_BODY, "mint-green label (carbs)");
  });

  it("text on soft accent chips reads", () => {
    assertRatio(COLORS.primaryInk, COLORS.primarySoft, AA_BODY, "ink on mint chip");
    assertRatio(COLORS.secondaryInk, COLORS.secondarySoft, AA_BODY, "ink on blue chip");
    assertRatio(COLORS.tertiaryInk, COLORS.tertiarySoft, AA_BODY, "ink on amber chip");
    assertRatio(COLORS.danger, COLORS.dangerSoft, AA_BODY, "error on error chip");
  });

  it("macro values and chart series stay legible on white", () => {
    for (const [macro, color] of Object.entries(MACRO_COLORS)) {
      assertRatio(color, COLORS.card, AA_BODY, `${macro} value`);
    }
    // Trend lines now come from MACRO_CHART_COLORS (CHART_SERIES ramp).
    assertRatio(MACRO_CHART_COLORS.calories, COLORS.card, AA_LARGE, "calorie line");
    assertRatio(MACRO_CHART_COLORS.protein, COLORS.card, AA_LARGE, "protein line");
  });

  it("the gradient wordmark is readable because it uses the deep stops", () => {
    for (const stop of BRAND.wordmark) {
      assertRatio(stop, COLORS.surface, AA_BODY, `wordmark stop ${stop}`);
    }
  });
});

describe("light palette — text on accent fills", () => {
  it("dark ink is the label color on every bright brand fill", () => {
    assertRatio(COLORS.ink, COLORS.primary, AA_BODY, "on emerald button");
    assertRatio(COLORS.ink, PALETTE.mintGreen, AA_BODY, "on mint-green pill");
    assertRatio(COLORS.ink, PALETTE.mint, AA_BODY, "on mint");
    assertRatio(COLORS.ink, COLORS.tertiary, AA_BODY, "on amber badge");
  });

  it("white text on the bright emerald really is the bad pairing", () => {
    // Documents why buttons label themselves with dark ink rather than white.
    assert.ok(
      contrast(PALETTE.white, COLORS.primary) < AA_LARGE,
      "white on #10B981 is expected to fail — do not use it for button labels"
    );
    // ...and where white text IS correct: dark scrims (camera overlays).
    assertRatio(PALETTE.white, COLORS.ink, AA_BODY, "on camera scrim");
  });
});

describe("light palette — structure", () => {
  it("the hairline border, not the tone gap, separates cards from the page", () => {
    // White on #F4F9F6 is only ~1.06:1, which is why every card carries a 1px
    // `edge` border (see src/theme/shadows.ts). Assert both halves of that.
    assert.ok(
      contrast(COLORS.card, COLORS.surface) < 1.15,
      "cards are expected to sit close to the page background"
    );
    assert.ok(
      contrast(COLORS.edge, COLORS.card) >= 1.2,
      `border ${contrast(COLORS.edge, COLORS.card).toFixed(2)}:1 is invisible on a white card`
    );
    assert.ok(
      contrast(COLORS.wash, COLORS.card) >= 1.08,
      "inset fields must be distinguishable from the card they sit on"
    );

    // Text-bearing insets (inputs, chips) must hold AA for muted and faint copy.
    for (const inset of [COLORS.wash, COLORS.primarySoft]) {
      assertRatio(COLORS.inkMuted, inset, AA_BODY, "muted text on inset");
      assertRatio(COLORS.inkFaint, inset, AA_BODY, "faint text on inset");
    }

    // `washDeep` is a track/dot fill only — no text sits on it — so it is held
    // to the visible-fill bar instead of the text bar.
    assert.ok(
      contrast(COLORS.washDeep, COLORS.card) >= 1.08,
      "washDeep must still read as a filled track"
    );
  });

  it("the logo arcs read as brand graphics, with deeper siblings available", () => {
    // Ring colors are the high-contrast chart hues, as requested: protein,
    // carbs and fats clear the 3:1 UI bar; mint (2.1:1) is decorative. If
    // strict WCAG 1.4.11 is ever required, deeper siblings are asserted here
    // so the escape hatch is known-good.
    assertRatio(RING_COLORS.protein, COLORS.card, AA_LARGE, "protein ring (spec color)");
    assertRatio(RING_COLORS.carbs, COLORS.card, AA_LARGE, "carbs ring (spec color)");
    for (const [macro, color] of [
      ["calories", RING_COLORS.calories],
      ["fats", RING_COLORS.fats],
    ] as const) {
      assert.ok(
        contrast(color, COLORS.card) >= 1.8,
        `${macro} ring ${contrast(color, COLORS.card).toFixed(2)}:1 is too faint to see at all`
      );
    }
    assertRatio("#0D9488", COLORS.card, AA_LARGE, "deeper mint sibling");
    assertRatio("#B45309", COLORS.card, AA_LARGE, "deeper amber sibling");
  });

  it("every chart hue pops on BOTH the light card and the dark emerald field", () => {
    // The data-viz contract for the CHART_SERIES ramp, against BOTH themes:
    //  - light card (#FFFFFF): ≥ 1.8:1, the decorative-graphics bar used for
    //    the rings (mint and amber are ~2:1 on white; charts also sit on
    //    white cards with the macro's deep ink printed right beside them).
    //  - dark emerald field (#0B4335, boot badge / logo): ≥ 2.6:1 — blue,
    //    mint, coral and amber clear 3:1; violet lands at 2.65.
    for (const [name, color] of Object.entries(CHART_SERIES)) {
      assert.ok(
        contrast(color, COLORS.card) >= 1.8,
        `${name} ${color} is ${contrast(color, COLORS.card).toFixed(2)}:1 on the light card`
      );
      assert.ok(
        contrast(color, "#0B4335") >= 2.6,
        `${name} ${color} is ${contrast(color, "#0B4335").toFixed(2)}:1 on the emerald field`
      );
    }
  });

  it("chart series hues that share a plot are far enough apart to distinguish", () => {
    // Only hues that can appear in the SAME chart are guarded: the donut and
    // the trend pages use MACRO_CHART_COLORS (violet, blue, mint, amber);
    // coral is the spare fifth hue and never competes with amber.
    const hues = Object.values(MACRO_CHART_COLORS).map(toHsl);
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        const gap = Math.abs(hues[i].h - hues[j].h);
        const separation = Math.min(gap, 360 - gap);
        assert.ok(
          separation >= 40,
          `chart hues ${i}/${j} are ${separation.toFixed(0)}° apart, need ≥ 40°`
        );
      }
    }
  });

  it("every macro keeps a distinct color", () => {
    const values = Object.values(MACRO_COLORS);
    assert.equal(new Set(values).size, values.length);
    const chartValues = Object.values(MACRO_CHART_COLORS);
    assert.equal(new Set(chartValues).size, chartValues.length);
  });
});

/** Hue of a hex color, for the chart-separation assertions. */
function toHsl(hex: string): { h: number } {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { h: 0 };
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return { h: h < 0 ? h + 360 : h };
}
