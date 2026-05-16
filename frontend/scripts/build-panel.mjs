/**
 * Bundle side panel React app for Chrome MV3 (no Next.js inline scripts).
 */
import * as esbuild from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  entryPoints: [join(root, "src/panel/main.tsx")],
  bundle: true,
  outfile: join(root, "public/panel.js"),
  format: "iife",
  target: ["chrome120"],
  platform: "browser",
  jsx: "automatic",
  logLevel: "info",
});

console.log("Panel bundled → public/panel.js");
