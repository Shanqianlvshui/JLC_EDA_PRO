/**
 * Clean build artifacts.
 */
import { rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
rmSync("build", { recursive: true, force: true });
console.log("Cleaned dist/ and build/");
