/**
 * Package Chrome extension into out/ without Next.js (MV3-safe, no inline scripts).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const publicDir = "public";
const outDir = "out";

const required = [
  "manifest.json",
  "panel.html",
  "panel.js",
  "panel.css",
  "background.js",
  "content.js",
];

function findUnderscorePaths(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_")) {
      found.push(join(dir, entry.name));
    }
    if (entry.isDirectory()) {
      findUnderscorePaths(join(dir, entry.name), found);
    }
  }
  return found;
}

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

cpSync(publicDir, outDir, { recursive: true });

const illegal = findUnderscorePaths(outDir);
if (illegal.length > 0) {
  console.error("\nExtension package failed: underscore paths in out/:");
  for (const p of illegal) {
    console.error(" ", p);
  }
  process.exit(1);
}

const missing = required.filter((name) => !existsSync(join(outDir, name)));
if (missing.length > 0) {
  console.error("\nExtension package failed. Missing in out/:");
  console.error(missing.join(", "));
  console.error("\nRun: npm run build:ext");
  process.exit(1);
}

console.log("");
console.log("========================================");
console.log("  Extension build succeeded");
console.log("========================================");
console.log("");
console.log("  Side panel: panel.html (esbuild, MV3-safe)");
console.log("");
console.log("  Load in Chrome:");
console.log("    1. chrome://extensions");
console.log("    2. Developer mode ON");
console.log("    3. Load unpacked -> select this folder:");
console.log(`       ${join(process.cwd(), outDir)}`);
console.log("");
