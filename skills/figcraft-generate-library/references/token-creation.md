> Part of the [figcraft-generate-library skill](../SKILL.md).

# Token Creation Reference

> **All examples use FigCraft declarative tools.** For raw Plugin API patterns, see the [figcraft-use skill](../../figcraft-use/SKILL.md).

This document covers Phase 1: creating variable collections, modes, primitives, semantic aliases, scopes, code syntax, styles, and validation.

---

## 1. Collection Architecture

Choose the pattern that matches your token count and complexity:

### Simple Pattern (< 50 tokens)

One collection, 2 modes. Appropriate for small projects or brand kits.

```
Collection: "Tokens"    modes: ["Light", "Dark"]
  color/bg/primary → Light: #FFFFFF, Dark: #1A1A1A
  spacing/sm = 8
```

### Standard Pattern (50–200 tokens) — Recommended Starting Point

Separate primitives from semantics. The real-world reference is Figma's Simple Design System (SDS): 7 collections, 368 variables, light/dark modes on semantic colors, single-mode primitives.

```
Collection: "Primitives"    modes: ["Value"]       ← raw hex values, no modes
  blue/500 = #3B82F6
  gray/900 = #111827
  white/1000 = #FFFFFF

Collection: "Color"         modes: ["Light", "Dark"] ← aliases to Primitives
  color/bg/primary → Light: alias Primitives/white/1000, Dark: alias Primitives/gray/900
  color/text/primary → Light: alias Primitives/gray/900, Dark: alias Primitives/white/1000

Collection: "Spacing"       modes: ["Value"]
  spacing/xs = 4, spacing/sm = 8, spacing/md = 16, spacing/lg = 24, spacing/xl = 32

Collection: "Typography Primitives"  modes: ["Value"]
  family/sans = "Inter", scale/01 = 12, scale/02 = 14, scale/03 = 16, weight/regular = 400

Collection: "Typography"    modes: ["Value"]        ← aliases to Typography Primitives
  body/font-family → alias family/sans
  body/size-md → alias scale/03
```

### Advanced Pattern (200+ tokens) — M3 Model

Multiple semantic collections, 4–8 modes. Use when you need light/dark × contrast × brand or responsive breakpoints.

```
Collection: "M3"           modes: ["Light", "Dark", "Light High Contrast", "Dark High Contrast", ...]
Collection: "Typeface"     modes: ["Baseline", "Wireframe"]
Collection: "Typescale"    modes: ["Value"]  ← aliases into Typeface
Collection: "Shape"        modes: ["Value"]
```

Key insight from M3: ALL 196 semantic color variables live in a SINGLE collection with 8 modes. Switching a frame's mode once updates every color simultaneously.

---

## 2. Creating Collections + Modes

### Creating a Primitives Collection

```
variables_ep({
  method: "create_collection",
  collectionName: "Primitives",
  modeNames: ["Value"]
})
```

Returns `{ collectionId, modes: [{ modeId, name: "Value" }] }`.

### Creating a Semantic Color Collection with Light/Dark Modes

```
variables_ep({
  method: "create_collection",
  collectionName: "Color",
  modeNames: ["Light", "Dark"]
})
```

Returns `{ collectionId, modes: [{ modeId, name: "Light" }, { modeId, name: "Dark" }] }`.

**Mode plan limits:** Starter = 1 mode, Professional = 4 modes, Organization/Enterprise = 40 modes. If `create_collection` throws a mode limit error, the file is on a Starter plan — tell the user and ask how to proceed.

### Creating a Spacing Collection (single mode)

```
variables_ep({
  method: "create_collection",
  collectionName: "Spacing",
  modeNames: ["Value"]
})
```

---

## 3. Creating All Variable Types

### hex Color Handling

FigCraft tools accept hex strings directly (e.g. `"#3B82F6"`) — no manual 0–1 range conversion needed. The tool handles the conversion internally. For alpha channels, use 8-digit hex (e.g. `"#0c0c0d1a"`).

### Creating Primitive Color Variables (Real SDS Data)

