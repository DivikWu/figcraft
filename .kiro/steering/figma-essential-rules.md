---
inclusion: auto
description: "Figma design essential rules cheat sheet — compact version for every Figma chat session"
---

# Figma Design — Essential Rules (Cheat Sheet)

Compact rules for creating Figma designs. For detailed code examples, `readFile` the reference docs listed at the bottom.

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
| Icon / badge | HUG | HUG |
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

1. `ping` → `set_current_page` (if needed) → `get_current_page(maxDepth=1)` to inspect
2. **Estimate task scale** — count screens and sections. Pick granularity from the table above. If 6+ screens, tell user upfront you'll batch.
3. Decide wrapper: multi-screen flow → HORIZONTAL wrapper (HUG/HUG), children FIXED. Single page → VERTICAL wrapper. Single element → no wrapper. For flows with a shared header/title above the screens, use a VERTICAL wrapper containing Header + HORIZONTAL Flow Row — **`readFile` `.kiro/steering/multi-screen-flow-guide.md` BEFORE writing any skeleton code** (contains required style presets, layer hierarchy, and helper templates).
4. Create wrapper frame first, return its ID. **Immediately verify with `get_current_page(maxDepth=1)`** — confirm page has exactly the expected number of top-level nodes. For multi-screen skeletons, also verify with `export_image`.
5. Build content at the appropriate granularity (see table above). Use shared helper functions in every script. **After each write, verify with `get_current_page(maxDepth=1)`** — check page-level child count hasn't changed unexpectedly.
6. Visual verification (`export_image`) at key milestones per the verification strategy table.
7. Fix before continuing — don't build on broken state
8. `lint_fix_all` on each individual screen (NOT on the wrapper — linting a wrapper with many screens can timeout)
9. **Post-lint structural verification (mandatory)** — after `lint_fix_all`, run `execute_js` to inspect each screen's child hierarchy (names, child counts, visibility) AND page-level children (`figma.currentPage.children`). `lint_fix_all` auto-fixes can introduce side effects: duplicate wrapper nodes, reparented elements, or hidden orphan frames. Compare the post-lint structure against the expected hierarchy and remove any unexpected nodes before proceeding.
10. Final `export_image` verification on both individual screens AND the full wrapper

Anti-patterns: ❌ ALL screens in one execute_js | ❌ one element per call | ❌ one section per call for multi-screen flows (too granular) | ❌ `export_image` after every section in multi-screen flows (use lightweight `get_current_page` instead; reserve `export_image` for key milestones) | ❌ skip lint_fix_all | ❌ omit sizing on any node | ❌ empty spacer frames for spacing | ❌ skip structure check after ANY write operation | ❌ skip skeleton visual verification | ❌ skip post-lint structure check (both screen-level AND page-level) | ❌ returning full node trees in return values | ❌ retry failed execute_js without inspecting page for orphan nodes first

## Multi-Screen Flow Generation Strategy

When building a multi-screen flow (auth, onboarding, checkout, etc.), `readFile` the detailed guide at `.kiro/steering/multi-screen-flow-guide.md` BEFORE writing any code. That guide contains full code templates and helper examples.

**CRITICAL — even if the guide is not loaded, these rules MUST be followed:**

Every `execute_js` script in a multi-screen flow MUST start with a `PRESET` variable. Default to `soft` if user hasn't specified a style:
```js
const PRESET = {
  screen: { radius: 28, shadow: {type:"DROP_SHADOW",color:{r:0,g:0,b:0,a:0.08},offset:{x:0,y:4},radius:24,spread:0,visible:true,blendMode:"NORMAL"} },
  button: { radius: 12 }, input: { radius: 12 }, card: { radius: 20 }, pill: { radius: 100 },
};
```
- Wrapper: `counterAxisAlignItems=MIN`, `clipsContent=false`, **must have a background fill** (e.g., light gray `{r:0.96,g:0.96,b:0.96}`), **must have `cornerRadius`** (use a presentation-level radius like 20–40, independent of `PRESET.screen.radius`)
- Flow Row + all Stage containers: `clipsContent=false`
- Screen: `cornerRadius=PRESET.screen.radius`, `clipsContent=true`, `effects=[PRESET.screen.shadow]`
- ALL corner radii in helpers (`makeButton`, `makeInput`, etc.) come from `PRESET` — **never hardcode**
- ALL ancestor containers of shadowed elements: `clipsContent=false` (see Rule #24)

## Skill & Reference Loading

- Do NOT pre-load `figma-use` or other large skills — this cheat sheet covers the core rules
- Exception: if the user manually loaded `figma-design-creation` (via #figma-design-creation), follow its §1 skill loading table — it takes precedence for that session
- If unsure about a specific API pattern (e.g., variable binding, component properties), `readFile` the relevant reference file listed below
- Only load a full skill via `discloseContext` when the task explicitly requires it (e.g., `figma-generate-library` for building a design system)

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
