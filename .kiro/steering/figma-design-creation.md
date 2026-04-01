---
inclusion: manual
description: "Figma design creation optimization rules — full version with templates and strategies. Use #figma-design-creation to load when needed."
---

# Figma Design Creation Optimization Rules

Core rules for creating Figma designs using FigCraft declarative tools (`create_frame` + `children`, `create_text`, `text(method: "set_range")`, `group_nodes`, `nodes(method: "update")`).
Incorporates official Figma Plugin API best practices. All UI creation is declarative — `execute_js` is in the `debug` toolset and not available by default.

## 1. Pre-Creation Checklist

### Skill loading (must decide before any tool call)

In Kiro, the auto-loaded `figma-essential-rules.md` steering is sufficient for all UI creation. Do NOT call `discloseContext("figma-use")` — it duplicates ~60KB of content already in context. Load additional skills based on task type:

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

### Granularity by Task Scale (create_frame + children)

| Task scale | Creation approach | Verification frequency |
|------------|-------------------|----------------------|
| Single element | 1 `create_frame` call | export_image after creation |
| Single screen | 1 `create_frame` call with full children tree | export_image after creation |
| Multi-screen flow (3-5 screens) | 1 `create_frame` per screen (with `parentId` for wrapper) | export_image after each screen |
| Large flow (6+ screens) | Batch 2-3 screens per turn | export_image at end of each batch |

#### Single Screen Example
```
Call 1: create_frame with full children tree (screen shell + all sections + all content)
        → check _children in response
        → export_image(scale:0.5) to verify
Call 2: lint_fix_all → export_image
```

#### Multi-Screen Flow Example
```
Call 1: create_frame — Wrapper with skeleton (Header + Flow Row + Stage shells + empty Screens)
        → export_image to verify skeleton
Call 2: create_frame — Fill Screen 1 (parentId=screen1Id, children=[TopContent, BottomContent])
        → export_image(scale:0.5) to verify
Call 3-N: create_frame — Fill remaining screens, one per call
        → export_image(scale:0.5) after each
Final: lint_fix_all on each screen → export_image
```

`create_frame` + `children` builds entire subtrees in one call with automatic sizing inference, token binding, and conflict detection. Use `dryRun: true` to preview inferences before committing.

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

