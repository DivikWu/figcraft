# FigCraft — Agent Instructions

AI-powered Figma plugin. Bridges AI IDEs to Figma via MCP with 100+ tools (~33 core + 10 on-demand toolsets). In endpoint mode, 4 additional core endpoint tools are available (~37 core).

## API Mode (Endpoint vs Flat)

FigCraft supports two API styles controlled by `FIGCRAFT_API_MODE` env var:

| Mode | Env Value | Behavior |
|------|-----------|----------|
| **flat** (default) | `FIGCRAFT_API_MODE=flat` | Traditional flat tools (`get_node_info`, `patch_nodes`, etc.) |
| **endpoint** | `FIGCRAFT_API_MODE=endpoint` | Resource-oriented endpoints with method dispatch |
| **both** | `FIGCRAFT_API_MODE=both` | Both flat tools and endpoints available |

### Endpoint Mode

In endpoint mode, related operations are grouped under resource endpoints:

| Endpoint | Methods | Replaces |
|----------|---------|----------|
| `nodes` | `get`, `list`, `update`, `delete`, `clone`, `insert_child` | `get_node_info`, `search_nodes`, `patch_nodes`, `delete_nodes`, `clone_node`, `insert_child` |
| `text` | `create`, `set_content` | `create_text`, `set_text_content` |
| `shapes` | `create_frame`, `create_rectangle`, `create_ellipse`, `create_vector` | `create_frame`, `create_rectangle`, `create_ellipse`, `create_vector` |
| `components` | `list`, `list_library`, `get`, `create_instance`, `list_properties` | `list_components`, `list_library_components`, `get_component`, `create_instance`, `list_component_properties` |
| `variables_ep` | 12 methods | 12 flat variable tools (requires `load_toolset("variables")`) |
| `styles_ep` | 8 methods | 8 flat style tools (requires `load_toolset("styles")`) |

Endpoint call syntax: `nodes({ method: "get", nodeId: "1:23" })`

Standalone tools (not grouped into endpoints): `ping`, `get_mode`, `set_mode`, `create_document`, `join_channel`, `get_channel`, `export_image`, `lint_fix_all`, `set_current_page`, `save_version_history`, `set_selection`, `get_selection`, `get_current_page`, `get_document_info`, `list_fonts`, `set_image_fill`

Note: `nodes` endpoint does NOT include a `create` method — use `create_document` (batch) or `shapes`/`text` endpoints for node creation.

## Dynamic Toolsets

~33 core tools are enabled by default, including `create_rectangle`, `create_ellipse`, `create_vector`, and `set_image_fill` (previously in `shapes-vectors`). Load additional toolsets as needed:

| Toolset | Tools | When to load |
|---------|-------|-------------|
| `variables` | 19 | Managing Figma variables, collections, modes |
| `tokens` | 11 | Syncing DTCG design tokens |
| `styles` | 11 | Managing paint/text/effect styles |
| `components-advanced` | 13 | Building component libraries, managing variants |
| `library` | 7 | Importing from shared Figma libraries |
| `shapes-vectors` | 6 | Stars, polygons, sections, boolean ops, flatten (note: `create_rectangle`, `create_ellipse`, `create_vector`, `set_image_fill` are now core) |
| `annotations` | 6 | Adding annotations, analyzing prototypes |
| `lint` | 4 | Fine-grained lint (beyond lint_fix_all) |
| `auth` | 3 | Figma OAuth setup |
| `pages` | 3 | Creating/renaming pages |

Use `load_toolset` to enable, `unload_toolset` to disable, `list_toolsets` to see status.
Load multiple at once: `load_toolset({ names: "tokens,variables" })`

## Rules

### Tool Behavior

