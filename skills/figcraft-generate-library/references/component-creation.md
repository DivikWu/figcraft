> Part of the [figcraft-generate-library skill](../SKILL.md).

# Component Creation Reference

> **All examples use FigCraft declarative tools.** For raw Plugin API patterns, see the `figcraft-use` skill.

Complete guide for Phase 3: building components with variant matrices, variable bindings, component properties, and documentation.

---

## 1. Component Architecture

### Dependency Ordering: Atoms Before Molecules

Always build in dependency order. A molecule that contains an atom instance cannot exist until the atom is published. Suggested ordering:

```
Tier 0 (atoms): Icon, Avatar, Badge, Spinner
Tier 1 (molecules): Button, Checkbox, Toggle, Input, Select
Tier 2 (organisms): Card, Dialog, Menu, Navigation, Form
```

If a component embeds an instance of another component, the embedded component must be created first. Build your dependency graph during Phase 0 and encode the creation order in the plan.

### Building Blocks Sub-Components (M3 Pattern)

For complex components with independent sub-element state machines, extract the sub-element into its own component set prefixed with `Building Blocks/` (public) or `.Building Blocks/` (hidden from assets panel). The dot-prefix is a Figma convention for suppressing a component from the public assets panel.

**When to use Building Blocks:**
- The sub-element has its own variant axes (state, selection) that would cause combinatorial explosion in the parent
- The sub-element repeats (nav items, table cells, calendar cells, segmented button segments)
- The sub-element has different variant axes than the parent

**Example (M3 Segmented Button):**
```
Building Blocks/Segmented button/Button segment (start)   [27 variants: Config × State × Selected]
Building Blocks/Segmented button/Button segment (middle)  [27 variants]
Building Blocks/Segmented button/Button segment (end)     [27 variants]

Segmented button  [16 variants: Segments=2-5 × Density=0/-1/-2/-3]
  Each variant contains instances of the appropriate Building Block segment components.
```

The parent manages composition and configuration; the Building Block manages its own interaction states.

### Private Components (`__` Prefix)

Use the `__` prefix for internal helper components that should not appear in the team library (Shop Minis pattern). Use `_` for documentation-only components (UI3 pattern).

```
__asset          // private icon/asset holder
_Label/Direction // documentation annotation helper
```

---

## 2. Creating the Component Page

Each component lives on its own dedicated page (one page per component is the default). The page contains: a documentation frame at top-left and the component set positioned to its right or below.

```
Step 1: Create or switch to the component page
─────────────────────────────────────────────
Tool: set_current_page
Args: { nameOrId: "Button" }
// Creates the page if it doesn't exist; switches to it if it does.

Step 2: Create the documentation frame
─────────────────────────────────────────────
Tool: create_frame
Args: {
  name: "Button / Documentation",
  x: 40, y: 40,
  width: 600,
  layoutMode: "VERTICAL",
  fill: "#FFFFFF",
  padding: 40,
  itemSpacing: 16,
  children: [
    {
      type: "text",
      name: "title",
      content: "Button",
      fontSize: 32,
      fontStyle: "Bold"
    },
    {
      type: "text",
      name: "description",
      content: "Buttons allow users to take actions and make choices with a single tap.",
      fontSize: 14
    }
  ]
}
// Font loading is handled automatically by the Opinion Engine.
// Returns: { id: "DOC_FRAME_ID" }
```

---

## 3. Base Component: Auto-Layout, Child Nodes, Variable Bindings

The base component is the template from which all variants are cloned. It must have:
1. Auto-layout (not manual positioning)
2. All child nodes present
3. ALL visual properties bound to variables (no hardcoded values)

### Complete Button Base Component Example

