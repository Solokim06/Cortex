#!/usr/bin/env node
/**
 * Render Cortex PWA icons from public/brand/cortex-logo.svg.
 *
 * Produces:
 *   public/icons/icon-192.png           192x192  (any)
 *   public/icons/icon-512.png           512x512  (any)
 *   public/icons/icon-maskable-512.png  512x512  (maskable, 60% safe zone)
 *   public/icons/apple-touch-icon.png   180x180  (opaque, for iOS)
 *
 * Run from apps/web:
 *   node scripts/generate-pwa-icons.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "public", "brand", "cortex-logo.svg");
const OUT = join(ROOT, "public", "icons");

if (!existsSync(SRC)) {
  console.error(`Source SVG not found: ${SRC}`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const BG = "#0a0a0a";

/**
 * Render a fresh PNG at `size`. We always render the *source* at 512,
 * then crop the glyph region and re-compose at the requested glyph_scale.
 * That gives us maskable safe-zone control without editing the SVG.
 */
function renderIcon(size, glyphScale) {
  const svg = readFileSync(SRC, "utf8");

  // We need to crop the glyph out and re-place it. resvg-js can't crop,
  // so we use a second pass: build a wrapper SVG that positions a <use>
  // of the glyph at the desired scale inside a fresh canvas.
  // Simpler: parse the inner <g> content out of the source and re-emit.
  const innerMatch = svg.match(
    /<g[^>]*transform="translate\(136 136\) scale\(10\)\s*"[^>]*>([\s\S]*?)<\/g>/
  );
  if (!innerMatch) {
    throw new Error("Could not locate the glyph <g> block in the source SVG");
  }
  const glyphInner = innerMatch[1];

  // Compose a target SVG: dark bg + glyph scaled to `glyphScale` of canvas.
  const glyphPx = Math.round(size * glyphScale);
  const scale = glyphPx / 24; // Lucide glyph is 24 units wide
  const offset = (size - glyphPx) / 2;

  const composed = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})"
     fill="none" stroke="#6366f1" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
${glyphInner}
  </g>
</svg>`;

  const resvg = new Resvg(composed, {
    fitTo: { mode: "width", value: size },
    background: BG,
  });
  return resvg.render().asPng();
}

const targets = [
  { name: "icon-192.png", size: 192, glyphScale: 0.8 },
  { name: "icon-512.png", size: 512, glyphScale: 0.8 },
  { name: "icon-maskable-512.png", size: 512, glyphScale: 0.6 },
  { name: "apple-touch-icon.png", size: 180, glyphScale: 0.8 },
];

console.log("Generating Cortex PWA icons…");
for (const t of targets) {
  const png = renderIcon(t.size, t.glyphScale);
  const path = join(OUT, t.name);
  writeFileSync(path, png);
  const kb = (png.length / 1024).toFixed(1);
  console.log(`  public/icons/${t.name}  ${t.size}x${t.size}  ${kb} KB`);
}
console.log("Done.");
