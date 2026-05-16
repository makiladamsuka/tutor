/**
 * Chrome MV3 forbids files/folders whose names start with "_".
 * Next.js static export uses "_next", "_not-found", etc. — sanitize after build.
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";

const outDir = "out";
const TEXT_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".txt",
  ".map",
]);

const CONTENT_REPLACEMENTS = [
  ["./_next/", "./next/"],
  ["/_next/", "/next/"],
  ['"_next/', '"next/'],
  ["'_next/", "'next/"],
  ["_buildManifest.js", "buildManifest.js"],
  ["_clientMiddlewareManifest.js", "clientMiddlewareManifest.js"],
  ["_ssgManifest.js", "ssgManifest.js"],
  ["_buildManifest", "buildManifest"],
  ["_clientMiddlewareManifest", "clientMiddlewareManifest"],
  ["_ssgManifest", "ssgManifest"],
];

function removePath(target) {
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }
}

/** Remove Next.js artifacts we do not need in the extension package. */
function removeUnusedArtifacts() {
  for (const name of readdirSync(outDir)) {
    if (name === "next") {
      continue;
    }
    if (
      name.startsWith("_") ||
      name.startsWith("__") ||
      name === "404.html"
    ) {
      removePath(join(outDir, name));
    }
  }
}

/** Rename out/_next → out/next before patching references. */
function renameNextFolder() {
  const from = join(outDir, "_next");
  const to = join(outDir, "next");
  if (!existsSync(from)) {
    return;
  }
  removePath(to);
  renameSync(from, to);
}

/** Rename manifest files inside next/static/... that start with "_". */
function renameUnderscoreFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const current = join(dir, entry.name);
    if (entry.isDirectory()) {
      renameUnderscoreFiles(current);
    }
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.name.startsWith("_")) {
      continue;
    }
    const withoutPrefix = entry.name.replace(/^_+/, "");
    renameSync(join(dir, entry.name), join(dir, withoutPrefix));
  }
}

function patchFileContents(filePath) {
  if (!TEXT_EXTENSIONS.has(extname(filePath))) {
    return;
  }

  let content = readFileSync(filePath, "utf8");
  const original = content;

  for (const [from, to] of CONTENT_REPLACEMENTS) {
    content = content.split(from).join(to);
  }

  if (content !== original) {
    writeFileSync(filePath, content);
  }
}

function walkAndPatch(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const current = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAndPatch(current);
    } else {
      patchFileContents(current);
    }
  }
}

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

// --- run ---
if (!existsSync(outDir)) {
  console.error("\nExtension build failed: out/ directory missing. Run next build first.");
  process.exit(1);
}

renameNextFolder();
removeUnusedArtifacts();

const nextDir = join(outDir, "next");
if (existsSync(nextDir)) {
  renameUnderscoreFiles(nextDir);
}

walkAndPatch(outDir);

const illegal = findUnderscorePaths(outDir);
if (illegal.length > 0) {
  console.error("\nExtension build failed: underscore paths remain:");
  for (const p of illegal) {
    console.error(" ", p);
  }
  process.exit(1);
}

const required = ["manifest.json", "index.html", "background.js", "next"];
const missing = required.filter((name) => !existsSync(join(outDir, name)));
if (missing.length > 0) {
  console.error("\nExtension build failed verification.");
  console.error("Missing in out/:", missing.join(", "));
  process.exit(1);
}

console.log("");
console.log("========================================");
console.log("  Extension build succeeded");
console.log("========================================");
console.log("");
console.log("  Renamed _next → next (required for Chrome).");
console.log("");
console.log("  Load in Chrome:");
console.log("    1. chrome://extensions");
console.log("    2. Developer mode ON");
console.log("    3. Load unpacked -> select this folder:");
console.log(`       ${join(process.cwd(), outDir)}`);
console.log("");
