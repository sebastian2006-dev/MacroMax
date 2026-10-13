# ─────────────────────────────────────────────────────────────────────────────
# MacroMax — extra R8 rules for release builds
#
# `android/` is git-ignored build output (a fresh `expo prebuild` recreates it),
# so this file is the committed source of truth: app.config.js reads it and
# hands the text to expo-build-properties, which appends it to the generated
# `android/app/proguard-rules.pro` on every prebuild — locally and on EAS.
#
# R8 runs in full mode (the AGP 8 default) and already applies the `-keep` rules
# from every library's consumer file (React Native, Expo Modules, expo-updates,
# react-native-svg, Reanimated, Worklets). Only rules those AARs cannot know
# about belong here — everything else would just undo shrinking.
# ─────────────────────────────────────────────────────────────────────────────

# ── Keep crash reports readable ──────────────────────────────────────────────
# The Play Console, Firebase Crashlytics and `adb logcat` all show the *minified*
# frames; the line table + source-file attributes are what make the uploaded
# mapping file resolve them back to real Kotlin/Java positions.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-keepattributes *Annotation*,EnclosingMethod,InnerClasses,Exceptions

# ── Reflection entry points reached only from JNI or from JS ─────────────────
# These classes are instantiated by name from C++ (TurboModules/Fabric) or
# resolved through the JS module registry, so R8 cannot see the edges and would
# otherwise strip or rename them.
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Native (JNI) methods are looked up by exact name+signature; obfuscating either
# turns into an UnsatisfiedLinkError at runtime instead of a build error.
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}
