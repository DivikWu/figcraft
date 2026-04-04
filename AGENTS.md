# FigCraft — Agent Instructions

AI-powered Figma plugin. Bridges AI IDEs to Figma via MCP for design review, lint, audit, token sync, UI creation, and inspection. Pure declarative architecture: all UI creation uses `create_frame` + `children`, `create_text`, `text(method: "set_range")`, `group_nodes`, and `nodes(method: "update")`. `execute_js` is in the `debug` toolset — not available by default.

## ⛔ Figma UI Creation — Mandatory Pre-Flight (ALL AI IDEs)

<!-- @inject-start: ide-shared/workflow.md -->
Before ANY Figma write operation, complete these steps IN ORDER:

```
STEP 0: ping                              → verify plugin connection
STEP 1: get_current_page(maxDepth=1)      → inspect existing content, find placement
STEP 2: get_mode                          → check library/token status, get _workflow
        ├─ library selected → load skill: design-guardian
        └─ no library       → load skill: design-creator
STEP 3: Follow _workflow.designPreflight  → present proposal → ⛔ WAIT for user confirmation
STEP 4: CLASSIFY TASK SCALE → pick creation method:
        ├─ single element   → 1 create_frame call
        ├─ single screen    → 1 create_frame call with full children tree
        ├─ multi-screen 3-5 → 1 create_frame per screen
        └─ large flow 6+    → batch 2-3 screens per conversation turn
STEP 5: create_frame + children           → Opinion Engine auto-handles sizing, tokens, pitfalls
        IF multi-screen → build wrapper with nested screen children, clipsContent: false
STEP 6: verify_design                     → lint + screenshot + preflight audit in one call
```

During execution: verify after every write (`export_image` at milestones). Run `lint_fix_all` before replying.
<!-- @inject-end -->

<!-- @inject-start: ide-shared/asset-locations.md -->
Project assets and their locations:

- **Skills** (design rules + workflows): `skills/*/SKILL.md` (flat, IDE auto-discovered)
- **Content** (templates + guides + prompts): `content/` (YAML/Markdown, `npm run content` to compile)
- **MCP tools**: `schema/tools.yaml` (`npm run schema` to compile)
- **Lint rules**: `packages/quality-engine/src/rules/` (TypeScript)
- **Opinion Engine**: `packages/adapter-figma/src/handlers/inline-tree.ts`

On-demand docs via MCP tools:
- `get_creation_guide(topic)` — layout, multi-screen, batching, tool-behavior, opinion-engine, responsive, content-states, ui-patterns
- `get_design_guidelines(category)` — all, color, typography, spacing, layout, composition, content, accessibility, buttons, inputs
- `list_toolsets` — available toolsets and loading status

Maintenance guide: `docs/asset-maintenance.md`
<!-- @inject-end -->

## API Mode (Endpoint)

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

Standalone tools (not grouped into endpoints): `ping`, `get_mode`, `set_mode`, `join_channel`, `get_channel`, `export_image`, `lint_fix_all`, `set_current_page`, `save_version_history`, `set_selection`, `get_selection`, `get_current_page`, `get_document_info`, `list_fonts`, `audit_node`, `get_design_guidelines`

## Dynamic Toolsets

<!-- @inject-start: ide-shared/toolsets.md -->
Core tools are always enabled. Load additional toolsets as needed via `load_toolset`:

| Toolset | When to load |
|---------|-------------|
| `variables` | Managing Figma variables, collections, modes |
| `tokens` | Syncing DTCG design tokens |
| `styles` | Managing paint/text/effect styles |
| `components-advanced` | Building component libraries, managing variants |
| `library` | Importing from shared Figma libraries |
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

> **Note:** FigCraft provides self-sufficient capabilities: design system search (`search_design_system`), UI creation (`create_frame`, `create_text`, `create_svg`), text range styling (`text(method: "set_range")`), node grouping (`group_nodes`), lint, audit, token sync, and node operations. `execute_js` is available in the `debug` toolset for diagnostics only.

## Rules

### Context Budget (CRITICAL)

0. **NEVER pre-load skills at the start of UI creation tasks.** The auto-loaded context is sufficient for all UI creation without a design system. Allowed: `discloseContext("figma-generate-design")` WITH a design system, `discloseContext("figma-generate-library")` for building design systems. Use `readFile` for individual reference docs as needed.

### Tool Behavior

1. **Always `ping` first** — every Figma task starts with `ping`. If it fails, tell user to open the plugin.
2. **Complete the workflow in one turn** — chain all tool calls sequentially until you reach a `⛔ HARD STOP` checkpoint. At `⛔ HARD STOP` you MUST output text and wait for the user — do NOT call more tools.
3. **Prefer batch tools** — use `lint_fix_all` over `lint_check` + `lint_fix`.
4. **Parallelize independent calls** — when multiple tool calls have no data dependency, call them in the same turn.
5. **`nodes(method: "get")` accepts Figma URLs** — no need to call `get_document_info` first.
6. **`nodes(method: "update")` uses 5-phase ordered execution** — simple props → fills/strokes → layout sizing → resize → text.
7. **`nodes(method: "update", strict: true)`** — rejects patches with unrecognized property names.
8. **`create_frame(dryRun: true)`** — pre-validates without creating nodes.

### On-Demand Guides

Layout rules, multi-screen flow, batching strategy, Opinion Engine docs, and design direction rules are all served by MCP tools at runtime — not duplicated here:

- `get_creation_guide(topic:"layout")` — structural rules (auto-layout, sizing, spacing)
- `get_creation_guide(topic:"multi-screen")` — multi-screen flow architecture
- `get_creation_guide(topic:"batching")` — context budget strategy
- `get_creation_guide(topic:"opinion-engine")` — auto-inference details
- `get_design_guidelines(category)` — design direction (color, typography, spacing, etc.)

## Quick Workflows

| Task | Sequence |
|------|----------|
| Inspect design | `ping` → `get_current_page(maxDepth=2)` → `nodes(method: "get")` |
| Design lint | `ping` → `lint_fix_all` |
| Token sync | `ping` → `load_toolset("tokens")` → `list_tokens` → `diff_tokens` → `sync_tokens` |
| List components | `ping` → `components(method: "list")` or `components(method: "list_library")` |
| Multi-document | `join_channel(newId)` → `ping` |

## Access Control

3-tier access control via `FIGCRAFT_ACCESS` env var:

| Level | Env Value | Allowed Tools |
|-------|-----------|---------------|
| **read** | `FIGCRAFT_ACCESS=read` | Read-only tools (inspect, export, search, `set_mode`, `save_version_history`). All write tools disabled. |
| **create** | `FIGCRAFT_ACCESS=create` | Read + tools that add NEW content. Edit/delete tools disabled. `lint_fix_all` is edit-level. |
| **edit** | `FIGCRAFT_ACCESS=edit` (default) | Full access — all tools enabled. |

Legacy: `FIGCRAFT_READ_ONLY=true` is equivalent to `FIGCRAFT_ACCESS=read`.

Each write tool in `schema/tools.yaml` has an `access` field (`create` or `edit`). In endpoint mode, method-level access control is enforced at runtime.

## Developer Documentation

For architecture, directory structure, adding tools/lint rules, environment variables, build commands, and running instructions: **read `CLAUDE.md`** in the project root.

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
