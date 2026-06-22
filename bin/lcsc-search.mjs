/**
 * LCSC (JLC 商城) component search — relay-side.
 *
 * `lcsc_search` is just a friendly alias for the JLC EDA Pro plugin's
 * `eda.lib_Device.search()` / `eda.lib_Device.getByLcscIds()`. The plugin
 * runs inside EDA Pro and has authenticated access to the LCSC backend,
 * so we route the call through the plugin instead of fetching the LCSC API
 * ourselves (the public web API is undocumented, returns 404, and would
 * need a separate auth flow).
 *
 * This module now just builds the MCP tool definition. The relay forwards
 * `lcsc_search` to the plugin and remaps it to `eda.lib_Device.search`
 * inside `dispatchRequest()`.
 */

/** MCP tool definition for `lcsc_search`. Forwarded to plugin at call time. */
export const lcscSearchTool = {
  name: "lcsc_search",
  description:
    "Search the JLC 商城 (LCSC) component library by keyword (part number, value, package, etc.). Forwarded to eda.lib_Device.search() inside the running EDA Pro. Returns LCSC id, stock count, basic price, symbol/footprint UUIDs. Use this to look up real parts before placing them on the schematic.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search keyword (e.g. 'STM32F103C8T6', '100nF 0603')" },
      limit: {
        type: "integer",
        description: "Maximum number of results (1-50, default 20)",
        minimum: 1,
        maximum: 50,
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

/**
 * Remap an `lcsc_search` tool call to the equivalent `eda.lib_Device.search`
 * invocation. Returns `{ toolName, args }` where `args` is a POSITIONAL array
 * that maps 1:1 to the pro-api signature:
 *   lib_Device.search(key, libraryUuid?, classification?, symbolType?, itemsOfPage?, page?)
 *
 * The relay forwards this array directly via `tools/call.arguments`. The
 * plugin's `executeTool` detects arrays and forwards them positionally.
 */
export function remapLcscSearch(callArgs) {
  const query = String(callArgs?.query ?? "").trim();
  if (!query) throw new Error("lcsc_search: 'query' must be a non-empty string");
  const limit = Math.min(Math.max(Number(callArgs?.limit ?? 20) | 0, 1), 50);
  return {
    toolName: "eda.lib_Device.search",
    // [key, libraryUuid, classification, symbolType, itemsOfPage, page]
    args: [query, undefined, undefined, undefined, limit, 1],
  };
}

/**
 * Same as above but for lcsc-id lookups (e.g. "C123456").
 * Maps to lib_Device.getByLcscIds(ids: Array<string>).
 */
export function remapLcscGetByIds(callArgs) {
  const ids = callArgs?.lcscIds ?? callArgs?.ids ?? callArgs?.query;
  if (!ids) throw new Error("lcsc_get: 'lcscIds' (or 'ids' / 'query') must be provided");
  const arr = Array.isArray(ids) ? ids : String(ids).split(/[\s,]+/).filter(Boolean);
  if (arr.length === 0) throw new Error("lcsc_get: no valid lcsc ids in input");
  return {
    toolName: "eda.lib_Device.getByLcscIds",
    // [lcscIds] — single positional array arg
    args: [arr],
  };
}

export const lcscGetTool = {
  name: "lcsc_get",
  description:
    "Look up JLC 商城 (LCSC) component(s) by their 立创 C 编号 (e.g. 'C123456'). Forwarded to eda.lib_Device.getByLcscIds() inside the running EDA Pro. Returns full device records (LCSC id, stock, price, symbol/footprint UUIDs).",
  inputSchema: {
    type: "object",
    properties: {
      lcscIds: {
        oneOf: [
          { type: "string", description: "Single LCSC id (e.g. 'C123456')" },
          { type: "array", items: { type: "string" }, description: "Array of LCSC ids" },
        ],
        description: "One or more LCSC ids",
      },
      query: { type: "string", description: "Alias for lcscIds — single LCSC id as string" },
      ids: { type: "array", items: { type: "string" }, description: "Alias for lcscIds" },
    },
    additionalProperties: false,
  },
};
