/**
 * LCSC (JLC 商城) component search.
 * Calls the public JLC search API directly from the relay (Node.js side).
 * The plugin side does NOT call this — the relay adds these as additional tools.
 */
const LCSC_SEARCH_URL = "https://www.jlc.com/api/eda/v2/common/lightSearch";

export interface LcscSearchItem {
  lcscId: string;
  mfrPart?: string;
  package?: string;
  manufacturer?: string;
  basicPrice?: number;
  stockCount?: number;
  description?: string;
  datasheetUrl?: string;
  symbolUuid?: string;
  footprintUuid?: string;
}

export async function searchLcsc(query: string, limit = 20): Promise<LcscSearchItem[]> {
  if (!query || query.trim().length === 0) {
    throw new Error("searchLcsc: query must not be empty");
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

  const data = (await res.json()) as {
    code?: number;
    msg?: string;
    data?: {
      list?: Array<{
        lcscId?: number | string;
        componentModel?: string;
        componentBrand?: string;
        componentPackageType?: string;
        componentStockCount?: number;
        componentPrice?: number | string;
        describe?: string;
        datasheetUrl?: string;
        componentSymbolUuid?: string;
        componentFootprintUuid?: string;
      }>;
    };
  };

  if (data.code !== 0) {
    throw new Error(`LCSC search API error: code=${data.code} msg=${data.msg ?? "unknown"}`);
  }

  return (data.data?.list ?? []).map((it) => ({
    lcscId: String(it.lcscId ?? ""),
    mfrPart: it.componentModel,
    manufacturer: it.componentBrand,
    package: it.componentPackageType,
    stockCount: it.componentStockCount,
    basicPrice: typeof it.componentPrice === "string" ? parseFloat(it.componentPrice) : it.componentPrice,
    description: it.describe,
    datasheetUrl: it.datasheetUrl,
    symbolUuid: it.componentSymbolUuid,
    footprintUuid: it.componentFootprintUuid,
  }));
}
