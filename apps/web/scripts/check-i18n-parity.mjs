#!/usr/bin/env node
/**
 * Fails if any locale file is missing keys present in en.json.
 * Run with: node scripts/check-i18n-parity.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = resolve(here, "..", "messages");

const en = JSON.parse(readFileSync(resolve(messagesDir, "en.json"), "utf-8"));

function diff(prefix, enNode, locNode) {
  const missing = [];
  if (typeof enNode !== "object" || enNode === null) return missing;
  if (typeof locNode !== "object" || locNode === null) {
    return [prefix + ".*"];
  }
  for (const k of Object.keys(enNode)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (!(k in locNode)) missing.push(path);
    else missing.push(...diff(path, enNode[k], locNode[k]));
  }
  return missing;
}

let failed = false;
const locales = readdirSync(messagesDir)
  .filter((f) => f.endsWith(".json") && f !== "en.json")
  .map((f) => f.replace(".json", ""));

for (const loc of locales) {
  const data = JSON.parse(readFileSync(resolve(messagesDir, `${loc}.json`), "utf-8"));
  const missing = diff("", en, data);
  if (missing.length > 0) {
    failed = true;
    console.log(`\n${loc}.json — ${missing.length} missing:`);
    for (const m of missing.slice(0, 15)) console.log(`  ${m}`);
    if (missing.length > 15) console.log(`  … and ${missing.length - 15} more`);
  }
}

if (failed) {
  console.log("\ni18n parity check FAILED");
  process.exit(1);
}
console.log("i18n parity: all locales OK");