This creates a subset of the Simple Design System's `Color Primitives` collection (Blue family, from the Standard pattern used by real design systems):

```
variables_ep({
  method: "batch_create",
  collectionName: "Primitives",
  variables: [
    // Blue scale
    { name: "blue/100", type: "COLOR", value: "#EFF6FF", scopes: [] },
    { name: "blue/200", type: "COLOR", value: "#DBEAFE", scopes: [] },
    { name: "blue/300", type: "COLOR", value: "#93C5FD", scopes: [] },
    { name: "blue/400", type: "COLOR", value: "#60A5FA", scopes: [] },
    { name: "blue/500", type: "COLOR", value: "#3B82F6", scopes: [] },
    { name: "blue/600", type: "COLOR", value: "#2563EB", scopes: [] },
    { name: "blue/700", type: "COLOR", value: "#1D4ED8", scopes: [] },
    { name: "blue/800", type: "COLOR", value: "#1E40AF", scopes: [] },
    { name: "blue/900", type: "COLOR", value: "#1E3A8A", scopes: [] },
    // Gray scale
    { name: "gray/100", type: "COLOR", value: "#F9FAFB", scopes: [] },
    { name: "gray/200", type: "COLOR", value: "#F3F4F6", scopes: [] },
    { name: "gray/300", type: "COLOR", value: "#D1D5DB", scopes: [] },
    { name: "gray/400", type: "COLOR", value: "#9CA3AF", scopes: [] },
    { name: "gray/500", type: "COLOR", value: "#6B7280", scopes: [] },
    { name: "gray/600", type: "COLOR", value: "#4B5563", scopes: [] },
    { name: "gray/700", type: "COLOR", value: "#374151", scopes: [] },
    { name: "gray/800", type: "COLOR", value: "#1F2937", scopes: [] },
    { name: "gray/900", type: "COLOR", value: "#111827", scopes: [] },
    // White / Black
    { name: "white/1000", type: "COLOR", value: "#FFFFFF", scopes: [] },
    { name: "black/1000", type: "COLOR", value: "#000000", scopes: [] }
  ]
})
```

**Critical scope rule for primitives:** Set `scopes: []`. This hides primitives from every picker. Designers should only see semantic tokens. The exception is semi-transparent overlay primitives (Black/White with alpha) — those get `["EFFECT_COLOR"]` so they appear in shadow pickers.

### Creating FLOAT Variables (Spacing, Radius, Font Size)

```
variables_ep({
  method: "batch_create",
  collectionName: "Spacing",
  variables: [
    // Spacing tokens
    { name: "spacing/xs",  type: "FLOAT", value: 4,    scopes: ["GAP"] },
    { name: "spacing/sm",  type: "FLOAT", value: 8,    scopes: ["GAP"] },
    { name: "spacing/md",  type: "FLOAT", value: 16,   scopes: ["GAP"] },
    { name: "spacing/lg",  type: "FLOAT", value: 24,   scopes: ["GAP"] },
    { name: "spacing/xl",  type: "FLOAT", value: 32,   scopes: ["GAP"] },
    { name: "spacing/2xl", type: "FLOAT", value: 48,   scopes: ["GAP"] },
    // Radius tokens
    { name: "radius/none", type: "FLOAT", value: 0,    scopes: ["CORNER_RADIUS"] },
    { name: "radius/sm",   type: "FLOAT", value: 4,    scopes: ["CORNER_RADIUS"] },
    { name: "radius/md",   type: "FLOAT", value: 8,    scopes: ["CORNER_RADIUS"] },
    { name: "radius/lg",   type: "FLOAT", value: 16,   scopes: ["CORNER_RADIUS"] },
    { name: "radius/full", type: "FLOAT", value: 9999, scopes: ["CORNER_RADIUS"] }
  ]
})
```

### Creating STRING Variables (Font Family, Font Style)

