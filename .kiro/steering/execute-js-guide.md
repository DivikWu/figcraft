---
inclusion: fileMatch
fileMatchPattern: "packages/adapter-figma/**,packages/core-mcp/src/tools/**,.kiro/steering/figma-*,.kiro/skills/figma-*"
description: "FigCraft execute_js tool usage rules and key pitfalls"
---

# execute_js — Figma Plugin API Execution Guide

FigCraft's `execute_js` tool executes arbitrary JavaScript in the Figma Plugin sandbox, equivalent to the official Figma MCP's `use_figma`.

## When to Use execute_js vs Other FigCraft Tools

- Simple node creation/modification → use structured tools like `create_frame`, `create_text`, `nodes(method: "update")`
- Variable/style/component CRUD → use dedicated toolsets like `load_toolset("variables")`
- Complex logic, loops, conditionals, multi-step operations → use `execute_js`
- Plugin API methods not wrapped by FigCraft → use `execute_js`
- Building complete design systems or component libraries → use `execute_js` (with the workflow below)

## Key Rules

1. Use `return` to send data back — auto JSON-serialized. Do not call `figma.closePlugin()` or wrap in async IIFE
2. Top-level `await` is supported — code is automatically wrapped in an async context
3. `figma.notify()` throws — never use it
4. `console.log()` does not return output — use `return` instead
5. Colors are 0–1 range (not 0–255): `{r: 1, g: 0, b: 0}` = red
6. fills/strokes are read-only arrays — clone, modify, reassign
7. Must load fonts before text operations: `await figma.loadFontAsync({family, style})`
8. `layoutSizingHorizontal/Vertical = 'FILL'` must be set AFTER `parent.appendChild(child)`
9. Page context resets on each call — use `await figma.setCurrentPageAsync(page)` to switch
10. `setBoundVariableForPaint` returns a new paint — must capture the return value
11. Failed scripts are atomic — no changes are made to the file on error
12. Must `return` all created/mutated node IDs
13. Every Promise must be `await`ed — no fire-and-forget
14. Position new top-level nodes away from (0,0) to avoid overlapping existing content
15. After setting `layoutMode`, always explicitly declare both `layoutSizingHorizontal` and `layoutSizingVertical` — never rely on defaults (default HUG overrides dimensions set by `resize()`). Use FIXED for fixed-size screens, HUG for scrollable long pages
16. Never use empty frames for spacing. Use `itemSpacing` and `padding` on nested auto-layout containers to control spacing between sections, keeping the layer structure clean

## Incremental Workflow (Key to Avoiding Bugs)

1. Inspect first — run a read-only `execute_js` to understand what already exists in the file
2. One thing per call — create variables in one call, create components in another, combine layout in another
3. Return IDs from every call — subsequent calls need these IDs as input
4. Validate after each step — use `get_screenshot` to check visual results, `get_current_page` to check structure
5. Fix before continuing — fix issues immediately, don't build on top of broken state

## Error Handling

When `execute_js` errors:
1. Stop — don't retry immediately
2. Read the error message carefully
3. If the error is unclear, use `get_current_page` or `get_screenshot` to inspect current file state
4. Fix the script then retry — this is safe because failed scripts don't execute any changes

## Timeout

- Default: 30 seconds, maximum: 120 seconds
- Adjust via the `timeoutMs` parameter
- Complex operations (bulk node creation) should use a longer timeout

## Reference Documentation

For detailed code patterns and pitfalls, see:
- #[[file:.kiro/steering/references/gotchas.md]] — All known pitfalls with WRONG/CORRECT code examples
- #[[file:.kiro/steering/references/common-patterns.md]] — Working code examples for common operations
