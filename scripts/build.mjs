/**
 * Build script: bundle the TypeScript plugin code into a single IIFE script
 * that JLC EDA Pro loads and reads from the global `edaEsbuildExportName`.
 *
 * Output: dist/index.js (and dist/index.js.map for debugging).
 *
 * CRITICAL: format must be `iife` and globalName must be `edaEsbuildExportName`
 * (the pro-api-sdk convention). EDA Pro reads exports like `activate`,
 * `deactivate` from this global; using ESM `format: "esm"` would silently
 * fail to load the extension.
 */
import { build } from "esbuild";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });

// Mirror pro-api-sdk behavior: auto-generate a 32-char UUID on first build
// if the user hasn't supplied one. EDA Pro rejects empty UUIDs.
const extPath = "extension.json";
const ext = JSON.parse(readFileSync(extPath, "utf8"));
if (!ext.uuid || !/^[a-z0-9]{32}$/.test(ext.uuid)) {
  ext.uuid = randomBytes(16).toString("hex");
  writeFileSync(extPath, JSON.stringify(ext, null, 2) + "\n");
  console.log(`Generated UUID: ${ext.uuid}`);
}

await build({
  entryPoints: ["src/index.ts"],
  entryNames: "[name]",
  outdir: "dist",
  bundle: true,
  format: "iife",
  globalName: "edaEsbuildExportName",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  logLevel: "info",
});

console.log("OK: dist/index.js");