**create_frame example:**
```json
create_frame({
  "name": "Login",
  "width": 402, "height": 874,
  "layoutMode": "VERTICAL",
  "primaryAxisAlignItems": "SPACE_BETWEEN",
  "counterAxisAlignItems": "CENTER",
  "paddingTop": 56, "paddingBottom": 40, "paddingLeft": 28, "paddingRight": 28,
  "fill": "#FFFFFF",
  "children": [
    {
      "type": "frame", "name": "Top Content",
      "layoutMode": "VERTICAL", "itemSpacing": 40,
      "children": [
        { "type": "frame", "name": "Header", "layoutMode": "VERTICAL", "itemSpacing": 8,
          "children": [
            { "type": "text", "content": "Title", "fontSize": 28, "fontStyle": "Bold" },
            { "type": "text", "content": "Subtitle", "fontSize": 16, "fill": "#666666" }
          ]
        },
        { "type": "frame", "name": "Form", "layoutMode": "VERTICAL", "itemSpacing": 20,
          "children": ["... form fields and buttons ..."]
        }
      ]
    },
    {
      "type": "frame", "name": "Bottom Content",
      "layoutMode": "HORIZONTAL", "itemSpacing": 4,
      "primaryAxisAlignItems": "CENTER", "counterAxisAlignItems": "CENTER",
      "children": [
        { "type": "text", "content": "Don't have an account?", "fontSize": 14, "fill": "#666666" },
        { "type": "text", "content": "Register", "fontSize": 14, "fill": "#3B82F6", "fontStyle": "SemiBold" }
      ]
    }
  ]
})
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

## 10. Transparent Container Handling

Container frames that don't need a background: batch-set `fillsVisible: false` in a single `nodes(method: "update")` call, or omit `fill` in `create_frame` children (frames default to no visible fill when no fill property is specified).

## 11. Batch Stroke Setting

Set strokes for all input fields in a single `nodes(method: "update")` call:
```json
{"strokes": [{"color": {"r": 0.898, "g": 0.906, "b": 0.922}, "opacity": 1, "type": "SOLID"}]}
```
Note: stroke color must be an `{r, g, b}` object (0-1 range), not a hex string. Or use `strokeColor` in `create_frame` children for hex shorthand.

## 12. Validation Strategy

After all sections of a screen are complete:

1. `lint_fix_all` with `nodeIds` set to each individual screen ID (NOT the wrapper — linting a wrapper with many screens can timeout and produces less targeted fixes)
2. **Post-lint structural verification (mandatory)** — after `lint_fix_all`, run `get_current_page(maxDepth=2)` to inspect structure. `lint_fix_all` auto-fixes can introduce side effects: duplicate wrapper nodes, reparented elements, or hidden orphan frames. Compare the post-lint structure against the expected hierarchy and fix any unexpected nodes with `nodes(method: "delete")` before proceeding
3. `export_image` on both individual screens AND the full wrapper — final visual verification
4. If lint introduced structural regressions (duplicate nodes, orphan frames), fix with targeted `nodes(method: "update"/"delete")` then `export_image` again

Per-screen validation (during creation):
- Check `_children` in each `create_frame` response — catch issues early. Use `export_image(scale:0.5)` for visual verification.
- `export_image` at key milestones (after each complete screen)
- If a screen looks wrong, fix with `nodes(method: "update")` before creating the next
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

When building a multi-screen flow (auth, onboarding, checkout, walkthrough, etc.), use a consistent structure to guarantee visual consistency across all screens.

### Strict layer hierarchy

All content lives inside a fixed tree structure. Content can ONLY be placed inside Screen's direct children (TopContent / BottomContent) — never directly on `Screen` or `Stage`:

```
Wrapper (VERTICAL, HUG/HUG, counterAxisAlignItems=MIN, clipsContent=false, cornerRadius=20-40, fill=lightGray, padding, itemSpacing)
  ├── Header (title + description)
  └── Flow Row (HORIZONTAL, HUG/HUG, clipsContent=false, itemSpacing between screens)
        └── Stage / {label} (VERTICAL, HUG/HUG, clipsContent=false) — one per screen
              ├── Step Pill (badge: "01 Welcome")
              └── Screen / {label} (VERTICAL, FIXED 402×874, cornerRadius=28, clipsContent=true, padding, SPACE_BETWEEN, dropShadow)
                    ├── Top Content (VERTICAL, FILL/HUG)
                    └── Bottom Content (HORIZONTAL or VERTICAL, FILL/HUG)
```

Key sizing rules:
- Wrapper: `VERTICAL`, `HUG/HUG`, padding on all sides
- Flow Row: `HORIZONTAL`, `HUG/HUG`, `itemSpacing` between stages
- Stage: `VERTICAL`, `HUG/HUG`
- Screen: `VERTICAL`, `FIXED` width × height, `primaryAxisAlignItems=SPACE_BETWEEN`, padding for safe area

> **⚠️ CRITICAL: Screen nodes MUST have auto-layout.** Give Screen its own `layoutMode: "VERTICAL"` with padding.

### Build order (using create_frame)

```
Call 1: create_frame — Wrapper + Header + Flow Row + all Stage/Screen shells (skeleton)
        → check _children, export_image to verify skeleton

Call 2: create_frame — Fill Screen 1 (parentId=screen1Id, children=[TopContent, BottomContent])
        → export_image(scale:0.5) to verify

Call 3–N: create_frame — Fill remaining screens, one per call
        → export_image(scale:0.5) after each

Final: lint_fix_all on each individual screen → export_image
```

### Adapting to different flow types

| Flow type | Screens | Content per screen |
|-----------|---------|-------------------|
| Auth (login/register) | Welcome, Login, Register, Verify, Done | Forms, OTP inputs, success state |
| Onboarding | Intro, Feature 1-3, Get Started | Illustrations, descriptions, progress dots |
| Checkout | Cart, Shipping, Payment, Review, Confirmation | Product list, address form, card form, summary |

The skeleton (Wrapper → Flow Row → Stage → Screen) stays the same. Only the content inside each Screen changes.
