/**
 * @file tabBarLayout.test.ts
 * Unit tests for the REAL src/lib/tabBarLayout.ts module — the bottom-nav
 * geometry that guarantees tab labels render in full ("Custom Dish", never
 * "Custom Di…") at every OS font scale.
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_TAB_SCALE,
  TAB_BAR_CONTENT_HEIGHT,
  TAB_ITEM_WIDTH,
  estimateTabLabelWidth,
  tabBarMetrics,
  tabLabelFits,
} from "../src/lib/tabBarLayout";

/**
 * Mirrors the `label` values of TAB_ITEMS in components/ScrollableTabBar.tsx
 * (kept as plain strings here so this module stays free of React Native).
 * The longest label is the one that previously ellipsized.
 */
const TAB_LABELS = ["Today", "Daily Log", "Custom Dish", "Analytics", "Profile"];

describe("tabBarMetrics", () => {
  it("uses the design size at (or below) 100% font scale", () => {
    for (const fontScale of [undefined, null, 0, -1, 0.85, 1]) {
      const m = tabBarMetrics(fontScale);
      assert.equal(m.scale, 1, `fontScale=${String(fontScale)} should clamp to 1`);
      assert.equal(m.itemWidth, TAB_ITEM_WIDTH);
      assert.equal(m.contentHeight, TAB_BAR_CONTENT_HEIGHT);
    }
  });

  it("grows slots and bar height linearly with the OS font scale", () => {
    const m = tabBarMetrics(1.25);
    assert.equal(m.scale, 1.25);
    assert.equal(m.itemWidth, TAB_ITEM_WIDTH * 1.25);
    assert.equal(m.contentHeight, TAB_BAR_CONTENT_HEIGHT * 1.25);
  });

  it("caps growth so the bar cannot eat the screen", () => {
    const m = tabBarMetrics(3);
    assert.equal(m.scale, MAX_TAB_SCALE);
    assert.equal(m.itemWidth, TAB_ITEM_WIDTH * MAX_TAB_SCALE);
    assert.equal(m.contentHeight, TAB_BAR_CONTENT_HEIGHT * MAX_TAB_SCALE);
  });

  it("is monotonic in the font scale", () => {
    let previous = 0;
    for (let fontScale = 1; fontScale <= 3; fontScale += 0.05) {
      const { itemWidth } = tabBarMetrics(fontScale);
      assert.ok(itemWidth >= previous, `itemWidth must not shrink at fontScale=${fontScale}`);
      previous = itemWidth;
    }
  });
});

describe("tab labels never truncate", () => {
  it("fits every tab label at every font scale from 100% to 300%", () => {
    for (let fontScale = 1; fontScale <= 3; fontScale += 0.05) {
      for (const label of TAB_LABELS) {
        const width = estimateTabLabelWidth(label, fontScale);
        const { labelMaxWidth } = tabBarMetrics(fontScale);
        assert.ok(
          tabLabelFits(label, fontScale),
          `"${label}" (${width.toFixed(1)}dp) must fit in ${labelMaxWidth.toFixed(1)}dp ` +
            `at fontScale=${fontScale.toFixed(2)}`
        );
      }
    }
  });

  it("keeps the previous worst case ('Custom Dish') comfortably inside its slot", () => {
    const { labelMaxWidth } = tabBarMetrics(1);
    // Measured on device: "Custom Dish" renders ~76dp wide at 11px.
    assert.ok(labelMaxWidth >= 76, `label slot is ${labelMaxWidth}dp, needs >= 76dp`);
  });

  it("never loses headroom as the font scale increases", () => {
    const baseline = tabBarMetrics(1);
    const baselineRatio = baseline.labelMaxWidth / estimateTabLabelWidth("Custom Dish", 1);
    for (let fontScale = 1; fontScale <= 3; fontScale += 0.05) {
      const m = tabBarMetrics(fontScale);
      const ratio = m.labelMaxWidth / estimateTabLabelWidth("Custom Dish", fontScale);
      assert.ok(
        ratio >= baselineRatio,
        `fit ratio dropped from ${baselineRatio.toFixed(3)} to ${ratio.toFixed(3)} ` +
          `at fontScale=${fontScale.toFixed(2)}`
      );
    }
  });
});
