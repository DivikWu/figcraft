---
inclusion: fileMatch
fileMatchPattern: "packages/adapter-figma/**,packages/core-mcp/src/tools/**,.kiro/steering/figma-*,.kiro/skills/figma-*"
description: "Workflow guide for building design system libraries using FigCraft execute_js"
---

# Building Design System Libraries with execute_js

This guide adapts the official `figma-generate-library` skill workflow to FigCraft's `execute_js`.
Core principle: this is NOT a one-shot task — it requires 20-100+ `execute_js` calls across multiple phases, each requiring user confirmation.

You MUST read #[[file:.kiro/steering/execute-js-guide.md]] before using `execute_js`.

## Mandatory Workflow

### Phase 0: Discovery (no writes)

1. Analyze codebase → extract tokens, components, naming conventions
2. Inspect Figma file → pages, variables, components, styles, existing conventions
3. Search subscribed libraries → use `list_library_components`, `list_library_variables` to find reusable assets
4. Lock v1 scope → confirm token set + component list with user
5. Map code → Figma → resolve conflicts (ask user when code and Figma disagree)

⛔ User checkpoint: present full plan, wait for explicit approval

### Phase 1: Foundation (tokens MUST come before components)

1. Create variable collections and modes
2. Create primitive variables (raw values, 1 mode)
3. Create semantic variables (aliases to primitives, multi-mode support)
4. Set scopes for all variables (NEVER leave ALL_SCOPES)
5. Set code syntax for all variables (WEB must use `var()` wrapper)
6. Create effect styles and text styles

⛔ User checkpoint: present variable summary, wait for approval

### Phase 2: File Structure

1. Create page skeleton: Cover → Getting Started → Foundations → --- → Components → ---
2. Create foundation documentation pages (color swatches, type specimens, spacing bars)

⛔ User checkpoint: present page list + screenshots

### Phase 3: Components (build one at a time, in dependency order)

For each component:
1. Create a dedicated page
2. Build the base component (auto-layout + full variable bindings)
3. Create all variant combinations (combineAsVariants + grid layout)
4. Add component properties (TEXT, BOOLEAN, INSTANCE_SWAP)
5. Validate: `get_current_page` (structure) + `export_image` (visual)

⛔ User checkpoint for each component

### Phase 4: Integration + QA

1. Code Connect mapping
2. Accessibility audit
3. Naming audit
4. Unresolved binding audit
5. Final screenshot review

## Key Rules

- Variables MUST come before components — components bind to variables
- Inspect before creating — use read-only `execute_js` to discover existing conventions first
- One page per component
- Visual properties bind to variables — fills, strokes, padding, radius, gap
- Variable scopes MUST be explicitly set:
  - Background: `["FRAME_FILL", "SHAPE_FILL"]`
  - Text: `["TEXT_FILL"]`
  - Border: `["STROKE_COLOR"]`
  - Spacing: `["GAP"]`
  - Radius: `["CORNER_RADIUS"]`
  - Primitives: `[]` (hidden)
- Code syntax WEB MUST use `var()` wrapper: `var(--color-bg-primary)`
- Semantic variables alias to primitives: `{ type: 'VARIABLE_ALIAS', id: primitiveVar.id }`
- After combineAsVariants, you MUST manually layout — variants stack at (0,0) by default
- NEVER run `execute_js` calls in parallel — must be strictly sequential
- NEVER guess node IDs — read them from return values of previous calls

## Token Architecture

| Complexity | Pattern |
|------------|---------|
| < 50 tokens | Single collection, 2 modes (Light/Dark) |
| 50-200 tokens | Standard: Primitives (1 mode) + Color semantic (Light/Dark) + Spacing (1 mode) |
| 200+ tokens | Advanced: multiple semantic collections, 4-8 modes |

## Variable Naming Conventions

```
color/bg/primary     color/text/secondary    color/border/default
spacing/xs  spacing/sm  spacing/md  spacing/lg  spacing/xl
radius/none  radius/sm  radius/md  radius/lg  radius/full
```
