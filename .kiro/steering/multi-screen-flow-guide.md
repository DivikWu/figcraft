---
inclusion: manual
description: "Detailed guide for building multi-screen flows (auth, onboarding, checkout) in Figma — style presets, layer hierarchy, create_frame patterns"
---

# Multi-Screen Flow Generation Guide

Detailed guide for building multi-screen flows in Figma using `create_frame` + `children`.

For general Figma rules, see `.kiro/steering/figma-essential-rules.md` (auto-loaded).

## Step 0: Define Style Preset

Choose a style preset before building. If the user hasn't specified a style, **default to `soft`**.

### Preset Reference Table

| Preset | screen.radius | button.radius | input.radius | card.radius | pill.radius | Shadow | Notes |
|--------|--------------|---------------|-------------|-------------|------------|--------|-------|
| `square` | 0 | 4–8 | 4–8 | 8 | 12 | none | Enterprise / dashboard / brutalist |
| `soft` | 28 | 12 | 12 | 20 | 100 | none | Modern mobile product (default) |
| `device-mockup` | 40 | 12 | 12 | 20 | 100 | strong drop shadow | Presentation with phone shell |
| `flat-wireframe` | 0 | 0 | 0 | 0 | 0 | none | Lo-fi wireframe, no decoration |

Apply the preset values consistently across all `create_frame` calls: screen `cornerRadius`, button `cornerRadius`, input `cornerRadius`, etc.

## Step 1: Define Screen List

Plan the full screen list before building. This forces you to think through the flow before touching the canvas.

## Step 2: Enforce Strict Layer Hierarchy

All content lives inside a fixed tree. Content can only be placed inside Screen's direct children (TopContent / BottomContent), never directly on Screen or Stage.

**Wrapper MUST use `counterAxisAlignItems: "MIN"` (left-align)** so that the Header aligns with the left edge of the Flow Row below it. Using `CENTER` causes the header to float in the middle, breaking visual hierarchy.

```
Wrapper (VERTICAL, HUG/HUG, counterAxisAlignItems=MIN, clipsContent=false, cornerRadius=20–40, fill=lightGray, padding, itemSpacing)
  ├── Header (title + description)
  └── Flow Row (HORIZONTAL, HUG/HUG, clipsContent=false, itemSpacing between screens)
        └── Stage / {label} (VERTICAL, HUG/HUG, clipsContent=false) — one per screenDef
              ├── Step Pill (badge: "01 Welcome")
              └── Screen / {label} (VERTICAL, FIXED width×height, cornerRadius=PRESET.screen.radius, clipsContent=true, padding, SPACE_BETWEEN, dropShadow=PRESET.screen.shadow)
                    ├── Top Content (VERTICAL, FILL/HUG)
                    └── Bottom Content (HORIZONTAL or VERTICAL, FILL/HUG)
```

### Shadow Rule
When `PRESET.screen.shadow` is set (e.g., `device-mockup` preset), Screen has `dropShadow` + `clipsContent=true` (clips its own content at rounded corners). ALL ancestor layout containers (Stage, Flow Row, Wrapper) MUST have `clipsContent=false` so the shadow renders fully. See Layout & Quality Rule #24 in the essential rules cheat sheet. When `PRESET.screen.shadow` is `null` (e.g., `soft`, `square`, `flat-wireframe` presets), no shadow is applied and the `clipsContent=false` requirement on ancestors is relaxed (but still recommended for consistency).

### Layout Rule
Screen nodes MUST have `layoutMode: "VERTICAL"` with padding to control safe area insets. Do NOT use a separate Content child with absolute positioning — this causes `lint_fix_all` to force auto-layout on Screen, breaking the layout.

## Step 3: Consistent Element Patterns

Use consistent patterns across all screens. `create_frame` + `children` templates:

### Button
```json
{ "type": "frame", "name": "Sign In",
  "cornerRadius": 12, "fill": "#3B82F6",
  "primaryAxisAlignItems": "CENTER", "counterAxisAlignItems": "CENTER",
  "padding": 16,
  "children": [{ "type": "text", "content": "Sign In", "fill": "#FFFFFF", "fontStyle": "SemiBold" }] }
```

### Input Field
```json
{ "type": "frame", "name": "Email Input",
  "cornerRadius": 12, "strokeColor": "#E0E0E0",
  "padding": 16,
  "children": [{ "type": "text", "content": "Enter your email", "fill": "#999999" }] }
```

### Icons — use `icon_search` → `icon_create`, NEVER emoji text nodes

Apply the chosen preset's `cornerRadius` values consistently across all elements.

## Step 4: Build Order (using create_frame)

```
Call 1: create_frame — Wrapper + Header + Flow Row + all Stage/Screen shells (skeleton)
        → check _children, export_image to verify skeleton
Call 2: create_frame — Fill Screen 1 (parentId=screen1Id, children=[TopContent, BottomContent])
        → check _preview, export_image to verify
Call 3-N: create_frame — Fill remaining screens, one per call
        → export_image after each
Final: lint_fix_all on each screen → export_image
```

The skeleton is guaranteed uniform before any content is added. Each `create_frame` call builds a complete subtree with automatic sizing inference and token binding.
