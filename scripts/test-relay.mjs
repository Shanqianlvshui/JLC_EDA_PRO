/**
 * E2E test for the relay: spawns it as a child process, speaks MCP
 * over stdio (the same protocol Claude Desktop / Cursor / mavis CLI use),
 * and exercises the synthetic lcsc_search tool against the real
 * JLC 商城 API.
 *
 * If the user's EDA Pro desktop client is open, this also lets the
 * plugin-side WsBridge connect so we can see in the relay log whether
 * the WS handshake works.
 */
import { spawn, execSync } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LOCK_PATH = join(homedir(), ".lceda-mcp-relay.lock");
const PID_PATH = join(homedir(), ".lceda-mcp-relay.pid");

// --- clean up any leftover relay from a previous run ---
if (existsSync(PID_PATH)) {
  try {
    const oldPid = parseInt(readFileSync(PID_PATH, "utf8").trim(), 10);
    if (Number.isFinite(oldPid)) {
      try {
        process.kill(oldPid, "SIGKILL");
        console.log(`[cleanup] killed leftover relay pid=${oldPid}`);
      } catch {
        // already gone
      }
    }
  } catch {
    // ignore
  }
}
for (const f of [LOCK_PATH, PID_PATH]) {
  try {
    unlinkSync(f);
  } catch {
    // ignore
  }
}

// --- spawn relay ---
const relay = spawn(process.execPath, ["bin/mcp-relay.mjs"], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: process.cwd(),
  env: { ...process.env },
});

let nextId = 1;
const pending = new Map();

let stderrLog = "";
relay.stderr.on("data", (chunk) => {
  const s = chunk.toString();
  stderrLog += s;
  process.stderr.write(`  [relay] ${s}`);
});

relay.on("exit", (code, signal) => {
  if (code !== 0 && code !== null) {
    console.error(`[harness] relay exited unexpectedly: code=${code} signal=${signal}`);
  }
});

const rl = createInterface({ input: relay.stdout });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id != null) {
    const handler = pending.get(msg.id);
    if (handler) {
      pending.delete(msg.id);
      if (msg.error) {
        const e = new Error(msg.error.message);
        e.data = msg.error.data;
        handler.reject(e);
      } else {
        handler.resolve(msg.result);
      }
    }
  } else {
    console.log("  [notification]", JSON.stringify(msg));
  }
});

function send(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    relay.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout for ${method} (id=${id})`));
      }
    }, 30_000);
  });
}

let failed = false;
const results = {};

try {
  // 1. initialize
  console.log("\n--- 1. initialize ---");
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mavis-self-test", version: "0.1.0" },
  });
  console.log("  ok server:", init.serverInfo ?? "(no serverInfo)");
  results.initialize = "ok";
} catch (e) {
  console.error("  FAIL:", e.message);
  results.initialize = "FAIL: " + e.message;
  failed = true;
}

try {
  relay.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
} catch {}

try {
  console.log("\n--- 2. tools/list ---");
  const list = await send("tools/list", undefined);
  const names = (list.tools ?? []).map((t) => t.name);
  console.log(`  ok: ${names.length} tools`);
  for (const n of names.slice(0, 5)) console.log(`     - ${n}`);
  if (names.length > 5) console.log(`     ... (${names.length - 5} more)`);
  if (!names.includes("lcsc_search")) {
    console.error("  FAIL: lcsc_search missing from tool list");
    results.toolsList = "FAIL: lcsc_search missing";
    failed = true;
  } else {
    results.toolsList = `ok (${names.length} tools)`;
  }
} catch (e) {
  console.error("  FAIL:", e.message);
  results.toolsList = "FAIL: " + e.message;
  failed = true;
}

try {
  console.log("\n--- 3. tools/call lcsc_search STM32F103C8T6 ---");
  const call = await send("tools/call", {
    name: "lcsc_search",
    arguments: { query: "STM32F103C8T6", limit: 3 },
  });
  if (call.isError) {
    console.error("  FAIL:", call.content?.[0]?.text ?? "unknown error");
    results.lcscSearch = "FAIL: " + (call.content?.[0]?.text ?? "unknown");
    failed = true;
  } else {
    const text = call.content?.[0]?.text ?? "[]";
    const items = JSON.parse(text);
    console.log(`  ok: ${items.length} results from JLC 商城`);
    for (const it of items) {
      console.log(
        `     - ${it.lcscId}  ${it.mfrPart}  (${it.manufacturer})  stock=${it.stockCount}  ¥${it.basicPrice}`,
      );
    }
    if (items.length === 0) {
      console.error("  FAIL: returned 0 items");
      results.lcscSearch = "FAIL: 0 items";
      failed = true;
    } else {
      results.lcscSearch = `ok (${items.length} real results)`;
    }
  }
} catch (e) {
  console.error("  FAIL:", e.message);
  results.lcscSearch = "FAIL: " + e.message;
  failed = true;
}

// 4. Give the plugin a chance to connect if EDA Pro is open
console.log("\n--- 4. waiting 4s for plugin to connect (if EDA Pro is open) ---");
await new Promise((r) => setTimeout(r, 4000));
const relevantStderr = stderrLog
  .split("\n")
  .filter((l) => l.includes("Plugin") || l.includes("listening") || l.includes("launch"))
  .slice(-10);
console.log("  relay log (plugin events):");
for (const l of relevantStderr) console.log("     " + l.trim());
const pluginConnected = stderrLog.includes("Plugin connected");
results.pluginConnection = pluginConnected ? "connected" : "not connected (EDA Pro not open or plugin hasn't connected yet)";
console.log(`  -> ${results.pluginConnection}`);

// --- summary ---
console.log("\n--- summary ---");
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${k}: ${v}`);
}
console.log(failed ? "\nFAIL" : "\nPASS");

// --- cleanup ---
relay.stdin.end();
try {
  relay.kill("SIGTERM");
} catch {}
setTimeout(() => {
  try {
    relay.kill("SIGKILL");
  } catch {}
}, 1000);

process.exit(failed ? 1 : 0);
