---
inclusion: fileMatch
fileMatchPattern: "packages/adapter-figma/**,packages/core-mcp/src/tools/**"
description: "Workflow guide for building/updating Figma designs using FigCraft execute_js"
---

# Building/Updating Figma Designs with execute_js

This guide is the FigCraft-adapted version of the `figma-generate-design` skill workflow.
**When this steering file conflicts with the skill, this file takes precedence.**

Core principle: reuse design system components, variables, and styles instead of drawing primitives with hardcoded values.

You MUST read #[[file:.kiro/steering/execute-js-guide.md]] before using `execute_js`.

## Workflow

### Step 1: Understand the Screen to Build

1. If building from code, read the relevant source files to understand page structure
2. Identify major sections (Header, Hero, Content, Footer, etc.)
3. List the UI components involved in each section

### Step 2: Discover Design System Assets

#### 2a: Discover components

Prefer inspecting existing screens in the file first. Use `execute_js` to traverse instances in an existing frame:

```js
const frame = figma.currentPage.findOne(n => n.name === "Existing Screen");
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

If no existing screens are available, use FigCraft's `load_toolset("library")` → `list_library_components` to search library components.

#### 2b: Discover variables

Inspect variables bound to existing screens:

```js
const frame = figma.currentPage.findOne(n => n.name === "Existing Screen");
const varMap = new Map();
for (const node of frame.findAll(() => true)) {
  const bv = node.boundVariables;
  if (!bv) continue;
  for (const [prop, binding] of Object.entries(bv)) {
    const bindings = Array.isArray(binding) ? binding : [binding];
    for (const b of bindings) {
      if (b?.id && !varMap.has(b.id)) {
        const v = await figma.variables.getVariableByIdAsync(b.id);
        if (v) varMap.set(b.id, { name: v.name, id: v.id, key: v.key, resolvedType: v.resolvedType });
      }
    }
  }
}
return [...varMap.values()];
```

You can also use `load_toolset("library")` → `list_library_variables` to search library variables.

#### 2c: Discover styles

Use FigCraft's `scan_styles` or `list_library_styles` to discover text styles and effect styles.

### Step 3: Create the Page Wrapper Frame

Create the wrapper frame in its own `execute_js` call, positioned away from existing content. For multi-screen flows, the wrapper MUST use `counterAxisAlignItems=MIN` (left-align), have a background fill, cornerRadius, and `clipsContent=false` (see figma-essential-rules.md Rule #24 and Multi-Screen Flow Strategy):

```js
let maxX = 0;
for (const child of figma.currentPage.children) {
  maxX = Math.max(maxX, child.x + child.width);
}
const wrapper = figma.createFrame();
wrapper.name = "Homepage";
wrapper.layoutMode = "VERTICAL";
wrapper.primaryAxisAlignItems = "MIN";
wrapper.counterAxisAlignItems = "MIN";
wrapper.resize(1440, 100);
wrapper.layoutSizingHorizontal = "FIXED";
wrapper.layoutSizingVertical = "HUG";
wrapper.cornerRadius = 24;
wrapper.fills = [{ type: "SOLID", color: { r: 0.96, g: 0.96, b: 0.96 } }];
wrapper.clipsContent = false;
wrapper.x = maxX + 200;
wrapper.y = 0;
return { wrapperId: wrapper.id };
```

**After creating the wrapper, ALWAYS verify:**
1. Structure-verify with `get_current_page(maxDepth=1)` — confirm page has exactly the expected number of top-level nodes (catches orphan nodes from failed previous attempts)
2. For multi-screen skeletons, also visual-verify with `export_image` — the skeleton is the foundation, never skip this

### Step 4: Build Section by Section (Scale-Appropriate)

Match granularity to task scale (see execute-js-guide.md for full details):
- Single page with sections → one `execute_js` call per section
- Multi-screen flow → one `execute_js` call per FULL SCREEN (all sections in one script)

Each script starts by fetching the wrapper by ID:

```js
const createdNodeIds = [];
const wrapper = await figma.getNodeByIdAsync("WRAPPER_ID");

// Import design system components
const buttonSet = await figma.importComponentSetByKeyAsync("BUTTON_KEY");
const primaryButton = buttonSet.children.find(c =>
  c.type === "COMPONENT" && c.name.includes("variant=primary")
) || buttonSet.defaultVariant;

// Import variables
const bgColorVar = await figma.variables.importVariableByKeyAsync("BG_VAR_KEY");
const spacingVar = await figma.variables.importVariableByKeyAsync("SPACING_VAR_KEY");

// Build section
const section = figma.createFrame();
section.name = "Header";
section.layoutMode = "HORIZONTAL";
section.setBoundVariable("paddingLeft", spacingVar);
section.setBoundVariable("paddingRight", spacingVar);

// Bind background color variable
const bgPaint = figma.variables.setBoundVariableForPaint(
  { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', bgColorVar
);
section.fills = [bgPaint];

// Create component instances
const btnInstance = primaryButton.createInstance();
section.appendChild(btnInstance);
createdNodeIds.push(btnInstance.id);

// Append to wrapper
wrapper.appendChild(section);
section.layoutSizingHorizontal = "FILL"; // MUST be after appendChild

createdNodeIds.push(section.id);
return { success: true, createdNodeIds };
```

Verify each write with `get_current_page(maxDepth=1)` (structure check — catches orphan nodes). Visual-verify with `export_image` at key milestones (after skeleton, after each complete screen).

### Step 5: Validate the Complete Screen

After all sections are done:
1. Run `lint_fix_all` on each individual screen (NOT on the wrapper)
2. Post-lint structural verification — `execute_js` to inspect each screen's child hierarchy AND page-level children (`figma.currentPage.children`) for orphan nodes
3. Screenshot the full page frame and compare. Use targeted `execute_js` calls to fix issues — do NOT rebuild the entire screen.

## Key Principles

- Never hardcode hex colors or pixel spacing — use variable bindings
- Prefer component instances over manual construction
- Match script granularity to task scale — one section per call for single pages, one full screen per call for multi-screen flows
- **Structure-verify after EVERY write** — `get_current_page(maxDepth=1)` is lightweight and non-negotiable; catches orphan nodes before they compound
- **Visual-verify at key milestones** — `export_image` after skeleton, after each complete screen, and at the end; skeleton verification is mandatory
- **On `execute_js` failure: STOP, inspect page, clean up orphans, THEN fix and retry** — failed scripts are NOT always atomic
- Return only node IDs needed by subsequent calls — keep return values minimal
- Match existing naming and layout conventions in the file
- For multi-screen flows, use shared helper functions (makeText, makeButton, makeField) to ensure visual consistency
