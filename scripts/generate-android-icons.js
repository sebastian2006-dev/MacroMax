/**
 * @file generate-android-icons.js
 * Regenerates every derived bitmap from the single canonical logo asset
 * (assets/macromax_A_ring_1024.png): the Android launcher art, the boot-splash
 * logo and the web favicon.
 *
 * Why this exists: `android/` is gitignored local build output, and the only
 * other way to refresh its artwork is `expo prebuild`, which regenerates the
 * whole project from the template — including the hand-tuned
 * `Theme.App.SplashScreen` styles (expo-splash-screen is not installed, so
 * nothing in app.json can express them). Re-applying the bitmaps in place keeps
 * the native tweaks and still ships the current logo.
 *
 * Two masks matter here:
 *  - the artwork is a full-bleed square of dark emerald, so anything that is
 *    NOT auto-masked by the OS (the splash drawable, legacy round icons) gets a
 *    circular alpha mask, otherwise it reads as a pasted-on box;
 *  - the adaptive-icon foreground stays full-bleed on purpose — Android applies
 *    its own shape mask to that layer, over `iconBackground`.
 *
 * The prebuild ships mipmaps as .webp; AAPT treats a duplicate resource name
 * with a different extension as an error, so the stale .webp files are removed
 * as their .png replacements are written.
 *
 * Usage: npm run build:icons
 */

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "assets", "macromax_A_ring_1024.png");
const FAVICON = path.join(ROOT, "assets", "favicon.png");
const RES = path.join(ROOT, "android", "app", "src", "main", "res");

/** Density buckets: launcher (48dp) / adaptive foreground (108dp). */
const MIPMAPS = [
  { dir: "mipmap-mdpi", launcher: 48, foreground: 108 },
  { dir: "mipmap-hdpi", launcher: 72, foreground: 162 },
  { dir: "mipmap-xhdpi", launcher: 96, foreground: 216 },
  { dir: "mipmap-xxhdpi", launcher: 144, foreground: 324 },
  { dir: "mipmap-xxxhdpi", launcher: 192, foreground: 432 },
];

/**
 * Splash logo at 160dp on every density: that is exactly the size Android 12+
 * gives the animated icon before it masks it, so the badge is never cropped.
 */
const SPLASH = [
  { dir: "drawable-mdpi", size: 160 },
  { dir: "drawable-hdpi", size: 240 },
  { dir: "drawable-xhdpi", size: 320 },
  { dir: "drawable-xxhdpi", size: 480 },
  { dir: "drawable-xxxhdpi", size: 640 },
];

/** Box-filter downscale (area average). The source is opaque, so no premultiply. */
function resize(source, size) {
  const target = new PNG({ width: size, height: size });
  const scale = source.width / size;

  for (let y = 0; y < size; y++) {
    const yStart = Math.floor(y * scale);
    const yEnd = Math.max(yStart + 1, Math.floor((y + 1) * scale));
    for (let x = 0; x < size; x++) {
      const xStart = Math.floor(x * scale);
      const xEnd = Math.max(xStart + 1, Math.floor((x + 1) * scale));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let sy = yStart; sy < yEnd; sy++) {
        for (let sx = xStart; sx < xEnd; sx++) {
          const i = (source.width * sy + sx) << 2;
          r += source.data[i];
          g += source.data[i + 1];
          b += source.data[i + 2];
          a += source.data[i + 3];
          count += 1;
        }
      }

      const o = (size * y + x) << 2;
      target.data[o] = Math.round(r / count);
      target.data[o + 1] = Math.round(g / count);
      target.data[o + 2] = Math.round(b / count);
      target.data[o + 3] = Math.round(a / count);
    }
  }

  return target;
}

/**
 * Circular alpha mask with a 1px antialiased edge, so a square artwork reads as
 * a round badge on any background instead of a box.
 */
function maskToCircle(png) {
  const center = (png.width - 1) / 2;
  const radius = png.width / 2;

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const distance = Math.hypot(x - center, y - center);
      const coverage = Math.min(1, Math.max(0, radius - distance + 0.5));
      if (coverage >= 1) {
        continue;
      }
      const i = (png.width * y + x) << 2;
      png.data[i + 3] = Math.round(png.data[i + 3] * coverage);
    }
  }

  return png;
}

function writePng(filePath, png) {
  fs.writeFileSync(filePath, PNG.sync.write(png, { deflateLevel: 9 }));
}

function removeStaleWebp(dir, names) {
  for (const name of names) {
    const stale = path.join(dir, `${name}.webp`);
    if (fs.existsSync(stale)) {
      fs.unlinkSync(stale);
    }
  }
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Missing canonical logo: ${path.relative(ROOT, SOURCE)}`);
    process.exit(1);
  }

  const source = PNG.sync.read(fs.readFileSync(SOURCE));
  console.log(`Source: ${path.relative(ROOT, SOURCE)} (${source.width}x${source.height})`);

  // Web favicon: 64px, the size Expo's template ships.
  writePng(FAVICON, resize(source, 64));
  console.log("  assets/favicon.png: 64px");

  if (!fs.existsSync(RES)) {
    console.warn(
      `No native resources at ${path.relative(ROOT, RES)} — skipping Android art. ` +
        "Run `npx expo prebuild` first, then re-apply the splash styles and re-run this script."
    );
    return;
  }

  for (const { dir, launcher, foreground } of MIPMAPS) {
    const target = path.join(RES, dir);
    if (!fs.existsSync(target)) {
      continue;
    }
    // Square (legacy launchers) vs round (launchers that ask for roundIcon).
    writePng(path.join(target, "ic_launcher.png"), resize(source, launcher));
    writePng(path.join(target, "ic_launcher_round.png"), maskToCircle(resize(source, launcher)));
    // Full-bleed on purpose: Android masks the adaptive foreground itself.
    writePng(path.join(target, "ic_launcher_foreground.png"), resize(source, foreground));
    removeStaleWebp(target, ["ic_launcher", "ic_launcher_round", "ic_launcher_foreground"]);
    console.log(`  ${dir}: launcher ${launcher}px, round ${launcher}px, foreground ${foreground}px`);
  }

  for (const { dir, size } of SPLASH) {
    const target = path.join(RES, dir);
    if (!fs.existsSync(target)) {
      continue;
    }
    writePng(path.join(target, "splashscreen_logo.png"), maskToCircle(resize(source, size)));
    console.log(`  ${dir}: splash ${size}px (circular)`);
  }

  console.log("Done. Rebuild the app for the new launcher icon and boot splash.");
}

main();
