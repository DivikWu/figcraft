---
inclusion: manual
description: "Detailed guide for building multi-screen flows (auth, onboarding, checkout) in Figma — style presets, layer hierarchy, helper templates"
---

# Multi-Screen Flow Generation Guide

Detailed guide for building multi-screen flows in Figma. Load this BEFORE writing any `execute_js` code for a multi-screen flow.

For general Figma rules, see `.kiro/steering/figma-essential-rules.md` (auto-loaded).

## Step 0: Define Style Preset

**This is not a conceptual step — it is a literal code block that MUST appear at the top of EVERY `execute_js` script in the flow.**

If the user hasn't specified a style, **ask which preset to use** in interactive mode. If unable to ask, **default to `soft`**.

Every `execute_js` script MUST start with this block (choose one preset):

```js
// === STYLE PRESET (must be first — all radii and shadows read from here) ===
// Options: 'square' | 'soft' | 'device-mockup' | 'flat-wireframe'
const PRESET = {
  // soft (default for mobile product flows)
  screen:  { radius: 28, shadow: null },
  button:  { radius: 12 },
  input:   { radius: 12 },
  card:    { radius: 20 },
  pill:    { radius: 100 },
};
```

### Preset Reference Table

| Preset | screen.radius | button.radius | input.radius | card.radius | pill.radius | Shadow | Notes |
|--------|--------------|---------------|-------------|-------------|------------|--------|-------|
| `square` | 0 | 4–8 | 4–8 | 8 | 12 | none | Enterprise / dashboard / brutalist |
| `soft` | 28 | 12 | 12 | 20 | 100 | none | Modern mobile product (default) |
| `device-mockup` | 40 | 12 | 12 | 20 | 100 | strong drop shadow | Presentation with phone shell |
| `flat-wireframe` | 0 | 0 | 0 | 0 | 0 | none | Lo-fi wireframe, no decoration |

Because `PRESET` is a code variable, all subsequent code — skeleton creation, helper functions, content fills — reads `PRESET.screen.radius`, `PRESET.button.radius`, etc. This makes it structurally impossible to use hardcoded radii. If `PRESET` is missing, the script won't work.

## Step 1: Define Screen List as Data

Create a `screenDefs` array with step number, label, and per-screen config (colors, content type) BEFORE drawing anything. Loop this array to generate uniform shells.

The skeleton creation code uses `PRESET.screen.radius` and `PRESET.screen.shadow` directly:

```js
const screen = figma.createFrame();
screen.cornerRadius = PRESET.screen.radius;
if (PRESET.screen.shadow) {
  screen.effects = [PRESET.screen.shadow];
}
```

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

## Step 3: Write Helper Functions from PRESET

`makeText`, `makeButton`, `makeField`, `makeBadge`, `makeIcon`, etc. These helpers MUST use `PRESET.button.radius`, `PRESET.input.radius`, etc. — **never hardcoded numbers**.

### Icon Helper (MANDATORY — no emoji placeholders)

Every script that needs icons MUST include the `ICONS` path library and `makeIcon` helper. See `.kiro/steering/figma-essential-rules.md` §Icons for the full `ICONS` object and `makeIcon` implementation. Use `figma.createNodeFromSvg()` to create real vector icons — **NEVER use emoji text nodes as icon substitutes**.

```js
function makeButton(parent, label, fillColor, textColor) {
  const f = figma.createFrame();
  f.name = `Button / ${label}`;
  f.layoutMode = "HORIZONTAL";
  f.primaryAxisAlignItems = "CENTER";
  f.counterAxisAlignItems = "CENTER";
  f.paddingTop = 16; f.paddingBottom = 16;
  f.paddingLeft = 24; f.paddingRight = 24;
  f.cornerRadius = PRESET.button.radius;  // ← from preset, not hardcoded
  f.fills = [{ type: "SOLID", color: fillColor }];
  parent.appendChild(f);
  f.layoutSizingHorizontal = "FILL";
  f.layoutSizingVertical = "HUG";

  const t = figma.createText();
  t.characters = label;
  t.fontSize = 16;
  t.fontName = { family: "Inter", style: "Semi Bold" };
  t.fills = [{ type: "SOLID", color: textColor }];
  f.appendChild(t);
  t.layoutSizingHorizontal = "HUG";
  t.layoutSizingVertical = "HUG";
  return f;
}

function makeInput(parent, placeholder, colors) {
  const f = figma.createFrame();
  f.name = `Input / ${placeholder}`;
  f.layoutMode = "HORIZONTAL";
  f.primaryAxisAlignItems = "MIN";
  f.counterAxisAlignItems = "CENTER";
  f.paddingTop = 14; f.paddingBottom = 14;
  f.paddingLeft = 16; f.paddingRight = 16;
  f.cornerRadius = PRESET.input.radius;  // ← from preset
  f.fills = [{ type: "SOLID", color: colors.bg }];
  f.strokes = [{ type: "SOLID", color: colors.border }];
  f.strokeWeight = 1.5;
  parent.appendChild(f);
  f.layoutSizingHorizontal = "FILL";
  f.layoutSizingVertical = "HUG";

  const t = figma.createText();
  t.characters = placeholder;
  t.fontSize = 15;
  t.fontName = { family: "Inter", style: "Regular" };
  t.fills = [{ type: "SOLID", color: colors.placeholder }];
  f.appendChild(t);
  t.layoutSizingHorizontal = "FILL";
  t.layoutSizingVertical = "HUG";
  return f;
}
```

Helpers don't persist across `execute_js` calls — re-define them (and `PRESET`) at the top of each script.

## Step 4: Build Order

1. **Call 1**: Creates Wrapper + Header + Flow Row + all Stage/Screen shells (the skeleton). Uses `PRESET` for screen radius and shadow.
2. **Call 2+**: Fills each Screen one at a time, using the helpers. Each call re-defines `PRESET` and all helpers at the top.

This way the skeleton is guaranteed uniform before any content is added.
