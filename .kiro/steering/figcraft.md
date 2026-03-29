---
inclusion: auto
description: "FigCraft MCP tool usage guide — Figma plugin bridge workflow"
---

# FigCraft — Figma Plugin Bridge Tools

Tool names are prefixed with `mcp_figcraft_`. The IDE auto-loads all tool definitions.

## FigCraft vs Figma Power (Official Figma MCP) — Division of Labor

| Task | Use |
|------|-----|
| Reading design data from nodes | Figma Power (`get_design_context`) |
| Reading variable definitions by fileKey | Figma Power (`get_variable_defs`) |
| Capturing screenshots by fileKey | Figma Power (`get_screenshot`) |
| Design-to-code generation | Figma Power (`get_design_context`, `figma-implement-design` skill) |
| Code Connect mapping | Figma Power (`figma-code-connect-components` skill) |
| Plugin connection & page inspection | FigCraft (`ping`, `get_current_page`, `get_mode`) |
| Plugin API scripting (component import, variable binding, node creation) | FigCraft `execute_js` (equivalent to `use_figma`, code 100% compatible) |
| Design quality (lint, audit) | FigCraft (`lint_fix_all`, `audit_node`) |
| Token sync (DTCG JSON ↔ Figma) | FigCraft (`load_toolset("tokens")`) |
| Node CRUD operations | FigCraft (`nodes`, `text`, `execute_js`) |
| Image export | FigCraft (`export_image`) |

Note: `use_figma` and `search_design_system` are NOT available in Kiro. All Plugin API execution goes through FigCraft's `execute_js`. Follow the official `figma-use` skill rules — code is 100% compatible, only the tool name differs.

## use_figma Is Not Available in Kiro

All Plugin API scripts must use FigCraft's `execute_js` (`mcp_figcraft_execute_js`), not the official Figma MCP's `use_figma`.
Screenshots: FigCraft `export_image` or official Figma MCP `get_screenshot`.

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
