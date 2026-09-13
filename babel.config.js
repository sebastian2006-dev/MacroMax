/**
 * Babel config.
 *
 * NativeWind v4 needs BOTH of these to turn `className` props into real styles:
 *   1. the JSX import source, so JSX compiles against `nativewind/jsx-runtime`
 *   2. the `react-native-css-interop` babel plugin (component registration)
 *
 * They are wired directly instead of via the `nativewind/babel` preset: on
 * nativewind 4.2 / react-native-css-interop 0.2 that preset also injects
 * `react-native-worklets/plugin`, and babel-preset-expo (SDK 54+) injects the
 * very same plugin as soon as `react-native-worklets` is installed. Using the
 * preset would therefore register the worklets plugin twice, which breaks
 * worklet transforms.
 *
 * The worklets/Reanimated babel plugin is NOT listed here on purpose for the
 * same reason: babel-preset-expo adds `react-native-worklets/plugin` (or
 * `react-native-reanimated/plugin` on older SDKs) automatically, and listing
 * it twice breaks worklet transforms.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }]],
    plugins: [require.resolve("react-native-css-interop/dist/babel-plugin")],
  };
};
