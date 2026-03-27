---
inclusion: fileMatch
fileMatchPattern: "packages/adapter-figma/**,packages/core-mcp/src/tools/**,.kiro/steering/figma-*"
description: "Figma design creation optimization rules — efficiently creating designs with FigCraft tools"
---

# Figma Design Creation Optimization Rules

Core rules for creating Figma designs using FigCraft structured tools (`create_frame`, `create_text`, `nodes(method: "update")`).
For `execute_js` scripting rules, see #[[file:.kiro/steering/execute-js-guide.md]].
Incorporates official Figma Plugin API best practices.

## 1. Pre-Creation Checklist

### Skill loading (must decide before any tool call)

`figma-use` is a mandatory prerequisite for ANY `execute_js` call. Beyond that, load additional skills based on task type:

| Task type | Skills to load |
|-----------|---------------|
| Create/edit a single component, card, form, button in Figma | `figma-use` |
| Create full page, multi-screen flow, mobile/web screens | `figma-use` + `figma-generate-design` |
| Create a new blank Figma file then design in it | `figma-create-new-file` + `figma-use` |
| Build design system, tokens, variables, component library | `figma-use` + `figma-generate-library` |
| Generate project-level design system rules | `figma-create-design-system-rules` |
| Map Figma components to code components (Code Connect) | `figma-code-connect-components` |
| Generate frontend code from a Figma design | `figma-implement-design` (not for drawing in Figma) |

If the task involves multi-screen or full-page creation and you're unsure, load `figma-generate-design` — it's better to have the workflow rules and not need them than to miss them.

### Tool and context setup

1. `ping` to confirm connection
2. `get_mode` to get current mode, design context, and available tokens (parallel)
3. `get_current_page(maxDepth=1)` to understand existing page content and avoid overlaps (parallel with above)
4. If library components/variables are needed: `load_toolset("library")` to load the library toolset
5. If the page has existing designs, observe naming conventions, color system, and spacing patterns to match existing conventions
6. Prefer token values from `get_mode`'s designContext over hardcoded colors/spacing

## 2. Wrapper Frame Strategy — Decide Before Building

Before creating any content, decide whether to use a wrapper frame based on the task type:

| Task | Wrapper? | Reason |
|------|----------|--------|
| Multi-screen flow (login, onboarding, etc.) | Yes — one wrapper containing all screens | Keeps related screens grouped, easy to move/export as a unit |
| Single full-page layout (landing page, dashboard) | Yes — the page frame itself is the wrapper | Sections build inside it incrementally (see figma-generate-design skill Step 3) |
| Single isolated component or element | No | Directly on page is fine |
| Adding content to an existing screen | No | Append to the existing frame |

When using a wrapper:
- Create it in its own call first, return its ID
- All subsequent content is built as children of the wrapper (never as top-level page nodes that get reparented later — cross-call reparenting silently fails)
- For multi-screen wrappers, use `layoutMode: "HORIZONTAL"` with `itemSpacing` to auto-space screens side by side. Set wrapper to `layoutSizingHorizontal: "HUG"` and `layoutSizingVertical: "HUG"` — child screens must use FIXED sizing on both axes so they don't collapse inside the HUG parent

This aligns with the [figma-generate-design](../skills/figma-generate-design/SKILL.md) skill Step 3 rule: "Create the Page Wrapper Frame First."

## 3. Maximize Parallelism, Minimize Turns

> This section applies to FigCraft structured tools (`create_frame`, `create_text`, `nodes(method: "update")`).
> `execute_js` calls MUST be sequential — never parallel. See execute-js-guide.md for execute_js rules.

### Principle: All independent structured tool calls within the same turn must be parallelized

- Sibling frames created in parallel (e.g., 4 screens in one turn)
- Sibling text nodes created in parallel (e.g., label + placeholder in same turn)
- Child nodes under different parents can also be parallelized (e.g., Login Header and SignUp Header in same turn)
- `nodes(method: "update")` patches array combines all node updates into a single call

### Structured Creation Order (by dependency level)

```
Turn 1: Wrapper frame (if needed per §2) + all screen frames as wrapper children (parallel)
Turn 2: All section container frames + batch fillsVisible updates (parallel)
Turn 3: All leaf frames (inputs, buttons) + all text nodes + batch strokes updates (parallel)
Turn 4: Remaining text nodes + bottom link containers (parallel)
Turn 5: lint_fix_all + screenshot verification (parallel)
```

## 4. Set Complete Properties at Creation Time

Pass all supported `create_frame` parameters at creation time to avoid post-creation updates:
- `fill`, `cornerRadius`, `layoutMode`, `itemSpacing`
- `paddingTop/Right/Bottom/Left`
- `primaryAxisAlignItems`, `counterAxisAlignItems`
- `layoutSizingHorizontal`, `layoutSizingVertical` (only FILL needs to be set after appendChild)
- `parentId` (specify parent node directly)

## 5. Auto Layout Key Rules (from Figma Plugin API Best Practices)

