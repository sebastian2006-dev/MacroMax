/**
 * ESLint flat config for MacroMax (ESLint 9).
 *
 * Built on eslint-config-expo (Expo SDK 57's maintained shared config), which
 * brings in eslint-plugin-react, react-hooks and react-native rules, plus
 * typescript-eslint for TS-aware parsing of .ts/.tsx.
 *
 * Scope: app code only. `test/` uses Node test runner globals, `scripts/` are
 * CommonJS Node build scripts, and `android/` is generated native output —
 * all exempt rather than littered with inline disables.
 */
import expoConfig from "eslint-config-expo/flat.js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "android/**",
      "ios/**",
      "assets/**",
      "dist/**",
      ".expo-shared/**",
      // CommonJS Node build scripts (DB seed + native icon generator) run
      // under plain node, not the app bundler — RN/browser globals rules and
      // ESM assumptions don't apply to them.
      "scripts/**",
      // app.config.js is the Node-side Expo config (CommonJS, standard Node
      // globals like __dirname); it is evaluated by the Expo CLI at build
      // time, never bundled into the app.
      "app.config.js",
      "brag-output/**",
    ],
  },
  ...expoConfig,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // The codebase deliberately uses type-only imports for interfaces and
      // `import type` where it matters; let TS decide what to elide.
      "@typescript-eslint/consistent-type-imports": "off",
      /**
       * react-hooks/set-state-in-effect fires on the canonical React Native
       * data-loading pattern this codebase uses: an effect (or
       * useFocusEffect) kicks off an async read and setState's the result.
       * These are NOT synchronous cascading renders — the setState happens
       * after an await — but the rule's static analysis can't tell. Ten
       * pre-existing call sites follow this pattern by design; refactoring
       * them all to an external-store model is a dedicated task with real
       * regression risk on-device, not a lint-drive-by.
       */
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // MacroMax_Web/ is the standalone marketing site: plain browser JS served
    // as-is, never bundled by Metro and never imported by the app. It is not
    // exempt from linting (real bugs there should still fail CI), it just needs
    // one global the app rules cannot know about: `THREE`, injected by the
    // three.js <script src> tag at the bottom of its index.html. Browser
    // globals (window, document, …) already come from eslint-config-expo.
    files: ["MacroMax_Web/**/*.js"],
    languageOptions: {
      globals: {
        THREE: "readonly",
      },
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      // Node's test runner injects describe/it as globals.
      "no-undef": "off",
    },
  }
);