```
Step 1: Switch to the Button page
─────────────────────────────────────────────
Tool: set_current_page
Args: { nameOrId: "Button" }

Step 2: Create the base component with variable bindings
─────────────────────────────────────────────
Tool: create_component
Args: {
  name: "Size=Medium, Style=Primary, State=Default",
  layoutMode: "HORIZONTAL",
  counterAxisAlignItems: "CENTER",
  primaryAxisAlignItems: "CENTER",
  fillVariableId: "VariableID:xx:yy",        // color/bg/primary
  cornerRadius: 8,                            // or use variable binding below
  padding: 12,                                // or use variable binding below
  itemSpacing: 8,
  children: [
    {
      type: "text",
      name: "label",
      content: "Button",
      fontSize: 14,
      fontStyle: "Medium",
      fontColorVariableName: "color/text/on-primary"
    },
    {
      type: "frame",
      name: "icon",
      width: 16,
      height: 16,
      fill: "none"
    }
  ]
}
// Returns: { id: "BASE_COMP_ID" }

Step 3: Bind spacing/radius to variables (for token-driven sizing)
─────────────────────────────────────────────
Tool: variables_ep
Args: {
  method: "batch_bind",
  bindings: [
    { nodeId: "BASE_COMP_ID", field: "paddingTop",         variableId: "VAR_ID_spacing_md" },
    { nodeId: "BASE_COMP_ID", field: "paddingBottom",      variableId: "VAR_ID_spacing_md" },
    { nodeId: "BASE_COMP_ID", field: "paddingLeft",        variableId: "VAR_ID_spacing_md" },
    { nodeId: "BASE_COMP_ID", field: "paddingRight",       variableId: "VAR_ID_spacing_md" },
    { nodeId: "BASE_COMP_ID", field: "itemSpacing",        variableId: "VAR_ID_spacing_sm" },
    { nodeId: "BASE_COMP_ID", field: "topLeftRadius",      variableId: "VAR_ID_radius_md" },
    { nodeId: "BASE_COMP_ID", field: "topRightRadius",     variableId: "VAR_ID_radius_md" },
    { nodeId: "BASE_COMP_ID", field: "bottomLeftRadius",   variableId: "VAR_ID_radius_md" },
    { nodeId: "BASE_COMP_ID", field: "bottomRightRadius",  variableId: "VAR_ID_radius_md" }
  ]
}
```

**ALL of these must be variable-bound (never hardcoded):**

| Property | Variable type | Declarative approach |
|---|---|---|
| Fill color | COLOR | `fillVariableId:"VariableID:x:y"` or `fillVariableName:"color/bg/primary"` param |
| Stroke color | COLOR | `strokeVariableName:"color/border/default"` param |
| Text fill | COLOR | `fontColorVariableName:"color/text/primary"` child param |
| Padding (all 4 sides) | FLOAT | `variables_ep(method:"batch_bind", bindings:[{field:"paddingTop", variableId}])` |
| Gap / itemSpacing | FLOAT | `variables_ep(method:"batch_bind", bindings:[{field:"itemSpacing", variableId}])` |
| Corner radius (all 4) | FLOAT | `variables_ep(method:"batch_bind", bindings:[{field:"topLeftRadius", variableId}])` etc. |
| Stroke weight | FLOAT | `variables_ep(method:"batch_bind", bindings:[{field:"strokeWeight", variableId}])` |

---

## 4. Variant Matrix

### Defining Axes

For each component, identify its variant axes before creating anything. Standard axes:

```
Button:
  Size   → [Small, Medium, Large]
  Style  → [Primary, Secondary, Outline, Ghost]
  State  → [Default, Hover, Focused, Pressed, Disabled]
  Total  = 3 × 4 × 5 = 60 combinations — exceeds 30 limit → split by Style
```

### The 30-Combination Cap and Split Strategy

When the product of all variant axes exceeds 30 combinations, split the matrix. Options:

1. **Split by a primary axis**: Create separate component sets, one per Style (Primary Button, Secondary Button, etc.)
2. **Use INSTANCE_SWAP**: Remove a visual axis (like Icon) from the variant matrix entirely and expose it as an INSTANCE_SWAP property instead
3. **Use Building Blocks**: Extract sub-elements with their own state axes into Building Block component sets

For Button with Size × State = 15 combinations, add Style as a variant axis only if Style ≤ 2 options (15 × 2 = 30). For more Styles, split.

### Creating All Variants

Build each variant by cloning the base component and adjusting the variable bindings that differ per variant. Pass in the base component ID from the previous call's state.

