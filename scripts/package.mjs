/**
 * Package the built plugin into a .eext file (zip) that JLC EDA Pro
 * can import via the extension manager.
 *
 * Output: dist/lceda-ai-mcp-<version>.eext
 *
 * Steps:
 *   1. Run `node scripts/build.mjs` to produce dist/index.js
 *   2. Hand off to scripts/package.py to zip into the .eext
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

console.log("--- build ---");
execFileSync(process.execPath, [path.join(here, "build.mjs")], { stdio: "inherit" });

console.log("\n--- package ---");
execFileSync(process.platform === "win32" ? "python" : "python3", [
  path.join(here, "package.py"),
], { stdio: "inherit" });

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const ext = JSON.parse(await readFile("extension.json", "utf8"));
const version = ext.version ?? pkg.version ?? "0.0.0";
const out = path.join("dist", `lceda-ai-mcp-${version}.eext`);
if (existsSync(out)) {
  const abs = path.resolve(out).replace(/\\/g, "/");
  console.log(`\nImport with: file:///${abs}`);
} else {
  console.error(`\nERROR: ${out} not produced`);
  process.exit(1);
}
