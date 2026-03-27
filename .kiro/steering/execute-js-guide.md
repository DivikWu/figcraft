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
9. Failed scripts are NOT always atomic — nodes created before the error point may persist as orphans. Always inspect page state after a failure before retrying
10. Must `return` created/mutated node IDs — for multi-screen flows, return only IDs needed by subsequent calls (see Incremental Workflow below)
11. Every Promise must be `await`ed — no fire-and-forget
12. Position new top-level nodes away from (0,0) to avoid overlapping existing content
13. After setting `layoutMode`, always explicitly set both `layoutSizingHorizontal` and `layoutSizingVertical` — see gotchas.md "Auto-layout sizing mode must be explicitly set"
14. Never use empty frames for spacing — see gotchas.md "Never use empty Spacer frames"

## Incremental Workflow (Key to Avoiding Bugs)

1. Inspect first — run a read-only `execute_js` to understand what already exists in the file
2. Match granularity to task scale:
   - Single screen → one section per call (2-4 calls)
   - Multi-screen flow → one FULL SCREEN per call (skeleton + N screen calls)
   - Large flow (6+) → batch 2-3 screens per conversation turn
3. Return only IDs you'll reference later — keep return values minimal to save context
4. **Structure-verify after EVERY write** — run `get_current_page(maxDepth=1)` after each `execute_js` write to confirm page-level child count hasn't changed unexpectedly (catches orphan nodes from failed or misbehaving scripts). This is lightweight and non-negotiable.
5. Visual-verify at key milestones — `export_image` after skeleton creation, after each complete screen, and at the end. Skeleton verification is mandatory (it's the foundation for everything else).
6. Fix before continuing — fix issues immediately, don't build on top of broken state

## Error Handling

When `execute_js` errors:
1. **STOP** — don't retry immediately
2. Read the error message carefully
3. **ALWAYS inspect page state** — run `get_current_page(maxDepth=1)` to check for orphan nodes left behind by the failed script. Despite documentation claims, failed scripts are NOT always atomic: nodes created before the error point may persist on the page as orphans (e.g., partially created wrappers, detached text nodes, incomplete frames)
4. **Clean up orphan nodes** — if the inspection reveals unexpected top-level nodes or nodes that don't belong to the intended hierarchy, remove them with `execute_js` before retrying
5. Fix the script then retry — only after confirming the page is clean

## Timeout

- Default: 30 seconds, maximum: 120 seconds
- Adjust via the `timeoutMs` parameter
- For multi-screen flows where each call creates an entire screen (20-30 nodes), use `timeoutMs: 60000` (60s) to avoid timeout on complex screens
- For skeleton calls that create wrapper + all screen shells in a loop, use `timeoutMs: 60000`

## Reference Documentation

For detailed code patterns and pitfalls, see:
- #[[file:.kiro/steering/references/gotchas.md]] — All known pitfalls with WRONG/CORRECT code examples
- #[[file:.kiro/steering/references/common-patterns.md]] — Working code examples for common operations

## Recommended Step Order for Full Page/Screen Creation

### Single Screen
```
Step 1: Inspect file — discover existing pages, naming conventions, find clear placement position
Step 2: Create screen shell frame, return ID
  - Structure-verify with get_current_page(maxDepth=1) — confirm page has expected top-level node count
Step 3: Build sections one at a time (one execute_js call per section, 2-4 calls total)
  - Create section with ALL children in one call (nested frames + text nodes)
  - Structure-verify with get_current_page(maxDepth=1) after each write
  - Visual-verify with export_image → confirm OK → fix if needed → next section
Step 4: lint_fix_all on the screen
Step 5: Post-lint structural verification — execute_js to inspect child hierarchy AND page-level children
Step 6: Final verification — export_image
```

### Multi-Screen Flow (3-5 screens) — CONTEXT-OPTIMIZED
```
Step 1: Inspect file — discover existing pages, naming conventions, find clear placement position
Step 2: Create wrapper + all screen shells (skeleton) in ONE execute_js call, return IDs
  - Define shared helpers (makeText, makeButton, makeField) in the script
  - Loop screenDefs to create all shells uniformly
  - MANDATORY: Structure-verify with get_current_page(maxDepth=1) — confirm page has exactly 1 new top-level node (the wrapper)
  - MANDATORY: Visual-verify skeleton with export_image — the skeleton is the foundation, never skip this
Step 3: Fill each screen in ONE execute_js call per screen (entire screen content, not per-section)
  - Re-define shared helpers at the top of each script (they don't persist across calls)
  - Create TopContent + all form fields + buttons + BottomContent in one script
  - Structure-verify with get_current_page(maxDepth=1) after each write — confirm no new orphan nodes appeared
  - Visual-verify with export_image after each COMPLETE screen
Step 4: lint_fix_all on each individual screen (NOT on the wrapper)
Step 5: Post-lint structural verification — execute_js to inspect each screen's child hierarchy AND page-level children
Step 6: Final verification — export_image on both individual screens and the complete wrapper
```

### Large Flow (6+ screens) — BATCHED
```
Same as multi-screen, but split into batches of 2-3 screens per conversation turn.
After each batch: lint_fix_all + export_image.
Tell user what's done and what remains. Ask them to continue in a new message.
```

**Why this matters**: A 5-screen flow with "one section per call" = ~20 execute_js + ~20 export_image = 40+ tool calls. With "one screen per call" = ~6 execute_js + ~6 export_image = 12 tool calls. The context savings are massive.

### Section Creation Strategy (borrowed from Vibma inline-children pattern)

Each `execute_js` call should create a complete section with all its children in one script, not just an empty container. This dramatically reduces tool call count.

```js
// GOOD — one call creates the entire form section with all children
await figma.loadFontAsync({ family: "Inter", style: "Regular" });

const wrapper = await figma.getNodeByIdAsync("WRAPPER_ID");

const form = figma.createFrame();
form.name = "Login Form";
form.layoutMode = "VERTICAL";
form.itemSpacing = 16;
form.fills = [];
wrapper.appendChild(form);
form.layoutSizingHorizontal = "FILL";
form.layoutSizingVertical = "HUG";

// Email field (frame + text) created in the SAME script
const emailField = figma.createFrame();
emailField.name = "Email Field";
emailField.layoutMode = "HORIZONTAL";
emailField.paddingLeft = 16;
emailField.paddingRight = 16;
emailField.paddingTop = 12;
emailField.paddingBottom = 12;
emailField.cornerRadius = 10;
emailField.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.92 } }];
emailField.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.98 } }];
form.appendChild(emailField);
emailField.layoutSizingHorizontal = "FILL";
emailField.layoutSizingVertical = "HUG";

const emailPlaceholder = figma.createText();
emailPlaceholder.characters = "Email address";
emailPlaceholder.fontSize = 15;
emailPlaceholder.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.65 } }];
emailField.appendChild(emailPlaceholder);
emailPlaceholder.layoutSizingHorizontal = "FILL";
emailPlaceholder.layoutSizingVertical = "HUG";

// Password field in the SAME script — same pattern
const passField = figma.createFrame();
// ... same structure as emailField ...

return { formId: form.id, emailFieldId: emailField.id, passFieldId: passField.id };
```

```js
// BAD — one call per element, 6+ tool calls for a simple form
// Call 1: create form frame
// Call 2: create email field frame
// Call 3: create email placeholder text
// Call 4: create password field frame
// Call 5: create password placeholder text
// Call 6: verify
```

### Sizing Defaults (borrowed from Vibma auto-correction)

Apply these defaults consistently in every script to avoid layout bugs:

| Node role | Horizontal | Vertical | Notes |
|-----------|-----------|----------|-------|
| Screen shell | FIXED (402/412) | FIXED (874/915) | Mobile dimensions |
| Section container | FILL | HUG | Stretches to parent, height from content |
| Input field frame | FILL | HUG | Stretches to parent |
| Button frame | FILL | HUG | Full-width button, height from padding |
| Text in auto-layout | FILL | HUG | Wraps at parent width |
| Icon / badge | HUG | HUG | Intrinsic size only |
| Multi-screen wrapper | HUG | HUG | Shrinks to child screens |

Always set BOTH axes explicitly. Never rely on defaults.

## Post-Creation Lint (Mandatory)

When UI elements have been created using `create_frame`, `create_text`, or `execute_js` (with creation operations), you MUST run `lint_fix_all` before replying to the user. Rules:

- If more creation operations follow, wait until all are complete, then run `lint_fix_all` once
- If no creation operations occurred, or `lint_fix_all` was already run, skip it
- Pass individual screen node IDs to `lint_fix_all`'s `nodeIds` parameter — do NOT pass a wrapper containing multiple screens (can timeout and produces less targeted fixes)
- **After `lint_fix_all`, run `execute_js` to inspect each screen's child hierarchy** (names, child counts, visibility). `lint_fix_all` auto-fixes can introduce side effects: duplicate wrapper nodes, reparented elements, or hidden orphan frames. Compare the post-lint structure against the expected hierarchy and remove any unexpected nodes before final verification. **Also check page-level children** (`figma.currentPage.children`) — `lint_fix_all` may extract nodes from deep nesting and drop them at the page root as orphans.

## Anti-Patterns (Forbidden)

- ❌ Putting ALL screens of a multi-screen flow into a single execute_js call
- ❌ Skipping screenshot verification and moving to the next step
- ❌ Skipping structure verification (`get_current_page`) after any write operation — this is the minimum check that catches orphan nodes early
- ❌ Skipping skeleton verification — the skeleton is the foundation; errors here propagate to all subsequent steps
- ❌ Rebuilding an entire screen after an error instead of targeted fixes
- ❌ Ending a conversation after creating UI elements without running lint_fix_all
- ❌ Creating one element per execute_js call (one call for frame, another for its text child)
- ❌ Creating empty container frames first, then filling them in separate calls
- ❌ Omitting layoutSizingHorizontal or layoutSizingVertical on any node in auto-layout
- ❌ Using empty spacer frames for spacing — use `itemSpacing`, `padding`, or `SPACE_BETWEEN` instead
- ❌ Using "one section per call" granularity for multi-screen flows (too many calls, context bloat)
- ❌ Running export_image after every section in a multi-screen flow (use lightweight `get_current_page` for per-write checks; reserve `export_image` for key milestones)
- ❌ Returning full node trees or debug info in return values (return only IDs you'll reference later)
- ❌ Retrying a failed execute_js without first inspecting the page for orphan nodes — failed scripts are NOT always atomic; nodes created before the error point may persist
