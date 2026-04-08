# Project: FigCraft

AI-powered Figma plugin that lets AI follow design specs to create designs. Bridges IDEs to Figma via MCP protocol, supporting two spec sources (Figma Shared Library / DTCG design spec documents). Provides Token sync, spec Lint, auto-fix, and element generation.

Standalone product — not tied to any specific design system. Works with any team's DTCG Token files or Figma Libraries.

## ⛔ Figma UI Creation — Tool-Driven Mandatory Flow

Creation flow is enforced by MCP tools at runtime. All IDEs share the same rules.
Call `get_mode` to get `_workflow`, follow `_workflow` steps.

Rules single source of truth (update MCP tool code → all IDEs auto-update):
- Creation flow + design checklist → `get_mode._workflow`
- Opinion Engine → `get_creation_guide(topic:"opinion-engine")`
- UI type templates → `get_creation_guide(topic:"ui-patterns", uiType:"xxx")`
- Design rules → `get_design_guidelines(category)`
- Multi-screen flow → `get_creation_guide(topic:"multi-screen")`
- Responsive Web → `get_creation_guide(topic:"responsive")`
- Content states → `get_creation_guide(topic:"content-states")`

> Do NOT duplicate these rules in CLAUDE.md or IDE config files. Rules are implemented in `packages/core-mcp/src/tools/logic/mode-logic.ts`.

## Stack

- TypeScript (strict, ESM)
- MCP Server: @modelcontextprotocol/sdk + stdio transport
- WebSocket Relay: ws (port 3055-3060, auto-switch)
- Figma Plugin: Plugin API (code.js sandbox + ui.html iframe)
- Build: tsup (Plugin IIFE + Server ESM)
- Schema: Zod (MCP tool parameter validation)
- Package manager: npm

IMPORTANT: Do NOT install additional CSS/UI frameworks. Plugin UI is pure HTML/CSS inline in ui.html.

## Commands

```bash
npm run dev:relay      # Start WebSocket relay server (port 3055)
npm run dev:mcp        # Start MCP Server (stdio transport)
npm run build          # Build all (tsup)
npm run build:plugin   # Build Figma Plugin (IIFE bundle)
npm run build:server   # Build MCP Server + Relay (ESM)
npm run typecheck      # TypeScript type checking
npm run test           # Run unit tests (vitest)
npm run test:watch     # Test watch mode
```

## Architecture

### Three-Component Relay Architecture

```
IDE (Kiro / Cursor / Claude Code / Antigravity / Codex)
    │ MCP (stdio)
    ▼
MCP Server (Node.js)           ← packages/core-mcp/src/
    │ WebSocket
    ▼
WS Relay (port 3055)           ← packages/relay/src/
    │ WebSocket
    ▼
Figma Plugin
    ├─ UI iframe                ← packages/adapter-figma/src/ui.html
    │     │ postMessage              (WebSocket connection + message bridge)
    │     ▼
    └─ code.js sandbox          ← packages/adapter-figma/src/code.ts
         (Figma Plugin API)          (command dispatch + handler registration)
```

Key constraints:
- **code.js sandbox** can call Figma Plugin API but has no network access
- **ui.html iframe** has browser APIs (WebSocket) but cannot call Figma API
- They communicate via `postMessage`

### Channel Routing

Each Figma document session generates a random channel ID. MCP Server joins the same channel for multi-session isolation. Plugin UI displays the channel ID for MCP Server configuration.

### Request Tracking

Each MCP command gets a UUID. Plugin responses carry the UUID back for correlation. 30-second timeout + 30-second heartbeat.

## Directory Structure

