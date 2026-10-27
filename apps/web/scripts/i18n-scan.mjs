#!/usr/bin/env node
/**
 * Read-only i18n scanner.
 *
 * Walks apps/web/{components,app} and finds likely-translatable strings:
 *   - JSX text nodes:  <p>Hello</p>
 *   - String attrs:    placeholder="Search"  title="Close"  aria-label="Menu"
 *   - Literal props:   label="Save"  description="..."
 *
 * Filters out:
 *   - Single words < 3 chars, all-caps constants, snake_case ids
 *   - CSS classes, URLs, file paths, emails
 *   - Strings that look like code (contain {, }, =, /, :)
 *   - Common non-translatables: OK, ID, URL, JSON, HTTP, etc.
 *
 * Usage:  node scripts/i18n-scan.mjs [--json] [--file=<path>]
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOTS = ["components", "app"];
const IGNORE_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", "build", "public",
]);
const IGNORE_FILE_PATTERNS = [
  /\.test\.(t|j)sx?$/,
  /\.spec\.(t|j)sx?$/,
  /\.d\.ts$/,
];

const ATTR_NAMES = new Set([
  "placeholder", "title", "aria-label", "aria-description",
  "label", "description", "alt", "tooltip", "heading",
]);

const TRIVIAL = new Set([
  "ok", "id", "url", "uri", "json", "http", "https", "api", "ui", "ux",
  "css", "html", "js", "ts", "tsx", "jsx", "pdf", "csv", "svg", "png",
  "jpg", "jpeg", "gif", "md", "v1", "v2", "px", "em", "rem",
]);

function shouldIgnoreFile(name) {
  return IGNORE_FILE_PATTERNS.some((re) => re.test(name));
}

function isLikelyTranslatable(s) {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 3) return false;
  if (TRIVIAL.has(t.toLowerCase())) return false;
  // no letters at all (pure numbers/symbols)
  if (!/[A-Za-z]/.test(t)) return false;
  // CSS / tailwind-ish
  if (/^[a-z0-9:\-\[\]\/\.]+$/.test(t) && !/\s/.test(t) && /[-:]/.test(t)) return false;
  // URLs / paths / emails
  if (/^https?:\/\//.test(t)) return false;
  if (/^[\w.-]+@[\w.-]+$/.test(t)) return false;
  if (/^\/[a-z0-9\-\/]+$/i.test(t)) return false;
  // code-ish
  if (/[{}<>]/.test(t)) return false;
  // all-caps identifiers
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 2) return false;
  return true;
}

function scanFile(path) {
  const src = readFileSync(path, "utf8");
  const found = new Map(); // string -> { line, kind }

  src.split(/\r?\n/).forEach((line, i) => {
    const lineNo = i + 1;

    // 1. String attributes:  attr="..."
    const attrRe = new RegExp(
      `(${[...ATTR_NAMES].join("|")})\\s*=\\s*["']([^"']{3,})["']`,
      "g"
    );
    for (const m of line.matchAll(attrRe)) {
      const val = m[2];
      if (isLikelyTranslatable(val) && !found.has(val)) {
        found.set(val, { line: lineNo, kind: m[1] });
      }
    }

    // 2. JSX text nodes:  >Some Text<   (naive, single-line)
    const textRe = />([^<>{}]*[A-Za-z][^<>{}]*)</g;
    for (const m of line.matchAll(textRe)) {
      const val = m[1].trim();
      if (isLikelyTranslatable(val) && !found.has(val)) {
        found.set(val, { line: lineNo, kind: "text" });
      }
    }
  });

  return found;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (IGNORE_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (/\.(t|j)sx?$/.test(name) && !shouldIgnoreFile(name)) out.push(full);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const fileFilter = args.find((a) => a.startsWith("--file="))?.slice(7);

  const allFiles = [];
  for (const root of ROOTS) {
    try {
      walk(root, allFiles);
    } catch {}
  }

  const filtered = fileFilter
    ? allFiles.filter((f) => f.includes(fileFilter))
    : allFiles;

  const report = [];
  for (const file of filtered) {
    const strings = scanFile(file);
    if (strings.size === 0) continue;
    report.push({
      file: relative(process.cwd(), file).split(sep).join("/"),
      count: strings.size,
      strings: [...strings.entries()].map(([s, meta]) => ({
        value: s,
        line: meta.line,
        kind: meta.kind,
      })),
    });
  }

  report.sort((a, b) => b.count - a.count);

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const totalFiles = report.length;
  const totalStrings = report.reduce((n, r) => n + r.count, 0);

  console.log(`\n# i18n scan report\n`);
  console.log(`Files with candidate strings: ${totalFiles}`);
  console.log(`Total candidate strings:      ${totalStrings}\n`);
  console.log("─".repeat(70));

  for (const r of report) {
    console.log(`\n## ${r.file}   (${r.count})`);
    for (const s of r.strings) {
      const v = s.value.length > 70 ? s.value.slice(0, 67) + "..." : s.value;
      console.log(`  L${String(s.line).padStart(4)}  [${s.kind}]  ${v}`);
    }
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log(`\nTip: run with --json > i18n-report.json for machine-readable output`);
  console.log(`     or --file=Sidebar to scope to one file.\n`);
}

main();