```
variables_ep({
  method: "batch_create",
  collectionName: "Typography Primitives",
  variables: [
    { name: "family/sans",       type: "STRING", value: "Inter",       scopes: ["FONT_FAMILY"] },
    { name: "family/mono",       type: "STRING", value: "Roboto Mono", scopes: ["FONT_FAMILY"] },
    // Font style strings — these are the Figma fontName.style values:
    { name: "weight/regular",    type: "STRING", value: "Regular",     scopes: ["FONT_STYLE"] },
    { name: "weight/medium",     type: "STRING", value: "Medium",      scopes: ["FONT_STYLE"] },
    { name: "weight/semibold",   type: "STRING", value: "Semi Bold",   scopes: ["FONT_STYLE"] },
    { name: "weight/bold",       type: "STRING", value: "Bold",        scopes: ["FONT_STYLE"] }
  ]
})
```

### Creating BOOLEAN Variables

BOOLEAN variables have no scopes (scopes are not supported for BOOLEAN type).

```
variables_ep({
  method: "batch_create",
  collectionName: "Tokens",
  variables: [
    { name: "feature-flags/show-beta-badge", type: "BOOLEAN", value: false }
  ]
})
```

---

## 4. Variable Aliasing (VARIABLE_ALIAS) — Primitive → Semantic Chain

Semantic tokens reference primitives via `VARIABLE_ALIAS`. This is the core pattern that makes light/dark theming work.

**Architecture:**
```
Color Primitives collection (1 mode: Value)
  blue/500 = #3B82F6          ← raw value

Color collection (2 modes: Light, Dark)
  color/bg/accent/default:
    Light → VARIABLE_ALIAS → Primitives/blue/500
    Dark  → VARIABLE_ALIAS → Primitives/blue/300
```

### Complete Semantic Alias Creation (SDS-style)

Create semantic color variables that alias to primitives, with per-mode values for light/dark theming:

```
variables_ep({
  method: "batch_create",
  collectionName: "Color",
  variables: [
    // Background
    {
      name: "color/bg/default/default",
      type: "COLOR",
      valuesByMode: {
        "Light": { type: "VARIABLE_ALIAS", name: "Primitives/white/1000" },
        "Dark":  { type: "VARIABLE_ALIAS", name: "Primitives/gray/900" }
      },
      scopes: ["FRAME_FILL", "SHAPE_FILL"]
    },
    {
      name: "color/bg/default/secondary",
      type: "COLOR",
      valuesByMode: {
        "Light": { type: "VARIABLE_ALIAS", name: "Primitives/gray/100" },
        "Dark":  { type: "VARIABLE_ALIAS", name: "Primitives/gray/800" }
      },
      scopes: ["FRAME_FILL", "SHAPE_FILL"]
    },
    {
      name: "color/bg/brand/default",
      type: "COLOR",
      valuesByMode: {
        "Light": { type: "VARIABLE_ALIAS", name: "Primitives/blue/600" },
        "Dark":  { type: "VARIABLE_ALIAS", name: "Primitives/blue/300" }
      },
      scopes: ["FRAME_FILL", "SHAPE_FILL"]
    },
    // Text
    {
      name: "color/text/default/default",
      type: "COLOR",
      valuesByMode: {
        "Light": { type: "VARIABLE_ALIAS", name: "Primitives/gray/900" },
        "Dark":  { type: "VARIABLE_ALIAS", name: "Primitives/white/1000" }
      },
      scopes: ["TEXT_FILL"]
    },
    {
      name: "color/text/default/secondary",
      type: "COLOR",
      valuesByMode: {
        "Light": { type: "VARIABLE_ALIAS", name: "Primitives/gray/500" },
        "Dark":  { type: "VARIABLE_ALIAS", name: "Primitives/gray/400" }
      },
      scopes: ["TEXT_FILL"]
    },
    {
      name: "color/text/brand/default",
      type: "COLOR",
      valuesByMode: {
        "Light": { type: "VARIABLE_ALIAS", name: "Primitives/blue/700" },
        "Dark":  { type: "VARIABLE_ALIAS", name: "Primitives/blue/200" }
      },
      scopes: ["TEXT_FILL"]
    },
    // Border
    {
      name: "color/border/default/default",
      type: "COLOR",
      valuesByMode: {
        "Light": { type: "VARIABLE_ALIAS", name: "Primitives/gray/300" },
        "Dark":  { type: "VARIABLE_ALIAS", name: "Primitives/gray/600" }
      },
      scopes: ["STROKE_COLOR"]
    },
    {
      name: "color/border/brand/default",
      type: "COLOR",
      valuesByMode: {
        "Light": { type: "VARIABLE_ALIAS", name: "Primitives/blue/500" },
        "Dark":  { type: "VARIABLE_ALIAS", name: "Primitives/blue/400" }
      },
      scopes: ["STROKE_COLOR"]
    }
  ]
})
```

