/**
 * Plugin entry point.
 * Loaded by JLC EDA Pro when the extension activates.
 */
import { WsBridge } from "./bridge/ws-client.ts";
import { autoGenerateTools } from "./mcp/tool-auto-gen.ts";
import { executeTool } from "./mcp/tool-executor.ts";
import type { McpTool } from "./mcp/protocol.ts";

let toolsCache: McpTool[] | null = null;
let bridge: WsBridge | null = null;

function log(level: "info" | "warn" | "error", message: string): void {
  try {
    const edaLog = (eda as { sys_Log?: { add?: (m: string, t?: string) => void } }).sys_Log;
    if (edaLog?.add) {
      edaLog.add(`[lceda-ai-mcp] ${message}`, level);
    } else {
      process.stderr.write(`[lceda-ai-mcp] [${level}] ${message}\n`);
    }
  } catch (e) {
    process.stderr.write(`[lceda-ai-mcp] log error: ${(e as Error)?.message ?? e}\n`);
  }
}

/** Loud, unmissable signal that activate() fired. Bypasses sys_Log entirely. */
function showStartupToast(): void {
  try {
    const dialog = (eda as { sys_Dialog?: { showInformationMessage?: (m: string, t: string) => void } })
      .sys_Dialog;
    if (dialog?.showInformationMessage) {
      dialog.showInformationMessage(
        `LCEDA AI MCP v0.1.0 activated. WS bridge polling ws://127.0.0.1:7842.`,
        "LCEDA AI MCP",
      );
    }
  } catch (e) {
    process.stderr.write(`[lceda-ai-mcp] toast error: ${(e as Error)?.message ?? e}\n`);
  }
}

function getTools(): McpTool[] {
  if (toolsCache) return toolsCache;
  try {
    toolsCache = autoGenerateTools(eda as unknown as Record<string, unknown>);
    log("info", `Auto-generated ${toolsCache.length} MCP tools from pro-api surface.`);
  } catch (e) {
    log("error", `Tool auto-gen failed: ${(e as Error)?.message ?? e}`);
    toolsCache = [];
  }
  return toolsCache;
}

async function handleRequest(req: { id: string; method: string; params?: unknown }): Promise<unknown> {
  // Lazy bridge: first request comes in via plugin WS, make sure the
  // bridge object is alive (it can be nulled by a page-cycle deactivate).
  ensureBridge();
  switch (req.method) {
    case "tools/list": {
      return { tools: getTools() };
    }
    case "tools/call": {
      const params = (req.params ?? {}) as { name: string; arguments?: Record<string, unknown> };
      if (!params.name) {
        throw new Error("tools/call: missing 'name' in params");
      }
      return executeTool(eda as unknown as Record<string, unknown>, params.name, params.arguments);
    }
    default: {
      throw new Error(`Unknown method: ${req.method}`);
    }
  }
}

export function activate(): void {
  // 1. Loud toast — should pop a dialog if activate() runs at all.
  showStartupToast();
  // 2. Background log
  try {
    log("info", `activate() called. eda=${typeof eda}, eda.sys_WebSocket=${typeof (eda as { sys_WebSocket?: unknown }).sys_WebSocket}, eda.sys_Dialog=${typeof (eda as { sys_Dialog?: unknown }).sys_Dialog}, eda.sys_Log=${typeof (eda as { sys_Log?: unknown }).sys_Log}`);
    // Pre-warm tool cache so the first MCP request is fast.
    getTools();
    log("info", "activate(): bridge is NOT auto-started (use Test activation or first MCP request to start).");
  } catch (e) {
    log("error", `activate() failed: ${(e as Error)?.message ?? e}`);
  }
}

/**
 * Lazily start the bridge. Called from showTestDialog and from the
 * handleRequest entrypoint so the bridge comes up on first real use,
 * survives activate→deactivate page cycles, and never blocks activate().
 */
function ensureBridge(): void {
  if (bridge && !bridge.debugStopped()) return;
  try {
    log("info", "ensureBridge: (re)creating WsBridge...");
    bridge = new WsBridge(handleRequest);
    bridge.start();
    log("info", "ensureBridge: bridge started.");
  } catch (e) {
    log("error", `ensureBridge failed: ${(e as Error)?.message ?? e}`);
    bridge = null;
  }
}

export function deactivate(): void {
  log("info", "deactivate() called — shutting down.");
  bridge?.stop();
  bridge = null;
  toolsCache = null;
}

/**
 * Header-menu entry: when the user clicks the menu item, this fires.
 * Useful as a "is the extension actually loaded?" smoke test.
 */
export function showTestDialog(): void {
  try {
    const dialog = (eda as { sys_Dialog?: { showInformationMessage?: (m: string, t: string) => void } })
      .sys_Dialog;
    const edaAny = eda as Record<string, unknown>;
    const wsType = typeof edaAny.sys_WebSocket;
    const wsHasRegister = typeof (edaAny.sys_WebSocket as { register?: unknown } | undefined)?.register;

    // Self-heal: if the bridge didn't survive a page reload, recreate it.
    ensureBridge();

    if (dialog?.showInformationMessage) {
      const tools = getTools();
      const bridgeInfo = bridge
        ? `created (attempt=${bridge.debugAttempt()}, stopped=${bridge.debugStopped()})`
        : "null (recreate failed)";
      dialog.showInformationMessage(
        [
          `Tools cached: ${tools.length}`,
          `Bridge: ${bridgeInfo}`,
          `eda.sys_WebSocket: ${wsType}, has register: ${wsHasRegister}`,
          `URL: ws://127.0.0.1:7842`,
        ].join("\n"),
        "LCEDA AI MCP — test",
      );
    } else {
      log("error", "showTestDialog: sys_Dialog.showInformationMessage missing");
    }
  } catch (e) {
    log("error", `showTestDialog failed: ${(e as Error)?.message ?? e}`);
  }
}
