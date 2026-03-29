---
inclusion: manual
description: "Figma design creation optimization rules — full version with templates and strategies. Use #figma-design-creation to load when needed."
---

# Figma Design Creation Optimization Rules

Core rules for creating Figma designs using FigCraft structured tools (`create_frame`, `create_text`, `nodes(method: "update")`).
For `execute_js` scripting rules, see #[[file:.kiro/steering/execute-js-guide.md]].
Incorporates official Figma Plugin API best practices.

## 1. Pre-Creation Checklist

### Skill loading (must decide before any tool call)

In Kiro, the auto-loaded `figma-essential-rules.md` steering already covers all execute_js rules. Do NOT call `discloseContext("figma-use")` — it duplicates ~60KB of content already in context. Load additional skills based on task type:

| Task type | Skills to load |
|-----------|---------------|
| Create/edit a single component, card, form, button in Figma | None (auto-loaded steering is sufficient) |
| Create full page, multi-screen flow, mobile/web screens (no design system) | None (auto-loaded steering is sufficient) |
| Create full page using a design system | `figma-generate-design` (uses Figma Power for component discovery/import via `inspectFileStructure`, `importComponentSetByKeyAsync`, `bindVariablesToComponent`) |
| Create a new blank Figma file then design in it | `figma-create-new-file` |
| Build design system, tokens, variables, component library | `figma-generate-library` (uses Figma Power helper scripts) |
| Generate project-level design system rules | `figma-create-design-system-rules` |
| Map Figma components to code components (Code Connect) | `figma-code-connect-components` |
| Generate frontend code from a Figma design | `figma-implement-design` (not for drawing in Figma) |

Use `readFile` on individual reference files (gotchas.md, common-patterns.md, etc.) when you need specific API patterns.

### Tool and context setup

1. `ping` to confirm FigCraft plugin connection
2. `get_current_page(maxDepth=1)` to understand existing page content, find clear placement position, and observe naming/color/spacing conventions
3. If creating UI with a design system library: load `figma-generate-design` skill — it uses Figma Power (official Figma MCP) for component discovery and import via fileKey, bypassing library name matching issues
4. If no design system: skip `get_mode`, use hardcoded colors/spacing directly

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

## 3. Build Order: Parent-First, Scale-Appropriate Granularity

### Principle: Create parents before children. Match script granularity to task scale.

This follows Vibma's "parent-first rule" — dependent creates must be sequential because children need parent IDs.

### For execute_js — Granularity by Task Scale

| Task scale | Script granularity | Verification frequency |
|------------|-------------------|----------------------|
| Single screen | 1 call per section (2-4 calls) | export_image after each section |
| Multi-screen flow (3-5 screens) | 1 call per FULL SCREEN | export_image after each complete screen |
| Large flow (6+ screens) | Batch 2-3 screens per turn | export_image at end of each batch |

#### Single Screen Example
```
Call 1: Create screen shell frame, return ID
        → export_image to verify
Call 2: Create header section with all children
        → export_image to verify
Call 3: Create form section with all children (inputs + buttons)
        → export_image to verify
Call 4: lint_fix_all → post-lint check → export_image
```

#### Multi-Screen Flow Example (CONTEXT-OPTIMIZED)
```
Call 1: Create wrapper + all screen shells (skeleton with shared helpers + loop)
        → export_image to verify skeleton
Call 2: Fill Screen 1 entirely (TopContent + form + buttons + BottomContent)
        → export_image to verify Screen 1
Call 3: Fill Screen 2 entirely
        → export_image to verify Screen 2
...
Call N: lint_fix_all on each screen → post-lint check → final export_image
```

Each "fill screen" call re-defines shared helpers (makeText, makeButton, makeField) at the top of the script — they don't persist across calls. This ensures every screen has identical visual rhythm.

**Why this matters**: A 5-screen flow with "one section per call" = ~20 execute_js + ~20 export_image = 40+ tool calls → context bloat → model stalls. With "one screen per call" = ~6 execute_js + ~6 export_image = 12 tool calls → fits comfortably in context.

### For structured tools (create_frame, create_text)

Maximize parallelism within each dependency level. All independent calls in the same turn must be parallelized.

