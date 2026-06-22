/**
 * Wire protocol between the plugin and the relay.
 * JSON-RPC 2.0 over WebSocket.
 */

export type ToolName = string; // e.g. "eda.sch_Document.addComponent"

export interface McpTool {
  name: ToolName;
  description: string;
  inputSchema: JsonSchema;
}

export type JsonSchema = {
  type: "object" | "string" | "number" | "integer" | "boolean" | "array" | "null";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: unknown[];
};

export interface ListToolsRequest {
  jsonrpc: "2.0";
  id: string;
  method: "tools/list";
}

export interface ListToolsResponse {
  jsonrpc: "2.0";
  id: string;
  result: { tools: McpTool[] };
}

export interface CallToolRequest {
  jsonrpc: "2.0";
  id: string;
  method: "tools/call";
  params: { name: ToolName; arguments?: Record<string, unknown> };
}

export interface CallToolResult {
  jsonrpc: "2.0";
  id: string;
  result: { content: McpContent[]; isError?: boolean };
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: string;
  error: { code: number; message: string; data?: unknown };
}

export type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; text?: string; mimeType?: string } };

/** All inbound messages (plugin side) */
export type RelayMessage =
  | ListToolsRequest
  | CallToolRequest
  | { jsonrpc: "2.0"; id?: string; method: string; params?: unknown };

/** All outbound messages (relay side) */
export type PluginMessage =
  | ListToolsResponse
  | CallToolResult
  | JsonRpcError
  | { jsonrpc: "2.0"; id?: string; result?: unknown; error?: { code: number; message: string } };
