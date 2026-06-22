/**
 * Execute a tool call against the live `eda` runtime.
 *
 * Tool name format: `eda.<classPropName>.<methodName>` — same as generated in tool-auto-gen.ts.
 */
import type { CallToolResult, McpContent, ToolName } from "./protocol.ts";

type Eda = Record<string, unknown>;

export function executeTool(eda: Eda, name: ToolName, args: Record<string, unknown> | undefined): CallToolResult["result"] {
  const parsed = parseToolName(name);
  if (!parsed) {
    return errorResult(`Invalid tool name: ${name}. Expected "eda.<class>.<method>".`);
  }

  const { classProp, method } = parsed;
  const instance = eda[classProp];
  if (!instance) {
    return errorResult(`eda.${classProp} is not available (host did not provide it, or wrong engine version).`);
  }

  const fn = (instance as Record<string, unknown>)[method];
  if (typeof fn !== "function") {
    return errorResult(`eda.${classProp}.${method} is not a function (got ${typeof fn}).`);
  }

  try {
    const argArray = args ? Object.values(args) : [];
    // Last-resort: many pro-api methods accept a single options object.
    // If args has exactly one entry whose value is an object, pass that object.
    const argEntries = args ? Object.entries(args) : [];
    let callArgs: unknown[];
    if (argEntries.length === 1) {
      const [, v] = argEntries[0]!;
      callArgs = [v];
    } else {
      callArgs = argArray;
    }

    const out = (fn as (...a: unknown[]) => unknown).apply(instance, callArgs);

    if (out && typeof (out as Promise<unknown>).then === "function") {
      // Async method — we can't await here (sync tool spec). Return a marker.
      return textResult(`[async] ${name} returned a Promise; promise result not yet implemented.`);
    }

    return textResult(safeStringify(out));
  } catch (e) {
    return errorResult(`eda.${classProp}.${method} threw: ${(e as Error)?.message ?? String(e)}`);
  }
}

function parseToolName(name: ToolName): { classProp: string; method: string } | null {
  if (!name.startsWith("eda.")) return null;
  const rest = name.slice(4);
  const lastDot = rest.lastIndexOf(".");
  if (lastDot < 1) return null;
  return { classProp: rest.slice(0, lastDot), method: rest.slice(lastDot + 1) };
}

function textResult(text: string): { content: McpContent[] } {
  return { content: [{ type: "text", text }] };
}

function errorResult(text: string): { content: McpContent[]; isError: true } {
  return { content: [{ type: "text", text }], isError: true };
}

function safeStringify(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