```
Turn 1: Wrapper frame (if needed per §2) + all screen frames as wrapper children (parallel)
Turn 2: All section container frames (parallel siblings)
Turn 3: All leaf frames (inputs, buttons) + all text nodes (parallel)
Turn 4: Remaining text nodes + batch property updates via nodes(method: "update") (parallel)
Turn 5: lint_fix_all + export_image verification
```

### Choosing between execute_js and structured tools

| Scenario | Recommended approach |
|----------|---------------------|
| Screen with 3+ sections, each with nested children | `execute_js` — fewer calls, complete sections per call |
| Multi-screen flow (any size) | `execute_js` — one screen per call with shared helpers |
| Simple layout with flat structure | Structured tools — parallelism across siblings |
| Complex logic (loops, conditionals, variable bindings) | `execute_js` — only option |
| Quick single-element addition | Structured tools — less overhead |

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

### Sizing Defaults by Node Role

See the Sizing Defaults table in `figma-essential-rules.md` (auto-loaded) — always set BOTH axes explicitly on every node.

## 6. Screen Layout — Top/Bottom Content Distribution (CRITICAL)

When a screen needs content at the top and a link/action at the bottom (e.g., login form at top, "Register" link at bottom), **NEVER use empty spacer frames** to push bottom content down. This is explicitly forbidden by Layout Rule #16.

### ✅ CORRECT — Use SPACE_BETWEEN on the screen frame

Group content into semantic containers ("Top Content" and "Bottom Content"), then use `primaryAxisAlignItems: "SPACE_BETWEEN"` on the parent screen frame to distribute them:

```
Screen Shell (VERTICAL, FIXED 402×874, primaryAxisAlignItems=SPACE_BETWEEN, padding)
  ├── Top Content (VERTICAL, FILL width, HUG height, itemSpacing=0)
  │     ├── Header (VERTICAL, FILL, HUG, itemSpacing=8)
  │     │     ├── Title (text)
  │     │     └── Subtitle (text)
  │     └── Form (VERTICAL, FILL, HUG, itemSpacing=20)
  │           ├── Email Field
  │           ├── Password Field
  │           ├── Forgot Password Row
  │           └── Login Button
  └── Bottom Content (VERTICAL or HORIZONTAL, FILL width, HUG height)
        ├── "Don't have an account?" (text)
        └── "Register" (text, primary color)
```

**Key properties on the screen frame:**
- `layoutMode = "VERTICAL"`
- `primaryAxisAlignItems = "SPACE_BETWEEN"` — this distributes space between top and bottom groups
- `counterAxisAlignItems = "CENTER"` (or "MIN" as needed)
- Use `paddingTop`, `paddingBottom`, `paddingLeft`, `paddingRight` for breathing room

**execute_js example:**
```js
const screen = figma.createFrame();
screen.name = "Login";
screen.layoutMode = "VERTICAL";
screen.primaryAxisAlignItems = "SPACE_BETWEEN"; // ← KEY: distributes top/bottom
screen.counterAxisAlignItems = "CENTER";
screen.resize(402, 874);
screen.layoutSizingHorizontal = "FIXED";
screen.layoutSizingVertical = "FIXED";
screen.paddingTop = 56;
screen.paddingBottom = 40;
screen.paddingLeft = 28;
screen.paddingRight = 28;
screen.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];

// Top Content — groups header + form
const topContent = figma.createFrame();
topContent.name = "Top Content";
topContent.layoutMode = "VERTICAL";
topContent.itemSpacing = 40; // space between header and form
topContent.fills = [];
screen.appendChild(topContent);
topContent.layoutSizingHorizontal = "FILL";
topContent.layoutSizingVertical = "HUG";

// ... add Header and Form as children of topContent ...

// Bottom Content — register link row
const bottomContent = figma.createFrame();
bottomContent.name = "Bottom Content";
bottomContent.layoutMode = "HORIZONTAL";
bottomContent.primaryAxisAlignItems = "CENTER";
bottomContent.counterAxisAlignItems = "CENTER";
bottomContent.itemSpacing = 4;
bottomContent.fills = [];
screen.appendChild(bottomContent);
bottomContent.layoutSizingHorizontal = "FILL";
bottomContent.layoutSizingVertical = "HUG";

// ... add text nodes as children of bottomContent ...
```

### ❌ WRONG — Empty spacer frame (FORBIDDEN)

