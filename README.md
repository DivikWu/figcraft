# FigCraft

AI-powered Figma plugin for design system compliance. Token sync, lint, auto-fix, and element generation via MCP.

## Features

- **60+ MCP tools** — read/write nodes, variables, styles, components, tokens
- **23 lint rules** — token compliance, WCAG accessibility, layout structure, naming, component health
- **DTCG token sync** — W3C Design Token Community Group format, multi-mode support
- **Auto-fix** — one-click fix for token binding, spacing, radius, text size violations
- **Dual mode** — Library mode (Figma shared library) or Spec mode (DTCG JSON files)
- **Prototype analysis** — flow diagrams (Mermaid) + interaction documentation

## Quick Start

### 1. Install the Figma Plugin

Import the plugin from `manifest.json` in Figma Desktop:
**Plugins → Development → Import plugin from manifest**

### 2. Configure your IDE

Add to your MCP config (Claude, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "npx",
      "args": ["figcraft"]
    }
  }
}
```

### 3. Connect

Open the plugin in Figma — both sides auto-connect via the WebSocket relay.

## Architecture

```
IDE (Claude/Cursor)
    │ MCP (stdio)
    ▼
MCP Server (Node.js)
    │ WebSocket
    ▼
WS Relay (port 3055)
    │ WebSocket
    ▼
Figma Plugin (code.js sandbox + UI iframe)
```

## Development

```bash
npm install
npm run build          # Build all (MCP server + relay + plugin)
npm run build:plugin   # Build Figma plugin only
npm run typecheck      # TypeScript type check
npm run test           # Run unit tests
```

For development with hot reload:

```bash
npm run dev:relay      # Start WebSocket relay
npm run dev:mcp        # Start MCP server (stdio)
```

Configure your IDE to use the dev server:

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server/index.ts"],
      "cwd": "/path/to/figcraft"
    }
  }
}
```

## Dual Mode

| Mode | Token Source | Lint Behavior | Use Case |
|------|-------------|---------------|----------|
| **Library** | Figma shared library | Check variable/style bindings | Daily design with team library |
| **Spec** | DTCG JSON files | Check values against token specs | Spec-driven validation |

Switch modes via `set_mode` tool or the plugin UI.

## Lint Rules (23)

**Token compliance**: spec-color, spec-typography, spec-spacing, spec-border-radius, hardcoded-token, no-text-style

**WCAG accessibility**: wcag-contrast (AA), wcag-contrast-enhanced (AAA), wcag-target-size, wcag-text-size, wcag-line-height, wcag-non-text-contrast

**Layout**: no-autolayout, fixed-in-autolayout, empty-container, overlapping-children, max-nesting-depth, missing-responsive

**Naming**: default-name, stale-text-name

**Component**: component-bindings, no-text-property, consistent-icon-size

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FIGCRAFT_RELAY_PORT` | Relay WebSocket port | `3055` |
| `FIGCRAFT_CHANNEL` | Default channel ID | `figcraft` |
| `FIGMA_API_TOKEN` | Figma Personal Access Token | — |

## License

MIT
