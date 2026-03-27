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
5. Colors are 0–1 range, fills/strokes are immutable arrays, `setBoundVariableForPaint` returns a new paint — see gotchas.md for details
6. Must load fonts before text operations: `await figma.loadFontAsync({family, style})`
7. `layoutSizingHorizontal/Vertical = 'FILL'` must be set AFTER `parent.appendChild(child)`
8. Page context resets on each call — use `await figma.setCurrentPageAsync(page)` to switch
9. Failed scripts are atomic — no changes are made to the file on error
10. Must `return` all created/mutated node IDs
11. Every Promise must be `await`ed — no fire-and-forget
12. Position new top-level nodes away from (0,0) to avoid overlapping existing content
13. After setting `layoutMode`, always explicitly set both `layoutSizingHorizontal` and `layoutSizingVertical` — see gotchas.md "Auto-layout sizing mode must be explicitly set"
14. Never use empty frames for spacing — see gotchas.md "Never use empty Spacer frames"

## Incremental Workflow (Key to Avoiding Bugs)

1. Inspect first — run a read-only `execute_js` to understand what already exists in the file
2. One thing per call — create variables in one call, create components in another, combine layout in another
3. Return IDs from every call — subsequent calls need these IDs as input
4. Validate after each step — use `export_image` (FigCraft) to check visual results, `get_current_page` to check structure
5. Fix before continuing — fix issues immediately, don't build on top of broken state

## Error Handling

When `execute_js` errors:
1. Stop — don't retry immediately
2. Read the error message carefully
3. If the error is unclear, use `get_current_page` or `export_image` to inspect current file state
4. Fix the script then retry — this is safe because failed scripts don't execute any changes

## Timeout

- Default: 30 seconds, maximum: 120 seconds
- Adjust via the `timeoutMs` parameter
- Complex operations (bulk node creation) should use a longer timeout

## Reference Documentation

For detailed code patterns and pitfalls, see:
- #[[file:.kiro/steering/references/gotchas.md]] — All known pitfalls with WRONG/CORRECT code examples
- #[[file:.kiro/steering/references/common-patterns.md]] — Working code examples for common operations

## Recommended Step Order for Full Page/Screen Creation

```
Step 1: Inspect file — discover existing pages, components, variables, naming conventions
Step 2: Create page wrapper frame, return ID
Step 3: Build sections one at a time (one execute_js call per section)
  - Create section → verify with export_image → confirm OK → next
Step 4: Final verification — screenshot the complete page
```

## Post-Creation Lint (Mandatory)

When UI elements have been created using `create_frame`, `create_text`, or `execute_js` (with creation operations), you MUST run `lint_fix_all` before replying to the user. Rules:

- If more creation operations follow, wait until all are complete, then run `lint_fix_all` once
- If no creation operations occurred, or `lint_fix_all` was already run, skip it
- Pass the top-level created node IDs to `lint_fix_all`'s `nodeIds` parameter to avoid scanning the entire page

## Anti-Patterns (Forbidden)

- ❌ Creating an entire screen in a single execute_js (Status Bar + Header + Form + Buttons + Footer in one script)
- ❌ Skipping screenshot verification and moving to the next step
- ❌ Rebuilding an entire screen after an error instead of targeted fixes
- ❌ Ending a conversation after creating UI elements without running lint_fix_all
