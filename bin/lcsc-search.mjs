/**
 * LCSC (JLC 商城) component search — relay-side.
 *
 * Lives in the relay (Node.js, no sandbox restrictions on `fetch`) so the
 * plugin can stay sandboxed. The relay exposes this as a synthetic MCP tool
 * named `lcsc_search`. The plugin's auto-generated tool list is merged with
 * this on every `tools/list` request.
 */
const LCSC_SEARCH_URL = "https://www.jlc.com/api/eda/v2/common/lightSearch";

/** @typedef {{ lcscId: string, mfrPart?: string, package?: string, manufacturer?: string, basicPrice?: number, stockCount?: number, description?: string, datasheetUrl?: string, symbolUuid?: string, footprintUuid?: string }} LcscSearchItem */

/**
 * @param {string} query
 * @param {number} [limit=20]
 * @returns {Promise<LcscSearchItem[]>}
 */
export async function searchLcsc(query, limit = 20) {
  if (!query || query.trim().length === 0) {
    throw new Error("lcsc_search: query must not be empty");
  }

  const res = await fetch(LCSC_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      keyword: query,
      pageSize: Math.min(Math.max(limit, 1), 50),
      pageNum: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`LCSC search HTTP ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`LCSC search API error: code=${data.code} msg=${data.msg ?? "unknown"}`);
  }

  return (data.data?.list ?? []).map((it) => ({
    lcscId: String(it.lcscId ?? ""),
    mfrPart: it.componentModel,
    manufacturer: it.componentBrand,
    package: it.componentPackageType,
    stockCount: it.componentStockCount,
    basicPrice:
      typeof it.componentPrice === "string" ? parseFloat(it.componentPrice) : it.componentPrice,
    description: it.describe,
    datasheetUrl: it.datasheetUrl,
    symbolUuid: it.componentSymbolUuid,
    footprintUuid: it.componentFootprintUuid,
  }));
}

/** MCP tool definition for the synthetic lcsc_search tool. */
export const lcscSearchTool = {
  name: "lcsc_search",
  description:
    "Search the JLC 商城 (LCSC) component library by keyword (part number, value, package, etc.). Returns stock count, basic price, datasheet URL, and JLC library UUIDs. Use this to look up real parts before placing them on the schematic.",
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