**Key points:**
- `VARIABLE_ALIAS` with `name` references the target variable by its full path (`CollectionName/VariableName`)
- The aliased variable MUST have the same `resolvedType` as the semantic variable
- Never duplicate raw values in the semantic layer — always alias

### Setting Multi-Mode Values on Existing Variables

To update mode values after creation:

```
variables_ep({
  method: "set_values_multi_mode",
  variableId: "<variable-id>",
  valuesByMode: {
    "Light": "#FFFFFF",
    "Dark": "#1A1A1A"
  }
})
```

---

## 5. Variable Scopes — Complete Reference Table

| Semantic Role | Recommended Scopes | Variable Type |
|---|---|---|
| Primitive colors (raw) | `[]` — empty, hidden from all pickers | COLOR |
| Semi-transparent overlay primitives | `["EFFECT_COLOR"]` | COLOR |
| Background fills (frame, shape) | `["FRAME_FILL", "SHAPE_FILL"]` | COLOR |
| Text color | `["TEXT_FILL"]` | COLOR |
| Icon / shape fill | `["SHAPE_FILL", "STROKE_COLOR"]` | COLOR |
| Border / stroke color | `["STROKE_COLOR"]` | COLOR |
| Background + border combined | `["FRAME_FILL", "SHAPE_FILL", "STROKE_COLOR"]` | COLOR |
| Shadow color | `["EFFECT_COLOR"]` | COLOR |
| Spacing / gap between items | `["GAP"]` | FLOAT |
| Padding (if separate from gap) | `["GAP"]` | FLOAT |
| Corner radius | `["CORNER_RADIUS"]` | FLOAT |
| Width / height dimensions | `["WIDTH_HEIGHT"]` | FLOAT |
| Font size | `["FONT_SIZE"]` | FLOAT |
| Line height | `["LINE_HEIGHT"]` | FLOAT |
| Letter spacing | `["LETTER_SPACING"]` | FLOAT |
| Font weight (numeric) | `["FONT_WEIGHT"]` | FLOAT |
| Stroke width | `["STROKE_FLOAT"]` | FLOAT |
| Effect blur radius | `["EFFECT_FLOAT"]` | FLOAT |
| Opacity | `["OPACITY"]` | FLOAT |
| Font family | `["FONT_FAMILY"]` | STRING |
| Font style (e.g. "Semi Bold") | `["FONT_STYLE"]` | STRING |
| Boolean flags | *(scopes not supported)* | BOOLEAN |

**Never use `ALL_SCOPES`** on any variable. It pollutes every picker with irrelevant tokens. The Simple Design System (SDS), the gold standard, uses targeted scopes on every variable.

**`ALL_FILLS` note:** `ALL_FILLS` is exclusive among fill scopes — it covers `FRAME_FILL`, `SHAPE_FILL`, and `TEXT_FILL` together. If set, you cannot also add individual fill scopes. Prefer specifying individual scopes for precision.

### Batch Scope-Setting (After Variables are Created)

If you created variables without scopes and need to set them in batch:

```
variables_ep({
  method: "batch_update",
  updates: [
    // Background color variables — show in fill pickers
    { variableId: "<color-bg-default-id>",   scopes: ["FRAME_FILL", "SHAPE_FILL"] },
    { variableId: "<color-bg-secondary-id>", scopes: ["FRAME_FILL", "SHAPE_FILL"] },
    // Text color variables — show in text fill picker
    { variableId: "<color-text-default-id>", scopes: ["TEXT_FILL"] },
    // Icon color variables
    { variableId: "<color-icon-default-id>", scopes: ["SHAPE_FILL", "STROKE_COLOR"] },
    // Border color variables
    { variableId: "<color-border-default-id>", scopes: ["STROKE_COLOR"] },
    // Spacing variables
    { variableId: "<spacing-sm-id>", scopes: ["GAP"] },
    // Radius variables
    { variableId: "<radius-md-id>", scopes: ["CORNER_RADIUS"] },
    // Primitives — hide from all pickers
    { variableId: "<blue-500-id>", scopes: [] },
    { variableId: "<gray-900-id>", scopes: [] }
  ]
})
```

---

## 6. Code Syntax — WEB/ANDROID/iOS

Every variable must have code syntax set. This is what powers the developer handoff experience:

**What code syntax does:** When a developer inspects any element in Figma Dev Mode that has a variable-bound property (fill, padding, radius, etc.), the code snippet shown uses the variable's code syntax name — not the Figma variable name. For example, a button's background fill bound to `color/bg/primary` will show `background: var(--color-bg-primary)` in the CSS snippet, not `color/bg/primary`. Without code syntax set, Dev Mode shows raw hex values or nothing useful.

You can set up to **3 syntaxes per variable** — one per platform (Web, iOS, Android). Set all three if the codebase targets multiple platforms; set only WEB if it's a web-only project.

```
variables_ep({
  method: "set_code_syntax",
  variableId: "<variable-id>",
  syntax: {
    WEB: "var(--color-bg-primary)",
    ANDROID: "colorBgPrimary",
    iOS: "Color.bgPrimary"
  }
})
```

> **CRITICAL — WEB code syntax MUST use the `var()` wrapper.** Setting just `--color-bg-primary` (without `var()`) will cause Dev Mode to show raw hex values instead of the CSS variable reference. Always use the full `var(--name)` form. ANDROID and iOS do NOT use a wrapper.

**Platform derivation rules from the CSS variable name:**

| Platform | Pattern | Example |
|---|---|---|
| WEB | **`var(--{css-var-name})`** — `var()` wrapper required | `var(--sds-color-bg-primary)` |
| ANDROID | camelCase, no wrapper, strip `--` prefix | `sdsColorBgPrimary` |
| iOS | PascalCase after `.`, no wrapper, strip `--` prefix | `Color.SdsColorBgPrimary` or `Color.bgPrimary` |

**Always use the actual CSS variable name from the codebase** — do not derive it from the Figma variable name. If the code uses `--sds-color-background-brand-default`, that exact string is the WEB code syntax (minus the `var()` wrapper that you add).

### Batch Code Syntax Setting

Use `batch_update` to set code syntax on many variables at once. Prefer passing actual CSS variable names from the codebase; derive from Figma name only as a fallback.

```
variables_ep({
  method: "batch_update",
  updates: [
    { variableId: "<color-bg-primary-id>",   codeSyntax: { WEB: "var(--color-bg-primary)" } },
    { variableId: "<color-text-default-id>",  codeSyntax: { WEB: "var(--color-text-default)" } },
    { variableId: "<spacing-sm-id>",          codeSyntax: { WEB: "var(--spacing-sm)" } },
    { variableId: "<radius-md-id>",           codeSyntax: { WEB: "var(--radius-md)" } }
  ]
})
```

Note: derived names are a fallback only. Always prefer overriding with actual CSS variable names from the codebase when they are known.

---

## 7. Effect Styles (Shadows) and Text Styles

Shadows and composite typography cannot be variables — they are Styles.

### Creating Effect Styles (Shadows)

Reference from SDS (15 effect styles) and the SDS shadow pattern `Shadow/{Level}`:

```
# Shadow/Subtle — CSS: 0 1px 2px rgba(0,0,0,0.05)
styles_ep({
  method: "create_effect",
  name: "Shadow/Subtle",
  effects: [{
    type: "DROP_SHADOW",
    color: { r: 0, g: 0, b: 0, a: 0.05 },
    offset: { x: 0, y: 1 },
    radius: 2,
    spread: 0
  }]
})

# Shadow/Medium — CSS: 0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -1px rgba(0,0,0,0.06)
styles_ep({
  method: "create_effect",
  name: "Shadow/Medium",
  effects: [
    { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.10 }, offset: { x: 0, y: 4 }, radius: 6, spread: -1 },
    { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.06 }, offset: { x: 0, y: 2 }, radius: 4, spread: -1 }
  ]
})

# Shadow/Strong — CSS: 0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -2px rgba(0,0,0,0.05)
styles_ep({
  method: "create_effect",
  name: "Shadow/Strong",
  effects: [
    { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.10 }, offset: { x: 0, y: 10 }, radius: 15, spread: -3 },
    { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.05 }, offset: { x: 0, y: 4 }, radius: 6, spread: -2 }
  ]
})
```

M3-style dual shadow (umbra + penumbra pattern):

```
styles_ep({
  method: "create_effect",
  name: "Elevation/1",
  effects: [
    { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.30 }, offset: { x: 0, y: 1 }, radius: 2, spread: 0 },
    { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.15 }, offset: { x: 0, y: 1 }, radius: 3, spread: 1 }
  ]
})

styles_ep({
  method: "create_effect",
  name: "Elevation/2",
  effects: [
    { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.30 }, offset: { x: 0, y: 1 }, radius: 2, spread: 0 },
    { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.15 }, offset: { x: 0, y: 2 }, radius: 6, spread: 2 }
  ]
})

styles_ep({
  method: "create_effect",
  name: "Elevation/3",
  effects: [
    { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.30 }, offset: { x: 0, y: 1 }, radius: 3, spread: 0 },
    { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.15 }, offset: { x: 0, y: 4 }, radius: 8, spread: 3 }
  ]
})
```

### Creating Text Styles

FigCraft handles font loading automatically — no manual `loadFontAsync` needed.

```
# Display / Hero
styles_ep({ method: "create_text", name: "Display/Hero", fontFamily: "Inter", fontStyle: "Bold", fontSize: 72, lineHeight: 80, letterSpacing: -1.5 })

# Headings
styles_ep({ method: "create_text", name: "Heading/H1", fontFamily: "Inter", fontStyle: "Bold", fontSize: 48, lineHeight: 56, letterSpacing: -1.0 })
styles_ep({ method: "create_text", name: "Heading/H2", fontFamily: "Inter", fontStyle: "Bold", fontSize: 40, lineHeight: 48, letterSpacing: -0.5 })
styles_ep({ method: "create_text", name: "Heading/H3", fontFamily: "Inter", fontStyle: "Semi Bold", fontSize: 32, lineHeight: 40, letterSpacing: 0 })
styles_ep({ method: "create_text", name: "Heading/H4", fontFamily: "Inter", fontStyle: "Semi Bold", fontSize: 24, lineHeight: 32, letterSpacing: 0 })

# Body
styles_ep({ method: "create_text", name: "Body/Large",  fontFamily: "Inter", fontStyle: "Regular", fontSize: 18, lineHeight: 28, letterSpacing: 0 })
styles_ep({ method: "create_text", name: "Body/Medium", fontFamily: "Inter", fontStyle: "Regular", fontSize: 16, lineHeight: 24, letterSpacing: 0 })
styles_ep({ method: "create_text", name: "Body/Small",  fontFamily: "Inter", fontStyle: "Regular", fontSize: 14, lineHeight: 20, letterSpacing: 0 })

# Label
styles_ep({ method: "create_text", name: "Label/Large",  fontFamily: "Inter", fontStyle: "Medium", fontSize: 14, lineHeight: 20, letterSpacing: 0.1 })
styles_ep({ method: "create_text", name: "Label/Medium", fontFamily: "Inter", fontStyle: "Medium", fontSize: 12, lineHeight: 16, letterSpacing: 0.5 })
styles_ep({ method: "create_text", name: "Label/Small",  fontFamily: "Inter", fontStyle: "Medium", fontSize: 11, lineHeight: 16, letterSpacing: 0.5 })

# Code
styles_ep({ method: "create_text", name: "Code/Base", fontFamily: "Roboto Mono", fontStyle: "Regular", fontSize: 14, lineHeight: 20, letterSpacing: 0 })
```