```
figcraft/
├── CLAUDE.md
├── package.json                    # private workspace root
├── manifest.json                   # generated root-compatible plugin manifest
├── schema/tools.yaml               # tool definitions single source of truth
├── scripts/
│   ├── compile-schema.ts           # tools.yaml → generates tool registry
│   └── compile-content.ts          # content/ → generates _guides/_prompts/_templates
├── skills/                         # Skills (IDE discovery, flat structure)
│   ├── ui-ux-fundamentals/         # design rules (MCP Server source of truth)
│   ├── design-creator/
│   ├── design-guardian/
│   ├── figma-create-ui/            # declarative creation flow
│   └── figma-use/ ...              # (see skills/ for full list)
├── content/                        # editable content assets (YAML/Markdown)
│   ├── ide-shared/                 # shared snippets injected into IDE config files
│   ├── templates/*.yaml            # UI templates → _templates.ts
│   ├── guides/*.md                 # creation guides → _guides.ts
│   └── prompts/*.yaml              # MCP Prompts → _prompts.ts
├── packages/
│   ├── figcraft-design/src/        # published CLI shell
│   ├── core-mcp/src/               # MCP Server runtime, bridge, tools, prompts
│   ├── relay/src/                  # WebSocket Relay
│   ├── shared/src/                 # shared protocol, types, version
│   ├── quality-engine/src/         # lint rules and quality engine
│   └── adapter-figma/
│       ├── manifest.base.json      # plugin manifest source of truth
│       ├── build.plugin.mjs        # generates root manifest + dist/plugin/*
│       └── src/                    # Plugin code, handlers, adapters, utils
├── tests/
│   ├── contracts/                  # monorepo/public surface guards
│   └── ...
└── dist/                           # build output (.gitignore)
```

## Dual Mode Operation

Manual switch via `set_mode` / `get_mode` tools:

| Mode | Token Source | Lint Method | Typical Use |
|------|-------------|-------------|-------------|
| **library** | Figma Shared Library Variables/Styles | Checks if nodes are bound to Library Variable/Style | Daily design with team shared library |
| **spec** | DTCG JSON files | Checks if node values match DTCG Token values | Sync from design spec documents, verify compliance |

## MCP Tool System

MCP tools are split into core (always loaded) and optional toolsets (on-demand via `load_toolset`), with resource endpoints.

- Tool definitions single source of truth: `schema/tools.yaml`
- Run `npm run schema` to regenerate registry
- AI calls `list_toolsets` to see full tool list and loading status
- Quality engine: lint rules + auto-fix (`packages/quality-engine/src/rules/`)
- Content assets: `content/` YAML/Markdown → `npm run content` generates TypeScript (see `docs/asset-maintenance.md`)

<!-- @inject-start: ide-shared/toolsets.md -->
Core tools are always enabled. Load additional toolsets as needed via `load_toolset`:

| Toolset | When to load |
|---------|-------------|
| `variables` | Managing Figma variables, collections, modes |
| `tokens` | Syncing DTCG design tokens |
| `styles` | Managing paint/text/effect styles |
| `components-advanced` | Building component libraries, managing variants |
| `library-import` | Importing library variables, styles, and components into local file (design system authoring, NOT for UI creation in library mode) |
| `shapes-vectors` | Stars, polygons, sections, boolean ops, flatten |
| `annotations` | Adding, reading, and clearing annotations on nodes |
| `prototype` | Prototype interactions, flow analysis, batch-connect screens |
| `lint` | Fine-grained lint (beyond lint_fix_all) |
| `auth` | Figma OAuth setup |
| `pages` | Creating/renaming pages |
| `staging` | Staged workflow — preview changes before finalizing |
| `debug` | execute_js (raw Plugin API) |

Use `list_toolsets` to see current status. Load multiple: `load_toolset({ names: "tokens,variables" })`.
<!-- @inject-end -->

<!-- @inject-start: ide-shared/endpoints.md -->
Resource-oriented endpoints with method dispatch:

| Endpoint | Methods |
|----------|---------|
| `nodes` | `get`, `get_batch`, `list`, `update`, `delete`, `clone`, `reparent` |
| `text` | `set_content`, `set_range` |
| `components` | `list`, `list_library`, `get`, `list_properties` |
| `variables_ep` | `list`, `get`, `list_collections`, `get_bindings`, `set_binding`, `create`, `update`, `delete`, `create_collection`, `delete_collection`, `batch_create`, `export` (requires `load_toolset("variables")`) |
| `styles_ep` | `list`, `get`, `create_paint`, `update_paint`, `update_text`, `update_effect`, `delete`, `sync` (requires `load_toolset("styles")`) |

