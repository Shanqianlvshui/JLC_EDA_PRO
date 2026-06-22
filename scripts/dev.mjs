/**
 * Dev mode: watch src/ and rebuild on change.
 */
import { context } from "esbuild";
import { rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });

const ctx = await context({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "browser",
  sourcemap: true,
  logLevel: "info",
});

await ctx.watch();
console.log("Watching src/... (press Ctrl+C to exit)");