```
For each combination of (Size, Style, State):
─────────────────────────────────────────────

Step 1: Clone the base component
Tool: nodes
Args: { method: "clone", items: [{ id: "BASE_COMP_ID" }] }
// Returns: { items: [{ id: "CLONE_ID" }] }

Step 2: Rename the clone to its variant name
Tool: nodes
Args: {
  method: "update",
  patches: [{
    nodeId: "CLONE_ID",
    props: { name: "Size=Small, Style=Primary, State=Default" }
  }]
}

Step 3: Rebind size-specific variables (padding by size tier)
Tool: variables_ep
Args: {
  method: "batch_bind",
  bindings: [
    { nodeId: "CLONE_ID", field: "paddingTop",    variableId: "VAR_ID_spacing_sm" },
    { nodeId: "CLONE_ID", field: "paddingBottom", variableId: "VAR_ID_spacing_sm" },
    { nodeId: "CLONE_ID", field: "paddingLeft",   variableId: "VAR_ID_spacing_sm" },
    { nodeId: "CLONE_ID", field: "paddingRight",  variableId: "VAR_ID_spacing_sm" }
  ]
}

Step 4: Rebind fill color by style + state
Tool: variables_ep
Args: {
  method: "batch_bind",
  bindings: [
    { nodeId: "CLONE_ID", field: "fills",  variableId: "VAR_ID_color_bg_primary" },
    { nodeId: "LABEL_ID", field: "fills",  variableId: "VAR_ID_color_text_on_primary" }
  ]
}

Repeat for all 18 combinations (3 Size × 2 Style × 3 State).
Collect all variant IDs: ["ID1", "ID2", ..., "ID18"]
```

---

## 5. `create_component_set` + Grid Layout

After all variant components exist, combine them into a ComponentSet. Use `create_component_set` which handles `combineAsVariants` internally and applies grid layout automatically via `layout_component_set`.

### Grid Design Conventions

Professional design systems lay out variants in a readable grid where:
- **Columns** = the property users interact with most (typically **State**: Default, Hover, Focused, Pressed, Disabled)
- **Rows** = structural axes grouped together (typically **Size × Style**, where Size varies fastest)
- **Gap** = 16–40px between variants (20px is a safe default; match existing file if one exists)
- **Padding** = 40px around the grid inside the ComponentSet frame

```
Visual structure:
                    Default    Hover     Focused   Pressed   Disabled
  ┌──────────────────────────────────────────────────────────────────┐
  │  Small/Primary   [comp]    [comp]    [comp]    [comp]    [comp] │
  │  Small/Secondary [comp]    [comp]    [comp]    [comp]    [comp] │
  │  Medium/Primary  [comp]    [comp]    [comp]    [comp]    [comp] │
  │  Medium/Secondary[comp]    [comp]    [comp]    [comp]    [comp] │
  │  Large/Primary   [comp]    [comp]    [comp]    [comp]    [comp] │
  │  Large/Secondary [comp]    [comp]    [comp]    [comp]    [comp] │
  └──────────────────────────────────────────────────────────────────┘
```

**Why State on columns?** State is the axis designers scan horizontally to verify interaction consistency. Size/Style define the "identity" of each row. This matches how professional design systems (M3, Polaris, Simple DS) organize their grids.

### Adding Row/Column Header Labels

After creating the component set, add text labels OUTSIDE the ComponentSet to help navigation. These are siblings of the ComponentSet on the page — not children of it:

```
Tool: create_text
Args: {
  items: [
    { content: "Default",  x: CS_X + 40,               y: CS_Y - 20, fontSize: 11, fontStyle: "Medium", fill: "#808080" },
    { content: "Hover",    x: CS_X + 40 + 1*(W + GAP),  y: CS_Y - 20, fontSize: 11, fontStyle: "Medium", fill: "#808080" },
    { content: "Focused",  x: CS_X + 40 + 2*(W + GAP),  y: CS_Y - 20, fontSize: 11, fontStyle: "Medium", fill: "#808080" },
    { content: "Pressed",  x: CS_X + 40 + 3*(W + GAP),  y: CS_Y - 20, fontSize: 11, fontStyle: "Medium", fill: "#808080" },
    { content: "Disabled", x: CS_X + 40 + 4*(W + GAP),  y: CS_Y - 20, fontSize: 11, fontStyle: "Medium", fill: "#808080" }
  ]
}
// Row labels similarly positioned to the left of the ComponentSet.
```

**Note:** These labels are documentation aids, not part of the component itself. They help designers navigate the variant grid.

### Creating the ComponentSet with Grid Layout

```
Step 1: Combine variants into a ComponentSet
─────────────────────────────────────────────
Tool: create_component_set
Args: {
  componentIds: ["ID1", "ID2", ..., "ID18"],
  name: "Button"
}
// Handles combineAsVariants internally.
// Returns: { id: "CS_ID" }

Step 2: Apply grid layout to the ComponentSet
─────────────────────────────────────────────
Tool: layout_component_set
Args: {
  nodeId: "CS_ID",
  colAxis: "State",
  rowAxes: ["Size", "Style"],
  gap: 16,
  padding: 40
}
// Positions children in a grid, resizes the ComponentSet frame to fit,
// and applies styling (background fill, corner radius).
// Returns: { id: "CS_ID", gridSize: { cols: 3, rows: 6 } }

Step 3: Position the ComponentSet on the page
─────────────────────────────────────────────
Tool: nodes
Args: {
  method: "update",
  patches: [{
    nodeId: "CS_ID",
    props: { x: 680, y: 40 }
  }]
}
```

