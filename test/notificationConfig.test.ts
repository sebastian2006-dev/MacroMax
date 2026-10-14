/**
 * @file notificationConfig.test.ts
 * Guards the native configuration the meal reminders depend on.
 *
 * Why this exists: the notification permission, the exact-alarm permission and
 * the Android channel id live in app.json / package.json, and the generated
 * `android/` project is git-ignored build output — so a regression there would
 * only ever surface on a real phone, as reminders that arrive late (or not at
 * all) days after the change. These tests assert on the config the prebuild
 * actually consumes.
 *
 * Run with: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import appJson from "../app.json";
import packageJson from "../package.json";
import { MEAL_REMINDER_CHANNEL_ID } from "../src/lib/mealReminders";
import { COLORS } from "../src/theme/colors";

/** Every .ts/.tsx file the app bundles, relative to the project root. */
function sourceFiles(): string[] {
  const roots = ["app", "components", "src"];
  const skip = new Set(["node_modules", ".expo", "android", "ios", "dist", ".git"]);
  const found: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) {
        continue;
      }
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        found.push(full);
      }
    }
  };

  for (const root of roots) {
    walk(path.join(process.cwd(), root));
  }
  return found;
}

type PluginEntry = string | [string, Record<string, unknown>];

const plugins = (appJson.expo.plugins ?? []) as unknown as PluginEntry[];
const android = appJson.expo.android as {
  permissions?: string[];
  package?: string;
};

function findPlugin(name: string): PluginEntry | undefined {
  return plugins.find((entry) => (Array.isArray(entry) ? entry[0] === name : entry === name));
}

describe("app.json — expo-notifications plugin", () => {
  it("is registered so the prebuild wires the native notification modules", () => {
    assert.ok(findPlugin("expo-notifications"), "expo-notifications must be in expo.plugins");
  });

  it("tints notifications with the brand emerald", () => {
    const entry = findPlugin("expo-notifications");
    assert.ok(Array.isArray(entry), "the plugin is registered with its options");
    assert.equal((entry as [string, Record<string, unknown>])[1].color, COLORS.primary);
  });

  it("names the channel the app schedules against", () => {
    const entry = findPlugin("expo-notifications") as [string, Record<string, unknown>];
    assert.equal(entry[1].defaultChannel, MEAL_REMINDER_CHANNEL_ID);
    assert.equal(MEAL_REMINDER_CHANNEL_ID, "meal-reminders");
  });

  it("does not duplicate the plugin registered through app.config.js", () => {
    const buildProperties = plugins.filter((entry) =>
      Array.isArray(entry) ? entry[0] === "expo-build-properties" : entry === "expo-build-properties",
    );
    assert.equal(buildProperties.length, 0);
  });
});

describe("app.json — exact alarms", () => {
  it("requests SCHEDULE_EXACT_ALARM so reminders land on the minute", () => {
    assert.ok(
      android.permissions?.includes("android.permission.SCHEDULE_EXACT_ALARM"),
      "without this, Android 14+ falls back to inexact alarms and meal reminders drift under Doze",
    );
  });

  it("does NOT declare USE_EXACT_ALARM, which Play restricts to clock/calendar apps", () => {
    assert.equal(
      android.permissions?.includes("android.permission.USE_EXACT_ALARM"),
      false,
      "USE_EXACT_ALARM is auto-granted but policy-restricted; a nutrition tracker must not claim it",
    );
  });

  it("keeps the permissions the app already relied on", () => {
    for (const permission of ["CAMERA", "android.permission.CAMERA", "android.permission.RECORD_AUDIO"]) {
      assert.ok(android.permissions?.includes(permission), `missing ${permission}`);
    }
  });

  it("keeps the package id the exact-alarm deep link targets", () => {
    // src/lib/notifications.ts opens the system Alarms & reminders screen for
    // this package; a rename here would silently break that deep link.
    assert.equal(android.package, "com.macromax.app");
  });
});

// Two native integrations carry import-time side effects that THROW where their
// native half is missing, so neither may be a static import anywhere in the app:
//  - expo-notifications runs push-token auto-registration on import, which
//    throws on Android inside Expo Go ("Android Push notifications ... was
//    removed from Expo Go") — that is exactly the startup crash this guards.
//  - expo-intent-launcher's Android entry is requireNativeModule(...) evaluated
//    at module scope, so it throws wherever that module is absent (Expo Go too).
const LAZY_ONLY_PACKAGES = ["expo-notifications", "expo-intent-launcher"] as const;

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("native integrations with import-time side effects stay lazy", () => {
  const files = sourceFiles();
  const adapterPath = path.join(process.cwd(), "src", "lib", "notifications.ts");

  it("scans the app source", () => {
    assert.ok(files.length > 20, `expected to scan the app's sources, saw ${files.length}`);
  });

  for (const pkg of LAZY_ONLY_PACKAGES) {
    it(`never has a runtime import statement for ${pkg}`, () => {
      // Matches real `import ... from "pkg"` statements only — a comment that
      // quotes the forbidden form is prose, not a bundler edge.
      const importStatement = new RegExp(`^\\s*import\\s+[^;]*from\\s+["']${escapeForRegex(pkg)}["']`);
      const violations: string[] = [];
      for (const file of files) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, index) => {
            if (!importStatement.test(line) || /^\s*import type\s/.test(line)) {
              return;
            }
            violations.push(`${path.relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`);
          });
      }
      assert.deepEqual(
        violations,
        [],
        `a runtime ${pkg} import can crash the app on load: ${violations.join(", ")}`,
      );
    });

    it(`loads ${pkg} lazily, in the notification adapter only`, () => {
      const loader = new RegExp(`(require|import)\\(\\s*["']${escapeForRegex(pkg)}["']\\s*\\)`);
      const owners = files.filter((file) => loader.test(readFileSync(file, "utf8")));
      assert.deepEqual(
        owners.map((file) => path.relative(process.cwd(), file).replace(/\\/g, "/")),
        ["src/lib/notifications.ts"],
      );
    });
  }

  it("checks for Expo Go BEFORE loading the notifications module", () => {
    const adapter = readFileSync(adapterPath, "utf8");
    assert.notEqual(adapter.indexOf("isExpoGoClient()"), -1, "the adapter must guard on the Expo Go client");
    assert.notEqual(
      adapter.indexOf('require("expo-notifications")'),
      -1,
      "the adapter must load the module lazily",
    );
    assert.ok(
      adapter.indexOf("if (isExpoGoClient())") < adapter.indexOf('require("expo-notifications")'),
      "the Expo Go check must short-circuit before the module is ever loaded",
    );
  });
});

describe("package.json — notification dependencies", () => {
  const dependencies = packageJson.dependencies as Record<string, string>;

  it("ships expo-notifications and expo-intent-launcher", () => {
    assert.ok(dependencies["expo-notifications"], "expo-notifications is required for reminders");
    assert.ok(
      dependencies["expo-intent-launcher"],
      "expo-intent-launcher is required to open Android's exact-alarm settings",
    );
  });

  it("keeps both on the Expo SDK major this project builds against", () => {
    const sdkMajor = dependencies.expo.replace(/[^0-9]*/, "").split(".")[0];
    for (const name of ["expo-notifications", "expo-intent-launcher"]) {
      const version = dependencies[name];
      const major = version.replace(/[^0-9]*/, "").split(".")[0];
      assert.equal(major, sdkMajor, `${name}@${version} must track expo@${dependencies.expo}`);
    }
  });
});
