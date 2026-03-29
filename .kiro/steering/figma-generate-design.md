---
inclusion: manual
description: "Workflow for building/updating Figma screens using design system components. Adapted from official figma-generate-design skill for Kiro + FigCraft environment."
---

# Building Screens from Design System — Kiro Adaptation

Adapted from the official `figma-generate-design` skill. Core principle: **discover and reuse** design system components, variables, and styles — don't draw primitives with hardcoded values.

## Kiro Environment Adaptations

| Official tool | Kiro equivalent | Notes |
|--------------|----------------|-------|
| `use_figma` | `mcp_figcraft_execute_js` | Code is 100% compatible. Not atomic on failure — verify after every write. |
| `search_design_system` | `execute_js` (traverse existing instances) or `get_mode` / `load_toolset("library")` | See Step 2 alternatives below. |
| `get_metadata` | `mcp_figcraft_get_current_page(maxDepth=N)` + `mcp_figcraft_nodes(method: "get")` | Returns compressed node tree, not XML. |
| `get_screenshot` | `mcp_figcraft_export_image` | Returns base64 PNG. |
| `get_variable_defs` | Figma Power `get_variable_defs(nodeId, fileKey)` | Available in Kiro — uses REST API, no library name matching. |

## Critical Difference: Non-Atomic Failure

`execute_js` does NOT guarantee atomic failure. Nodes created before an error may persist as orphans.

**Required after EVERY `execute_js` write:**
```
execute_js (write)
  → get_current_page(maxDepth=1)  — confirm no unexpected top-level nodes
  → [if orphans found] execute_js to remove them
```

## Workflow

### Step 1: Understand the Screen

Before touching Figma:
1. Read source files or description to understand page structure
2. Identify major sections (Header, Hero, Content, Footer, etc.)
3. List UI components per section (buttons, inputs, cards, nav, etc.)

### Step 2: Discover Design System Assets

Three things to discover: **components**, **variables**, **styles**.

#### 2a: Components — Inspect existing screens first (preferred)

```js
// execute_js — read-only
const frame = figma.currentPage.findOne(n => n.name === "Existing Screen");
if (!frame) return { found: false, hint: "No existing screens. Use get_mode libraryComponents or load_toolset('library')." };

const uniqueSets = new Map();
frame.findAll(n => n.type === "INSTANCE").forEach(inst => {
  const mc = inst.mainComponent;
  const cs = mc?.parent?.type === "COMPONENT_SET" ? mc.parent : null;
  const key = cs ? cs.key : mc?.key;
  const name = cs ? cs.name : mc?.name;
  if (key && !uniqueSets.has(key)) {
    uniqueSets.set(key, { name, key, isSet: !!cs, sampleVariant: mc.name });
  }
});
return [...uniqueSets.values()];
```

**Fallback when no existing screens:**
- `get_mode` → `libraryComponents` (grouped by component set with variant properties)
- `load_toolset("library")` → `list_library_collections` / `list_library_variables`

#### 2b: Component properties — Create temp instance to read structure

```js
// execute_js — read then clean up
const set = await figma.importComponentSetByKeyAsync("COMPONENT_SET_KEY");
const sample = set.defaultVariant.createInstance();
const props = sample.componentProperties;
const nested = sample.findAll(n => n.type === "INSTANCE").map(ni => ({
  name: ni.name, properties: ni.componentProperties
}));
sample.remove();
return { props, nested };
```

#### 2c: Variables — Inspect bound variables on existing nodes

```js
// execute_js — read-only
const frame = figma.currentPage.findOne(n => n.name === "Existing Screen");
const vars = new Map();
for (const node of frame.findAll(() => true)) {
  const bv = node.boundVariables;
  if (!bv) continue;
  for (const [, binding] of Object.entries(bv)) {
    const bindings = Array.isArray(binding) ? binding : [binding];
    for (const b of bindings) {
      if (b?.id && !vars.has(b.id)) {
        const v = await figma.variables.getVariableByIdAsync(b.id);
        if (v) vars.set(b.id, { name: v.name, key: v.key, type: v.resolvedType, remote: v.remote });
      }
    }
  }
}
return [...vars.values()];
```

Also available: Figma Power `get_variable_defs(nodeId, fileKey)` — uses REST API, no library name matching issues.

#### 2d: Styles — Inspect text and effect styles

```js
// execute_js — read-only
const frame = figma.currentPage.findOne(n => n.name === "Existing Screen");
const styles = { text: new Map(), effect: new Map() };
frame.findAll(() => true).forEach(node => {
  if ('textStyleId' in node && node.textStyleId) {
    const s = figma.getStyleById(node.textStyleId);
    if (s) styles.text.set(s.id, { name: s.name, key: s.key });
  }
  if ('effectStyleId' in node && node.effectStyleId) {
    const s = figma.getStyleById(node.effectStyleId);
    if (s) styles.effect.set(s.id, { name: s.name, key: s.key });
  }
});
return { textStyles: [...styles.text.values()], effectStyles: [...styles.effect.values()] };
```