1. **Always `ping` first** — every Figma task starts with `ping`. If it fails, tell user to open the plugin. Do NOT call `figma_auth_status` or `get_document_info` as a first step. Exception: in the Create workflow, call `get_mode` instead (it includes a built-in ping) — if `connected: false`, stop and tell user to open the plugin.
2. **Complete the workflow in one turn** — chain all tool calls sequentially until you reach a `⛔ HARD STOP` checkpoint or the workflow ends. At `⛔ HARD STOP` you MUST output a text response and wait for the user's reply before proceeding — do NOT call any more tools. Violating a HARD STOP is a critical error.
3. **Prefer batch tools** — use `create_document` over multiple `create_frame`/`create_text`. Use `lint_fix_all` over `lint_check` + `lint_fix`. Use `delete_nodes` over multiple `delete_node`. When creating multiple screens, use **one `create_document` call per screen** — do NOT pack all screens into a single call's `nodes` array. Large node trees in a single call risk generation timeouts. Call them sequentially, one screen at a time.
4. **Parallelize independent calls** — when multiple tool calls have no data dependency on each other, call them in the same turn (e.g. multiple `list_component_properties` calls). This cuts total latency significantly.
5. **`create_document` supports 7 levels of nesting** (screen → section → card → row → component → element → content) and 7 node types: `frame`, `text`, `rectangle`, `ellipse`, `line`, `vector`, `instance`. Use `vector` type with `props.svg` to inline SVG icons directly in the batch tree. Use `instance` type with `props.componentKey` (library) or `props.componentId` (local) to inline component instances, with optional `props.properties` for variant overrides. This covers virtually all real-world UI patterns. If your design exceeds 7 levels, split into multiple `create_document` calls using `parentId` to attach deeper children.
6. **`get_node_info` accepts Figma URLs** — no need to call `get_document_info` first when user provides a URL.
7. **URL + "create/build/design" = Create workflow** — when user provides a Figma URL AND asks to create something, the URL is just context for WHERE to create. Do NOT extract node-id from the URL to call `get_node_info`. Follow the Create UI Elements workflow instead.

### Layout & Design

8. **No Spacer frames for spacing** — NEVER insert empty frames (e.g. "Spacer 1", "Spacer 2") to create variable spacing between elements. Instead, group related elements into semantic auto-layout frames (e.g. "Header", "Form", "Actions") where each group has its own `itemSpacing`. Use the parent container's `itemSpacing` for spacing between groups. This follows Figma best practices and produces clean layer trees.
9. **Use `layoutAlign: STRETCH` for responsive children** — input fields, buttons, dividers, lines, and content sections inside auto-layout containers MUST set `props.layoutAlign: "STRETCH"` so they fill the parent's cross-axis width. Never rely on hardcoded pixel widths for children that should be responsive. `create_document` supports `layoutAlign` and `layoutGrow` in props for all node types. Note: `line` nodes are now auto-set to STRETCH when inside auto-layout parents (useful for dividers).
10. **Filled elements with margin need a wrapper** — when any element has a background fill and needs horizontal margin from its container edge, do NOT put `paddingLeft`/`paddingRight` on the element itself (the fill would extend into the padding area). Instead, create a transparent wrapper frame (VERTICAL auto layout) with the desired `paddingLeft`/`paddingRight`, place the element inside with `layoutAlign: STRETCH`. Common cases: colored buttons, cards with background, input groups with fills.
11. **Full-bleed system bars** — for screens with a system bar (iOS status bar, Android status bar, etc.), the page-level frame MUST have `paddingLeft: 0, paddingRight: 0, paddingTop: 0` and `primaryAxisAlignItems: MIN` so the system bar sits flush at the top edge. The system bar manages its own internal padding. Content sections below each manage their own horizontal padding independently.
12. **Mobile screen dimensions** — when creating mobile screens, use these standard frame sizes unless the user explicitly requests otherwise:
    - iOS → 402×874 (iPhone 16 Pro)
    - Android → 412×915 (common Android viewport)
    - Do NOT use legacy sizes (390×844, 360×800, etc.) unless explicitly requested.