```js
// NEVER DO THIS — violates Layout Rule #16
const spacer = figma.createFrame();
spacer.name = "Spacer";
spacer.fills = [];
spacer.layoutMode = "VERTICAL";
spacer.resize(100, 100);
screen.appendChild(spacer);
spacer.layoutSizingHorizontal = "FILL";
spacer.layoutSizingVertical = "FILL"; // ← empty frame just to push content down
```

This pattern creates non-semantic empty frames that serve no purpose other than spacing. Use `SPACE_BETWEEN` on the parent instead.

## 7. Input Field Standard Template

Colors should come from `get_mode`'s designContext. Below is the structural reference (colors annotated with token semantic names):
```
Field Container (VERTICAL, itemSpacing=6, FILL width, no fill)
  ├── Label (text, 14px Medium, text/secondary)
  └── Input Frame (HORIZONTAL, cornerRadius=10, fill=surface/input, stroke=border/default, padding=12/16, FILL width)
       └── Placeholder (text, 15px Regular, text/placeholder)
```

Multiple Field Containers can be created in parallel (under the same Form parent).
Input Frames and text nodes are created in the next turn in parallel.

## 8. Button Standard Template

```
Button Frame (HORIZONTAL, cornerRadius=12, fill=fill/primary, padding=14/24, CENTER, height=52, FILL width)
  └── Button Text (text, 16px Semi Bold, text/on-primary)
```

## 9. Bottom Link Standard Template

```
Link Container (HORIZONTAL, itemSpacing=4, CENTER, no fill)
  ├── Description Text (14px Regular, text/tertiary)
  └── Action Text (14px Semi Bold, fill/primary)
```

## 10. Transparent Container Handling (structured tools only)

When using structured tools (`create_frame`), after creating container frames that don't need a background, batch-set `fillsVisible: false` in a single `nodes(method: "update")` call instead of updating individually.

When using `execute_js`, set `frame.fills = []` directly in the creation script — no separate batch call needed.

## 11. Batch Stroke Setting (structured tools only)

When using structured tools, set strokes for all input fields in a single `nodes(method: "update")` call:
```json
{"strokes": [{"color": {"r": 0.898, "g": 0.906, "b": 0.922}, "opacity": 1, "type": "SOLID"}]}
```
Note: stroke color must be an `{r, g, b}` object (0-1 range), not a hex string.

When using `execute_js`, set strokes directly during creation — no separate batch call needed.

## 12. Validation Strategy

After all sections of a screen are complete:

1. `lint_fix_all` with `nodeIds` set to each individual screen ID (NOT the wrapper — linting a wrapper with many screens can timeout and produces less targeted fixes)
2. **Post-lint structural verification (mandatory)** — after `lint_fix_all`, run `execute_js` to inspect each screen's child hierarchy (names, child counts, visibility). `lint_fix_all` auto-fixes can introduce side effects: duplicate wrapper nodes, reparented elements, or hidden orphan frames. Compare the post-lint structure against the expected hierarchy and remove any unexpected nodes before proceeding
3. `export_image` on both individual screens AND the full wrapper — final visual verification
4. If lint introduced structural regressions (duplicate nodes, orphan frames), fix with targeted `execute_js` then `export_image` again

Per-section validation (during creation — single screen only):
- `export_image` after each section is created — catch issues early
- For multi-screen flows, verify per-screen instead (see §3 Granularity by Task Scale)
- If a section looks wrong, fix it with a targeted `execute_js` before creating the next section
- Never build on top of broken state

## 13. Mobile Screen Specifications

- iOS: 402×874 (iPhone 16 Pro)
- Android: 412×915
- Unified primary color scheme, button height ≥ 52px (meets iOS 44pt / Android 48dp minimum touch target)

## 14. Mobile Screen Modes — System Chrome Handling

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

## 15. Multi-Screen Flow Generation Strategy (Data-Driven)

When building a multi-screen flow (auth, onboarding, checkout, walkthrough, etc.), use a data-driven approach to guarantee visual consistency across all screens. The key insight: define the screen list as structured data and loop it, rather than manually building each screen one by one.

### Why this matters

