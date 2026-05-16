/**
 * Bundle content script with @mozilla/readability for Chrome MV3.
 */
import * as esbuild from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  entryPoints: [join(root, "src/content/content.ts")],
  bundle: true,
  outfile: join(root, "public/content.js"),
  format: "iife",
  target: ["chrome120"],
  platform: "browser",
  logLevel: "info",
});

console.log("Content script bundled → public/content.js");