13. **Buttons must be proper auto-layout frames** — every button MUST be an auto-layout frame with `primaryAxisAlignItems: CENTER`, `counterAxisAlignItems: CENTER`, explicit height (≥ 44pt iOS / ≥ 48dp Android), and internal padding. NEVER use a bare text node or a rectangle + text overlap as a button. NEVER place decorative shapes that obscure button text.
14. **No text overflow or truncation** — all text nodes MUST fit within their parent container. For buttons and labels, ensure the parent frame is wide enough or use `layoutAlign: STRETCH`. If text might be long, use `textAutoResize: WIDTH_AND_HEIGHT`. Visually clipped text is a critical defect.
15. **Input fields are auto-layout frames** — every input field MUST be an auto-layout frame with stroke (border), corner radius, internal padding, and a text child for placeholder. Set `layoutAlign: STRETCH` so it fills parent width. Use consistent height across all inputs in the same form.
16. **Semantic frame naming** — every frame MUST have a descriptive name reflecting its purpose (e.g. "Login Form", "Email Input", "Submit Button", "Social Login Row"). NEVER leave default names like "Frame 1", "Frame 2", "Group 1".
17. **Form children consistency** — inside a VERTICAL auto-layout form container, ALL interactive children (input fields, buttons, dividers, social login rows) MUST use `layoutAlign: STRETCH` so they share the same width. NEVER mix hardcoded widths with STRETCH children in the same form — it creates visual misalignment. If a child needs narrower width, wrap it in a STRETCH frame with horizontal padding.
18. **No HUG/STRETCH paradox** — NEVER set a frame to HUG on the cross-axis while its children use `layoutAlign: STRETCH` or `layoutSizing*: FILL`. The parent has no width to fill, causing children to collapse to 0. Always give the parent an explicit dimension or `layoutAlign: STRETCH` on the cross-axis.
19. **FILL requires auto-layout parent** — NEVER use `layoutSizingHorizontal: FILL` or `layoutSizingVertical: FILL` on a child whose parent has no auto-layout. FILL sizing only works inside auto-layout containers. Use explicit dimensions or HUG instead.
20. **Every frame with 2+ children MUST have auto-layout** — frames with multiple children and no auto-layout cause overlapping content. Always set `autoLayout: true` with an appropriate `layoutDirection`. The only exception is decorative overlays where overlap is intentional.
21. **Children must not overflow parent** — every child's cross-axis dimension must fit within the parent's inner space (parent dimension minus padding). If a child is wider than its parent, use `layoutAlign: STRETCH` instead of a hardcoded width.

## Workflows

### Create UI Elements
**Think → Gather → Propose → Confirm → [Query] → Create → Check**

Steps 1–4 are shared. Steps 5–7 diverge by mode.

1. **Think**: Call `get_mode` (includes built-in connectivity check). The response tells you:
   - `connected` — false means plugin is not reachable. Stop and tell user to open the plugin.
   - `selectedLibrary` — null means Design Creator mode (no library)
   - `designContext` — grouped tokens (text/surface/fill/border) and defaults. Present only in Library mode. **Cache this for Propose — do NOT call `get_mode` again later.**
   - `designContext.unresolvedDefaults` — roles where no matching variable was found (e.g. `["border"]`). For these roles, auto-bind will be skipped; choose colors freely.
   - `libraryComponents` — available components with keys and descriptions. Present only when a library file URL is configured. **Cache this for Query.**

2. **Gather** `⛔ HARD STOP`: After Think completes, output a text message to collect missing preferences. Do NOT call any more tools — just reply to the user. Match the user's language (infer language/region from the user's message). Before asking, check what the user already provided and skip those items.

   **Library mode** (selectedLibrary is set):
   - (a) UI type — skip if user already specified (e.g. "login page", "dashboard"). If vague (e.g. "a page"), provide 3–4 examples.
   - (b) Platform — Web/iOS/Android.

   **Design Creator mode** (selectedLibrary is null):
   - (a) UI type — same logic as above.
   - (b) Platform — Web/iOS/Android.
   - (c) Style tone — Minimal / Elegant / Warm / Bold / Rich (or free-form).

   If the user already provided ALL required items, merge Gather and Propose into one turn: go directly to step 3 (Propose) with the full design plan.

   `⛔ HARD STOP` — Reply with your message, then stop. Do NOT call any tools. Wait for the user.

