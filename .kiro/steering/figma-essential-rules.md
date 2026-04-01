---
inclusion: auto
description: "Figma design essential rules cheat sheet — compact version for every Figma chat session"
---

# Figma Design — Essential Rules (Cheat Sheet)

Compact rules for creating Figma designs. For detailed code examples, `readFile` the reference docs listed at the bottom.

## ⛔ MANDATORY PRE-FLIGHT CHECKLIST (execute BEFORE any Figma write operation)

Skipping ANY step below is a critical workflow violation. Every Figma UI creation task MUST execute these steps IN ORDER before the first write tool call. Non-creation tasks (inspect, lint, audit) skip this checklist.

```
STEP 0: ping                                          → verify plugin connection
STEP 1: get_current_page(maxDepth=1)                  → inspect existing content, find placement position
STEP 2: get_mode → DESIGN DECISIONS (⛔ BLOCKING — must complete before ANY write)
        ├─ library selected → readFile design-guardian.md + discloseContext("figma-generate-design")
        └─ no library       → readFile design-creator.md
        Then: complete the Design Thinking checklist (see §Design Direction below)
        ⛔ HARD STOP: present design plan to user and WAIT for explicit confirmation.
        Do NOT proceed to STEP 3 or any write operations until user approves.
        ❌ FORBIDDEN: skipping this step or using hardcoded colors without design justification
STEP 3: CLASSIFY TASK SCALE → pick creation method:
        ├─ DEFAULT: use create_frame + children (declarative — see figma-declarative-creation.md)
        │   ├─ single element   → 1 create_frame call
        │   ├─ single screen    → 1 create_frame call with full children tree
        │   ├─ multi-screen 3-5 → create_frame with items[] batch (up to 20 screens)
        │   ├─ large flow 6+    → batch 2-3 screens per conversation turn
        │   └─ complex params?  → dryRun:true first to preview inferences, then use correctedPayload
        ├─ BATCH TEXT: create_text with items[] (up to 50 text nodes)
        └─ DEBUG ONLY: execute_js requires load_toolset("debug") — NOT available by default
            Only for: diagnostics, node inspection, Plugin API methods not wrapped by any declarative tool
            ❌ NEVER for UI creation — use create_frame + children instead
STEP 4: IF multi-screen flow →
        See figma-declarative-creation.md §Multi-Screen Flows (already in context)
        ✅ REQUIRED: wrapper with nested screen children, or wrapper first then screens via parentId
        ✅ REQUIRED: each screen uses FIXED sizing (layoutSizingHorizontal/Vertical: FIXED)
        ✅ REQUIRED: wrapper uses clipsContent: false for shadow visibility
```

Proceed to write operations ONLY after completing all applicable steps above. The Workflow section below has full details for each step.

## Precedence

- This steering file is the authoritative source for UI creation rules and layout rules in the FigCraft/Kiro context.
- When this file conflicts with the `figma-use` skill, this file wins.
- `design-creator.md` / `design-guardian.md` (source: `packages/core-mcp/src/prompts/`) cover aesthetic direction and design decisions. They are loaded via `readFile` in Workflow step 2 for UI creation tasks, or via `get_design_guidelines` MCP tool in non-Kiro environments. Layout, sizing, and structural rules live here and in the other steering files.
- **Step 2 is a BLOCKING design decision step** — not just a file-loading step. The design-creator/guardian files provide the framework for ALL visual decisions (colors, typography, spacing, composition, content, icons, elevation). Skipping this step means all design choices are unjustified.

## Design Direction (MUST complete in Step 2 before any write)

This section summarizes the core principles from `design-creator.md` / `design-guardian.md`. Even if the full files are loaded via `readFile`, these rules are always in effect.

### Design Thinking Checklist (complete BEFORE creating)

1. **Purpose** — What problem does this solve? Who is the audience?
2. **Platform** — Web, iOS, or Android? Determines touch targets, safe areas, conventions.
3. **Language/region** — What language for UI text? Determines font choice and content.
4. **Density** — How much information per screen? (sparse form vs dense dashboard)
5. **Tone** — Pick a clear position: Minimal restraint ← Elegant refinement ← Warm approachable → Bold expressive → Maximal richness

### Color Rules

- MUST choose 1 dominant + 1 accent, total colors ≤ 5, serving the Tone
- Dominant color at 60%+, accent for key focal points only
- NEVER more than 1 accent color per semantic role per view
- NEVER default to blue/gray without justification — "Inter + blue + centered symmetry is the AI safe zone"
- Define a color palette with hex values for the design decision. Pass hex values or token names directly in `create_frame` children.