1. **FILL must be set after appendChild** — `layoutSizingHorizontal/Vertical = 'FILL'` can only be set after the node is already a child of an auto-layout parent. The `create_frame` `layoutSizingHorizontal: FILL` parameter handles this ordering automatically.
2. **HUG parent + FILL child = child collapses** — when the parent's cross-axis is HUG, FILL children have no space to fill and collapse to minimum size. Parent must be FIXED or FILL.
3. **resize() resets sizing mode to FIXED** — if you need HUG, set it after resize().
4. **counterAxisAlignItems does not support STRETCH** — use `MIN` + child `layoutSizingHorizontal: FILL` instead.
5. **After setting `layoutMode`, always explicitly declare both `layoutSizingHorizontal` and `layoutSizingVertical`** — never rely on defaults. Default HUG silently overrides dimensions set by `resize()`. Use FIXED for fixed-size screens (e.g., mobile 402×874), HUG for scrollable long pages.

## 6. Input Field Standard Template

Colors should come from `get_mode`'s designContext. Below is the structural reference (colors annotated with token semantic names):
```
Field Container (VERTICAL, itemSpacing=6, FILL width, no fill)
  ├── Label (text, 14px Medium, text/secondary)
  └── Input Frame (HORIZONTAL, cornerRadius=10, fill=surface/input, stroke=border/default, padding=12/16, FILL width)
       └── Placeholder (text, 15px Regular, text/placeholder)
```

Multiple Field Containers can be created in parallel (under the same Form parent).
Input Frames and text nodes are created in the next turn in parallel.

## 7. Button Standard Template

```
Button Frame (HORIZONTAL, cornerRadius=12, fill=fill/primary, padding=14/24, CENTER, height=52, FILL width)
  └── Button Text (text, 16px Semi Bold, text/on-primary)
```

## 8. Bottom Link Standard Template

```
Link Container (HORIZONTAL, itemSpacing=4, CENTER, no fill)
  ├── Description Text (14px Regular, text/tertiary)
  └── Action Text (14px Semi Bold, fill/primary)
```

## 9. Transparent Container Handling

After creating container frames that don't need a background, batch-set `fillsVisible: false` in a single `nodes(method: "update")` call instead of updating individually.

## 10. Batch Stroke Setting

Set strokes for all input fields in a single `nodes(method: "update")` call:
```json
{"strokes": [{"color": {"r": 0.898, "g": 0.906, "b": 0.922}, "opacity": 1, "type": "SOLID"}]}
```
Note: stroke color must be an `{r, g, b}` object (0-1 range), not a hex string.

## 11. Validation Strategy

- After all pages are complete, run `lint_fix_all` to auto-fix quality issues
- Use `export_image` (FigCraft) or the official Figma MCP's `get_screenshot` to capture page screenshots for visual verification
- Only capture individual screens when issues are found
- For deep inspection of a single node, use `audit_node`

## 12. Mobile Screen Specifications

- iOS: 402×874 (iPhone 16 Pro)
- Android: 412×915
- Unified primary color scheme, button height ≥ 52px (meets iOS 44pt / Android 48dp minimum touch target)

## 13. Mobile Screen Modes — System Chrome Handling

Mobile screens have two modes for handling Status Bar and Home Indicator. Choose based on the design's purpose.

### Mode A: Concept / Flow Mockup (default)

For rapid flow exploration, information hierarchy review, and early-stage ideation. Focus is on content structure, not pixel-perfect device fidelity.

- Do NOT draw Status Bar or Home Indicator
- Reserve top/bottom breathing room via padding on the screen frame (e.g., `paddingTop: 48–56`, `paddingBottom: 32–40`) so content doesn't touch edges. These are approximate values for visual comfort, not exact safe area dimensions
- The screen is a "content-first product flow mockup"
- Use this mode when the user asks for flow screens, wireframes, concept exploration, or doesn't specify fidelity level

### Mode B: High-Fidelity / Device-Accurate

For deliverables closer to real device rendering, developer handoff, or prototype demos.

**System chrome strategy — real components or nothing:**
1. Check if a design library is available (`get_mode`, `components(method: "list_library")`)
2. If iOS system bar components are found → import them as instances
3. If no library or no matching components → fall back to padding-only approach: use exact safe area values (`paddingTop: 47`, `paddingBottom: 34`) to reserve space, but do not draw any system chrome elements

**Never hand-draw a low-fidelity fake Status Bar or Home Indicator.** System chrome is either real (from a library component) or absent. Half-baked placeholders lower overall design quality.

**When real components are available, use this structure:**
```
Screen Shell (VERTICAL, FIXED 402×874, clipsContent=true)
  ├── Status Bar (library instance, ~47pt height)
  ├── Content Viewport (VERTICAL, layoutGrow=1, contains all business UI)
  └── Home Indicator (library instance, ~34pt height)
```

**Safe area reference (iPhone 16 Pro):**
- Top safe area (Status Bar): ~47pt
- Bottom safe area (Home Indicator): ~34pt
- Usable content height: 402×874 → approximately 874 - 47 - 34 = 793pt

### How to decide which mode

| Scenario | Mode |
|----------|------|
| Flow exploration, concept validation | A |
| Wireframes, information architecture | A |
| User doesn't specify fidelity | A |
| High-fidelity visual deliverable | B |
| Developer handoff with safe area alignment | B |
| Prototype demo on real device | B |
| User explicitly asks for system bars | B |
