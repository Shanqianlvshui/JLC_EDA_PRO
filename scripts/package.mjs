/**
 * Package the built plugin into a .eext file (zip) that JLC EDA Pro
 * can import via the extension manager.
 *
 * Output: dist/lceda-ai-mcp-<version>.eext
 *
 * Implementation: shells out to scripts/package.py because the project's
 * Node 24 / PowerShell 5.1 mix has rough edges with Compress-Archive
 * (relative paths, encoding). Python's zipfile is reliable.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(here, "package.py");

execFileSync(process.platform === "win32" ? "python" : "python3", [scriptPath], {
  stdio: "inherit",
});

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const ext = JSON.parse(await readFile("extension.json", "utf8"));
const version = ext.version ?? pkg.version ?? "0.0.0";
const out = path.join("dist", `lceda-ai-mcp-${version}.eext`);
if (existsSync(out)) {
  const abs = path.resolve(out).replace(/\\/g, "/");
  console.log(`Import with: file:///${abs}`);
}