### Typography Rules

- MUST create clear visual distinction between heading and body (different weight or size)
- Limit to ≤ 3 font weights
- NEVER use only Inter without justification

### Content Rules

- MUST use realistic, contextually appropriate text — NEVER "Lorem ipsum", "Text goes here", "Button", "Title", "Label"
- Match content length to real-world usage (names ≤ 20 chars, descriptions 1–2 sentences)

### Iconography Rules

- MUST use a single icon style per design: outline, filled, or duotone — NEVER mix
- Keep icon stroke weight consistent with typography weight
- NEVER use decorative icons without functional meaning

### Composition Rules

- MUST establish a clear visual focal point
- Prefer asymmetry over symmetry; whitespace is a design element
- NEVER arrange all children in equal-width, equal-height uniform grids

### Spacing Rules

- MUST establish a base unit (recommended 8dp), all spacing as multiples
- Use larger spacing between groups than within groups

### Anti-AI Slop

- NEVER cheap gradients (purple/rainbow/oversaturated) or glow effects. When gradients ARE appropriate (hero backgrounds, CTAs), use `gradient` param with ≤3 stops and tasteful palette
- Vary corner radius across hierarchy levels (container > card > button); keep consistent within same level. Use per-corner radius for bottom sheets, top bars

### Accessibility

- Text contrast ratio ≥ 4.5:1
- Minimum touch target: iOS ≥ 44×44pt, Android ≥ 48×48dp, Web ≥ 24×24px

## execute_js Reference (debug toolset only — declarative tools handle these automatically)

These rules apply ONLY when using `execute_js` from the `debug` toolset (`load_toolset("debug")`). When using `create_frame` + `children` (the default), all of these are handled internally by the tool.

1. `return` to output data — no `figma.closePlugin()`, no async IIFE wrapper, no `console.log()`
2. `figma.notify()` throws — never use it
3. Colors 0–1 range (not 0–255). Fills/strokes are read-only arrays — clone, modify, reassign
4. `setBoundVariableForPaint()` returns a NEW paint — must capture and reassign
5. Load fonts before ANY text op: `await figma.loadFontAsync({family, style})`
6. `layoutSizingHorizontal/Vertical = 'FILL'` MUST be set AFTER `parent.appendChild(child)`
7. After `layoutMode`, always explicitly set BOTH `layoutSizingHorizontal` and `layoutSizingVertical` — defaults are HUG which silently overrides `resize()`
8. `resize()` resets sizing modes to FIXED — call resize BEFORE setting HUG/FILL
9. Page context resets each call — use `await figma.setCurrentPageAsync(page)` to switch
10. Failed scripts are NOT always atomic — partial nodes may remain after errors. On failure: STOP, inspect page with `get_current_page`, clean up orphan nodes, THEN fix and retry
11. MUST `return` created/mutated node IDs — for multi-screen flows, return only IDs needed by subsequent calls (see Context Budget section)
12. `await` every Promise — no fire-and-forget
13. Position top-level nodes away from (0,0) — scan existing children for clear space
14. `counterAxisAlignItems` does NOT support `'STRETCH'` — use `'MIN'` + child `FILL`
15. For multi-screen flows (20+ nodes per call), use `timeoutMs: 60000` to avoid timeout

## Layout & Quality Rules

16. NEVER use empty spacer frames — use `itemSpacing`, `padding`, `SPACE_BETWEEN` instead. For top/bottom distribution, see figma-design-creation.md §6.
17. Responsive children (inputs, buttons, dividers) → `layoutSizingHorizontal: 'FILL'` (declarative tools handle this automatically)
18. HUG parent + FILL child = child collapses — parent must be FIXED or FILL
19. FILL requires auto-layout parent
20. Frames with 2+ children MUST have auto-layout
21. Children must not overflow parent
22. Semantic frame naming — no "Frame 1"
23. All spacing/sizing values must be multiples of 4 (exceptions: strokeWeight, fontSize, lineHeight, icon sizes)
24. **Drop Shadow requires `clipsContent = false` on ALL ancestor layout containers** — Figma Frames default to `clipsContent = true`, which clips child shadows at the frame boundary. When a child has a Drop Shadow effect, every ancestor Frame between that child and the top-level wrapper MUST set `clipsContent = false` so the shadow renders fully on all sides. Missing even one ancestor level will clip the shadow on that side. The only exception is the shadowed element itself — e.g., a Screen shell with `cornerRadius` should keep `clipsContent = true` to clip its own content at rounded corners, while its shadow is rendered by the parent.

## Mobile Dimensions

