/**
 * Auto-generate MCP tool definitions from the JLC EDA Pro pro-api surface.
 *
 * The `eda` global exposes class instances (sys_WebSocket, sch_Document, etc.).
 * Each public method of these classes becomes one MCP tool.
 *
 * v1: we enumerate all methods of the configured exposable classes, generate
 * a tool per method with a generic object inputSchema. Tight schemas come in
 * v2 once we have usage data.
 */
import type { McpTool, JsonSchema, ToolName } from "./protocol.ts";

type EdaGlobal = typeof globalThis extends { eda: infer T } ? T : Record<string, never>;

/** Class property names on `eda` we want to expose as MCP tool groups. */
const EXPOSABLE_PROPERTIES: ReadonlyArray<keyof EdaGlobal> = [
  // System
  "sys_ClientUrl",
  "sys_Dialog",
  "sys_Environment",
  "sys_FileManager",
  "sys_FileSystem",
  "sys_FontManager",
  "sys_FormatConversion",
  "sys_HeaderMenu",
  "sys_I18n",
  "sys_IFrame",
  "sys_LoadingAndProgressBar",
  "sys_Log",
  "sys_Message",
  "sys_MessageBox",
  "sys_MessageBus",
  "sys_PanelControl",
  "sys_RightClickMenu",
  "sys_Setting",
  "sys_ShortcutKey",
  "sys_Storage",
  "sys_Timer",
  "sys_ToastMessage",
  "sys_Tool",
  "sys_Unit",
  "sys_WebSocket",
  "sys_Window",

  // Document tree
  "dmt_Board",
  "dmt_EditorControl",
  "dmt_Event",
  "dmt_Folder",
  "dmt_Panel",
  "dmt_Pcb",
  "dmt_Project",
  "dmt_Schematic",
  "dmt_SelectControl",
  "dmt_Team",
  "dmt_Workspace",

  // Library
  "lib_3DModel",
  "lib_Cbb",
  "lib_Classification",
  "lib_Device",
  "lib_Footprint",
  "lib_LibrariesList",
  "lib_PanelLibrary",
  "lib_SelectControl",
  "lib_Symbol",

  // Schematic
  "sch_Document",
  "sch_Drc",
  "sch_Event",
  "sch_ManufactureData",
  "sch_Net",
  "sch_Netlist",
  "sch_Primitive",
  "sch_PrimitiveArc",
  "sch_PrimitiveAttribute",
  "sch_PrimitiveBus",
  "sch_PrimitiveCircle",
  "sch_PrimitiveComponent",
  "sch_PrimitivePin",
  "sch_PrimitivePolygon",
  "sch_PrimitiveRectangle",
  "sch_PrimitiveText",
  "sch_PrimitiveWire",
  "sch_SelectControl",
  "sch_SimulationEngine",
  "sch_Utils",
  "sch_PrimitiveObject",

  // PCB
  "pcb_Document",
  "pcb_Drc",
  "pcb_Event",
  "pcb_Layer",
  "pcb_ManufactureData",
  "pcb_MathPolygon",
  "pcb_Net",
  "pcb_Primitive",
  "pcb_PrimitiveArc",
  "pcb_PrimitiveAttribute",
  "pcb_PrimitiveComponent",
  "pcb_PrimitiveDimension",
  "pcb_PrimitiveFill",
  "pcb_PrimitiveImage",
  "pcb_PrimitiveLine",
  "pcb_PrimitiveObject",
  "pcb_PrimitivePad",
  "pcb_PrimitivePolyline",
  "pcb_PrimitivePour",
  "pcb_PrimitivePoured",
  "pcb_PrimitiveRegion",
  "pcb_PrimitiveString",
  "pcb_PrimitiveVia",
  "pcb_RayTracerEngine",
  "pcb_SelectControl",

  // Panel
  "pnl_Document",
] as const;

const SKIP_METHODS: ReadonlySet<string> = new Set([
  // JS/TS runtime noise
  "constructor",
  "toJSON",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  // internal EDA hooks
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "__proto__",
  // extension identity (handled by host)
  "extensionUuid",
]);

const genericArgsSchema: JsonSchema = {
  type: "object",
  description:
    "Arguments to pass to the pro-api method. Keys + values depend on the method; see JLC EDA Pro API reference for exact parameter names and types.",
  additionalProperties: true,
};

/**
 * Walk an `eda` instance and produce one MCP tool per public method of each
 * exposable class.
 */
export function autoGenerateTools(eda: Record<string, unknown>): McpTool[] {
  const tools: McpTool[] = [];

  for (const prop of EXPOSABLE_PROPERTIES) {
    const instance = eda[prop as string];
    if (!instance) continue;

    const className = String(prop);
    const proto = Object.getPrototypeOf(instance);
    const methodNames = collectMethodNames(proto);

    for (const method of methodNames) {
      const toolName: ToolName = `eda.${className}.${method}`;
      tools.push({
        name: toolName,
        description: `Call eda.${className}.${method}() on the JLC EDA Pro API. Args follow the pro-api reference (https://prodocs.lceda.cn/cn/api/reference/pro-api.html).`,
        inputSchema: genericArgsSchema,
      });
    }
  }

  return tools;
}

function collectMethodNames(proto: object): string[] {
  const seen = new Set<string>();
  let current: object | null = proto;
  while (current && current !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (SKIP_METHODS.has(name)) continue;
      if (name.startsWith("_")) continue;
      const value = (current as Record<string, unknown>)[name];
      if (typeof value !== "function") continue;
      seen.add(name);
    }
    current = Object.getPrototypeOf(current);
  }
  return [...seen].sort();
}