3. **Propose** `⛔ HARD STOP`: Output a concrete design plan draft. Start with: "I understand you need [what], for [platform], with a [tone/library] feel."

   **Library mode**: Reference the cached `designContext` tokens by name. Draft includes: layout structure, specific token names for colors/typography/spacing (from designContext), which library components to reuse (from libraryComponents), composition strategy, and content strategy. Do NOT invent token values — use only what `designContext` provides.

   **Design Creator mode**: Draft includes: purpose, platform, density, tone, color palette (dominant + accent with hex), font pairing, spacing base unit, corner radius scale, composition strategy, elevation scale, icon style, content strategy, and layout structure. Make intentional choices — no Inter + blue + centered without justification.

   End with: "Want me to adjust anything, or should I go ahead?"
   `⛔ HARD STOP` — Reply with your plan, then stop. Do NOT call any tools. Wait for user approval.

4. **Confirm**: Wait for explicit user approval (e.g. "go ahead", "ok", "looks good"). If user requests changes, revise the plan and present again with another `⛔ HARD STOP`.

#### Library Mode (steps 5–7)

5. **Query**: Identify components needed from the plan. For library components, use the cached `libraryComponents` descriptions — only call `create_instance` to probe variant properties if the description is insufficient. For local components, call `list_component_properties` for ALL needed components in parallel.
6. **Create (Sectional)**: Build each screen section-by-section for higher quality. **One `create_document` call per screen**, but structure the node tree in logical sections. After each screen is created:
   - **Inspect warnings**: Check the `warnings` array in the `create_document` response. If warnings mention hardcoded fills, missing auto-layout, or structural issues, fix them with `patch_nodes` immediately.
   - **Run scoped lint**: Call `lint_fix_all` with `nodeIds` set to the just-created screen's root node ID. This catches layout issues (button structure, text overflow, spacing) while the screen is fresh.
   - **Fix violations**: Apply `patch_nodes` for any remaining issues before creating the next screen.
   - Only call `get_current_page(maxDepth=1)` first if you need to position new frames relative to existing content (e.g. user said "add next to the existing screen"). Otherwise skip it.
7. **Check (Final)**: Run `lint_fix_all` on ALL created screens (no nodeIds filter). Then self-review against rules 8–21:
   - No empty Spacer frames (rule 8)
   - All responsive children use `layoutAlign: STRETCH` (rule 9)
   - Filled elements with margin use wrapper frames (rule 10)
   - System bars are full-bleed (rule 11)
   - Correct mobile dimensions (rule 12)
   - All buttons are proper auto-layout frames with centered text, no overlapping shapes (rule 13)
   - No text overflow or truncation anywhere (rule 14)
   - All input fields are auto-layout frames with stroke and padding (rule 15)
   - All frames have descriptive names (rule 16)
   - All form children have consistent widths — inputs, buttons, and dividers use `layoutAlign: STRETCH` (rule 17)
   - No HUG/STRETCH paradox — parent frames with STRETCH children have explicit cross-axis dimension (rule 18)
   - No FILL sizing on children of non-auto-layout parents (rule 19)
   - Every frame with 2+ children has auto-layout enabled (rule 20)
   - No children overflow their parent's inner bounds (rule 21)
   Fix any violations immediately with `patch_nodes` before finishing.

#### Design Creator Mode (steps 5–7)

5. **Query**: Skip — no components or tokens to query.
6. **Create (Sectional)**: Same sectional approach as Library Mode. Call `create_document` one screen at a time. After each screen:
   - **Inspect warnings**: Check `warnings` in response — especially "no fill in Design Creator mode" warnings.
   - **Run scoped lint**: Call `lint_fix_all` with `nodeIds` = [created screen root ID].
   - **Fix violations**: Apply `patch_nodes` before next screen.
   - **Important**: always specify `props.fill` for top-level frames that need a visible background — in Design Creator mode, frames without fill are transparent (no auto-bind).
7. **Check (Final)**: Same as Library Mode step 7 — run `lint_fix_all` on all screens, self-review rules 8–21, fix violations.

When user provides a Figma URL AND asks to **create/build/design** something, follow this workflow (not Inspect). The URL is context for WHERE to create, not WHAT to inspect.