- iOS: 402×874 (iPhone 16 Pro) | Android: 412×915
- Button height ≥ 52px (meets 44pt iOS / 48dp Android touch target)
- Default mode: concept mockup (no system bars, use padding for breathing room: paddingTop ~48–56, paddingBottom ~32–40)

## Sizing Defaults (set BOTH axes on every node)

See `figma-responsive-sizing.md` §Sizing by Node Role (already in context) for the full table. Key rule: always set BOTH axes explicitly.

## Context Budget & Batching Strategy (CRITICAL)

Large design tasks (multi-screen flows, full pages) generate many tool calls. Each call's request + response accumulates in context. When context fills up, the model stalls or stops mid-task. **Proactively manage context to prevent this.**

### Granularity Rules — Match Call Size to Task Scale

| Task scale | Granularity | Example |
|------------|------------|---------|
| Single element (button, card) | 1 create_frame call | One call with children builds the card |
| Single screen (login page) | 1 create_frame call with full children tree | Entire screen in one call |
| Multi-screen flow (3-5 screens) | create_frame with items[] batch | One call creates all screens (max 20), lint runs once at end. See batch tradeoff below |
| Large flow (6+ screens) | Batch 2-3 screens per conversation turn | Tell user: "I'll create screens 1-3 now, then 4-6 in the next turn" |
| Multiple labels/headings | create_text with items[] batch | One call creates up to 50 text nodes |
| Complex/unfamiliar params | dryRun:true → correctedPayload | Preview inferences first, then create with validated params |

### Batch Mode Tradeoff (items[] vs individual calls)

`items[]` batch (max 20) creates multiple frames in one call, reducing context overhead. But there are tradeoffs:

