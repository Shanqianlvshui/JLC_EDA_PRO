#!/usr/bin/env node
/**
 * @lceda/mcp-relay — bridges MCP stdio (MCP client) to WebSocket (plugin in EDA).
 *
 * Lifecycle:
 *   1. MCP client spawns this process (via mcpServers command).
 *   2. We acquire a singleton file lock; if another relay is already running, exit silently.
 *   3. We start a WebSocket server on ws://127.0.0.1:7842.
 *   4. If JLC EDA Pro is not running, we launch it.
 *   5. We speak MCP-over-stdio upstream; the plugin connects to us over WS.
 *   6. We translate tools/list and tools/call between the two.
 *   7. When the MCP client disconnects (closes stdin), we shut down.
 *
 * Requirements: Node.js >= 20.5.0.
 */
import { spawn, exec } from "node:child_process";
import { existsSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "node:url";

const execP = promisify(exec);

const WS_PORT = 7842;
const WS_URL = `ws://127.0.0.1:${WS_PORT}`;
const LOCK_PATH = path.join(os.homedir(), ".lceda-mcp-relay.lock");
const PID_PATH = path.join(os.homedir(), ".lceda-mcp-relay.pid");
const EDA_LAUNCH_PATHS = {
  win32: [
    "C:\\Program Files\\LCEDA Pro\\lceda-pro.exe",
    "C:\\Program Files (x86)\\LCEDA Pro\\lceda-pro.exe",
    path.join(os.homedir(), "AppData", "Local", "Programs", "lceda-pro", "lceda-pro.exe"),
  ],
  darwin: ["/Applications/LCEDA Pro.app/Contents/MacOS/lceda-pro"],
  linux: ["/opt/lceda-pro/lceda-pro", path.join(os.homedir(), "lceda-pro/lceda-pro")],
};

const isMain = (() => {
  if (!process.argv[1]) return false;
  // Normalize both sides to platform-native absolute paths.
  const importPath = path.resolve(fileURLToPath(import.meta.url));
  const argvPath = path.resolve(process.argv[1]);
  return importPath === argvPath;
})();

/* ---------- logging ---------- */

function log(level, msg) {
  process.stderr.write(`[${new Date().toISOString()}] [${level}] ${msg}\n`);
}

/* ---------- singleton lock ---------- */

function tryAcquireLock() {
  if (existsSync(LOCK_PATH)) {
    const oldPid = Number(readFileSync(LOCK_PATH, "utf8").trim());
    if (Number.isFinite(oldPid) && isProcessAlive(oldPid)) {
      // Another relay is alive. Exit silently so the MCP client uses it.
      process.exit(0);
    }
  }
  writeFileSync(LOCK_PATH, String(process.pid));
  writeFileSync(PID_PATH, String(process.pid));
}

function releaseLock() {
  try {
    if (existsSync(PID_PATH) && readFileSync(PID_PATH, "utf8").trim() === String(process.pid)) {
      unlinkSync(LOCK_PATH);
      unlinkSync(PID_PATH);
    }
  } catch {
    // ignore
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/* ---------- JLC EDA Pro launcher ---------- */

async function ensureEdaRunning() {
  if (await isEdaProcessRunning()) {
    log("info", "JLC EDA Pro is already running.");
    return;
  }

  const exe = findEdaExecutable();
  if (!exe) {
    log("warn", "JLC EDA Pro executable not found in standard locations. Start it manually.");
    return;
  }

  log("info", `Launching JLC EDA Pro: ${exe}`);
  try {
    const child = spawn(exe, [], { detached: true, stdio: "ignore" });
    child.unref();
  } catch (e) {
    log("error", `Failed to launch EDA: ${e?.message ?? e}`);
  }
}

async function isEdaProcessRunning() {
  const cmd =
    process.platform === "win32"
      ? `tasklist /FI "IMAGENAME eq lceda-pro.exe" /NH`
      : `pgrep -f lceda-pro`;
  try {
    const { stdout } = await execP(cmd);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function findEdaExecutable() {
  const candidates = EDA_LAUNCH_PATHS[process.platform] ?? [];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/* ---------- WebSocket server (plugin side) ---------- */

const connectedPlugins = new Set();
let wss = null;

function startWebSocketServer() {
  return new Promise((resolve, reject) => {
    wss = new WebSocketServer({ port: WS_PORT, host: "127.0.0.1", path: "/" });
    wss.once("listening", () => {
      log("info", `WebSocket server listening on ${WS_URL}`);
      resolve();
    });
    wss.on("error", reject);
    wss.on("connection", (ws) => bindPluginConnection(ws));
  });
}

function bindPluginConnection(ws) {
  connectedPlugins.add(ws);
  log("info", `Plugin connected (${connectedPlugins.size} active).`);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || msg.jsonrpc !== "2.0" || msg.id == null) return;
    const pending = pendingFromPlugin.get(String(msg.id));
    if (!pending) return;
    pendingFromPlugin.delete(String(msg.id));
    if (msg.error) {
      const err = new Error(msg.error.message);
      err.data = msg.error.data;
      pending.reject(err);
    } else {
      pending.resolve(msg.result);
    }
  });

  const drop = () => {
    connectedPlugins.delete(ws);
    log("info", `Plugin disconnected (${connectedPlugins.size} active).`);
    for (const [id, p] of pendingFromPlugin) {
      p.reject(new Error("Plugin disconnected"));
      pendingFromPlugin.delete(id);
    }
  };
  ws.on("close", drop);
  ws.on("error", (e) => log("error", `Plugin WS error: ${e?.message ?? e}`));
}

/* ---------- MCP stdio bridge ---------- */

let nextId = 1;
const pendingFromPlugin = new Map();

function sendToMcpClient(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function sendToPlugin(ws, msg) {
  if (ws.readyState !== 1) return; // OPEN
  ws.send(JSON.stringify(msg));
}

function bridgeToPlugin(ws, method, params) {
  const id = String(nextId++);
  return new Promise((resolve, reject) => {
    pendingFromPlugin.set(id, { resolve, reject });
    sendToPlugin(ws, { jsonrpc: "2.0", id, method, params });
    setTimeout(() => {
      if (pendingFromPlugin.has(id)) {
        pendingFromPlugin.delete(id);
        reject(new Error(`Plugin timed out for ${method} (id=${id}).`));
      }
    }, 30_000);
  });
}

function startMcpStdioLoop() {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) handleMcpLine(line);
    }
  });
  process.stdin.on("end", () => shutdown());
}