Call syntax: `nodes({ method: "get", nodeId: "1:23" })`
<!-- @inject-end -->

## DTCG → Figma Type Mapping

| DTCG $type | Figma Target | Scope Inference |
|------------|-------------|-----------------|
| `color` | Variable (COLOR) | ALL_FILLS + STROKE_COLOR + EFFECT_COLOR |
| `dimension` / `number` | Variable (FLOAT) | Inferred by name: radius→CORNER_RADIUS, spacing→GAP, font-size→FONT_SIZE |
| `fontFamily` | Variable (STRING) | FONT_FAMILY |
| `fontWeight` | Variable (FLOAT) | FONT_WEIGHT |
| `boolean` | Variable (BOOLEAN) | ALL_SCOPES |
| `typography` | **Text Style** | N/A (compound type — decomposed into individual Variables + Style created) |
| `shadow` | **Effect Style** | N/A (compound type) |

## Plugin Handler Registration Pattern

All handlers are registered to a global Map via `registerHandler(method, handler)`. Handler files auto-register via import side effects.

> **Note**: Plugin-side handler method names (e.g. `get_node_info`, `patch_nodes`) are internal bridge protocol names, unrelated to MCP tool names. The MCP layer uses endpoint mode (e.g. `nodes(method: "get")`), and endpoints internally call Plugin handlers via `bridge.request('get_node_info', ...)`.

```typescript
// packages/adapter-figma/src/handlers/nodes.ts
import { registerHandler } from '../code.js';

// Internal bridge protocol name — NOT an MCP tool name
registerHandler('get_node_info', async (params) => {
  // ... Figma API calls
});
```

Adding a new handler:
1. Create file in `packages/adapter-figma/src/handlers/`
2. Use `registerHandler` to register (internal bridge protocol name)
3. Add `import './handlers/xxx.js'` in `packages/adapter-figma/src/code.ts`
4. Add tool definition in `schema/tools.yaml` (endpoint or standalone)

## Adding New MCP Tools

New tools are defined via `schema/tools.yaml`, supporting three handler types:

1. **`handler: bridge`** — auto-generated, YAML definition only, no hand-written MCP wrapper needed
2. **`handler: endpoint`** — resource endpoint, define `methods` map in YAML, dispatch in `packages/core-mcp/src/tools/endpoints.ts`
3. **`handler: custom`** — hand-written MCP wrapper in `packages/core-mcp/src/tools/`, registered in `toolset-manager.ts`

Run `npm run schema` to regenerate registry.

## Adding New Lint Rules

1. Create file in `packages/quality-engine/src/rules/`, implement `LintRule` interface
2. Register in `ALL_RULES` array in `packages/quality-engine/src/engine.ts`
3. `check()` method receives `AbstractNode` (decoupled from Figma API), returns `LintViolation[]`
4. Set `autoFixable: true` + `fixData` for auto-fix support
5. Add fix logic in `packages/adapter-figma/src/handlers/lint.ts` `lint_fix` handler

## IDE Diagnostic Notes

Plugin files (`packages/adapter-figma/src/**`) will show "Cannot find name" errors for `figma`, `__html__` and other globals in IDEs. This is normal — these globals are injected by the Figma Plugin runtime, `@figma/plugin-typings` provides type definitions, and the Plugin uses a separate `tsconfig.plugin.json`.

Server-side type checking: `npm run typecheck` (uses main `tsconfig.json`, excludes plugin files).

## Environment Variables

