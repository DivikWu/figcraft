# FigCraft — Agent Instructions

AI-powered Figma plugin. Bridges AI IDEs to Figma via MCP for design review, lint, audit, token sync, and inspection. Creation capabilities are delegated to the official Figma MCP. In endpoint mode, 4 additional core endpoint tools are available.

## API Mode (Endpoint)

FigCraft uses resource-oriented endpoints with method dispatch. Legacy flat tool names (e.g. `get_node_info`, `patch_nodes`) are registered as ghost tools that return migration guidance pointing to the equivalent endpoint method.

### Endpoint Mode

In endpoint mode, related operations are grouped under resource endpoints:

| Endpoint | Methods | Replaces |
|----------|---------|----------|
| `nodes` | `get`, `list`, `update`, `delete` | `get_node_info`, `search_nodes`, `patch_nodes`, `delete_nodes` |
| `text` | `set_content` | `set_text_content` |
| `components` | `list`, `list_library`, `get`, `list_properties` | `list_components`, `list_library_components`, `get_component`, `list_component_properties` |
| `variables_ep` | 12 methods | 12 flat variable tools (requires `load_toolset("variables")`) |
| `styles_ep` | 8 methods | 8 flat style tools (requires `load_toolset("styles")`) |

Endpoint call syntax: `nodes({ method: "get", nodeId: "1:23" })`

Standalone tools (not grouped into endpoints): `ping`, `get_mode`, `set_mode`, `join_channel`, `get_channel`, `export_image`, `lint_fix_all`, `set_current_page`, `save_version_history`, `set_selection`, `get_selection`, `get_current_page`, `get_document_info`, `list_fonts`, `audit_node`, `get_design_guidelines`

## Dynamic Toolsets

Core tools are enabled by default, including `audit_node` and `get_design_guidelines`. Load additional toolsets as needed:

| Toolset | Tools | When to load |
|---------|-------|-------------|
| `variables` | 19 | Managing Figma variables, collections, modes |
| `tokens` | 11 | Syncing DTCG design tokens |
| `styles` | 11 | Managing paint/text/effect styles |
| `components-advanced` | 13 | Building component libraries, managing variants |
| `library` | 7 | Importing from shared Figma libraries |
| `shapes-vectors` | 6 | Stars, polygons, sections, boolean ops, flatten |
| `annotations` | 4 | Adding, reading, and clearing annotations on nodes |
| `prototype` | 6 | Prototype interactions — get/add/remove/set reactions, analyze flows, batch-connect screens |
| `lint` | 4 | Fine-grained lint (beyond lint_fix_all) |
| `auth` | 3 | Figma OAuth setup |
| `pages` | 3 | Creating/renaming pages |
| `staging` | 4 | Staged workflow — preview changes before finalizing |

Use `load_toolset` to enable, `unload_toolset` to disable, `list_toolsets` to see status.
Load multiple at once: `load_toolset({ names: "tokens,variables" })`

> **Note:** Code generation, design system search, Code Connect, and canvas write capabilities are now provided by Figma Power (Kiro platform). FigCraft focuses on Plugin Channel capabilities: lint, audit, token sync, and node operations.

## Rules

### Tool Behavior

1. **Always `ping` first** — every Figma task starts with `ping`. If it fails, tell user to open the plugin. Do NOT call `figma_auth_status` or `get_document_info` as a first step.
2. **Complete the workflow in one turn** — chain all tool calls sequentially until you reach a `⛔ HARD STOP` checkpoint or the workflow ends. At `⛔ HARD STOP` you MUST output a text response and wait for the user's reply before proceeding — do NOT call any more tools. Violating a HARD STOP is a critical error.
3. **Prefer batch tools** — use `lint_fix_all` over `lint_check` + `lint_fix`. Use `nodes(method: "delete")` over individual delete calls.
4. **Parallelize independent calls** — when multiple tool calls have no data dependency on each other, call them in the same turn (e.g. multiple `components(method: "list_properties")` calls). This cuts total latency significantly.
5. **`nodes(method: "get")` accepts Figma URLs** — no need to call `get_document_info` first when user provides a URL.

### Layout & Design (Lint Rules Reference)

These rules are enforced by the Quality Engine lint system:

6. **No Spacer frames for spacing** — NEVER insert empty frames to create variable spacing. Group related elements into semantic auto-layout frames where each group has its own `itemSpacing`.
7. **Use `layoutAlign: STRETCH` for responsive children** — input fields, buttons, dividers, lines, and content sections inside auto-layout containers MUST use STRETCH.
8. **Filled elements with margin need a wrapper** — when any element has a background fill and needs horizontal margin, use a transparent wrapper frame with padding.
9. **Full-bleed system bars** — system bars sit flush at the top edge with zero padding on the page-level frame.
10. **Mobile screen dimensions** — iOS → 402×874 (iPhone 16 Pro), Android → 412×915.
11. **Buttons must be proper auto-layout frames** — with CENTER alignment, explicit height (≥ 44pt iOS / ≥ 48dp Android), and internal padding.
12. **No text overflow or truncation** — all text nodes MUST fit within their parent container.
13. **Input fields are auto-layout frames** — with stroke, corner radius, internal padding, and a text child for placeholder.
14. **Semantic frame naming** — every frame MUST have a descriptive name reflecting its purpose.
15. **Form children consistency** — ALL interactive children in a form MUST use `layoutAlign: STRETCH`.
16. **No HUG/STRETCH paradox** — NEVER set a frame to HUG on the cross-axis while its children use STRETCH.
17. **FILL requires auto-layout parent** — NEVER use FILL sizing on a child whose parent has no auto-layout.
18. **Every frame with 2+ children MUST have auto-layout** — except decorative overlays where overlap is intentional.
19. **Children must not overflow parent** — every child's cross-axis dimension must fit within the parent's inner space.

