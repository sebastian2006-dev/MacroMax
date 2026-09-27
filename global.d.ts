/**
 * Ambient module declarations for CSS side-effect imports (NativeWind).
 *
 * `app/_layout.tsx` imports "../global.css" — NativeWind's global stylesheet.
 * On a dev machine this type-checks because expo-env.d.ts (generated locally
 * by `expo start`) declares CSS modules; that file is GITIGNORED, so a fresh
 * checkout (CI, collaborators) has no declaration and `tsc --noEmit` fails:
 *
 *   error TS2882: Cannot find module or type declarations for side-effect
 *   import of '../global.css'
 *
 * This committed file provides the declaration everywhere. NativeWind's real
 * class-name typings come from nativewind-env.d.ts (nativewind/types), which
 * is committed; this file only covers the side-effect import.
 */
declare module "*.css";
