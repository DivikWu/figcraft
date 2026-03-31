---
inclusion: auto
description: "FigCraft MCP tool usage guide — Figma plugin bridge workflow"
---

# FigCraft — Figma Plugin Bridge Tools

Tool names are prefixed with `mcp_figcraft_`. The IDE auto-loads all tool definitions.

## UI Creation Strategy

**Declarative tools are the primary creation method.** Use `create_frame` with inline `children` to build entire node trees in one call. Smart defaults handle sizing, token binding, and layout inference automatically.

`execute_js` is the escape hatch — use it only when declarative tools can't express the logic (complex conditionals, loops over dynamic data, Plugin API methods not wrapped by any tool). `execute_js` is 100% compatible with official Figma MCP's `use_figma` — same Plugin API code works in both.

See `figma-declarative-creation.md` (auto-loaded) for the full declarative creation guide.

## FigCraft Tool Reference

| Task | Tool |
|------|------|
| UI creation (screens, forms, cards, flows) | `create_frame` + `children`, `create_text`, `create_instance` |
| Searching design system assets | `search_design_system` — searches components, variables, styles across all subscribed libraries |
| Icons | `icon_search` → `icon_create` |
| Images | `image_search` → `create_frame` with `imageUrl` |
| SVG creation | `create_svg` |
| Text scanning | `text_scan` |
| Node-to-component | `create_component_from_node` |
| Plugin connection & page inspection | `ping`, `get_current_page`, `get_mode` |
| Plugin API scripting (escape hatch) | `execute_js` |
| Design quality (lint, audit) | `lint_fix_all`, `audit_node` |
| Token sync (DTCG JSON ↔ Figma) | `load_toolset("tokens")` |
| Node CRUD operations | `nodes` endpoint — get, list, update, delete, clone, reparent |
| Image export | `export_image` |

**Optional Figma Power tools** (available when official Figma MCP is also configured):
`get_design_context`, `get_variable_defs`, `get_screenshot` — these provide additional data via REST API. FigCraft equivalents: `nodes(get)`, `variables_ep(list)`, `export_image`.

## Page Operation Order (Must Follow)

Target node on a non-current page → switch first, then read:
1. `ping`
2. `set_current_page("target page")`
3. `get_current_page(maxDepth=2)`

❌ Never `nodes(get, nodeId)` before `set_current_page` — plugin can only access the active page.

## Dual Mode

| Mode | Token Source |
|------|-------------|
| **library** | Figma shared library |
| **spec** | DTCG JSON files |

Switch via `set_mode`. Call `get_mode` to get design context and available tokens when a library is selected.
