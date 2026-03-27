---
inclusion: auto
description: "FigCraft MCP tool usage guide — Figma plugin bridge workflow"
---

# FigCraft — Figma Plugin Bridge Tools

Tool names are prefixed with `mcp_figcraft_`. The IDE auto-loads all tool definitions.

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
