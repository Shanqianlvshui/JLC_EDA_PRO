/**
 * Execute a tool call against the live `eda` runtime.
 *
 * Tool name format: `eda.<classPropName>.<methodName>` — same as generated in tool-auto-gen.ts.
 */
import type { CallToolResult, McpContent, ToolName } from "./protocol.ts";

type Eda = Record<string, unknown>;

export async function executeTool(
  eda: Eda,
  name: ToolName,
  args: Record<string, unknown> | undefined,
): Promise<CallToolResult["result"]> {
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
    // Args come in two shapes:
    //   (a) JSON object `{key: "STM32", itemsOfPage: 20}` — we pass values
    //       positionally via Object.values. Keys are not preserved, so the
    //       order of keys MUST match the pro-api positional signature.
    //   (b) JSON array `["STM32", undefined, undefined, undefined, 20, 1]` —
    //       explicit positional form, used when the relay remaps a friendly
    //       alias to its real pro-api positional call. Forwarded as-is.
    let callArgs: unknown[];
    if (Array.isArray(args)) {
      callArgs = args;
    } else if (args && typeof args === "object") {
      callArgs = Object.values(args);
    } else {
      callArgs = [];
    }

    const out = (fn as (...a: unknown[]) => unknown).apply(instance, callArgs);

    // Almost every pro-api method returns a Promise. Await it.
    let resolved: unknown = out;
    if (out && typeof (out as Promise<unknown>).then === "function") {
      try {
        resolved = await (out as Promise<unknown>);
      } catch (e) {
        return errorResult(`eda.${classProp}.${method} rejected: ${(e as Error)?.message ?? String(e)}`);
      }
    }

    return textResult(safeStringify(resolved));
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