### Step 3: Create Page Wrapper

```js
// execute_js — write
let maxX = 0;
for (const child of figma.currentPage.children) {
  maxX = Math.max(maxX, child.x + child.width);
}
const wrapper = figma.createFrame();
wrapper.name = "Homepage";
wrapper.layoutMode = "VERTICAL";
wrapper.primaryAxisAlignItems = "CENTER";
wrapper.counterAxisAlignItems = "CENTER";
wrapper.resize(1440, 100);
wrapper.layoutSizingHorizontal = "FIXED";
wrapper.layoutSizingVertical = "HUG";
wrapper.x = maxX + 200;
wrapper.y = 0;
return { wrapperId: wrapper.id };
```

→ `get_current_page(maxDepth=1)` to verify

### Step 4: Build Sections (one per `execute_js` call)

Each call: fetch wrapper → import components/variables/styles → build section → append → return IDs.

```js
// execute_js — write one section
const wrapper = await figma.getNodeByIdAsync("WRAPPER_ID");
await figma.loadFontAsync({ family: "GT Walsheim", style: "Regular" });

// Import components by key
const buttonSet = await figma.importComponentSetByKeyAsync("BUTTON_SET_KEY");
const primaryBtn = buttonSet.children.find(c =>
  c.type === "COMPONENT" && c.name.includes("variant=primary")
) || buttonSet.defaultVariant;

// Import variables by key
const bgVar = await figma.variables.importVariableByKeyAsync("BG_VAR_KEY");
const spacingVar = await figma.variables.importVariableByKeyAsync("SPACING_VAR_KEY");

// Import and apply styles
const shadowStyle = await figma.importStyleByKeyAsync("SHADOW_STYLE_KEY");

// Build section with variable bindings (not hardcoded values)
const section = figma.createFrame();
section.name = "Header";
section.layoutMode = "HORIZONTAL";
section.setBoundVariable("paddingLeft", spacingVar);
section.setBoundVariable("paddingRight", spacingVar);
const bgPaint = figma.variables.setBoundVariableForPaint(
  { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', bgVar
);
section.fills = [bgPaint];
section.effectStyleId = shadowStyle.id;

// Create component instance
const btn = primaryBtn.createInstance();
section.appendChild(btn);

// Override text via setProperties (not direct node.characters)
btn.setProperties({ "Label#2:0": "Get Started" });

// Append to wrapper
wrapper.appendChild(section);
section.layoutSizingHorizontal = "FILL"; // AFTER appendChild

return { createdNodeIds: [section.id, btn.id] };
```

→ `get_current_page(maxDepth=1)` after each write
→ `export_image` at key milestones (after skeleton, after each complete screen)

### Step 5: Validate

1. `lint_fix_all(nodeIds: ["screen-id"])` — auto-fix quality issues
2. `execute_js` — inspect child hierarchy for lint side effects (orphan nodes, reparented elements)
3. `export_image` — final visual check. Look for:
   - Cropped/clipped text
   - Placeholder text not overridden
   - Wrong component variants
   - Overlapping elements

### Step 6: Updating Existing Screens

```js
// execute_js — targeted modification
const existingBtn = await figma.getNodeByIdAsync("BUTTON_INSTANCE_ID");
if (existingBtn?.type === "INSTANCE") {
  const buttonSet = await figma.importComponentSetByKeyAsync("BUTTON_SET_KEY");
  const newVariant = buttonSet.children.find(c =>
    c.name.includes("variant=primary") && c.name.includes("size=lg")
  ) || buttonSet.defaultVariant;
  existingBtn.swapComponent(newVariant);
}
return { mutatedNodeIds: [existingBtn.id] };
```

## What to Build Manually vs Import

| Build manually | Import from design system |
|----------------|--------------------------|
| Page wrapper frame | Components (buttons, cards, inputs, nav) |
| Section container frames | Variables (colors, spacing, radii) via `setBoundVariable` / `setBoundVariableForPaint` |
| Layout grids (rows, columns) | Text styles via `node.textStyleId` |
| | Effect styles via `node.effectStyleId` |

## Official Reference Docs (read on demand)

These are from the official Figma MCP `figma-use` skill — all patterns apply to `execute_js`:

| Doc | When to load |
|-----|-------------|
| `.kiro/skills/figma-use/references/component-patterns.md` | Importing components, finding variants, setProperties, text overrides |
| `.kiro/skills/figma-use/references/variable-patterns.md` | Creating/binding variables, importing library variables, scopes |
| `.kiro/skills/figma-use/references/gotchas.md` | Every known pitfall with WRONG/CORRECT examples |
| `.kiro/skills/figma-use/references/common-patterns.md` | Working code templates for common operations |
| `.kiro/skills/figma-use/references/text-style-patterns.md` | Creating/applying text styles |
| `.kiro/skills/figma-use/references/effect-style-patterns.md` | Creating/applying effect styles |
| `.kiro/skills/figma-use/references/validation-and-recovery.md` | Verification workflow and error recovery |