**Critical rules for `create_component_set`:**
- `componentIds` must be a non-empty array containing ONLY `ComponentNode` IDs (not frames, not groups)
- `layout_component_set` handles child positioning and frame resizing — no manual grid math needed
- The 30-variant cap is enforced at runtime — exceeding it produces an error with a split suggestion

---

## 6. Component Properties

Add TEXT, BOOLEAN, and INSTANCE_SWAP properties to the ComponentSet (not to individual variants). The return value of `addComponentProperty` is the actual property key (it gets a `#id:id` suffix appended) — save this key and use it immediately when setting `componentPropertyReferences`.

> **Note:** Component property operations (addComponentProperty, editComponentProperty, componentPropertyReferences) require the `figcraft-use` skill with `use_figma` calls, as FigCraft does not yet have declarative tools for these. The examples below show the `use_figma` call structure.

### TEXT Properties

Expose editable text in instances:

```
Tool: use_figma
Description: "Add Label TEXT property and wire to label children"
Code:
  const cs = await figma.getNodeByIdAsync('CS_ID');
  const labelKey = cs.addComponentProperty('Label', 'TEXT', 'Button');
  for (const child of cs.children) {
    const labelNode = child.findOne(n => n.name === 'label');
    if (labelNode) {
      labelNode.componentPropertyReferences = { characters: labelKey };
    }
  }
  return { labelKey };
```

### BOOLEAN Properties

Toggle child node visibility:

```
Tool: use_figma
Description: "Add Show Icon BOOLEAN property and wire to icon children"
Code:
  const cs = await figma.getNodeByIdAsync('CS_ID');
  const showIconKey = cs.addComponentProperty('Show Icon', 'BOOLEAN', true);
  for (const child of cs.children) {
    const iconNode = child.findOne(n => n.name === 'icon');
    if (iconNode) {
      iconNode.componentPropertyReferences = { visible: showIconKey };
    }
  }
  return { showIconKey };
```

### INSTANCE_SWAP Properties

Allow swapping a nested component instance (e.g., swap the icon):

```
Tool: use_figma
Description: "Add Icon INSTANCE_SWAP property"
Code:
  const cs = await figma.getNodeByIdAsync('CS_ID');
  const iconKey = cs.addComponentProperty('Icon', 'INSTANCE_SWAP', 'DEFAULT_ICON_COMP_ID');
  for (const child of cs.children) {
    const iconSlot = child.findOne(n => n.name === 'icon');
    if (iconSlot && iconSlot.type === 'INSTANCE') {
      iconSlot.componentPropertyReferences = { mainComponent: iconKey };
    }
  }
  return { iconKey };
```

**Use INSTANCE_SWAP instead of creating a variant per icon.** Never add "Icon=ChevronRight, Icon=ChevronLeft, ..." as VARIANT axes — that causes combinatorial explosion. One INSTANCE_SWAP property covers all icons.

### Creating Icon Components for INSTANCE_SWAP

INSTANCE_SWAP needs a real Component ID as its default value. Before wiring INSTANCE_SWAP, you need at least one icon component. Use `icon_search` + `icon_create` to find and create icons:

```
Step 1: Search for an icon
─────────────────────────────────────────────
Tool: icon_search
Args: { query: "chevron right", prefix: "lucide" }
// Returns: [{ name: "lucide:chevron-right", ... }, ...]

Step 2: Create the icon as a component
─────────────────────────────────────────────
Tool: create_component
Args: {
  name: "Icon/ChevronRight",
  width: 24,
  height: 24,
  clipsContent: true,
  children: [
    {
      type: "icon",
      icon: "lucide:chevron-right",
      size: 24,
      colorVariableName: "color/icon/default"
    }
  ]
}
// Returns: { id: "ICON_COMP_ID" }
```

**Then use the returned `ICON_COMP_ID` as the default value for INSTANCE_SWAP.**

**Constraining swap options with `preferredValues`:**
After adding the INSTANCE_SWAP property, you can optionally limit which components appear in the swap picker:

```
Tool: use_figma
Description: "Set preferredValues for Icon INSTANCE_SWAP property"
Code:
  const cs = await figma.getNodeByIdAsync('CS_ID');
  const props = cs.componentPropertyDefinitions;
  const iconPropKey = Object.keys(props).find(k => k.startsWith('Icon'));
  cs.editComponentProperty(iconPropKey, {
    preferredValues: [
      { type: 'COMPONENT', key: 'CHEVRON_RIGHT_KEY' },
      { type: 'COMPONENT', key: 'CHEVRON_LEFT_KEY' },
      { type: 'COMPONENT', key: 'CLOSE_KEY' },
    ],
  });
  return { updated: iconPropKey };
```

**Icon library tip:** Create all icon components on a dedicated `Icons` page before building any UI components. Then reference their IDs when wiring INSTANCE_SWAP properties.

### `componentPropertyReferences` mapping

The `componentPropertyReferences` object maps a node's own property to a component property key:

| Node property | Component property type | Used for |
|---|---|---|
| `characters` | TEXT | Editable text content |
| `visible` | BOOLEAN | Show/hide toggle |
| `mainComponent` | INSTANCE_SWAP | Swap nested instances |

---

## 7. `sharedPluginData` Tagging for Idempotency

Tag EVERY created node immediately after creation. This enables safe cleanup, resumability, and idempotency checks.

> **Note:** `sharedPluginData` operations require `use_figma` as there is no declarative tool for plugin data.

```
Tool: use_figma
Description: "Tag node with sharedPluginData for idempotency"
Code:
  const node = await figma.getNodeByIdAsync('NODE_ID');
  node.setSharedPluginData('dsb', 'run_id', 'ds-build-2024-001');
  node.setSharedPluginData('dsb', 'phase', 'phase3');
  node.setSharedPluginData('dsb', 'key', 'component/button/base');
  return { tagged: node.id };
```

**Key naming convention:** use `/`-separated logical paths that mirror the entity hierarchy:
```
'component/button/base'
'component/button/variant/Medium/Primary/Default'
'componentset/button'
'doc/button'
'page/button'
```

**Idempotency check before creating:** before creating a node, scan the current page for an existing node with the same `key`:

```
Tool: use_figma
Description: "Check if componentset/button already exists"
Code:
  const existing = figma.currentPage.findAll(n =>
    n.getSharedPluginData('dsb', 'key') === 'componentset/button'
  );
  if (existing.length > 0) {
    return { alreadyExists: true, componentSetId: existing[0].id };
  }
  return { alreadyExists: false };
```

---

## 8. Documentation

### Page title + description frame

The documentation frame (see Section 2) should contain:
1. Component name as a large title (32px+ Bold)
2. 1–3 sentence description of what the component is and when to use it
3. Spec notes (sizes, spacing values, accessibility notes)

### Component `description` property

Set the description on the ComponentSet — it appears in the Figma properties panel and is exported as documentation:

```
Tool: nodes
Args: {
  method: "update",
  patches: [{
    nodeId: "CS_ID",
    props: {
      description: "Buttons allow users to take actions and make choices. Use Primary for the highest-emphasis action on a page."
    }
  }]
}
```

### `documentationLinks`

Link to external documentation (Storybook, design spec, tokens reference):

```
Tool: use_figma
Description: "Set documentationLinks on ComponentSet"
Code:
  const cs = await figma.getNodeByIdAsync('CS_ID');
  cs.documentationLinks = [{ uri: 'https://your-storybook.com/button' }];
  return { done: true };
```

### Node names and organization