---

## 8. Idempotency — Check-Before-Create Pattern

Every creation script should check whether the entity already exists before creating it. This prevents duplicates when a script is re-run after partial failure.

### Check-Before-Create for Collections

Use `variables_ep(method: "list_collections")` to check for existing collections before creating:

```
# Step 1: Check existing collections
variables_ep({ method: "list_collections" })
# → Returns array of { id, name, modes, variableCount }

# Step 2: Only create if "Primitives" not found in the list
variables_ep({
  method: "create_collection",
  collectionName: "Primitives",
  modeNames: ["Value"]
})
```

### Check-Before-Create for Variables

Use `variables_ep(method: "list")` to check for existing variables:

```
# Step 1: List variables in the target collection
variables_ep({ method: "list", collectionId: "<primitives-collection-id>" })
# → Returns array of { id, name, resolvedType, scopes, ... }

# Step 2: Only create variables not already present
# batch_create is idempotent — duplicate names in the same collection
# should be checked before calling
```

### sharedPluginData Tagging Strategy

FigCraft declarative tools handle tagging internally. When using `batch_create`, the tool tracks creation metadata automatically. For manual tagging scenarios (advanced), use `nodes(method: "update")` with plugin data fields.

**Cleanup by run:** Use `variables_ep(method: "list")` to find variables, then `variables_ep(method: "delete")` to remove specific ones by ID.

**Never clean up by name prefix** (e.g., deleting everything starting with `color/`). This will destroy user-created variables that happen to share the prefix.

---

## 9. Validation — Verify Counts, Aliases, and Scopes

Run these checks after Phase 1 to verify everything was created correctly before proceeding to Phase 2.

### Verify Collection and Variable Counts

```
# List all collections with their variable counts
variables_ep({ method: "list_collections" })
# → Returns: [{ name, id, modes, variableCount }, ...]

# List all variables (optionally filtered by collection)
variables_ep({ method: "list", collectionId: "<collection-id>" })
# → Returns: [{ name, id, resolvedType, scopes, codeSyntax, valuesByMode }, ...]
```

Interpret: variables with `scopes: []` for non-primitives and non-BOOLEANs → scope-setting failed, re-run scope script. Variables with no `codeSyntax.WEB` → code syntax not set, run batch code syntax update.

Note: primitives correctly have `scopes = []` (empty, hidden). Review the list to confirm empty-scope variables are all primitives.

### Verify Aliases Resolve

```
# List variables and inspect valuesByMode for VARIABLE_ALIAS entries
variables_ep({ method: "list", collectionId: "<color-collection-id>" })
# → Each variable's valuesByMode shows alias targets
# → Check that alias target IDs correspond to existing primitive variables

# Export for a structured view of all variables with resolved values
variables_ep({ method: "export" })
# → Returns full variable tree with resolved alias chains
```

Interpret: broken aliases (target ID not found) means a semantic variable references a primitive that was deleted or not yet created. Create the missing primitives, then re-run alias creation for the affected semantic variables.

### Verify Style Counts

```
# List all text styles
styles_ep({ method: "list", type: "TEXT" })
# → Returns: [{ name, id, fontSize, fontFamily, fontStyle, lineHeight, letterSpacing }, ...]

# List all effect styles
styles_ep({ method: "list", type: "EFFECT" })
# → Returns: [{ name, id, effects }, ...]
```

### Phase 1 Exit Criteria Checklist

Before proceeding to Phase 2, verify all of the following:

- Every planned collection exists with the correct number of modes
- Primitive variables: `scopes = []`, code syntax set
- Semantic variables: targeted scopes set, code syntax set, aliases pointing to primitives (not raw values)
- All broken alias count = 0
- All planned text styles exist with correct font family/size/weight
- All planned effect styles exist with correct shadow values
- No variable has `ALL_SCOPES` unless explicitly approved by the user
