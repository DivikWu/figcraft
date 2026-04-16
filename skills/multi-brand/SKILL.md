---
name: multi-brand
description: "Multi-brand token management — set up brand themes, switch between brands, verify cross-brand consistency. Use when: multi-brand/theme/white-label + tokens/variables/design system, or when managing multiple brand variants in one Figma file."
---

# Multi-Brand — Theme Switching & Verification

Set up and manage multiple brand themes in a single Figma design system using variable modes. Each brand gets its own mode with distinct color, typography, and spacing tokens. Supports switching between brands and verifying cross-brand consistency.

## Skill Boundaries

- Use this skill to **set up or manage multi-brand token systems**.
- If the task is **building a single-brand design system**, switch to [figcraft-generate-library](../figcraft-generate-library/SKILL.md).
- If the task is **syncing tokens from a DTCG spec**, switch to [token-sync](../token-sync/SKILL.md).
- If the task is **auditing design system health**, switch to [design-system-audit](../design-system-audit/SKILL.md).

## Key Concept

Figma variable modes enable multi-brand by storing different values per brand in the same variable:

```
Collection: "Brand Colors"
  Modes: [Brand A, Brand B, Brand C]

  Variable: color/primary
    Brand A: #3B82F6 (blue)
    Brand B: #10B981 (green)
    Brand C: #8B5CF6 (purple)

  Variable: color/surface
    Brand A: #FFFFFF
    Brand B: #F0FDF4
    Brand C: #FAF5FF
```

Components bound to these variables automatically switch appearance when the mode changes.

## Workflow

### Step 1: Connect and Load Tools

```
ping                                          → verify plugin connection
load_toolset("variables")                     → variable/collection/mode management
```

**If `ping` fails (plugin not connected):** STOP. Do not fall back to other MCP servers. Tell user: open Figma → Plugins → FigCraft → wait for connection, then retry.

### Step 2: Discover Existing Structure

```
variables_ep(method: "list_collections")      → existing collections and modes
variables_ep(method: "list")                  → all variables with current values
```

Determine if multi-brand is already set up (multiple modes in color collections) or needs to be created.

### Step 3: Set Up Brand Modes

If creating from scratch:

```
add_collection_mode(collectionId: "...", name: "Brand B")
```

If renaming existing modes:

```
rename_collection_mode(collectionId: "...", modeId: "...", name: "Brand A")
```

### Step 4: Populate Brand Values

For each brand mode, set variable values:

```
variables_ep(method: "update", variableId: "...", valuesByMode: {
  "modeId-brand-a": "#3B82F6",
  "modeId-brand-b": "#10B981"
})
```

For multi-mode token sync from DTCG files:

```
load_toolset("tokens")
sync_tokens_multi_mode(modes: {
  "Brand A": "tokens/brand-a.json",
  "Brand B": "tokens/brand-b.json"
}, collectionName: "Brand Colors")
```

### Step 5: Apply Brand to Screens

Set explicit variable mode on screen frames to preview each brand:

```
set_explicit_variable_mode(nodeId: "screen-frame-id", collectionId: "...", modeId: "brand-b-mode-id")
```

This makes the entire screen and its children resolve variables using Brand B values.

### Step 6: Verify Cross-Brand Consistency

For each brand mode, verify:

1. Contrast ratios — colors must meet WCAG 4.5:1 in every brand
2. Readability — text colors work against brand-specific backgrounds
3. Component integrity — no visual breakage when switching brands
4. Token completeness — every variable has a value for every brand mode

Verification workflow per brand:

```
set_explicit_variable_mode(nodeId: "...", collectionId: "...", modeId: "brand-x")
export_image(nodeId: "...", scale: 2)         → screenshot for visual check
lint_fix_all(categories: ["wcag"])            → contrast check
```

### Step 7: Generate Brand Comparison

Create side-by-side brand previews:

For each key screen, clone the frame and set different brand modes:

```
nodes(method: "clone", items: [{ id: "screen-id", name: "Screen - Brand B", x: 500 }])
set_explicit_variable_mode(nodeId: "cloned-id", collectionId: "...", modeId: "brand-b")
```

Export comparison screenshots for stakeholder review.

## Architecture Patterns

### Simple (2–3 Brands)

```
Collection: "Color"     modes: [Brand A, Brand B]
Collection: "Spacing"   modes: [Value]          ← shared across brands
Collection: "Radius"    modes: [Value]          ← shared across brands
```

Only color varies between brands. Spacing and radius are shared.

### Standard (3–5 Brands)

```
Collection: "Primitives"  modes: [Brand A, Brand B, Brand C]
Collection: "Semantic"    modes: [Light, Dark]
```

Primitives vary per brand. Semantic tokens alias primitives and vary by light/dark mode.

### Advanced (5+ Brands × Light/Dark)

```
Collection: "Primitives"  modes: [Brand A, Brand B, ...]    ← brand palette
Collection: "Semantic"    modes: [Light, Dark]               ← aliases to primitives
Collection: "Component"   modes: [Default]                   ← aliases to semantic
```

Three-tier architecture: primitives (brand-specific) → semantic (mode-specific) → component (stable API).

## Cross-Brand Checklist

Before publishing a multi-brand system:

- [ ] Every variable has values for all brand modes (no undefined)
- [ ] Contrast ratios pass WCAG AA in every brand
- [ ] Text remains readable against all brand backgrounds
- [ ] Icons/illustrations work with all brand color schemes
- [ ] Component states (hover, active, disabled) work in all brands
- [ ] Dark mode (if applicable) works with all brands
- [ ] Brand-specific assets (logos, illustrations) are swappable via INSTANCE_SWAP

## Safety Rules

- NEVER remove a brand mode without explicit user confirmation
- ALWAYS verify contrast in every brand after color changes
- ALWAYS set values for new variables in ALL existing modes (avoid undefined)
- Use `save_version_history` before major brand changes