## Workflows

### Inspect Design
`ping` → `get_current_page(maxDepth=2)` → `nodes(method: "get")` for details
Use when user asks to **inspect/review/analyze** existing elements.

### Design Lint
`ping` → `lint_fix_all`

### Token Sync
`ping` → `load_toolset({ names: "tokens" })` → `list_tokens` → `diff_tokens` → `sync_tokens`

### Components
`ping` → `components(method: "list")` or `components(method: "list_library")`

### Multi-Document
`join_channel(newId)` → `ping`

## Architecture

FigCraft operates on a single Plugin Channel:

```
                              ┌─ Plugin Channel ─┐
IDE → MCP Server (stdio) ──→ │ WS Relay (:3055) → Figma Plugin │  (lint, audit, token sync, node ops)
                              └──────────────────┘
```

- Plugin Channel: WebSocket relay to Figma Plugin sandbox. Required for lint/audit (needs full node tree traversal).
- `ping` checks Plugin Channel connectivity and reports status.
- Code generation, design system search, Code Connect, and canvas write are provided by Figma Power (Kiro platform), not by FigCraft.

## Dual Mode

| Mode | Token Source |
|------|-------------|
| **library** | Figma shared library |
| **spec** | DTCG JSON files |

Switch via `set_mode`.

## Access Control

3-tier access control via `FIGCRAFT_ACCESS` env var:

| Level | Env Value | Allowed Tools |
|-------|-----------|---------------|
| **read** | `FIGCRAFT_ACCESS=read` | Read-only tools (inspect, export, search, `set_mode`, `save_version_history`). All write tools disabled. |
| **create** | `FIGCRAFT_ACCESS=create` | Read + tools that add NEW content. Edit/delete tools disabled. `lint_fix_all` is edit-level (modifies existing nodes). |
| **edit** | `FIGCRAFT_ACCESS=edit` (default) | Full access — all tools enabled. |

Legacy: `FIGCRAFT_READ_ONLY=true` is equivalent to `FIGCRAFT_ACCESS=read`.

Each write tool in `schema/tools.yaml` has an `access` field (`create` or `edit`):
- `access: create` — adds new content without modifying existing nodes
- `access: edit` — modifies or deletes existing content
- Non-write tools (`write: false`) — available at all access levels

The schema compiler generates `GENERATED_CREATE_TOOLS` and `GENERATED_EDIT_TOOLS` sets in `_registry.ts`. The toolset manager uses these to disable tools at startup and block them from being loaded via `load_toolset`.

In endpoint mode, method-level access control is enforced at runtime. Endpoint descriptions dynamically indicate which methods are blocked at the current access level.

## Build & Test

```bash
npm run build          # Build all (runs schema compiler first)
npm run build:plugin   # Build Figma plugin only
npm run schema         # Regenerate tool registry from YAML
npm run typecheck      # TypeScript type check
npm run test           # Run unit tests (vitest)
```

## Tool Schema (Single Source of Truth)

All tool definitions live in `schema/tools.yaml`. The schema compiler (`scripts/compile-schema.ts`) generates:
- `packages/core-mcp/src/tools/_registry.ts` — package-owned generated registry (authoritative runtime copy)
- `packages/core-mcp/src/tools/_generated.ts` — package-owned generated bridge/endpoint schemas (authoritative runtime copy)

Endpoint tools use `handler: endpoint` in the YAML with a `methods` map. Each method specifies `maps_to` (the flat tool it replaces), `write`, `access`, and `params`.

Run `npm run schema` after editing `schema/tools.yaml`. The `build` script runs it automatically.
New tool work should target `packages/core-mcp/src/tools/` and `packages/adapter-figma/src/handlers/`.

## Adding New Tools

1. Handler in `packages/adapter-figma/src/handlers/` → import in `packages/adapter-figma/src/code.ts`
2. Add tool definition to `schema/tools.yaml` (toolset, write flag, access level, handler type, params)
3. If `handler: custom` — write MCP wrapper in `packages/core-mcp/src/tools/`, register in `packages/core-mcp/src/tools/toolset-manager.ts`
4. If `handler: bridge` — tool is auto-generated; just add the YAML entry
5. If `handler: endpoint` — add method definitions with `maps_to`, implement dispatch in `packages/core-mcp/src/tools/endpoints.ts`
6. Run `npm run schema` to regenerate registry

## Adding New Lint Rules

1. Rule in `packages/quality-engine/src/rules/` implementing `LintRule`
2. Register in `packages/quality-engine/src/engine.ts` `ALL_RULES`
3. Fix logic in `packages/adapter-figma/src/handlers/lint.ts` if `autoFixable`

## Constraints

- Plugin UI: pure HTML/CSS in `packages/adapter-figma/src/ui.html` — no frameworks
- Linter runs in Plugin sandbox, not MCP Server
- DTCG parsing runs only on MCP Server
- Composite tokens (typography/shadow) → Figma Styles, not Variables
- UI creation is delegated to the official Figma MCP — FigCraft focuses on review, lint, audit, and token sync
