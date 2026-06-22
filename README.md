# LCEDA AI MCP

A JLC EDA Pro extension that exposes the entire pro-api as MCP (Model Context Protocol) tools, so any MCP-compatible AI agent (Claude Desktop, Cursor, Mavis CLI, etc.) can drive the EDA by conversation.

## Architecture

```
[ MCP client (Claude Desktop / Cursor / Mavis CLI) ]
        │ stdio (MCP protocol, JSON-RPC 2.0)
        ▼
[ @lceda/mcp-relay ]  ← Node.js, spawned by client via `command` field
        │ WebSocket (ws://localhost:7842)
        ▼
[ LCEDA AI MCP plugin (this repo) ]
        │ pro-api
        ▼
[ JLC EDA Pro ]
```

The MCP client auto-spawns the relay on first use; the plugin polls `ws://localhost:7842` and connects when the relay appears. No background daemon runs when the AI is idle.

## Install (developer setup)

1. Install JLC EDA Pro 2.3+ desktop client
2. `npm install`
3. `npm run build` → produces `dist/index.js` (plugin entry) and `bin/mcp-relay.mjs`
4. In EDA: Extensions → Install from disk → select this folder
5. Configure your MCP client (see `docs/mcp-client-config.md`)

## Configure MCP client

Add to your MCP client config (e.g. `~/.config/claude/mcp.json`):

```json
{
  "mcpServers": {
    "lceda": {
      "command": "npx",
      "args": ["-y", "lceda-mcp-relay"]
    }
  }
}
```

The relay auto-launches JLC EDA Pro if it isn't running.

## v1 scope

Schematic capture end-to-end via AI:

- Search components (LCSC mall API)
- Place components on schematic
- Connect pins with wires
- Annotate reference designators
- Run ERC
- Read schematic state

PCB layout tools will follow in v2.

## v1 tool surface

**All** pro-api public methods are auto-exposed as MCP tools (no manual curation). The LLM picks the right tool. If the tool set is too noisy, we add curation in v2 based on actual usage data.

## Project layout

```
src/
├── index.ts                 # plugin entry, lifecycle hooks
├── bridge/
│   └── ws-client.ts         # SYS_WebSocket client, polls localhost:7842
├── mcp/
│   ├── tool-auto-gen.ts     # pro-api methods → MCP tool list
│   ├── tool-executor.ts     # MCP tool call → pro-api call
│   └── lcsc-search.ts       # JLC mall REST API search
└── lifecycle.ts             # start/stop wiring

bin/
└── mcp-relay.mjs            # WebSocket server + MCP stdio bridge (separate npm package later)

scripts/
├── build.mjs                # esbuild plugin + relay
├── dev.mjs                  # watch mode
└── clean.mjs
```

## License

Apache-2.0
