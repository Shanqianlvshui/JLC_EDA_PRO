/**
 * Build script: bundle the TypeScript plugin code into a single ESM file
 * that JLC EDA Pro can load via the `entry` field in extension.json.
 *
 * Output: dist/index.js (and dist/index.js.map for debugging).
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
  outfile: "dist/index.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "browser",
  sourcemap: true,
  // The plugin runs in the EDA host's sandbox. We intentionally leave
  // `eda` un-bundled (it's a runtime global) by NOT marking it external —
  // it isn't imported anywhere, only referenced as a global, so esbuild
  // leaves it alone.
  logLevel: "info",
});

console.log("OK: dist/index.js");
