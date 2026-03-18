# FigCraft — Agent Instructions

AI-powered Figma plugin. Bridges AI IDEs to Figma via MCP with 65+ tools.

**Always use the figcraft MCP server** when the user asks about Figma operations, design system tasks, or design token management.

## Architecture

```
IDE (Kiro / Cursor / Claude Code / Antigravity / Codex)
    │ MCP (stdio)
    ▼
MCP Server (Node.js)           ← src/mcp-server/
    │ WebSocket
    ▼
WS Relay (port 3055)           ← src/relay/
    │ WebSocket
    ▼
Figma Plugin (sandbox + UI)    ← src/plugin/
```

- **code.js sandbox**: Figma Plugin API access, no network
- **ui.html iframe**: WebSocket to relay, no Figma API
- Communication via `postMessage`

## Key Workflows

1. **Test connection**: `ping` first to verify plugin is connected
2. **Create elements**: `get_mode` → `create_document` (batch) or `create_frame`/`create_text`
3. **Design lint**: `lint_check` → `lint_fix` for auto-fixable issues
4. **Token sync**: `list_tokens` → `diff_tokens` → `sync_tokens`
5. **Components**: `list_components`, `create_instance`, `audit_components`

## Dual Mode

| Mode | Token Source | Use Case |
|------|-------------|----------|
| **library** | Figma shared library | Daily design with team library |
| **spec** | DTCG JSON files | Spec-driven validation |

Switch via `set_mode` tool or plugin UI.

## Build & Test

```bash
npm run build          # Build all
npm run build:plugin   # Build Figma plugin only
npm run typecheck      # TypeScript type check
npm run test           # Run unit tests (vitest)
```

## Adding New Tools

1. Create handler in `src/plugin/handlers/` using `registerHandler(method, handler)`
2. Import handler in `src/plugin/code.ts`
3. Create MCP tool wrapper in `src/mcp-server/tools/`
4. Import and register in `src/mcp-server/index.ts`

## Adding New Lint Rules

1. Create rule in `src/plugin/linter/rules/` implementing `LintRule` interface
2. Register in `src/plugin/linter/engine.ts` `ALL_RULES` array
3. Add fix logic in `src/plugin/handlers/lint.ts` if `autoFixable`

## Constraints

- Plugin UI is pure HTML/CSS inline in `src/plugin/ui.html` — no CSS/UI frameworks
- Linter runs in the Plugin sandbox, not the MCP Server
- DTCG parsing runs only on the MCP Server side
- Composite types (typography/shadow) map to Figma Styles, not Variables
- Batch operations use `items[]` + per-item error handling

## Environment

- `FIGCRAFT_CHANNEL` — channel ID (default: `figcraft`)
- `FIGCRAFT_RELAY_PORT` — relay port (default: `3055`, auto-switches to 3056-3060)
- `FIGMA_API_TOKEN` — Figma PAT (optional, can be set in plugin UI or via OAuth)