- ComponentSet: plain component name — `'Button'`
- Individual variants: `'Property=Value, Property=Value'` format (match the file's existing casing)
- Child nodes: semantic names — `'label'`, `'icon'`, `'container'`, `'state-layer'`
- Documentation frames: `'ComponentName / Documentation'`

---

## 9. Validation

Always validate after creating or modifying a component before proceeding to the next one.

### `nodes(method:"get", detail:"full")` structural checks

After creating the component set, call `nodes(method:"get", detail:"full")` on the ComponentSet node and verify:
- `variantGroupProperties` lists the expected axes with the correct value arrays
- `componentPropertyDefinitions` contains the expected TEXT/BOOLEAN/INSTANCE_SWAP properties
- `children.length` equals the expected variant count (e.g., 18 for 3x2x3)
- No children are named `'Component 1'` (unnamed components are a sign of a bug)

### `export_image` — Visual Validation (Critical)

`export_image` returns an **image** of the specified node. Call it on the **component set** or the **component page** to see the full layout including documentation and grid labels.

```
Tool: export_image
Args: { nodeId: "CS_ID", format: "PNG", scale: 1 }
```

**How to use the screenshot:**

1. **Display it to the user** — this is the primary purpose. Show the screenshot as part of the user checkpoint: "Here's the Button component. Does it look right?"
2. **Analyze it yourself** — if you have vision capabilities, check the visual checklist below. If you don't (text-only agent), fall back to structural validation only via `nodes(method:"get", detail:"full")` and describe what you created textually.

**Visual validation checklist** (check each item when viewing the screenshot):

| # | Check | What "good" looks like | What "broken" looks like |
|---|-------|----------------------|------------------------|
| 1 | **Grid layout** | Variants in neat rows and columns with consistent spacing | All variants piled at top-left (0,0 stacking bug) |
| 2 | **Color fills** | Components show distinct, correct colors per style variant | All components are black or same color (variable binding failed) |
| 3 | **Size differentiation** | Small variants are visibly smaller than Large variants | All variants are the same size (height/padding not bound to variables) |
| 4 | **Text readability** | Labels are visible with correct font and color | Text is invisible (white on white), missing, or shows "undefined" |
| 5 | **Spacing/padding** | Interior padding visible, components aren't "shrink-wrapped" | Components look cramped or have no visible internal space |
| 6 | **State differentiation** | Hover/Pressed variants have visible color differences from Default | All states look identical (state-specific fills not applied) |
| 7 | **Disabled state** | Lower opacity or muted colors compared to active states | Disabled looks identical to Default |
| 8 | **Documentation frame** | Title + description text visible above or beside the component grid | No documentation, or it overlaps the component set |
| 9 | **Grid labels** | Row/column headers visible around the component set (if added) | Labels overlap the grid or are missing |
| 10 | **Component set boundary** | Gray background frame wraps all variants with even padding | Frame is too small (variants clipped) or way too large |

**Screenshot diagnosis and fix mapping:**

| Screenshot shows | Diagnosis | Fix |
|-----------------|-----------|-----|
| All variants stacked top-left | Grid layout wasn't applied after combining | Re-run `layout_component_set` (Section 5) |
| Everything black/same color | Variable bindings failed or variables don't have values for the active mode | Re-run `variables_ep(method:"batch_bind")`, check mode values |
| No text visible | Font auto-load failed, or text fill is same color as background | Check text `fontColorVariableName` binding; verify `color/text/*` variable has a value |
| Variants all same size | Padding/height not bound to size variables | Re-run `variables_ep(method:"batch_bind")` with size-specific tokens |
| Component set frame tiny | `layout_component_set` wasn't called or used wrong dimensions | Re-run `layout_component_set` with correct parameters |
| Doc frame overlaps components | Component set positioned at same x,y as doc frame | Move component set: `nodes(method:"update", patches:[{nodeId:"CS_ID", props:{x:680}}])` |

**When visual analysis isn't available:**
If your model can't process images (text-only mode), validate structurally instead:
1. Call `nodes(method:"get", detail:"full")` on the component set — verify child count, property definitions, variant names
2. Use `nodes(method:"get")` to sample key properties:
```
Tool: nodes
Args: { method: "get", nodeId: "CS_ID", detail: "full" }
// Inspect: children positions (grid working?), dimensions (size differentiation?),
// fill info (bindings working?), and total child count.
```

**When to take a screenshot:**
- After EVERY completed component (mandatory — part of the user checkpoint)
- After creating the foundations documentation page
- After final QA (screenshot every page)
- Do NOT screenshot after every intermediate step (wastes tool calls)

### Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| All variants stacked at (0,0) | `create_component_set` was called but `layout_component_set` was not | Run `layout_component_set` with correct axes |
| Variants show wrong colors | Variable bindings applied after combining instead of before | Rebind via `variables_ep(method:"batch_bind")` on component set children |
| Variant count wrong | Clone loop produced wrong number of variants | Check variant IDs list before calling `create_component_set` |
| BOOLEAN property has no effect | `componentPropertyReferences` was set on the component set frame, not on the child node | Find the actual child node and set references there |
| INSTANCE_SWAP shows no swap option | Default value was not a valid component ID | Pass a real existing component ID as `defaultValue` |
| `create_component_set` throws | At least one ID in `componentIds` is not a `ComponentNode` | Filter array to only include component IDs |
| `addComponentProperty` returns unexpected key | Expected — the key gets a `#id:id` suffix | Save the returned value immediately |

---

## 10. Complete Worked Example: Button Component

This shows the full sequence of FigCraft tool calls for a Button component, including state passing between calls. Replace variable IDs with your actual values from the state ledger.

### Call 1: Create the component page

**Goal:** Create (or find) the Button page.
**State input:** None
**State output:** `{ pageId }`

```
Tool: set_current_page
Args: { nameOrId: "Button" }
// Returns: { pageId: "PAGE_ID" }
```

### Call 2: Create documentation frame

**Goal:** Add title + description frame.
**State input:** `{ pageId }`
**State output:** `{ docFrameId }`

```
Tool: create_frame
Args: {
  name: "Button / Documentation",
  x: 40, y: 40,
  width: 560,
  layoutMode: "VERTICAL",
  fill: "#FFFFFF",
  padding: 40,
  itemSpacing: 16,
  children: [
    {
      type: "text",
      name: "title",
      content: "Button",
      fontSize: 32,
      fontStyle: "Bold"
    },
    {
      type: "text",
      name: "description",
      content: "Buttons allow users to take actions with a single tap. Use Primary for the highest-emphasis action on a page, Secondary for supporting actions.",
      fontSize: 14,
      layoutSizingHorizontal: "FILL"
    }
  ]
}
// Returns: { id: "DOC_FRAME_ID" }
```

### Call 3: Create base component

**Goal:** Create the base component with auto-layout and all variable bindings.
**State input:** `{ pageId }` + variable IDs from Phase 1
**State output:** `{ baseCompId }`

*(See Section 3 for full tool calls — substituting the actual variable IDs from the state ledger.)*

### Call 4: Create all variants

**Goal:** Clone base and produce all 18 variants (3 Size x 2 Style x 3 State).
**State input:** `{ pageId, baseCompId }` + variable IDs
**State output:** `{ variantIds: ['id1', 'id2', ..., 'id18'] }`

```
For each of 18 combinations, repeat:
─────────────────────────────────────────────

Tool: nodes
Args: { method: "clone", items: [{ id: "BASE_COMP_ID" }] }
// → CLONE_ID

Tool: nodes
Args: {
  method: "update",
  patches: [{
    nodeId: "CLONE_ID",
    props: { name: "Size=Small, Style=Primary, State=Default" }
  }]
}

Tool: variables_ep
Args: {
  method: "batch_bind",
  bindings: [
    { nodeId: "CLONE_ID", field: "paddingTop",    variableId: "VAR_ID_spacing_sm" },
    { nodeId: "CLONE_ID", field: "paddingBottom", variableId: "VAR_ID_spacing_sm" },
    { nodeId: "CLONE_ID", field: "paddingLeft",   variableId: "VAR_ID_spacing_sm" },
    { nodeId: "CLONE_ID", field: "paddingRight",  variableId: "VAR_ID_spacing_sm" },
    { nodeId: "CLONE_ID", field: "fills",         variableId: "VAR_ID_color_bg_primary" },
    { nodeId: "LABEL_ID", field: "fills",         variableId: "VAR_ID_color_text_on_primary" }
  ]
}

Collect all 18 variant IDs into variantIds array.
```

### Call 5: create_component_set + grid layout

**Goal:** Combine all 18 variants into a ComponentSet and lay them out in a grid.
**State input:** `{ pageId, variantIds }` (18 IDs)
**State output:** `{ componentSetId }`

```
Tool: create_component_set
Args: {
  componentIds: ["ID1", "ID2", ..., "ID18"],
  name: "Button"
}
// Returns: { id: "CS_ID" }

Tool: layout_component_set
Args: {
  nodeId: "CS_ID",
  colAxis: "State",
  rowAxes: ["Size", "Style"],
  gap: 16,
  padding: 40
}

Tool: nodes
Args: {
  method: "update",
  patches: [{ nodeId: "CS_ID", props: { x: 680, y: 40 } }]
}
```

### Call 6: Add component properties

**Goal:** Add TEXT, BOOLEAN, INSTANCE_SWAP properties and wire them to child nodes.
**State input:** `{ pageId, componentSetId }`
**State output:** `{ componentSetId, properties: { labelKey, showIconKey, iconKey } }`

```
Tool: nodes
Args: {
  method: "update",
  patches: [{
    nodeId: "CS_ID",
    props: {
      description: "Buttons allow users to take actions and make choices with a single tap."
    }
  }]
}

Tool: use_figma
Description: "Add component properties (Label, Show Icon, Icon) and wire to children"
Code:
  const cs = await figma.getNodeByIdAsync('CS_ID');
  cs.documentationLinks = [{ uri: 'https://your-storybook.com/button' }];

  const labelKey    = cs.addComponentProperty('Label', 'TEXT', 'Button');
  const showIconKey = cs.addComponentProperty('Show Icon', 'BOOLEAN', true);
  const iconKey     = cs.addComponentProperty('Icon', 'INSTANCE_SWAP', 'DEFAULT_ICON_ID');

  for (const child of cs.children) {
    const labelNode = child.findOne(n => n.name === 'label');
    if (labelNode) labelNode.componentPropertyReferences = { characters: labelKey };
    const iconNode = child.findOne(n => n.name === 'icon');
    if (iconNode) {
      iconNode.componentPropertyReferences = {
        visible: showIconKey,
        ...(iconNode.type === 'INSTANCE' ? { mainComponent: iconKey } : {}),
      };
    }
  }
  return { labelKey, showIconKey, iconKey };
```

### Call 7: Validate with nodes(method:"get", detail:"full")

**Goal:** Structural check — variant count, properties, axes.
**Action:** Call `nodes(method:"get", detail:"full")` on the ComponentSet node ID (from state). Verify in the result:
- `children.length === 18`
- `variantGroupProperties` has `Size`, `Style`, `State` keys with correct value arrays
- `componentPropertyDefinitions` has `Label`, `Show Icon`, `Icon` entries

### Call 8: Validate with export_image

**Goal:** Visual check — layout, colors, text.

```
Tool: export_image
Args: { nodeId: "CS_ID", format: "PNG", scale: 1 }
```

Inspect the screenshot. If variants are stacked, re-run `layout_component_set`. If colors look wrong, re-run `variables_ep(method:"batch_bind")`.

### Checkpoint

After Call 8: show the screenshot to the user. Ask: "Here's the Button component with 18 variants. Does this look correct?" Do not proceed to the next component until the user approves.

---

## 11. Cleanup and Recovery

When a build run fails partway through, or orphan nodes accumulate from aborted operations, use declarative tools for cleanup.

### Identifying Orphans

Scan the current page at a shallow depth to find nodes that need cleanup:

```
Tool: get_current_page
Args: { maxDepth: 2 }
// Returns the page tree. Look for:
//   - Unnamed components ("Component 1", "Component 2")
//   - Frames/components not tagged with sharedPluginData
//   - Duplicate component sets from failed retries
```

For targeted identification, search by sharedPluginData:

```
Tool: use_figma
Description: "Find orphan nodes from a failed build run"
Code:
  const orphans = figma.currentPage.findAll(n => {
    const runId = n.getSharedPluginData('dsb', 'run_id');
    return runId === 'ds-build-2024-001' && n.type === 'COMPONENT';
  });
  return { orphanIds: orphans.map(n => ({ id: n.id, name: n.name })) };
```

### Deleting Orphan Nodes

Once identified, remove orphan nodes with the `nodes` endpoint:

```
Tool: nodes
Args: { method: "delete", nodeId: "ORPHAN_NODE_ID" }
// Deletes a single node.

// For batch deletion, call once per node:
Tool: nodes
Args: { method: "delete", nodeId: "ORPHAN_1" }
Tool: nodes
Args: { method: "delete", nodeId: "ORPHAN_2" }
```

### Cleaning Up Variables

If a failed token sync left behind incomplete or duplicate variables:

```
Step 1: List variables to find orphans
─────────────────────────────────────────────
Tool: variables_ep
Args: { method: "list", collectionId: "COLLECTION_ID" }
// Review the list for duplicates or incomplete entries.

Step 2: Delete orphan variables
─────────────────────────────────────────────
Tool: variables_ep
Args: { method: "delete", variableId: "ORPHAN_VAR_ID" }
```

### Recovery Workflow

The full recovery sequence when a component build fails mid-way:

```
1. Assess damage:
   Tool: get_current_page
   Args: { maxDepth: 2 }
   // See what exists on the page.

2. Identify orphans (unfinished components from the failed run):
   Tool: use_figma
   Description: "Find nodes from failed run ds-build-2024-001"
   // Collect IDs of nodes to remove.

3. Delete orphans:
   Tool: nodes
   Args: { method: "delete", nodeId: "ORPHAN_ID" }
   // Repeat for each orphan.

4. Verify clean state:
   Tool: get_current_page
   Args: { maxDepth: 1 }
   // Confirm only intended nodes remain.

5. Restart the build from the last successful checkpoint.
```

**Prevention tip:** Tag every node with `sharedPluginData` immediately after creation (Section 7). This makes orphan identification trivial — any node with the run ID but missing from the expected set is an orphan.
