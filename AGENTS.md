# FigCraft — Agent Instructions

AI-powered Figma plugin. Bridges AI IDEs to Figma via MCP for design review, lint, audit, token sync, UI creation, and inspection. Pure declarative architecture: all UI creation uses `create_frame` + `children`, `create_text`, `text(method: "set_range")`, `group_nodes`, and `nodes(method: "update")`. `execute_js` is in the `debug` toolset — not available by default.

## ⛔ Figma UI Creation — Mandatory Pre-Flight (ALL AI IDEs)

<!-- @inject-start: ide-shared/workflow.md -->
**Tool routing by intent** (decide BEFORE entering the workflow):
- CREATE/DESIGN UI → FigCraft tools only (workflow below)
- REVIEW/ANALYZE existing design → FigCraft tools (nodes, audit_node, components, export_image). Load design-review or component-docs skill. Do NOT use figma-desktop for review/analysis tasks
- IMPLEMENT CODE from existing design → Figma Desktop MCP: get_design_context
- Figma URL in a creation request = WHERE to create, not what to read
- Figma URL in a review/analysis request = WHAT to inspect with FigCraft tools
- NEVER call get_design_context on empty pages/frames — it will error and block

**FigCraft tool equivalents** (use these instead of figma-desktop/figma MCP):
- Screenshots → `export_image` (NOT `get_screenshot`)
- Node inspection → `nodes(method:"get")` (NOT `get_metadata`)
- Page overview → `get_current_page(maxDepth:2)` (NOT `get_metadata`)
- Design context → figcraft `get_design_context` (NOT figma MCP `get_design_context`)

Before ANY Figma write operation, complete these steps IN ORDER:

```
STEP 0: get_mode                          → verifies connection (built-in ping), inspects page
                                             (built-in pageContext), gets _workflow
        ├─ always              → load skill: ui-ux-fundamentals
        ├─ library selected    → load skill: design-guardian
        ├─ library + components/variables present → figma-create-ui covers component discovery
        └─ no library          → load skill: design-creator
STEP 1: Follow _workflow.designPreflight  → present proposal → ⛔ WAIT for user confirmation
        After platform confirmed → load skill: platform-ios / platform-android / responsive-design
STEP 2: CLASSIFY TASK SCALE → pick creation method:
        ├─ single element   → 1 create_frame call
        ├─ single screen    → 1 create_frame call with full children tree
        ├─ multi-screen 3-5 → load skill: multi-screen-flow → 1 create_frame per screen
        └─ large flow 6+    → load skill: multi-screen-flow → batch 2-3 screens per turn
STEP 3: create_frame + children           → Opinion Engine auto-handles sizing, tokens, pitfalls
        IF multi-screen → follow multi-screen-flow skill hierarchy (Wrapper → Header → Flow Row → Stage → Screen)
        Harness Pipeline auto-enriches response:
          _qualityScore (0-100)    → check this; if < 80 or errors exist, call verify_design()
          _verificationDebt        → persists in ALL subsequent responses until verified
          _recovery (on error)     → follow suggestion to fix and retry
STEP 4: verify_design                     → lint + screenshot + preflight audit in one call
        Clears _verificationDebt for verified nodes
```

During execution: verify after every write (`export_image` at milestones). Run `lint_fix_all` before replying.
<!-- @inject-end -->

<!-- @inject-start: ide-shared/harness-fields.md -->
Harness Pipeline auto-enriches bridge responses. Check these fields after every tool call:

| Field | When present | What to do |
|-------|-------------|------------|
| `_qualityScore` | After root-level `create_frame` | If < 80 or errors exist → call `verify_design()` |
| `_qualityWarning` | When `_qualityScore` has violations | Read the warning, follow its fix suggestion |
| `_verificationDebt` | After any tool, if unverified creations exist | Persists until `verify_design()` or `lint_fix_all` clears it. Call `verify_design()` before replying to user |
| `_recovery` | On error (appended to error message) | Follow the `suggestion` to fix and retry. Includes `errorType` for classification |
| `_warnings` | After `create_frame` with placeholder text | Replace placeholder content with real text |
| `_nextSteps` | After `sync_tokens`, `set_mode` | Follow the listed steps in order |

Error recovery patterns (from `content/harness/recovery-patterns.yaml`):
- **connection_lost** → check Figma plugin is running, try `ping`
- **token_not_found** → call `search_design_system(query:"...")` to find available tokens
- **node_deleted** → call `nodes(method:"list")` to get current IDs
- **file_not_found** → check file path (use absolute path)
- **parse_error** → file must be valid DTCG JSON
- **response_too_large** → narrow scope with `nodeId`, `maxDepth`, or `detail:"summary"`
<!-- @inject-end -->

<!-- @inject-start: ide-shared/asset-locations.md -->
Project assets and their locations:

