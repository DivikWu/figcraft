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
        and define the COL (color palette) object BEFORE writing any execute_js code.
        ❌ FORBIDDEN: skipping this step or using hardcoded colors without design justification
STEP 3: CLASSIFY TASK SCALE                           → count screens, pick granularity:
        ├─ single element   → 1 execute_js call
        ├─ single screen    → 2-4 execute_js calls (1 per section)
        ├─ multi-screen 3-5 → 1 execute_js per FULL SCREEN (NOT per element, NOT per section)
        └─ large flow 6+    → batch 2-3 screens per conversation turn
STEP 4: IF multi-screen flow →
        readFile .kiro/steering/multi-screen-flow-guide.md   (MANDATORY — contains layer hierarchy, PRESET, helpers)
        ❌ FORBIDDEN: using create_frame/create_text individually for multi-screen flows
        ❌ FORBIDDEN: skipping the Wrapper → Header → Flow Row → Stage → Screen hierarchy
```

Proceed to write operations ONLY after completing all applicable steps above. The Workflow section below has full details for each step.

## Precedence

- This steering file is the authoritative source for execute_js behavior and layout rules in the FigCraft/Kiro context.
- When this file conflicts with the `figma-use` skill, this file wins. Notably: the `figma-use` skill claims failed scripts are "atomic" (no changes on error). In practice, **failed scripts are NOT always atomic** — nodes created before the error point may persist as orphans. Always inspect page state after a failure.
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
- Define a `COL` object at the top of every `execute_js` script with all colors derived from the design decision

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

- NEVER cheap gradients (purple/rainbow/oversaturated) or glow effects
- Vary corner radius across hierarchy levels (container > card > button); keep consistent within same level

### Accessibility

- Text contrast ratio ≥ 4.5:1
- Minimum touch target: iOS ≥ 44×44pt, Android ≥ 48×48dp, Web ≥ 24×24px

## execute_js Critical Rules

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
17. Responsive children (inputs, buttons, dividers) → `layoutSizingHorizontal: 'FILL'` (after appendChild)
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

| Node role | Horizontal | Vertical |
|-----------|-----------|----------|
| Screen shell (mobile) | FIXED (402/412) | FIXED (874/915) |
| Section container | FILL | HUG |
| Input / Button frame | FILL | HUG |
| Text in auto-layout | FILL | HUG |
| Icon / badge | FIXED | FIXED |
| Multi-screen wrapper | HUG | HUG (children FIXED) |

## Context Budget & Batching Strategy (CRITICAL)

Large design tasks (multi-screen flows, full pages) generate many tool calls. Each call's request + response accumulates in context. When context fills up, the model stalls or stops mid-task. **Proactively manage context to prevent this.**

### Granularity Rules — Match Script Size to Task Scale

The "one section per call" rule is a MINIMUM granularity (never go smaller). But for multi-screen flows, go BIGGER:

| Task scale | Script granularity | Example |
|------------|-------------------|---------|
| Single element (button, card) | 1 call for the element | One execute_js creates the card with all children |
| Single screen (login page) | 1 call per section (2-4 calls total) | Call 1: skeleton. Call 2: header+form. Call 3: buttons+footer |
| Multi-screen flow (3-5 screens) | 1 call per FULL SCREEN (skeleton + all content) | Call 1: wrapper+skeleton. Call 2: entire Screen 1. Call 3: entire Screen 2... |
| Large flow (6+ screens) | Split into batches of 2-3 screens per conversation turn | Tell user: "I'll create screens 1-3 now, then 4-6 in the next turn" |

**Key insight**: For multi-screen flows, each `execute_js` call should create an ENTIRE screen's content (TopContent + all form fields + buttons + BottomContent) using shared helper functions defined at the top of the script. This is NOT the same as "entire screen in one call" anti-pattern — the anti-pattern refers to cramming ALL screens into one script. One screen per script is the sweet spot.

### Verification Strategy (Two-Level)

Every `execute_js` write operation MUST be followed by verification. Use two levels to balance correctness and context cost:

- **Structure check** (lightweight, ~small context cost): `get_current_page(maxDepth=1)` — verifies page-level child count, node names, and sizes. Catches orphan nodes, duplicate wrappers, and missing children. **Use after EVERY write operation.**
- **Visual check** (heavyweight, ~large context cost): `export_image` — renders a screenshot to catch layout bugs, overflow, wrong colors, placeholder text. Use at key milestones only.

| Task scale | Structure check | Visual check (`export_image`) |
|------------|----------------|-------------------------------|
| Single screen | After every `execute_js` write | After each section, and final |
| Multi-screen flow (3-5) | After every `execute_js` write | After skeleton, after each complete screen, and final |
| Large flow (6+) | After every `execute_js` write | After skeleton, after first screen, at end of each batch |

**Key rule**: Structure check is NEVER optional. It is the minimum verification after any write. Visual check can be scaled based on context budget, but skeleton verification is also NEVER optional — the skeleton is the foundation for all subsequent operations.

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

## Workflow (execute_js)

0. **Context budget gate** — Do NOT call `discloseContext` to pre-load skills. The auto-loaded steering is sufficient for UI creation without a design system. If `get_mode` (Step 2) reveals a design system, THEN load `discloseContext("figma-generate-design")`. See §Skill & Reference Loading below for the full policy.
1. `ping` → `set_current_page` (if needed) → `get_current_page(maxDepth=1)` to inspect
2. **⛔ DESIGN DECISIONS (mandatory, blocking for UI creation)** — call `get_mode` to check library status, then:
   - Library selected → `readFile packages/core-mcp/src/prompts/design-guardian.md` (use existing tokens, exercise restraint) + `discloseContext("figma-generate-design")` (need component/variable/style discovery workflow)
   - No library → `readFile packages/core-mcp/src/prompts/design-creator.md` (make intentional design choices, avoid AI defaults)
   - **Complete the Design Thinking checklist** (see §Design Direction above): Purpose, Platform, Language, Density, Tone
   - **Define the color palette** — choose dominant + accent colors serving the Tone, document the `COL` object that will be used in all execute_js scripts
   - **Choose typography** — heading vs body distinction, font weights
   - **Output the design decisions to the user** — before writing any code, present the design plan as a brief summary: chosen Tone, color palette (hex values), typography choices, icon style. This makes the decisions explicit and reviewable. If the user disagrees, adjust before proceeding.
   - Apply ALL Design Direction rules (Color, Typography, Content, Iconography, Composition, Anti-AI Slop, Accessibility) BEFORE writing any execute_js code
   - If `get_mode` result contradicts user intent (e.g., user says "use my design system" but get_mode returns no library), alert the user to check plugin settings before proceeding
   - Skip this step only for non-creation tasks (inspect, lint, audit, token sync)
   - ❌ FORBIDDEN: writing any execute_js code before completing this step
   - ❌ FORBIDDEN: using hardcoded colors without design justification from the Design Thinking checklist
3. **Estimate task scale** — count screens and sections. Pick granularity from the table above. If 6+ screens, tell user upfront you'll batch.
4. Decide wrapper: multi-screen flow → HORIZONTAL wrapper (HUG/HUG), children FIXED. Single page → VERTICAL wrapper. Single element → no wrapper. For flows with a shared header/title above the screens, use a VERTICAL wrapper containing Header + HORIZONTAL Flow Row — **`readFile` `.kiro/steering/multi-screen-flow-guide.md` BEFORE writing any skeleton code** (contains required style presets, layer hierarchy, and helper templates).
5. Create wrapper frame first, return its ID. **Immediately verify with `get_current_page(maxDepth=1)`** — confirm page has exactly the expected number of top-level nodes. For multi-screen skeletons, also verify with `export_image`.
6. Build content at the appropriate granularity (see table above). Use shared helper functions in every script. **After each write, verify with `get_current_page(maxDepth=1)`** — check page-level child count hasn't changed unexpectedly.
7. Visual verification (`export_image`) at key milestones per the verification strategy table.
8. Fix before continuing — don't build on broken state
9. `lint_fix_all` on each individual screen (NOT on the wrapper — linting a wrapper with many screens can timeout)
10. **Post-lint structural verification (mandatory)** — after `lint_fix_all`, run `execute_js` to inspect each screen's child hierarchy (names, child counts, visibility, **padding values**) AND page-level children (`figma.currentPage.children`). `lint_fix_all` auto-fixes can introduce side effects: duplicate wrapper nodes, reparented elements, hidden orphan frames, **and unwanted padding injection**. Compare the post-lint structure against the expected hierarchy and remove any unexpected nodes or revert any unwanted property changes before proceeding.
    - **Padding injection pitfall**: lint may add `paddingLeft`/`paddingRight` to inner frames (e.g., header groups, link rows) that already inherit sufficient margin from an outer Screen shell's padding. This causes visible misalignment between sibling elements. After lint, verify that no inner frame received unexpected padding by checking `paddingLeft`/`paddingRight`/`paddingTop`/`paddingBottom` on all direct children of TopContent and BottomContent, and reset any values that were 0 before lint.
11. Final `export_image` verification on both individual screens AND the full wrapper

Anti-patterns: ❌ ALL screens in one execute_js | ❌ one element per call | ❌ one section per call for multi-screen flows (too granular) | ❌ `export_image` after every section in multi-screen flows (use lightweight `get_current_page` instead; reserve `export_image` for key milestones) | ❌ skip lint_fix_all | ❌ omit sizing on any node | ❌ empty spacer frames for spacing | ❌ skip structure check after ANY write operation | ❌ skip skeleton visual verification | ❌ skip post-lint structure check (both screen-level AND page-level) | ❌ skip post-lint padding verification on inner frames | ❌ returning full node trees in return values | ❌ retry failed execute_js without inspecting page for orphan nodes first | ❌ skip the PRE-FLIGHT CHECKLIST (Steps 0-4 at the top of this file) | ❌ using create_frame/create_text individually for multi-screen flows instead of execute_js | ❌ starting any write operation without first calling ping + get_current_page + get_mode | ❌ skip Step 2 Design Decisions (design-creator/guardian) — all visual choices become unjustified | ❌ hardcode colors/fonts without completing the Design Thinking checklist | ❌ emoji text nodes as icon placeholders (use figma.createNodeFromSvg instead)

## Multi-Screen Flow Generation Strategy

When building a multi-screen flow (auth, onboarding, checkout, etc.), `readFile` the detailed guide at `.kiro/steering/multi-screen-flow-guide.md` BEFORE writing any code. That guide contains full code templates and helper examples.

**CRITICAL — even if the guide is not loaded, these rules MUST be followed:**

Every `execute_js` script in a multi-screen flow MUST start with a `PRESET` variable. Default to `soft` if user hasn't specified a style:
```js
const PRESET = {
  screen: { radius: 28, shadow: null },
  button: { radius: 12 }, input: { radius: 12 }, card: { radius: 20 }, pill: { radius: 100 },
};
```
- Wrapper: `counterAxisAlignItems=MIN`, `clipsContent=false`, **must have a background fill** (e.g., light gray `{r:0.96,g:0.96,b:0.96}`), **must have `cornerRadius`** (use a presentation-level radius like 20–40, independent of `PRESET.screen.radius`)
- Flow Row + all Stage containers: `clipsContent=false`
- Screen: `cornerRadius=PRESET.screen.radius`, `clipsContent=true`, `effects=[PRESET.screen.shadow]`
- ALL corner radii in helpers (`makeButton`, `makeInput`, etc.) come from `PRESET` — **never hardcode**
- ALL ancestor containers of shadowed elements: `clipsContent=false` (see Rule #24)

## Skill & Reference Loading (CRITICAL — Context Budget)

**FORBIDDEN `discloseContext` calls for UI creation tasks:**
- ❌ `discloseContext("figma-essential-rules")` — already auto-loaded as steering, calling it duplicates ~15KB
- ❌ `discloseContext("figma-use")` — pulls in SKILL.md + gotchas.md + common-patterns.md (~60KB total). This cheat sheet already covers 90% of those rules. Use `readFile` on individual reference files when needed.
- ❌ `discloseContext("figma-generate-design")` when there is NO design system — the workflow in this file (Steps 1-11) already covers the creation process

**ALLOWED `discloseContext` calls:**
- ✅ `discloseContext("figma-generate-design")` — ONLY when assembling pages WITH a design system (need Step 2a-2c component/variable/style discovery). Note: this skill's SKILL.md says "MUST also load figma-use" — **ignore that directive in Kiro**. The auto-loaded steering already covers all execute_js rules that figma-use provides. This override is authorized by the Precedence section above.
- ✅ `discloseContext("figma-generate-library")` — ONLY when building a design system. Same override applies: ignore its "MUST load figma-use" directive in Kiro.
- ✅ `discloseContext("figma-implement-design")` — when generating code FROM Figma designs

**For everything else, use `readFile` on individual reference files:**
- API error → `readFile .kiro/skills/figma-use/references/gotchas.md`
- Need code template → `readFile .kiro/skills/figma-use/references/common-patterns.md`
- Component API → `readFile .kiro/skills/figma-use/references/component-patterns.md`
- Variable API → `readFile .kiro/skills/figma-use/references/variable-patterns.md`

Exception: if the user manually loaded `figma-design-creation` (via #figma-design-creation), its §1 skill loading table has been updated to align with this policy — no conflict.

## Icons (CRITICAL — no emoji placeholders)

**NEVER use emoji text nodes (🔒, ✉️, etc.) as icon placeholders.** Always create real vector icons using `figma.createNodeFromSvg()`. This produces scalable, colorable, production-ready vector nodes.

### Icon Helper Pattern

Every `execute_js` script that needs icons MUST include a `makeIcon` helper:

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

## Templates (structural reference — radii shown are for `soft` preset; always use the chosen style preset values from §Multi-Screen Flow step 0)

Screen layout (top/bottom distribution): `Frame(VERTICAL, FIXED 402×874, SPACE_BETWEEN, padding) → TopContent(VERTICAL, FILL, HUG) + BottomContent(HORIZONTAL, FILL, HUG)` — NEVER use empty spacer frames
Input field: `Frame(HORIZONTAL, cornerRadius=<preset.input>, stroke, padding=12/16, FILL) → Text(placeholder)`
Button: `Frame(HORIZONTAL, cornerRadius=<preset.button>, fill=primary, padding=14/24, CENTER, h≥52, FILL) → Text(label)`
Link row: `Frame(HORIZONTAL, itemSpacing=4, CENTER) → Text(desc) + Text(action, primary color)`
Pill / badge: `Frame(HORIZONTAL, cornerRadius=<preset.pill>, fill=pillBg, padding=8/14, HUG/HUG) → Text(label, 13px Medium, HUG/HUG)`

## Reference Docs (readFile on demand)

- `.kiro/steering/multi-screen-flow-guide.md` — Style presets, layer hierarchy, helper templates for multi-screen flows (auth, onboarding, checkout)
- `.kiro/steering/execute-js-guide.md` — Full execute_js workflow with code examples (Section Creation Strategy)
- `.kiro/skills/figma-use/references/gotchas.md` — WRONG/CORRECT code examples for every pitfall
- `.kiro/skills/figma-use/references/common-patterns.md` — Working code scaffolds
- `.kiro/skills/figma-use/references/component-patterns.md` — Components, variants, properties
- `.kiro/skills/figma-use/references/variable-patterns.md` — Variable collections, bindings, scopes
- `.kiro/skills/figma-use/references/text-style-patterns.md` — Text styles
- `.kiro/skills/figma-use/references/plugin-api-standalone.d.ts` — Full API typings (grep, don't load all)
