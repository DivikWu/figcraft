# FigCraft — Agent Instructions

AI-powered Figma plugin. Bridges AI IDEs to Figma via MCP for design review, lint, audit, token sync, UI creation, and inspection. Pure declarative architecture: all UI creation uses `create_frame` + `children`, `create_text`, `text(method: "set_range")`, `group_nodes`, and `nodes(method: "update")`. `execute_js` is in the `debug` toolset — not available by default.

## ⛔ Figma UI Creation — Mandatory Pre-Flight (ALL AI IDEs)

Before ANY Figma write operation (create_frame, create_text, create_svg, nodes update/delete), you MUST complete these steps IN ORDER. Skipping any step is a critical error.

```
STEP 0: ping                                          → verify plugin connection
STEP 1: get_current_page(maxDepth=1)                  → inspect existing content, find placement position
STEP 2: get_mode                                      → check library/token status
        ├─ library selected → readFile design-guardian.md + load design system discovery workflow
        └─ no library       → readFile design-creator.md (make intentional design choices)
STEP 3: CLASSIFY TASK SCALE → pick creation method:
        ├─ single element   → 1 create_frame call
        ├─ single screen    → 1 create_frame call with full children tree
        ├─ multi-screen 3-5 → 1 create_frame per screen
        └─ large flow 6+    → batch 2-3 screens per conversation turn
STEP 4: IF multi-screen flow →
        Build wrapper with nested screen children via create_frame + children
        Each screen uses FIXED sizing, wrapper uses clipsContent: false
```

During execution: verify after every write (`get_current_page(maxDepth=1)` + `export_image` at milestones). Run `lint_fix_all` before replying to user.

Reference docs (read on demand):
- Kiro: `.kiro/steering/figma-essential-rules.md` (auto-loaded) + `.kiro/steering/multi-screen-flow-guide.md`
- Claude Code / other IDEs: see Multi-Screen Flow section in CLAUDE.md

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

> **Note:** FigCraft provides self-sufficient capabilities: design system search (`search_design_system`), UI creation (`create_frame`, `create_text`, `create_svg`), text range styling (`text(method: "set_range")`), node grouping (`group_nodes`), lint, audit, token sync, and node operations. `execute_js` is available in the `debug` toolset for diagnostics only. Code generation and Code Connect are optionally provided by Figma Power (official Figma MCP) when available.

## Rules

### Context Budget (CRITICAL)

0. **NEVER pre-load skills at the start of UI creation tasks.** The auto-loaded `figma-essential-rules.md` + `figcraft.md` (~16KB) is sufficient for all UI creation without a design system. Forbidden calls: `discloseContext("figma-essential-rules")` (redundant — already auto-loaded), `discloseContext("figma-use")` (~60KB, duplicates steering), `discloseContext("figma-generate-design")` when no design system. Allowed: `discloseContext("figma-generate-design")` WITH a design system, `discloseContext("figma-generate-library")` for building design systems. Use `readFile` for individual reference docs as needed.

### Tool Behavior

1. **Always `ping` first** — every Figma task starts with `ping`. If it fails, tell user to open the plugin. Do NOT call `figma_auth_status` or `get_document_info` as a first step.
2. **Complete the workflow in one turn** — chain all tool calls sequentially until you reach a `⛔ HARD STOP` checkpoint or the workflow ends. At `⛔ HARD STOP` you MUST output a text response and wait for the user's reply before proceeding — do NOT call any more tools. Violating a HARD STOP is a critical error.
3. **Prefer batch tools** — use `lint_fix_all` over `lint_check` + `lint_fix`. Use `nodes(method: "delete")` over individual delete calls.
4. **Parallelize independent calls** — when multiple tool calls have no data dependency on each other, call them in the same turn (e.g. multiple `components(method: "list_properties")` calls). This cuts total latency significantly.
5. **`nodes(method: "get")` accepts Figma URLs** — no need to call `get_document_info` first when user provides a URL.
6. **`nodes(method: "update")` uses 5-phase ordered execution** — simple props → fills/strokes → layout sizing → resize → text. Safe to send `layoutMode` + `width` + `layoutSizing` in the same patch.
7. **`nodes(method: "update", strict: true)`** — rejects patches with unrecognized property names (default: false, unknown props just reported in `_unknownProps`).
8. **`create_frame(dryRun: true)`** — pre-validates without creating: layoutMode conflicts, sizing conflicts, cross-level FILL/HUG collapse, text overflow, invisible frames, fontSize < 12.