**Error recovery**: if `create_document` partially fails (e.g. some nodes created, others not), use `get_node_info` on the returned parent to inspect what was created, then use a second `create_document` with `parentId` to fill in missing children. Do NOT delete and retry the entire tree.

**Ambiguous inference review**: `create_document` may return a `correctedPayload` array when the inference engine made ambiguous fixes (low confidence). Each entry contains `nodeId`, `nodeName`, `original` (props before inference), `corrected` (props after inference), and `ambiguousFixes` (list of what changed). Review these carefully — if an inference was wrong (e.g. a child was set to FILL but should be FIXED with explicit width), use `patch_nodes` with the `nodeId` to revert the specific property. The `inferenceDiff` field shows the same information in diff format for quick scanning.

### Inspect Design
`ping` → `get_current_page(maxDepth=2)` → `get_node_info` for details
Only use this when user asks to **inspect/review/analyze** existing elements.

### Design Lint
`ping` → `lint_fix_all`

### Token Sync
`ping` → `load_toolset({ names: "tokens" })` → `list_tokens` → `diff_tokens` → `sync_tokens`

### Components
`ping` → `list_components` or `list_library_components` → `create_instance`

### Multi-Document
`join_channel(newId)` → `ping`

## Architecture

```
IDE → MCP Server (stdio) → WS Relay (:3055) → Figma Plugin
```

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
| **read** | `FIGCRAFT_ACCESS=read` | Read-only tools (inspect, export, search). All write tools disabled. |
| **create** | `FIGCRAFT_ACCESS=create` | Read + tools that add NEW content (create_frame, create_text, etc.). Edit/delete tools disabled. |
| **edit** | `FIGCRAFT_ACCESS=edit` (default) | Full access — all tools enabled. |

Legacy: `FIGCRAFT_READ_ONLY=true` is equivalent to `FIGCRAFT_ACCESS=read`.

Each write tool in `schema/tools.yaml` has an `access` field (`create` or `edit`):
- `access: create` — adds new content without modifying existing nodes
- `access: edit` — modifies or deletes existing content

The schema compiler generates `GENERATED_CREATE_TOOLS` and `GENERATED_EDIT_TOOLS` sets in `_registry.ts`. The toolset manager uses these to disable tools at startup and block them from being loaded via `load_toolset`.

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
- `src/mcp-server/tools/_registry.ts` — CORE_TOOLS, TOOLSETS, WRITE_TOOLS, CREATE_TOOLS, EDIT_TOOLS, ENDPOINT_TOOLS, ENDPOINT_METHOD_ACCESS, ENDPOINT_REPLACES sets
- `src/mcp-server/tools/_generated.ts` — bridge tool registrations with Zod schemas + endpoint Zod schemas

Endpoint tools use `handler: endpoint` in the YAML with a `methods` map. Each method specifies `maps_to` (the flat tool it replaces), `write`, `access`, and `params`.

Run `npm run schema` after editing `schema/tools.yaml`. The `build` script runs it automatically.

## Adding New Tools

1. Handler in `src/plugin/handlers/` → import in `src/plugin/code.ts`
2. Add tool definition to `schema/tools.yaml` (toolset, write flag, access level, handler type, params)
3. If `handler: custom` — write MCP wrapper in `src/mcp-server/tools/`, register in `toolset-manager.ts`
4. If `handler: bridge` — tool is auto-generated; just add the YAML entry
5. If `handler: endpoint` — add method definitions with `maps_to`, implement dispatch in `endpoints.ts`
6. Run `npm run schema` to regenerate registry

## Adding New Lint Rules

1. Rule in `src/plugin/linter/rules/` implementing `LintRule`
2. Register in `src/plugin/linter/engine.ts` `ALL_RULES`
3. Fix logic in `src/plugin/handlers/lint.ts` if `autoFixable`

## Constraints

- Plugin UI: pure HTML/CSS in `src/plugin/ui.html` — no frameworks
- Linter runs in Plugin sandbox, not MCP Server
- DTCG parsing runs only on MCP Server
- Composite tokens (typography/shadow) → Figma Styles, not Variables