async function handleMcpLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (!msg || msg.jsonrpc !== "2.0") return;

  // Notification (no id): accept silently except for `exit`.
  if (msg.id == null) {
    if (msg.method === "exit") shutdown();
    return;
  }

  const pluginWs = [...connectedPlugins][0];
  if (!pluginWs) {
    sendToMcpClient({
      jsonrpc: "2.0",
      id: msg.id,
      error: {
        code: -32000,
        message:
          "JLC EDA Pro plugin is not connected. Ensure EDA Pro is running, the extension is installed and active, and external-interaction permission is enabled.",
      },
    });
    return;
  }

  try {
    const result = await bridgeToPlugin(pluginWs, msg.method, msg.params);
    sendToMcpClient({ jsonrpc: "2.0", id: msg.id, result });
  } catch (e) {
    sendToMcpClient({
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32603, message: e?.message ?? String(e) },
    });
  }
}

/* ---------- shutdown ---------- */

function shutdown() {
  log("info", "Shutting down.");
  try {
    if (wss) wss.close();
  } catch {
    // ignore
  }
  for (const ws of connectedPlugins) {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
  releaseLock();
  process.exit(0);
}

if (isMain) {
  tryAcquireLock();
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("exit", releaseLock);

  await ensureEdaRunning();
  await startWebSocketServer();
  startMcpStdioLoop();
  log("info", "Ready. Listening on stdin (MCP) + ws://127.0.0.1:7842 (plugin).");
}