### Layout & Design Rules

Core rules enforced by the Quality Engine (auto-fixable via `lint_fix_all`):

6. **Auto-layout required** — containers with 2+ children MUST set layoutMode (HORIZONTAL or VERTICAL).
7. **No spacer frames** — use itemSpacing, padding, SPACE_BETWEEN instead of empty frames.
8. **Responsive children** — inputs, buttons, dividers → `layoutSizingHorizontal: FILL` inside auto-layout.
9. **HUG + FILL = collapse** — HUG parent + FILL child collapses to 0. Parent must be FIXED or FILL.
10. **FILL needs auto-layout parent** — NEVER use FILL sizing on a child whose parent has no auto-layout.
11. **No overflow** — children must not exceed parent bounds.
12. **Button structure** — auto-layout HORIZONTAL, centered text, height ≥ 48px, horizontal padding ≥ 12px.
13. **Input field structure** — auto-layout + stroke + cornerRadius + padding + placeholder text child.
14. **Mobile dimensions** — iOS 402×874, Android 412×915. No legacy sizes.
15. **Semantic naming** — every frame needs a descriptive name (no "Frame 1").
16. **Text fit** — text must fit within parent. Use textAutoResize: HEIGHT for fixed-width containers.
17. **Shadow visibility** — drop shadow requires `clipsContent: false` on ALL ancestor containers.
18. **Form consistency** — ALL form children use `layoutAlign: STRETCH`.
19. **No ABSOLUTE in auto-layout** — layoutPositioning: ABSOLUTE breaks flow; use a wrapper frame.

Detailed rules: `get_creation_guide(topic:"layout")`

### Multi-Screen Flow

Hierarchy: Wrapper → Header + Flow Row → Stage → Screen (FIXED, cornerRadius=28, SPACE_BETWEEN).
Build order: skeleton first (create_frame with all screens empty) → fill each screen via parentId → lint_fix_all.
Shadow: ALL ancestor containers must have `clipsContent: false`.

Detailed guide: `get_creation_guide(topic:"multi-screen")`

### Batching Strategy

- Single element → 1 create_frame call
- Single screen → 1 create_frame with full children tree
- Multi-screen 3-5 → create_frame `items[]` batch (max 20)
- Large flow 6+ → batch 2-3 screens per turn
- dryRun:true for complex params → use correctedPayload

Detailed guide: `get_creation_guide(topic:"batching")`

### Opinion Engine

`create_frame` auto-infers: layoutMode, sizing (FILL/HUG), FILL ordering, font normalization, token binding.
Response fields: `_hints` (inferences), `_warnings` (issues), `_lintSummary` (violations), `_previewHint` (export_image).
`dryRun:true` previews all inferences without creating nodes.

Detailed docs: `get_creation_guide(topic:"opinion-engine")`

### Design Direction

- **Library mode**: use tokens, ≤ 3 text tiers, match palette, no hardcoded hex.
- **No library**: 1 dominant + 1 accent color, ≤ 5 total, NEVER default blue/gray/Inter.
- **Both modes**: realistic content (never Lorem ipsum), single icon style, ≤ 3 shadow levels, 4.5:1 contrast.

Detailed rules: `get_design_guidelines(category)`

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
- Design system search (`search_design_system`) and UI creation are built into FigCraft. Code generation and Code Connect are optionally available via Figma Power.

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
- Pure declarative UI creation: `create_frame` + `children`, `create_text`, `text(method: "set_range")`, `group_nodes`, `nodes(method: "update")`. `execute_js` is in `debug` toolset — not available by default
