/**
 * Generate Cortex extension icons using the lucide Brain glyph.
 *
 * Run with: node scripts/generate-icons.mjs
 */

import sharp from "sharp";
import { mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons2");

// Lucide's brain.svg paths (24x24 viewBox), stroke-width 2.
// Source: https://unpkg.com/lucide-static@latest/icons/brain.svg
const BRAIN_PATHS = `
  <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
  <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
  <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
  <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
  <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
  <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
  <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
  <path d="M6 18a4 4 0 0 1-1.967-.516"/>
  <path d="M19.967 17.484A4 4 0 0 1 18 18"/>
`;

const BG = "#8b5cf6"; // purple
const FG = "#ffffff"; // white

function svg(size) {
  // Inner scale: brain should occupy ~58% of the circle diameter.
  const innerScale = 0.58;
  const iconSize = size * innerScale;
  const offset = (size - iconSize) / 2;
  const scale = iconSize / 24; // 24 is lucide's viewBox size
  // Stroke width should scale with the icon, but we want it to render
  // crisply. At 24 viewBox the natural stroke is 2; scale that too.
  const strokeW = 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${BG}" />
  <g
    transform="translate(${offset}, ${offset}) scale(${scale})"
    fill="none"
    stroke="${FG}"
    stroke-width="${strokeW}"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    ${BRAIN_PATHS}
  </g>
</svg>`;
}

async function main() {
  await mkdir(outDir, { recursive: true });

  for (const size of [16, 32, 48, 128]) {
    const buf = Buffer.from(svg(size));
    const outPath = join(outDir, `icon-${size}.png`);
    await sharp(buf).png().toFile(outPath);
    console.log(`Wrote icon-${size}.png — ${size}x${size}`);
  }

  console.log("\n✅ Done. Icons in public/icons2/");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