Without this pattern, the model tends to:
- Build each screen ad-hoc, leading to subtle inconsistencies (different padding, font sizes, button widths)
- Skip the skeleton step and mix structure with content, making the layout fragile
- Not use helper functions, so the same button/input/badge gets slightly different styling per screen

### The three pillars

#### Pillar 1: Screen definitions as data

Before drawing anything, define the full screen list as a structured array. This forces you to think through the flow before touching the canvas:

```js
const screenDefs = [
  { step: '01', label: 'Welcome',  fill: palette.dark },
  { step: '02', label: 'Login',    fill: palette.white },
  { step: '03', label: 'Register', fill: palette.white },
  { step: '04', label: 'Verify',   fill: palette.white },
  { step: '05', label: 'Done',     fill: palette.white },
];
```

Loop this array to generate all shells uniformly. Never hardcode individual screens.

#### Pillar 2: Strict layer hierarchy

All content lives inside a fixed tree structure. Content can ONLY be placed inside Screen's direct children (TopContent / BottomContent) — never directly on `Screen` or `Stage`:

```
Wrapper (VERTICAL, padding=56, itemSpacing=40, cornerRadius=40)
  ├── Header (VERTICAL, FILL width, HUG height)
  │     ├── Title text
  │     └── Description text
  └── Flow Row (HORIZONTAL, itemSpacing=48, HUG/HUG)
        └── Stage / {label} (VERTICAL, itemSpacing=16, HUG/HUG) — one per screenDef
              ├── Step Pill — badge showing "01 Welcome"
              └── Screen / {label} (VERTICAL, FIXED width×height, cornerRadius=32, clipsContent=true, padding for safe area, SPACE_BETWEEN)
                    ├── Top Content (VERTICAL, FILL/HUG) — header, form, etc.
                    └── Bottom Content (HORIZONTAL or VERTICAL, FILL/HUG) — links, actions
```

Key sizing rules for this hierarchy:
- Wrapper: `VERTICAL`, `HUG/HUG`, padding on all sides, `itemSpacing` between Header and Flow Row
- Flow Row: `HORIZONTAL`, `HUG/HUG`, `itemSpacing` between stages
- Stage: `VERTICAL`, `HUG/HUG`, `itemSpacing` between pill and screen
- Screen: `VERTICAL`, `FIXED` width × height (e.g., 402×874), cornerRadius, `clipsContent=true`, `primaryAxisAlignItems=SPACE_BETWEEN`, padding for safe area insets (e.g., `paddingTop=56, paddingBottom=40, paddingLeft=28, paddingRight=28`). Screen MUST have `layoutMode` — do NOT use absolute positioning for children
- Top Content / Bottom Content: direct children of Screen, `VERTICAL` or `HORIZONTAL` auto-layout, `FILL` width, `HUG` height

> **⚠️ CRITICAL: Screen nodes MUST have auto-layout.** Previous versions used `NO layoutMode` on Screen with an absolutely-positioned Content child. This causes `lint_fix_all` to force auto-layout on Screen (lint rule: "frames with children MUST have auto-layout"), which breaks the layout by overriding the absolute positioning. The correct approach is to give Screen its own `layoutMode: "VERTICAL"` with padding, eliminating the need for a Content wrapper layer.

#### Pillar 3: Shared helper functions

Define helper functions inside the `execute_js` script that lock down the visual rhythm of common elements. Font must be loaded once before calling any helper that creates text:

```js
// Load fonts ONCE at the top of the script, before any helper calls
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });

// Helper examples — define once, use across all screens
function makeText(parent, content, { fontSize = 15, fontStyle = 'Regular', fill = colors.text } = {}) {
  const t = figma.createText();
  t.fontName = { family: 'Inter', style: fontStyle };
  t.characters = content;
  t.fontSize = fontSize;
  t.fills = [{ type: 'SOLID', color: fill }];
  parent.appendChild(t);
  t.layoutSizingHorizontal = 'FILL';
  t.layoutSizingVertical = 'HUG';
  return t;
}

function makeButton(parent, label, { fill = colors.primary, textFill = colors.white } = {}) {
  const btn = figma.createFrame();
  btn.name = label;
  btn.layoutMode = 'HORIZONTAL';
  btn.primaryAxisAlignItems = 'CENTER';
  btn.counterAxisAlignItems = 'CENTER';
  btn.cornerRadius = 12;
  btn.paddingTop = 16; btn.paddingBottom = 16;  // padding controls height (≥52 with 16px text)
  btn.paddingLeft = 24; btn.paddingRight = 24;
  btn.fills = [{ type: 'SOLID', color: fill }];
  parent.appendChild(btn);
  btn.layoutSizingHorizontal = 'FILL';
  btn.layoutSizingVertical = 'HUG';
  const t = makeText(btn, label, { fontSize: 16, fontStyle: 'Semi Bold', fill: textFill });
  t.textAlignHorizontal = 'CENTER';
  return btn;
}

function makeField(parent, placeholder, { label } = {}) {
  const container = figma.createFrame();
  container.name = label || placeholder;
  container.layoutMode = 'VERTICAL';
  container.itemSpacing = 6;
  container.fills = [];
  parent.appendChild(container);
  container.layoutSizingHorizontal = 'FILL';
  container.layoutSizingVertical = 'HUG';
  if (label) makeText(container, label, { fontSize: 14, fontStyle: 'Medium', fill: colors.secondary });
  const field = figma.createFrame();
  field.layoutMode = 'HORIZONTAL';
  field.cornerRadius = 10;
  field.paddingTop = 12; field.paddingBottom = 12;
  field.paddingLeft = 16; field.paddingRight = 16;
  field.fills = [{ type: 'SOLID', color: colors.inputBg }];
  field.strokes = [{ type: 'SOLID', color: colors.border }];
  container.appendChild(field);
  field.layoutSizingHorizontal = 'FILL';
  field.layoutSizingVertical = 'HUG';
  makeText(field, placeholder, { fill: colors.placeholder });
  return container;
}

function makePill(parent, text) {
  const pill = figma.createFrame();
  pill.name = `Pill / ${text}`;
  pill.layoutMode = 'HORIZONTAL';
  pill.paddingTop = 8; pill.paddingBottom = 8;
  pill.paddingLeft = 14; pill.paddingRight = 14;
  pill.cornerRadius = 100;
  pill.fills = [{ type: 'SOLID', color: colors.pillBg }];
  parent.appendChild(pill);
  pill.layoutSizingHorizontal = 'HUG';
  pill.layoutSizingVertical = 'HUG';
  const t = makeText(pill, text, { fontSize: 13, fontStyle: 'Medium', fill: colors.pillText });
  // Pill text should HUG, not FILL — it's a compact badge
  t.layoutSizingHorizontal = 'HUG';
  return pill;
}
```

These helpers ensure that every button across 5 screens has the same height, corner radius, and padding. Every input field has the same stroke, background, and placeholder style. This is what creates the "stable rhythm" across the flow.

### Build order for multi-screen flows

```
Call 1 (skeleton):
  - Create Wrapper + Header + Flow Row
  - Loop screenDefs to create all Stage / Screen shells (Screen has auto-layout + padding, no Content wrapper needed)
  - Return all IDs: { wrapperId, flowRowId, stages: [{ stageId, screenId }] }
  → export_image to verify skeleton alignment

Call 2 (screen 1 content):
  - Fetch Screen node by ID
  - Use helpers to fill Welcome screen content (TopContent + BottomContent as direct children of Screen)
  - Return only the screen ID (content is already inside it, no need to track child IDs)
  → export_image to verify

Call 3–N (remaining screens):
  - Same pattern, one screen per call
  → export_image after each

Final call:
  - lint_fix_all on each individual screen (NOT on the wrapper — can timeout)
  - Post-lint structural verification
  - export_image final verification
```

### Adapting to different flow types

The pattern is generic — swap the screenDefs and content to fit any flow:

| Flow type | Typical screenDefs | Content per screen |
|-----------|-------------------|-------------------|
| Auth (login/register) | Welcome, Login, Register, Verify, Done | Forms, OTP inputs, success state |
| Onboarding | Intro, Feature 1, Feature 2, Feature 3, Get Started | Illustrations, descriptions, progress dots |
| Checkout | Cart, Shipping, Payment, Review, Confirmation | Product list, address form, card form, summary |
| Walkthrough | Step 1–N | Instruction text, screenshots, action buttons |

The skeleton (Wrapper → Flow Row → Stage → Screen) stays the same. Only the content inside each Screen frame (TopContent + BottomContent) changes.
