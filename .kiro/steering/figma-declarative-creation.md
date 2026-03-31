---
inclusion: auto
description: "Figma UI creation via declarative tools (create_frame + children) — preferred over execute_js"
---

# Figma UI Creation — Declarative Tools (Preferred)

Use `create_frame` with inline `children` as the primary way to create UI in Figma. This produces higher quality output than `execute_js` because sizing, token binding, and layout inference are handled automatically by the tool.

## When to Use What

| Scenario | Use | Why |
|----------|-----|-----|
| Any UI creation (screens, forms, cards, flows) | `create_frame` + `children` | Smart defaults, auto token binding, no Plugin API pitfalls |
| Component instances | `create_instance` or `create_instances` | Variant selection + property overrides in one call |
| Icons | `icon_search` → `icon_create` | Iconify integration, color variable binding |
| Images | `image_search` → `create_frame` with `imageUrl` | Pexels integration, one-step placement |
| Text scanning | `text_scan` | Find all text in a subtree |
| Node-to-component conversion | `create_component_from_node` | Auto-exposes text as editable properties |
| Decorative shapes | `create_frame` children: `star`, `polygon` | Star ratings, hex grids, badges |
| Complex conditional logic, loops over dynamic data | `execute_js` (escape hatch) | Only when declarative tools can't express the logic |
| Plugin API methods not wrapped by any tool | `execute_js` (escape hatch) | Rare — most operations have declarative equivalents |

## Core Pattern: create_frame + children

One call builds an entire node tree. Smart defaults handle sizing automatically.

```json
create_frame({
  "name": "Login Screen",
  "width": 402, "height": 874,
  "layoutMode": "VERTICAL",
  "primaryAxisAlignItems": "SPACE_BETWEEN",
  "padding": 24,
  "fill": "#FFFFFF",
  "children": [
    {
      "type": "frame", "name": "Top Content", "itemSpacing": 32,
      "children": [
        { "type": "text", "content": "Welcome back", "fontSize": 28, "fontStyle": "Bold" },
        {
          "type": "frame", "name": "Form", "itemSpacing": 12,
          "children": [
            {
              "type": "frame", "name": "Email Input",
              "cornerRadius": 12, "strokeColor": "#E0E0E0", "padding": 16,
              "children": [
                { "type": "text", "content": "Enter your email", "fill": "#999999" }
              ]
            },
            {
              "type": "frame", "name": "Password Input",
              "cornerRadius": 12, "strokeColor": "#E0E0E0", "padding": 16,
              "children": [
                { "type": "text", "content": "Password", "fill": "#999999" }
              ]
            }
          ]
        },
        {
          "type": "frame", "name": "Sign In",
          "cornerRadius": 12, "fill": "#3B82F6",
          "primaryAxisAlignItems": "CENTER", "counterAxisAlignItems": "CENTER",
          "padding": 16,
          "children": [
            { "type": "text", "content": "Sign In", "fill": "#FFFFFF", "fontStyle": "SemiBold" }
          ]
        }
      ]
    },
    { "type": "text", "content": "Don't have an account? Sign up", "fontSize": 14, "fill": "#666666" }
  ]
})
```

This single call creates the entire login screen with correct auto-layout, sizing, and structure.

## Smart Defaults (automatic — no action needed)

These happen inside the tool, the agent doesn't need to think about them:

- Frame with padding/spacing but no `layoutMode` → auto-inferred as VERTICAL
- Frame with `children` but no `layoutMode` → auto-inferred as VERTICAL (auto-layout needed for child sizing)
- Frame with `width`/`height` + auto-layout → sizing stays FIXED (not overridden by layoutMode's HUG default)
- Child in VERTICAL parent → `layoutSizingHorizontal: FILL`, `layoutSizingVertical: HUG`
- Child in HORIZONTAL parent → `layoutSizingHorizontal: HUG`, `layoutSizingVertical: FILL`
- Parent HUGs on cross-axis → child defaults to HUG (avoids collapse)
- Parent uses CENTER/MAX/BASELINE alignment → child defaults to HUG (avoids overriding alignment)
- Text in VERTICAL parent → auto `textAutoResize: HEIGHT` (wraps at parent width)
- `width` on text → auto `textAutoResize: HEIGHT` (fixed width, auto height)
- `layoutMode: NONE` + padding/spacing → throws error (conflict detection)
- `FILL` + explicit `width`/`height` → throws error (conflict detection)
- Hex color → auto-matches local variable or paint style (even without library mode)
- Cards/panels → auto `minWidth` constraint (prevents collapse)
- Buttons → auto `minWidth` + `minHeight` constraints (touch target)
- Input fields → auto `minWidth` constraint
- Inline children max depth: 10 levels (deeper levels are skipped with warning)

## Token Binding (automatic or explicit)

Automatic (hex colors are matched to local variables/styles):
```json
{ "fill": "#3B82F6" }
```

Explicit (preferred when you know the token name):
```json
{ "fillVariableName": "bg/primary" }
{ "fillStyleName": "Surface/Primary" }
{ "fontColorVariableName": "text/primary" }
{ "strokeVariableName": "border/default" }
```

The `_libraryBindings` and `_hints` arrays in the response tell you what was auto-bound and what sizing was inferred. `_warnings` array reports non-fatal issues (e.g. image load failed, style not found).

## Advanced Properties

### Per-corner Radius
```json
{ "cornerRadius": 20, "bottomLeftRadius": 0, "bottomRightRadius": 0 }
```
Set `cornerRadius` for uniform, then override individual corners with `topLeftRadius`, `topRightRadius`, `bottomRightRadius`, `bottomLeftRadius`.

### Gradient Fill
```json
{ "gradient": { "type": "LINEAR", "stops": [{"color": "#FF6B6B", "position": 0}, {"color": "#4ECDC4", "position": 1}], "angle": 135 } }
```
Supports `LINEAR` and `RADIAL`. `angle` is degrees (default 180 = top-to-bottom, 90 = left-to-right).

### Dashed Stroke
```json
{ "strokeColor": "#E0E0E0", "strokeDashes": [10, 5], "strokeCap": "ROUND" }
```
`strokeDashes`: `[dash, gap]` array. `strokeCap`: `NONE | ROUND | SQUARE`. `strokeJoin`: `MITER | BEVEL | ROUND`.

### Text Case & Decoration
```json
{ "type": "text", "content": "Sign Up", "textCase": "UPPER" }
{ "type": "text", "content": "Was $99", "textDecoration": "STRIKETHROUGH" }
```
`textCase`: `ORIGINAL | UPPER | LOWER | TITLE`. `textDecoration`: `NONE | UNDERLINE | STRIKETHROUGH`.

### Inline Star & Polygon Children
```json
{ "type": "star", "width": 24, "height": 24, "fill": "#FFD700", "pointCount": 5, "innerRadius": 0.4 }
{ "type": "polygon", "width": 32, "height": 32, "fill": "#333", "pointCount": 6 }
```

## Dry Run (Staging Preview)

Use `dryRun: true` to validate params and preview inferences WITHOUT creating nodes:
```json
create_frame({ "dryRun": true, "name": "Card", "padding": 16, "children": [...] })
// Returns: { "dryRun": true, "valid": true, "inferences": [...], "ambiguous": false }
```
When ambiguity is detected, the response includes `correctedPayload` — use it for the actual creation:
```json
// Response: { "dryRun": true, "ambiguous": true, "correctedPayload": { ... }, "diff": "..." }
// Then: create_frame(response.correctedPayload)
```

## Batch Creation

`create_frame` and `create_text` support `items[]` for batch creation:
```json
create_frame({ "items": [
  { "name": "Screen 1", "width": 402, "height": 874, ... },
  { "name": "Screen 2", "width": 402, "height": 874, ... }
] })
// Returns: { "created": 2, "total": 2, "items": [{id, name, ok}, ...] }
```
- `create_frame`: max 20 per batch, lint runs once at the end (not per-item)
- `create_text`: max 50 per batch

## Multi-Screen Flows

Build the wrapper and screens as nested children:

```json
create_frame({
  "name": "Auth Flow",
  "layoutMode": "HORIZONTAL",
  "itemSpacing": 48,
  "padding": 56,
  "fill": "#F5F5F5",
  "cornerRadius": 32,
  "clipsContent": false,
  "children": [
    {
      "type": "frame", "name": "Screen 1 - Login",
      "width": 402, "height": 874,
      "layoutMode": "VERTICAL",
      "primaryAxisAlignItems": "SPACE_BETWEEN",
      "padding": 24, "fill": "#FFFFFF",
      "cornerRadius": 28, "clipsContent": true,
      "layoutSizingHorizontal": "FIXED", "layoutSizingVertical": "FIXED",
      "children": [...]
    },
    {
      "type": "frame", "name": "Screen 2 - Register",
      "width": 402, "height": 874,
      "layoutMode": "VERTICAL",
      "primaryAxisAlignItems": "SPACE_BETWEEN",
      "padding": 24, "fill": "#FFFFFF",
      "cornerRadius": 28, "clipsContent": true,
      "layoutSizingHorizontal": "FIXED", "layoutSizingVertical": "FIXED",
      "children": [...]
    }
  ]
})
```

For large flows (5+ screens), split into multiple calls — one `create_frame` per screen, appending to the wrapper via `parentId`.

## Verification

After creation:
1. `get_current_page(maxDepth=1)` — structure check (always)
2. `export_image` — visual check (at milestones)
3. `lint_fix_all` — quality check (before replying to user)

## Component Workflow

One-step (preferred — create component with children + properties in one call):
```json
create_component({
  "name": "Card",
  "layoutMode": "VERTICAL",
  "padding": 16, "itemSpacing": 8,
  "fill": "#FFFFFF",
  "children": [
    { "type": "text", "content": "Title", "fontSize": 18, "fontStyle": "Bold", "componentPropertyName": "Title" },
    { "type": "text", "content": "Description", "fontSize": 14, "componentPropertyName": "Description" }
  ],
  "properties": [{ "propertyName": "Show Icon", "type": "BOOLEAN", "defaultValue": true }]
})
```

Two-step (when converting existing nodes):
```
1. Create UI tree:     create_frame({ children: [...] })
2. Convert to component: create_component_from_node({ nodeId, exposeText: true })
```

Create instances:
```json
create_instances({ "items": [{ "componentId": "<id>", "properties": { "Title": "My Card" }, "sizing": "contextual" }] })
```

## Templates

Screen shell:
```json
{ "name": "Screen Name", "width": 402, "height": 874, "layoutMode": "VERTICAL",
  "primaryAxisAlignItems": "SPACE_BETWEEN", "padding": 24, "fill": "#FFFFFF",
  "layoutSizingHorizontal": "FIXED", "layoutSizingVertical": "FIXED" }
```

Input field:
```json
{ "type": "frame", "name": "Email Input", "cornerRadius": 12, "strokeColor": "#E0E0E0",
  "padding": 16, "children": [{ "type": "text", "content": "Placeholder", "fill": "#999" }] }
```

Button:
```json
{ "type": "frame", "name": "Sign In", "cornerRadius": 12, "fill": "#3B82F6",
  "primaryAxisAlignItems": "CENTER", "counterAxisAlignItems": "CENTER",
  "padding": 16, "children": [{ "type": "text", "content": "Sign In", "fill": "#FFF", "fontStyle": "SemiBold" }] }
```

Button (with token binding — preferred when tokens exist):
```json
{ "type": "frame", "name": "Sign In", "cornerRadius": 12, "fillVariableName": "fill/primary",
  "primaryAxisAlignItems": "CENTER", "counterAxisAlignItems": "CENTER",
  "padding": 16, "children": [{ "type": "text", "content": "Sign In", "fontColorVariableName": "text/on-primary", "fontStyle": "SemiBold" }] }
```

Link row:
```json
{ "type": "frame", "layoutMode": "HORIZONTAL", "itemSpacing": 4,
  "primaryAxisAlignItems": "CENTER",
  "children": [
    { "type": "text", "content": "Don't have an account?", "fontSize": 14, "fill": "#666" },
    { "type": "text", "content": "Sign up", "fontSize": 14, "fill": "#3B82F6", "fontStyle": "SemiBold" }
  ] }
```


## Text Replacement Strategy

When replacing text content in existing designs (localization, content updates, data population):

### 1. Scan first
```
text_scan({ nodeId: "<root>", includePath: true })
```
Returns all text nodes with layer hierarchy paths. Use this to understand the structure before making changes.

### 2. Chunk by structure
Divide replacements into logical groups based on the scan results:
- Structural: table rows, list sections, card groups
- Spatial: top-to-bottom, left-to-right
- Semantic: content related to the same topic
- Component-based: similar instances together

### 3. Replace progressively
```
text(method: "set_content", nodeId: "<id>", content: "New text")
```
After each chunk:
- `export_image` on the affected section to verify text fits
- Fix overflow or truncation before proceeding

### 4. Table/list data
- Process one row or column at a time
- Maintain alignment between cells
- Consider text length constraints per column

### 5. Text adaptation
- Auto-detect container width constraints
- Use realistic text lengths (names ≤ 20 chars, descriptions 1-2 sentences)
- Never use "Lorem ipsum", "Text goes here", or placeholder text
