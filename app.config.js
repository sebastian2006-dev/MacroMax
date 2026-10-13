/**
 * Dynamic Expo config for MacroMax.
 *
 * `app.json` remains the static source of truth; this file only layers on the
 * Android release-build settings that have to differ between a local/emulator
 * build and a device/store build (see `buildArchs` below). Everything else is
 * passed through untouched.
 *
 * Why a `.js` config at all: the native `android/` directory is git-ignored, so
 * anything typed into `android/gradle.properties` or `android/app/*.gradle`
 * evaporates on the next EAS build. Expo re-runs the plugins declared here on
 * every prebuild, which is the only place a setting survives.
 *
 * @see https://docs.expo.dev/versions/latest/sdk/build-properties/
 */

const fs = require('fs');
const path = require('path');

/**
 * The only ABIs actual Android phones have used since 2017: 32-bit ARM
 * (armeabi-v7a, still the OS on plenty of 2017-2019 budget phones and on
 * 32-bit installs of 64-bit-capable chips) and 64-bit ARM (arm64-v8a, the
 * mandatory ABI on Google Play since 2019).
 */
const ARM_ARCHITECTURES = ['arm64-v8a', 'armeabi-v7a'];

/** ARM plus the x86 ABIs, which only exist so emulators/AVDs can install. */
const EMULATOR_ARCHITECTURES = [...ARM_ARCHITECTURES, 'x86', 'x86_64'];

/** R8/ProGuard rules committed at the repo root instead of in ignored `android/`. */
const PROGUARD_RULES_PATH = path.join(__dirname, 'plugins', 'android-proguard-rules.pro');

module.exports = ({ config }) => {
  // EAS Build exports the profile being built (development | preview |
  // production); it is unset for `expo run:android`, `expo start` and CI.
  const profile = process.env.EAS_BUILD_PROFILE;
  const isStoreBuild = profile === 'preview' || profile === 'production';

  // Explicit override for pipelines that are not EAS (GitHub Actions, a shell):
  //   BUILD_TARGET=physical → ARM only, i.e. an APK/ABB for real phones
  //   BUILD_TARGET=emulator → all four ABIs, so x86 AVDs can install it
  // Unset, the EAS profile above decides — so EAS builds behave exactly as before.
  const buildTarget = process.env.BUILD_TARGET ?? '';
  if (buildTarget && buildTarget !== 'physical' && buildTarget !== 'emulator') {
    // Loud on purpose: a typo would otherwise silently ship (or drop) two ABIs.
    throw new Error(`[app.config] BUILD_TARGET must be "physical" or "emulator", got "${buildTarget}"`);
  }

  const buildArchs =
    buildTarget === 'physical'
      ? ARM_ARCHITECTURES
      : buildTarget === 'emulator'
        ? EMULATOR_ARCHITECTURES
        : isStoreBuild
          ? ARM_ARCHITECTURES
          : EMULATOR_ARCHITECTURES;

  console.log(
    `[app.config] EAS_BUILD_PROFILE=${profile ?? '(none)'} BUILD_TARGET=${buildTarget || '(none)'} → reactNativeArchitectures=${buildArchs.join(',')}`,
  );

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-build-properties',
        {
          android: {
            // Android 7.0 (2017's baseline OS). Pinned on purpose: it is the
            // floor that keeps ARM phones from 2017 installable, and pinning it
            // makes a future SDK raising the floor fail loudly here instead of
            // silently dropping those devices.
            minSdkVersion: 24,

            // R8: shrinks + obfuscates the Java/Kotlin side (and the dex it
            // pulls in) in release builds. Debug/dev builds are untouched.
            enableMinifyInReleaseBuilds: true,

            // Drops resources no reachable code references. Requires minify
            // above, otherwise the resource shrinker cannot know what is used.
            enableShrinkResourcesInReleaseBuilds: true,

            // Recompresses packaged PNGs (AAPT2). Already the template default;
            // stated explicitly so nobody has to guess why the assets shrink.
            enablePngCrunchInReleaseBuilds: true,

            // Extra R8 rules that live in version control — see the file.
            extraProguardRules: fs.readFileSync(PROGUARD_RULES_PATH, 'utf8'),

            // Store builds ship ARM only: x86/x86_64 JSC/Hermes/native payloads
            // would be dead weight on every real device. Dev builds keep all
            // four so x86_64 AVDs and the dev client still install.
            buildArchs,
          },
        },
      ],
    ],
  };
};
