<!-- DIVERGES FROM UPSTREAM: figma-skills-ref/skills/figma-use/references/validation-and-recovery.md
     Reason: execute_js is NOT atomic (partial nodes may persist on error), unlike use_figma.
     Uses get_current_page(maxDepth=N) instead of get_metadata for validation.
     When syncing upstream, manually merge — do NOT replace wholesale. -->
# Validation Workflow & Error Recovery

> Part of the [figma-use skill](../SKILL.md). How to debug, validate, and recover from errors.

## Contents

- `get_current_page` vs `export_image`
- Error Recovery After Failed `execute_js`
- Recommended Workflow


## `get_current_page` vs `export_image`

After each `execute_js` call, validate results using the right tool for the job. Do NOT reach for `export_image` every time — it is expensive and should be reserved for visual checks.

### `get_current_page` — Use for intermediate validation (preferred)

`get_current_page(maxDepth=N)` returns a compressed tree of node IDs, types, names, positions, and sizes. Use it to confirm:

- **Structure & hierarchy**: correct parent-child relationships, component nesting, section contents
- **Node counts**: expected number of variants created, children present
- **Naming**: variant property names follow the `property=value` convention
- **Positioning & alignment**: x/y coordinates, width/height values match expectations
- **Layout properties**: auto-layout direction, sizing mode, padding, spacing
- **Component set membership**: all expected variants are inside the ComponentSet

```
Example: After creating a ComponentSet with 120 variants, call get_current_page on the
page to verify all 120 children exist with correct names, sizes, and positions
— without waiting for a full render.
```

**When to use `get_current_page`:**
- After creating/modifying nodes — to verify structure, counts, and names
- After layout operations — to verify positions and dimensions
- After combining variants — to confirm all components are in the ComponentSet
- After binding variables — to verify node properties (use execute_js to read bound variables if needed)
- Between multi-step workflows — to confirm step N succeeded before starting step N+1

### `export_image` — Use after each major creation milestone

`export_image` renders a pixel-accurate image. It is the only way to verify visual correctness (colors, typography rendering, effects, variable mode resolution). It is slower and produces large responses, so don't call it after every single `execute_js` — but do call it after each major milestone to catch visual problems early.

**When to use `export_image`:**
- **After creating a component set** — verify variants look correct, grid is readable, nothing is collapsed or overlapping
- **After composing a layout** — verify overall structure and spacing
- **After binding variables/modes** — verify colors and tokens resolved correctly
- **After any fix or recovery** — verify the fix didn't introduce new visual issues
- **Before reporting results to the user** — final visual proof

**What to look for in screenshots** — these are the most commonly missed issues:
- **Cropped/clipped text** — line heights or frame sizing cutting off descenders, ascenders, or entire lines
- **Overlapping content** — elements stacking on top of each other due to incorrect sizing or missing auto-layout
- **Placeholder text** still showing ("Title", "Heading", "Button") instead of actual content

## Error Recovery After Failed `execute_js`

**`execute_js` is NOT guaranteed atomic — partial nodes may persist.** Nodes created before the error point can remain on the page as orphans. Always inspect page state after a failure.

**Recovery steps when `execute_js` returns an error:**
1. **STOP — do NOT immediately fix the code and retry.** Read the error message carefully first.
2. **Understand the error.** Most errors are caused by wrong API usage, missing font loads, invalid property values, or referencing nodes that don't exist.
3. **ALWAYS inspect page state** — run `get_current_page(maxDepth=1)` to check for orphan nodes left behind by the failed script.
4. **Clean up orphan nodes** — if unexpected nodes exist, remove them with `execute_js` before retrying.
5. **Fix the script** based on the error message, then retry on a clean page.

## Recommended Workflow

```
1. execute_js        →  Create/modify nodes
2. get_current_page  →  Verify structure, counts, names, positions (fast, cheap)
3. execute_js        →  Fix any structural issues found
4. get_current_page  →  Re-verify fixes
5. ... repeat as needed ...
6. export_image      →  Visual check after each major milestone

⚠️ ON ERROR at any step:
   a. Read the error message carefully
   b. get_current_page / export_image  →  Inspect page state, clean up orphans
   c. Fix the script based on the error
   d. Retry the corrected script on a clean page
```
