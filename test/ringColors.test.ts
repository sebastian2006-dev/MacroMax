/**
 * @file ringColors.test.ts
 * Guards the macro ring palette: the calories ring must read MINT, protein
 * ELECTRIC BLUE, carbs MINT-GREEN and fats AMBER GOLD — the logo's own arcs —
 * and each unfilled track must be a faint tint of its own fill color (not a
 * shared grey).
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHART_SERIES,
  MACRO_COLORS,
  RING_COLORS,
  RING_TRACK_ALPHA,
  withAlpha,
} from "../src/theme/colors";

/** Hex → { h (0-360), s, l } for hue-family assertions. */
function toHsl(hex: string): { h: number; s: number; l: number } {
  const value = hex.replace("#", "");
  assert.equal(value.length, 6, `expected a 6-digit hex color, got ${hex}`);
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };

  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;

  h *= 60;
  if (h < 0) h += 360;
  return { h, s: d / (1 - Math.abs(2 * l - 1)), l };
}

function hueGap(a: string, b: string): number {
  const gap = Math.abs(toHsl(a).h - toHsl(b).h);
  return Math.min(gap, 360 - gap);
}

describe("ring palette", () => {
  it("calories ring is neon mint", () => {
    const { h, s } = toHsl(RING_COLORS.calories);
    assert.ok(h >= 150 && h <= 175, `expected a mint/emerald hue (150-175), got ${h}`);
    assert.ok(s > 0.4, `expected a saturated mint, got saturation ${s}`);
    assert.equal(RING_COLORS.calories, CHART_SERIES.mint);
  });

  it("protein ring is electric blue", () => {
    const { h, s } = toHsl(RING_COLORS.protein);
    assert.ok(h >= 200 && h <= 240, `expected a blue hue (200-240), got ${h}`);
    assert.ok(s > 0.4, `expected a saturated blue, got saturation ${s}`);
    assert.equal(RING_COLORS.protein, CHART_SERIES.blue);
  });

  it("carbs is vivid violet and fats is bright amber", () => {
    // Carbs moved from mint-green to violet: the old calories mint sat ~2°
    // from carbs' mint-green, and the two green rings were indistinguishable.
    const carbs = toHsl(RING_COLORS.carbs);
    const fats = toHsl(RING_COLORS.fats);
    assert.ok(carbs.h >= 245 && carbs.h <= 275, `carbs hue ${carbs.h}`);
    assert.ok(fats.h >= 30 && fats.h <= 55, `fats hue ${fats.h}`);
    assert.equal(RING_COLORS.carbs, CHART_SERIES.violet);
    assert.equal(RING_COLORS.fats, CHART_SERIES.amber);
  });

  it("every pair of rings is clearly distinguishable", () => {
    const rings = Object.values(RING_COLORS);
    assert.equal(new Set(rings).size, rings.length);
    // 40° of hue is the point where two saturated hues stop reading as
    // "shades of the same color". The tightest pair here is blue↔violet at
    // 41° — perceptually far apart (blue vs purple) despite the number.
    for (let i = 0; i < rings.length; i++) {
      for (let j = i + 1; j < rings.length; j++) {
        const gap = hueGap(rings[i], rings[j]);
        assert.ok(
          gap >= 40,
          `ring hue gap ${rings[i]} vs ${rings[j]} is ${gap.toFixed(0)}°, needs ≥ 40°`
        );
      }
    }
  });

  it("ring arcs and value inks are two distinct, documented sets", () => {
    const rings = Object.values(RING_COLORS);
    assert.equal(new Set(rings).size, rings.length);

    const macroValues = Object.values(MACRO_COLORS);
    assert.equal(new Set(macroValues).size, macroValues.length);

    // The rings keep the logo's bright arcs (decorative on a white card); the
    // numbers printed next to them use the text-safe sibling of each hue.
    assert.notEqual(MACRO_COLORS.calories, RING_COLORS.calories);
    assert.notEqual(MACRO_COLORS.protein, RING_COLORS.protein);
    assert.notEqual(MACRO_COLORS.fats, RING_COLORS.fats);
  });

  it("tracks are a faint tint of their own fill color", () => {
    // Bumped from the light theme's 0.10: a 10% tint of a bright hue all but
    // vanishes against a card, so the unfilled ring looked broken.
    assert.ok(
      RING_TRACK_ALPHA >= 0.12 && RING_TRACK_ALPHA <= 0.25,
      `track alpha ${RING_TRACK_ALPHA} must stay faint but visible on emerald`
    );

    const byte = Math.round(RING_TRACK_ALPHA * 255)
      .toString(16)
      .toUpperCase()
      .padStart(2, "0");

    for (const color of Object.values(RING_COLORS)) {
      const track = withAlpha(color, RING_TRACK_ALPHA);
      assert.equal(track, `${color}${byte}`);
      // Same RGB, only the alpha channel differs — so the hue never drifts.
      assert.equal(track.slice(0, 7).toUpperCase(), color.toUpperCase());
    }
  });
});

describe("withAlpha()", () => {
  it("appends a two-digit alpha byte", () => {
    assert.equal(withAlpha("#000000", 0), "#00000000");
    assert.equal(withAlpha("#FFFFFF", 1), "#FFFFFFFF");
    assert.equal(withAlpha("#3B82F6", 0.5), "#3B82F680");
  });

  it("clamps out-of-range alpha instead of emitting invalid hex", () => {
    assert.equal(withAlpha("#123456", 5), "#123456FF");
    assert.equal(withAlpha("#123456", -3), "#12345600");
  });

  it("passes non-6-digit-hex values through untouched", () => {
    assert.equal(withAlpha("transparent", 0.1), "transparent");
    assert.equal(withAlpha("rgb(1, 2, 3)", 0.1), "rgb(1, 2, 3)");
    assert.equal(withAlpha("#12345678", 0.1), "#12345678");
  });
});