| | items[] batch | Individual calls |
|---|---|---|
| Context cost | 1 request + 1 response | N requests + N responses |
| Visual verification | Call `export_image` after batch | Call `export_image` per screen |
| Error isolation | Per-item error handling (one failure doesn't block others) | Natural isolation |
| Best for | Skeleton/wrapper creation, homogeneous screens | Screens with complex children needing visual feedback |

**Recommendation**: Use `items[]` for the wrapper skeleton (empty screens), then fill each screen individually with `create_frame(parentId=screenId, children=[...])` and verify with `export_image(scale:0.5)`.

### Verification Strategy (Embedded + On-Demand)

`create_frame` responses include `_children` (node IDs) and `_previewHint` (suggested export_image call). Verification strategy:

- **Embedded check** (zero cost): inspect `_children` from the create_frame response. **Default after every write.**
- **On-demand visual check**: `export_image(scale:0.5)` — use at key milestones (after each screen, after skeleton) for visual verification.
- **On-demand structure check**: `get_current_page(maxDepth=1)` — only when you need broader canvas context (sibling placement, page-level node count).

| Task scale | Embedded check (_children) | Extra calls |
|------------|---------------------------|-------------|
| Single screen | After every write | `export_image(scale:0.5)` after creation |
| Multi-screen flow (3-5) | After every write | `export_image` after each screen; `get_current_page` after wrapper if needed |
| Large flow (6+) | After every write | `export_image` at end of each batch; `get_current_page` after wrapper |

**Key rule**: Always check `_children`. Use `export_image(scale:0.5)` for visual verification at key milestones.

### Return Value Discipline

Keep return values MINIMAL to reduce context bloat:
- Return only the IDs you'll actually reference in subsequent calls
- Don't return full node trees or debug info unless debugging
- For multi-screen flows, return only `{ wrapperId, screens: [{ id, name }] }` — not every child ID

### When Context Is Running Low

If you sense the conversation is getting long (15+ tool calls already made):
1. Stop creating new content
2. Run `lint_fix_all` on what exists
3. Tell the user what's done and what remains
4. Ask them to continue in a new message (which resets context)

## Workflow

### Default: Declarative Tools (create_frame + children)

0. **Context budget gate** — Do NOT call `discloseContext` to pre-load skills. The auto-loaded steering is sufficient for UI creation without a design system. If `get_mode` (Step 2) reveals a design system, THEN load `discloseContext("figma-generate-design")`.
1. `ping` → `set_current_page` (if needed) → `get_current_page(maxDepth=1)` to inspect
2. **⛔ DESIGN DECISIONS (mandatory, blocking for UI creation)** — call `get_mode`, complete Design Thinking checklist, present plan to user, WAIT for confirmation.
3. **Create UI** — use `create_frame` with `children` to build entire node trees. See `figma-declarative-creation.md` for patterns and templates.
4. **Verify** — check `_children` from create_frame response. Call `export_image(scale:0.5)` for visual verification at key milestones.
5. **Lint** — `lint_fix_all` on each screen before replying to user.
6. **Final verification** — `export_image` on the complete result.

### Debug: execute_js (requires `load_toolset("debug")` — diagnostics only)

`execute_js` is NOT for UI creation. Use it only for diagnostics, node inspection, or Plugin API methods not wrapped by declarative tools. When used:
1. Verify page state with `get_current_page(maxDepth=1)` after every write — execute_js does not return `_children`
2. Clean up orphan nodes — failed scripts are NOT atomic
3. Return only IDs needed by subsequent calls

Anti-patterns: ❌ ALL screens in one create_frame call | ❌ one element per call | ❌ skip lint_fix_all | ❌ omit sizing on any node | ❌ empty spacer frames for spacing | ❌ skip checking _children from create_frame response | ❌ skip post-lint structure check | ❌ skip the PRE-FLIGHT CHECKLIST (Steps 0-4 at the top of this file) | ❌ starting any write operation without first calling ping + get_current_page | ❌ skip Step 2 Design Decisions — all visual choices become unjustified | ❌ hardcode colors/fonts without completing the Design Thinking checklist | ❌ emoji text nodes as icon placeholders (use icon_create instead) | ❌ calling get_current_page after every create_frame when _children suffices | ❌ using execute_js for UI creation (use create_frame + children instead)

## Multi-Screen Flow Generation Strategy

See `figma-declarative-creation.md` §Multi-Screen Flows — build wrapper with nested screen children using `create_frame` + `children`.

For detailed layer hierarchy and style presets: `readFile` `.kiro/steering/multi-screen-flow-guide.md`.

Key rules:
- Wrapper: `counterAxisAlignItems=MIN`, `clipsContent=false`, background fill, `cornerRadius` 20–40
- Flow Row + all Stage containers: `clipsContent=false`
- Screen: `cornerRadius=28` (soft preset), `clipsContent=true`
- ALL ancestor containers of shadowed elements: `clipsContent=false` (see Rule #24)

## Skill & Reference Loading (CRITICAL — Context Budget)

**FORBIDDEN `discloseContext` calls for UI creation tasks:**
- ❌ `discloseContext("figma-essential-rules")` — already auto-loaded as steering, calling it duplicates ~15KB
- ❌ `discloseContext("figma-use")` — pulls in SKILL.md + gotchas.md + common-patterns.md (~60KB total). This cheat sheet already covers 90% of those rules. Use `readFile` on individual reference files when needed.
- ❌ `discloseContext("figma-generate-design")` when there is NO design system — the workflow in this file (Steps 1-11) already covers the creation process

**ALLOWED `discloseContext` calls:**
- ✅ `discloseContext("figma-generate-design")` — ONLY when assembling pages WITH a design system (need component/variable/style discovery). Note: this skill's SKILL.md says "MUST also load figma-use" — **ignore that directive in Kiro**. The auto-loaded steering is sufficient. This override is authorized by the Precedence section above.
- ✅ `discloseContext("figma-generate-library")` — ONLY when building a design system. Same override applies: ignore its "MUST load figma-use" directive in Kiro.
- ✅ `discloseContext("figma-implement-design")` — when generating code FROM Figma designs

**For everything else, use `readFile` on individual reference files:**
- API error → `readFile .kiro/skills/figma-use/references/gotchas.md`
- Need code template → `readFile .kiro/skills/figma-use/references/common-patterns.md`
- Component API → `readFile .kiro/skills/figma-use/references/component-patterns.md`
- Variable API → `readFile .kiro/skills/figma-use/references/variable-patterns.md`

Exception: if the user manually loaded `figma-design-creation` (via #figma-design-creation), its §1 skill loading table has been updated to align with this policy — no conflict.

## Icons & SVG (CRITICAL — no emoji placeholders)

**NEVER use emoji text nodes (🔒, ✉️, etc.) as icon placeholders.** Three approaches, in order of preference:

| Method | When to use | Pros | Cons |
|--------|------------|------|------|
| `icon_search` → `icon_create` | Icons from standard sets (Lucide, MDI, etc.) | Simplest, auto color binding, 200k+ icons | Requires network (Iconify API) |
| `create_frame` with `{type:'svg', svg:'...'}` child | Custom SVG inline with other children | Declarative, part of node tree, Opinion Engine sizing | No color variable binding on SVG internals |
**Default to `icon_create`** for standard icons. Use `create_frame` SVG children when embedding custom SVGs in a declarative tree.

### Icon Helper Pattern (for debug toolset execute_js only)

When using `execute_js` from the debug toolset for icon operations, include a `makeIcon` helper:

```js
function makeIcon(parent, name, svgPath, size, color) {
  // CLEANUP: remove any existing children to prevent duplicates
  // This is critical when replacing emoji placeholders or re-running icon creation
  while (parent.children.length > 0) {
    parent.children[0].remove();
  }
  const svgStr = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="${svgPath}" stroke="rgb(${Math.round(color.r*255)},${Math.round(color.g*255)},${Math.round(color.b*255)})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`;
  const svgNode = figma.createNodeFromSvg(svgStr);
  svgNode.name = `Icon / ${name}`;
  svgNode.resize(size, size);
  parent.appendChild(svgNode);
  svgNode.layoutSizingHorizontal = "FIXED";
  svgNode.layoutSizingVertical = "FIXED";
  return svgNode;
}
```

**IMPORTANT**: The `makeIcon` helper includes a cleanup step that removes all existing children from the parent before adding the new icon. This prevents duplicate icons when:
- Replacing emoji text nodes with vector icons
- Re-running a script that creates icons (e.g., after a failure/retry)
- `lint_fix_all` has modified the parent structure

If the parent frame is shared with non-icon children, do NOT use this helper directly — instead, target a dedicated icon container frame.

For **filled** icons (not stroke-based), use `fill` instead of `stroke` in the SVG string.

### Built-in Icon Path Library

Include this `ICONS` object at the top of scripts that need icons. All paths use a 24×24 viewBox:

```js
const ICONS = {
  lock:     "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2ZM7 11V7a5 5 0 0 1 10 0v4",
  mail:     "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2Zm16 2-8 5-8-5",
  eye:      "M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Zm11 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff:   "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22",
  check:    "M20 6L9 17l-5-5",
  chevronR: "M9 18l6-6-6-6",
  chevronL: "M15 18l-6-6 6-6",
  chevronD: "M6 9l6 6 6-6",
  arrowL:   "M19 12H5M12 19l-7-7 7-7",
  search:   "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35",
  user:     "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  google:   "M21.8 10.4h-9.4v3.4h5.5c-.5 2.5-2.6 3.8-5.5 3.8a6.2 6.2 0 0 1 0-12.4c1.5 0 2.9.5 4 1.5l2.5-2.5A10.2 10.2 0 0 0 12.4 2 10 10 0 1 0 22 13.2c0-.9-.1-1.9-.2-2.8Z",
  apple:    "M18.7 12.4c0-3-2.5-4.5-2.6-4.5.9-1.4.7-3.3.7-3.4-1.4.1-3 .9-3.8 1.6-.7-.6-2-1.4-3.4-1.4-2.8.1-5.1 2.5-5.1 5.5 0 4.3 3.3 9.3 5.8 9.3.8 0 1.8-.5 2.7-.5.9 0 1.7.5 2.7.5 2.3 0 4.6-4.2 5-5-.1 0-3-.9-3-3.1Z",
  plus:     "M12 5v14M5 12h14",
  x:        "M18 6L6 18M6 6l12 12",
  menu:     "M3 12h18M3 6h18M3 18h18",
  home:     "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
};
```

### Usage in Helpers

When a design element needs an icon (e.g., a lock icon for "Forgot Password", a mail icon for "Verification"), call:
```js
makeIcon(parentFrame, "Lock", ICONS.lock, 24, COL.primary);
```

### When to Extend the Library

If a design requires an icon not in the built-in set, find its SVG path from a standard icon set (Feather, Lucide, Material) and add it to the `ICONS` object inline. Keep paths in the 24×24 viewBox coordinate system.

## Templates

For declarative tool templates (create_frame + children JSON), see `figma-declarative-creation.md` §Templates (already in context).

## Reference Docs (readFile on demand)

- `.kiro/steering/figma-declarative-creation.md` — Declarative creation patterns, templates, smart defaults (auto-loaded)
- `.kiro/steering/multi-screen-flow-guide.md` — Style presets, layer hierarchy for multi-screen flows
- `.kiro/steering/figma-design-creation.md` — Full design creation rules, layout strategies
- `.kiro/steering/execute-js-guide.md` — Debug toolset execute_js reference (diagnostics only)
- `.kiro/skills/figma-use/references/gotchas.md` — Plugin API pitfalls with WRONG/CORRECT examples
- `.kiro/skills/figma-use/references/common-patterns.md` — Working code scaffolds
- `.kiro/skills/figma-use/references/component-patterns.md` — Components, variants, properties
- `.kiro/skills/figma-use/references/variable-patterns.md` — Variable collections, bindings, scopes
