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

function getTools(): McpTool[] {
  if (toolsCache) return toolsCache;
  toolsCache = autoGenerateTools(eda as unknown as Record<string, unknown>);
  try {
    const log = (eda.sys_Log as unknown as { info?: (...a: unknown[]) => void } | undefined)?.info;
    if (log) {
      log(
        "lceda-ai-mcp",
        `Auto-generated ${toolsCache.length} MCP tools from pro-api surface.`,
      );
    }
  } catch {
    // logging is best-effort
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
  bridge = new WsBridge(handleRequest);
  bridge.start();
}

export function deactivate(): void {
  bridge?.stop();
  bridge = null;
}