- **Skills** (design rules + workflows): `skills/*/SKILL.md` (flat, IDE auto-discovered)
- **Content** (templates + guides + prompts): `content/` (YAML/Markdown, `npm run content` to compile)
- **MCP tools**: `schema/tools.yaml` (`npm run schema` to compile)
- **Lint rules**: `packages/quality-engine/src/rules/` (TypeScript)
- **Opinion Engine**: `packages/adapter-figma/src/handlers/inline-tree.ts`
- **Harness rules** (code): `packages/core-mcp/src/harness/rules/` (TypeScript)
- **Harness rules** (data): `content/harness/` (YAML, `npm run content` to compile)

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
| `variables_ep` | `list`, `get`, `list_collections`, `get_bindings`, `export` (always available); `set_binding`, `create`, `update`, `batch_update`, `delete`, `create_collection`, `delete_collection`, `batch_create`, `set_code_syntax`, `batch_bind`, `set_values_multi_mode`, `extend_collection`, `get_overrides`, `remove_override` (write methods — `load_toolset("variables")` to enable write tools) |
| `styles_ep` | `list`, `get` (always available); `create_paint`, `update_paint`, `update_text`, `update_effect`, `delete`, `sync` (write methods — `load_toolset("styles")` to enable write tools) |

Call syntax: `nodes({ method: "get", nodeId: "1:23" })`, `variables_ep({ method: "list_collections" })`, `styles_ep({ method: "list" })`
<!-- @inject-end -->

Standalone tools (not grouped into endpoints): `ping`, `get_mode`, `set_mode`, `join_channel`, `get_channel`, `export_image`, `lint_fix_all`, `set_current_page`, `save_version_history`, `set_selection`, `get_selection`, `get_current_page`, `get_document_info`, `list_fonts`, `audit_node`, `get_design_guidelines`

## Dynamic Toolsets

<!-- @inject-start: ide-shared/toolsets.md -->
Core tools (39) are always enabled — including `create_component`, `create_component_set`, `create_component_from_node`, `layout_component_set`, `create_section`, `get_design_context`, `variables_ep`, and `styles_ep`. Load additional toolsets as needed via `load_toolset`:

| Toolset | When to load |
|---------|-------------|
| `variables` | Write operations on variables (rename, alias, modes). Note: `variables_ep` read/write methods are always available as core — no toolset needed for list, get, export, batch_update |
| `tokens` | Syncing DTCG design tokens |
| `styles` | Write operations on styles (create, update, sync). Note: `styles_ep` read methods are always available as core — no toolset needed for list, get |
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

## Multi-File Parallel

<!-- @inject-start: ide-shared/multi-file.md -->
Multi-file parallel workflows — multiple agents operating different Figma files simultaneously:

```
Agent A → MCP Server (FIGCRAFT_CHANNEL=file-a) → Relay → Figma File A
Agent B → MCP Server (FIGCRAFT_CHANNEL=file-b) → Relay → Figma File B
```

Setup: each MCP Server instance uses a different `FIGCRAFT_CHANNEL` env var. The shared Relay (port 3055) routes messages by channel. Each Figma file's plugin auto-generates a unique channel ID shown in the plugin UI.

| Method | How |
|--------|-----|
| Env var | `FIGCRAFT_CHANNEL=my-channel` in MCP server config |
| Runtime | `join_channel(channel: "my-channel")` tool call |
| Auto | Plugin generates random channel on load, use `get_channel` to read it |

Limitation: multiple agents on the **same file** is NOT supported — Figma Plugin API is single-threaded and `figma.currentPage` is global state.
<!-- @inject-end -->

> **Note:** FigCraft provides self-sufficient capabilities: design system search (`search_design_system`), UI creation (`create_frame`, `create_text`, `create_svg`), text range styling (`text(method: "set_range")`), node grouping (`group_nodes`), lint, audit, token sync, and node operations. `execute_js` is available in the `debug` toolset for diagnostics only.

## Rules

### Context Budget (CRITICAL)

0. **ALWAYS load the skills indicated by STEP 0** — `ui-ux-fundamentals` always, plus `design-guardian` (library) or `design-creator` (no library). Additionally: `figcraft-generate-library` for building design systems.
1. After STEP 2 skills are loaded, do NOT call `get_design_guidelines(category:"all")` — the same content is already in context. Use `get_design_guidelines(category:"color")` etc. only when you need to focus on a specific area.

### Tool Behavior

1. **Always `get_mode` first** — every Figma task starts with `get_mode` (built-in ping + page inspection). If it fails, tell user to open the plugin.
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
- Figma Plugin API does NOT expose component property descriptions — `editComponentProperty`/`addComponentProperty` accept only `{ name, defaultValue, preferredValues }`. Property descriptions are editable only in Figma's UI (`execute_js` cannot help — same API surface). `update_component_property` throws `UNSUPPORTED_BY_FIGMA_API` with the workaround
- VARIANT property defaults are derived from the top-left variant's spatial position — `editComponentProperty`'s `defaultValue` does NOT apply to VARIANT. Reorder variants to change the default. `update_component_property` throws `UNSUPPORTED_FOR_VARIANT`
<!-- @inject-end -->
