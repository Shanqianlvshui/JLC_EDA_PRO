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
    // SYS_Log.add(message, type) — the actual EDA Pro API (per prodocs.lceda.cn).
    const edaLog = (eda as { sys_Log?: { add?: (m: string, t?: string) => void } }).sys_Log;
    if (edaLog?.add) {
      edaLog.add(`[lceda-ai-mcp] ${message}`, level);
    } else {
      // Fall back to stderr so devs see something during local debugging.
      process.stderr.write(`[lceda-ai-mcp] [${level}] ${message}\n`);
    }
  } catch (e) {
    process.stderr.write(`[lceda-ai-mcp] log error: ${(e as Error)?.message ?? e}\n`);
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
  log("info", "activate() called — plugin starting up.");
  try {
    // Pre-warm the tool cache so the count is logged even before any MCP call.
    getTools();
    bridge = new WsBridge(handleRequest);
    bridge.start();
    log("info", "WebSocket bridge started, polling ws://127.0.0.1:7842.");
  } catch (e) {
    log("error", `activate() failed: ${(e as Error)?.message ?? e}`);
  }
}

export function deactivate(): void {
  log("info", "deactivate() called — shutting down.");
  bridge?.stop();
  bridge = null;
  toolsCache = null;
}