```env
FIGCRAFT_RELAY_URL=ws://localhost:3055    # Relay address (default, usually no need to set)
FIGCRAFT_RELAY_PORT=3055                  # Relay preferred port (default 3055, auto-switches to 3056-3060 if occupied)
FIGCRAFT_CHANNEL=figcraft                 # Default channel (both Plugin and MCP Server default to figcraft)
FIGMA_API_TOKEN=figd_xxx                  # Figma Personal Access Token (optional, can also be configured in plugin panel)
FIGMA_CLIENT_ID=xxx                       # OAuth 2.0 Client ID (optional, for figma_login)
FIGMA_CLIENT_SECRET=xxx                   # OAuth 2.0 Client Secret (optional, for figma_login)
```

> **Note**: `FIGMA_API_TOKEN` has three configuration methods (priority high to low):
> 1. Environment variable `FIGMA_API_TOKEN`
> 2. API Token input in FigCraft plugin panel (stored in Figma clientStorage, passed to MCP Server via WebSocket)
> 3. OAuth login (`figma_login` tool, requires `FIGMA_CLIENT_ID` + `FIGMA_CLIENT_SECRET`)

## Running

### User Usage (after npm package published)

```bash
# Configure MCP Server in IDE (no need to clone source):
# {
#   "mcpServers": {
#     "figma-desktop": {
#       "url": "http://127.0.0.1:3845/mcp",
#       "type": "http"
#     },
#     "figcraft": {
#       "command": "npx",
#       "args": ["figcraft-design"]
#     }
#   }
# }
# figma-desktop: Figma official desktop MCP (design-to-code, Code Connect, screenshots)
#   Requires: Figma desktop app → Shift+D (Dev Mode) → Enable MCP Server
# figcraft: FigCraft (declarative creation, lint, token sync, audit)
#   Requires: FigCraft plugin loaded in Figma
```

### Development

```bash
# 1. Load plugin in Figma desktop app
# Plugins → Development → Import plugin from manifest → select manifest.json
# (requires npm run build:plugin to build dist/plugin/ first)

# 2. Configure MCP Server in IDE (no need to manually start Relay, MCP Server auto-embeds it):
# {
#   "mcpServers": {
#     "figma-desktop": {
#       "url": "http://127.0.0.1:3845/mcp",
#       "type": "http"
#     },
#     "figcraft": {
#       "command": "npx",
#       "args": ["tsx", "packages/figcraft-design/src/index.ts"],
#       "cwd": "/path/to/figcraft"
#     }
#   }
# }

# Optionally start Relay separately (for debugging):
npm run dev:relay
```

### End-to-End Verification

1. Open plugin in Figma → UI auto-detects Relay port and connects
2. IDE starts MCP Server → auto-embeds Relay (or connects to existing Relay) → `ping` tool returns document name and page info

> **Note**: Plugin and MCP Server default to `figcraft` channel — zero config for single-document scenarios. For multi-document, use `join_channel` tool or `FIGCRAFT_CHANNEL` env var. Relay port defaults to 3055, auto-switches to 3056-3060 if occupied.

## Relationship with design-guidelines Project

figcraft is a standalone product. The design-guidelines project's DTCG Token files are one optional source for figcraft:

```
design-guidelines/
  ├── tokens/*.json          # Token source files
  └── mcp-server/            # Design spec query MCP Server (independent of figcraft)

figcraft/
  └── sync_tokens(filePath)  # Can point to design-guidelines token files
```

## Constraints

<!-- @inject-start: ide-shared/constraints.md -->
Key architectural constraints:

- Plugin UI is pure HTML/CSS inline in ui.html — no frontend frameworks
- Linter runs in Plugin side (not MCP Server) — avoids transmitting large node data over WebSocket
- DTCG parsing runs in MCP Server only — Plugin receives parsed `DesignToken[]`
- Composite types (typography/shadow) map to Figma Styles, not Variables — Figma Variables don't support compound types
- `figma.teamLibrary` API can enumerate Library Variables but not Library Styles (REST API supplement needed)
- Plugin API bypasses REST API Enterprise restrictions — Variable writes work on all Figma plans
- Batch operations use `items[]` + per-item error handling — single-item failure doesn't block batch
- Token sync is idempotent — second run: created=0
<!-- @inject-end -->
