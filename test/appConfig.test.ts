/**
 * @file appConfig.test.ts
 * Guards the Android release-build configuration that app.config.js hands to
 * expo-build-properties.
 *
 * Why this exists: the R8 / resource-shrinking switches and the ARM ABI policy
 * only ever show up in the generated `android/` directory, which is git-ignored
 * and recreated by every prebuild — so a regression there (R8 quietly disabled,
 * 32-bit ARM dropped, store builds shipping dead x86 payload) would otherwise
 * reach users unnoticed. These tests assert on the resolved config instead.
 *
 * The same goes for the ABI override the GitHub Actions APK pipeline uses
 * (`BUILD_TARGET`, see .github/workflows/build-apk.yml): it is read only while
 * the Expo CLI generates the native project, and the APK is the only artifact
 * that would show the mistake.
 *
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import appConfigModule from "../app.config.js";
import appJson from "../app.json";

interface AndroidBuildOptions {
  minSdkVersion?: number;
  enableMinifyInReleaseBuilds?: boolean;
  enableShrinkResourcesInReleaseBuilds?: boolean;
  enablePngCrunchInReleaseBuilds?: boolean;
  extraProguardRules?: string;
  buildArchs?: string[];
}

interface ResolvedConfig {
  plugins: [string, { android: AndroidBuildOptions }][];
}

/** Resolves app.config.js the way the Expo CLI does, for a given EAS profile. */
function resolveAndroidOptions(profile?: string, buildTarget?: string): AndroidBuildOptions {
  const previousProfile = process.env.EAS_BUILD_PROFILE;
  const previousTarget = process.env.BUILD_TARGET;
  delete process.env.EAS_BUILD_PROFILE;
  delete process.env.BUILD_TARGET;
  if (profile !== undefined) {
    process.env.EAS_BUILD_PROFILE = profile;
  }
  if (buildTarget !== undefined) {
    process.env.BUILD_TARGET = buildTarget;
  }

  try {
    const resolved = appConfigModule({
      config: { name: "MacroMax", plugins: ["expo-router"] },
    }) as unknown as ResolvedConfig;

    const entry = resolved.plugins.find(([name]) => name === "expo-build-properties");
    assert.ok(entry, "app.config.js must register expo-build-properties");
    return entry[1].android;
  } finally {
    if (previousProfile === undefined) {
      delete process.env.EAS_BUILD_PROFILE;
    } else {
      process.env.EAS_BUILD_PROFILE = previousProfile;
    }
    if (previousTarget === undefined) {
      delete process.env.BUILD_TARGET;
    } else {
      process.env.BUILD_TARGET = previousTarget;
    }
  }
}

describe("app.config.js — Android ABIs", () => {
  it("ships only ARM ABIs to a store build (preview)", () => {
    assert.deepEqual(resolveAndroidOptions("preview").buildArchs, ["arm64-v8a", "armeabi-v7a"]);
  });

  it("ships only ARM ABIs to a production build", () => {
    assert.deepEqual(resolveAndroidOptions("production").buildArchs, ["arm64-v8a", "armeabi-v7a"]);
  });

  it("keeps x86_64 for the development profile so x86 AVDs and the dev client install", () => {
    assert.ok(resolveAndroidOptions("development").buildArchs?.includes("x86_64"));
  });

  it("keeps x86_64 when no EAS profile is set (expo run:android, CI)", () => {
    assert.ok(resolveAndroidOptions().buildArchs?.includes("x86_64"));
  });

  it("always covers both ARM variants — 64-bit and 2017-era 32-bit devices", () => {
    for (const profile of [undefined, "development", "preview", "production"]) {
      for (const target of [undefined, "physical", "emulator"]) {
        assert.deepEqual(
          resolveAndroidOptions(profile, target).buildArchs?.filter((abi) => abi.startsWith("arm")),
          ["arm64-v8a", "armeabi-v7a"],
          `profile ${profile ?? "(none)"} / BUILD_TARGET ${target ?? "(none)"} must build both ARM ABIs`,
        );
      }
    }
  });
});

// The GitHub Actions APK pipeline is not EAS, so it cannot select an EAS
// profile: it sets BUILD_TARGET instead (physical = ARM-only device build).
describe("app.config.js — BUILD_TARGET override (CI, no EAS)", () => {
  it("packs only the ARM ABIs for a physical-device build", () => {
    assert.deepEqual(resolveAndroidOptions(undefined, "physical").buildArchs, ["arm64-v8a", "armeabi-v7a"]);
  });

  it("keeps x86_64 for an emulator build", () => {
    assert.deepEqual(resolveAndroidOptions(undefined, "emulator").buildArchs, [
      "arm64-v8a",
      "armeabi-v7a",
      "x86",
      "x86_64",
    ]);
  });

  it("outranks the EAS profile when both are set (CI exports neither, EAS sets only the profile)", () => {
    assert.deepEqual(resolveAndroidOptions("production", "emulator").buildArchs, [
      "arm64-v8a",
      "armeabi-v7a",
      "x86",
      "x86_64",
    ]);
  });

  it("leaves the EAS behaviour untouched when unset", () => {
    assert.deepEqual(resolveAndroidOptions("production", undefined).buildArchs, [
      "arm64-v8a",
      "armeabi-v7a",
    ]);
  });

  it("fails loudly on a typo instead of silently building the wrong ABIs", () => {
    assert.throws(() => resolveAndroidOptions(undefined, "tablet"), /BUILD_TARGET must be/);
  });
});

describe("app.config.js — release shrinking", () => {
  const android = resolveAndroidOptions("production");

  it("enables R8 minification", () => {
    assert.equal(android.enableMinifyInReleaseBuilds, true);
  });

  it("enables resource shrinking (which requires R8)", () => {
    assert.equal(android.enableShrinkResourcesInReleaseBuilds, true);
  });

  it("enables PNG crunching", () => {
    assert.equal(android.enablePngCrunchInReleaseBuilds, true);
  });

  it("pins minSdkVersion to Android 7.0 — the floor for ARM phones from 2017", () => {
    assert.equal(android.minSdkVersion, 24);
  });

  it("inlines the committed R8 rules", () => {
    const rules = android.extraProguardRules ?? "";
    for (const keep of ["com.swmansion.reanimated", "com.swmansion.worklets", "com.facebook.react.turbomodule"]) {
      assert.ok(rules.includes(keep), `proguard rules must keep ${keep} entry points`);
    }
    assert.ok(rules.includes("LineNumberTable"), "stack traces stay de-minifiable only with line tables");
  });

  it("does not disable shrinking wholesale", () => {
    const rules = android.extraProguardRules ?? "";
    assert.ok(!/-keep\s+class\s+\*\*\s*\{/.test(rules), "a blanket keep-everything rule would undo R8");
    assert.ok(!/^-dontshrink$/m.test(rules), "-dontshrink would undo R8");
  });
});

describe("app.json — plugin registration", () => {
  it("leaves expo-build-properties to app.config.js (no duplicate registration)", () => {
    const plugins = (appJson.expo.plugins ?? []) as unknown[];
    const duplicated = plugins.some(
      (plugin) => plugin === "expo-build-properties" || (Array.isArray(plugin) && plugin[0] === "expo-build-properties"),
    );
    assert.equal(duplicated, false);
  });
});
