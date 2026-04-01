---
inclusion: manual
description: "Workflow for building/updating Figma screens using design system components. Adapted from official figma-generate-design skill for Kiro + FigCraft environment."
---

# Building Screens from Design System — Kiro Adaptation

Adapted from the official `figma-generate-design` skill. Core principle: **discover and reuse** design system components, variables, and styles — don't draw primitives with hardcoded values.

## Tool Mapping

| Task | FigCraft Tool | Notes |
|------|--------------|-------|
| UI creation | `create_frame` + `children` | Declarative, Opinion Engine handles sizing/token binding/conflicts |
| Text creation | `create_text` | Standalone text nodes |
| Text range styling | `text(method: "set_range")` | Bold/color/size on character ranges |
| Node updates | `nodes(method: "update")` | 5-phase ordered execution, supports `strict` mode |
| Search design system | `search_design_system` | Searches components, variables, styles across all subscribed libraries |
| Read node tree | `get_current_page(maxDepth=N)` + `nodes(method: "get")` | Returns compressed node tree |
| Screenshot / export | `export_image` | Returns base64 PNG |
| Variable definitions | `variables_ep(method: "list")` + `list_library_variables` | Or Figma Power `get_variable_defs` if available |

## Workflow

### Step 1: Understand the Screen

Before touching Figma:
1. Read source files or description to understand page structure
2. Identify major sections (Header, Hero, Content, Footer, etc.)
3. List UI components per section (buttons, inputs, cards, nav, etc.)

### Step 2: Discover Design System Assets

Use `search_design_system` to find components, variables, and styles in one call:

```
search_design_system(query: "button")
→ { components: [...], variables: [...], styles: [...] }
```

For broader discovery:
- `get_mode` → returns `designContext` (grouped tokens) + `libraryComponents` (all published components)
- `search_design_system(query: "primary", types: ["variables"])` → find specific tokens

#### 2b: Component properties — Read via endpoint

```
components(method: "list_properties", componentId: "COMPONENT_ID")
→ Returns exposed properties, variant options, and nested instance slots
```

### Step 3: Create Page Wrapper

```json
create_frame({
  "name": "Homepage",
  "width": 1440,
  "layoutMode": "VERTICAL",
  "primaryAxisAlignItems": "CENTER",
  "counterAxisAlignItems": "CENTER",
  "layoutSizingVertical": "HUG"
})
```

→ `get_current_page(maxDepth=1)` to verify

### Step 4: Build Sections

Each call: `create_frame` with `parentId` pointing to wrapper, full children tree with token bindings.

```json
create_frame({
  "parentId": "WRAPPER_ID",
  "name": "Header",
  "layoutMode": "HORIZONTAL",
  "fillVariableName": "color/bg/primary",
  "paddingLeft": 24, "paddingRight": 24,
  "children": [
    { "type": "text", "content": "Get Started", "fontStyle": "SemiBold",
      "fontColorVariableName": "color/text/on-primary" }
  ]
})
```

For component instances, use `create_instances` (requires `load_toolset("components-advanced")`):
```
create_instances({ items: [{ componentId: "COMPONENT_ID", properties: { "Label": "Get Started" } }] })
```

→ Check `_children` and `_preview` in response
→ `export_image` at key milestones

### Step 5: Validate

1. `lint_fix_all(nodeIds: ["screen-id"])` — auto-fix quality issues
2. `get_current_page(maxDepth=2)` — inspect structure for lint side effects
3. `export_image` — final visual check. Look for:
   - Cropped/clipped text
   - Placeholder text not overridden
   - Wrong component variants
   - Overlapping elements

### Step 6: Updating Existing Screens

Use `nodes(method: "update")` for property changes:
```json
nodes({ method: "update", patches: [
  { nodeId: "NODE_ID", props: { fillVariableName: "color/bg/secondary" } }
] })
```

For component swaps, use `components(method: "swap")` (requires `load_toolset("components-advanced")`).

## What to Build Manually vs Import

| Build manually | Import from design system |
|----------------|--------------------------|
| Page wrapper frame | Components (buttons, cards, inputs, nav) |
| Section container frames | Variables (colors, spacing, radii) via `setBoundVariable` / `setBoundVariableForPaint` |
| Layout grids (rows, columns) | Text styles via `node.textStyleId` |
| | Effect styles via `node.effectStyleId` |

## Reference Docs (read on demand)

| Doc | When to load |
|-----|-------------|
| `.kiro/steering/figma-declarative-creation.md` | Declarative creation patterns, templates, smart defaults |
| `.kiro/steering/figma-design-creation.md` | Full design creation rules, layout strategies |
| `.kiro/steering/multi-screen-flow-guide.md` | Multi-screen flow hierarchy and build order |
