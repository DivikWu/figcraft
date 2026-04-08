---
name: figma-generate-design
description: "Use this skill when the task involves creating or updating screens in Figma using a published design system. Triggers: 'create a screen', 'build a landing page in Figma', 'design a login page', 'update the Figma screen'. Discovers design system components, variables, and styles via search_design_system, then assembles screens using create_frame with type:\"instance\" for library components and token bindings for colors/spacing/typography."
disable-model-invocation: false
---

# Build / Update Screens from Design System

Use this skill to create or update screens in Figma by **reusing the published design system** — components, variables, and styles — rather than hand-building with frame+text and hardcoded values.

**Key insight**: the Figma file likely has a published design system with components (Button, Input, Card, etc.), color/spacing variables, and text/effect styles. Find and use those instead of drawing boxes with hex colors.

## Skill Boundaries

- Use this skill when the deliverable is a **Figma screen** composed of design system component instances.
- If the user wants to generate **code from a Figma design**, switch to [figma-implement-design](../figma-implement-design/SKILL.md).
- If the user wants to **build a design system** (variables, component libraries), switch to [figma-generate-library](../figma-generate-library/SKILL.md).

## Design Direction

Design rules are delivered by `_workflow.designPreflight` (from `get_mode`). For detailed rules by category, call `get_design_guidelines(category)`.

## Required Workflow

**Follow these steps in order. Do not skip steps.**

### Step 1: Understand the Screen

Before touching Figma, understand what you're building:

1. If building from code, read the relevant source files to understand the page structure.
2. Identify the major sections (e.g., Header, Form, Footer).
3. For each section, list the UI components involved (buttons, inputs, cards, toggles, etc.).

### Step 2: Discover Design System — Components, Variables, and Styles

**⛔ MANDATORY: Always search before building.** The design system likely has the component you need.

#### 2a: Discover components

Use `search_design_system` with broad queries — try multiple terms and synonyms:

```
search_design_system(query: "button")
search_design_system(query: "input")
search_design_system(query: "card")
search_design_system(query: "toggle")
search_design_system(query: "tab")
search_design_system(query: "avatar")
```

**Component disambiguation:** Search results include `containingFrame` — the library page/section name (e.g., "Forms", "Avatars", "Buttons"). Use this as the primary signal to verify a component's purpose:
- `containingFrame: "Forms"` or `"Input"` → form components (inputs, selects, checkboxes)
- `containingFrame: "Avatars"` → profile/user image components — NEVER use for form inputs
- Property names like `Placeholder`, `Size` appear on MANY component types — they are NOT reliable for identifying component purpose

For form inputs, verify the component has **State/Error/Focused** variants — Avatars and Cards never have these.

For each component found, note the `key`, `name`, and `containingFrame`. To inspect properties and variants:

```
components(method: "list_properties", nodeId: "<component-id>")
```

Build a component map before creating anything:

```
Component Map:
- Button → key: "abc123", variants: Type=Primary/Secondary, Size=Small/Medium/Large
- Input  → key: "def456", variants: Size=md/lg, Placeholder=True/False, State=Default/Focused/Error
- Card   → key: "ghi789", standalone component
```

#### 2b: Discover variables (colors, spacing, radii)

`get_mode` returns `designContext.defaults` with common tokens. For additional tokens, search broadly:

```
search_design_system(query: "surface", types: ["variables"])
search_design_system(query: "text", types: ["variables"])
search_design_system(query: "border", types: ["variables"])
search_design_system(query: "fill", types: ["variables"])
```

**Query strategy**: search by variable name fragments. Run multiple short queries in parallel:
- **Semantic colors**: "background", "surface", "text", "border", "fill"
- **Primitive colors**: "gray", "red", "blue", "brand"
- **Spacing**: "space", "radius", "gap", "padding"

#### 2c: Discover styles (text styles, effect styles)

`get_mode` returns `registeredStyles` with available text/paint/effect styles. Use `textStyleName` and `effectStyleName` in create_frame/create_text to bind them.

### Step 3: Create Screens Using Library Components

Use `create_frame` with `type:"instance"` in children to instantiate library components. Use `componentKey` for library components.

#### What to build manually vs. import from design system

| Build manually | Import from design system |
|----------------|--------------------------|
| Page wrapper frame | **Components**: buttons, cards, inputs, toggles, tabs, etc. |
| Section container frames | **Variables**: colors (`fillVariableName`), spacing, radii |
| Layout structure (rows, columns) | **Text styles**: `textStyleName: "body-md"` |
| Dividers, spacers | **Effect styles**: `effectStyleName: "elevation-200"` |

#### Example: Login screen with library components

```json
{
  "name": "Screen / Login",
  "width": 402, "height": 874,
  "layoutMode": "VERTICAL",
  "primaryAxisAlignItems": "SPACE_BETWEEN",
  "role": "screen",
  "fillVariableName": "surface/primary",
  "children": [
    {
      "type": "frame", "name": "Top Content",
      "layoutMode": "VERTICAL", "itemSpacing": 32,
      "padding": 24, "paddingTop": 80,
      "children": [
        { "type": "text", "content": "Welcome back", "textStyleName": "display-md", "fontColorVariableName": "text/emphasis" },
        { "type": "text", "content": "Sign in to your account", "textStyleName": "body-md", "fontColorVariableName": "text/secondary" },
        {
          "type": "instance", "componentKey": "INPUT_KEY_FROM_STEP_2",
          "properties": { "Placeholder": "your@email.com", "Size": "lg" }
        },
        {
          "type": "instance", "componentKey": "INPUT_KEY_FROM_STEP_2",
          "properties": { "Placeholder": "Password", "Size": "lg" }
        }
      ]
    },
    {
      "type": "frame", "name": "Bottom Content",
      "layoutMode": "VERTICAL", "itemSpacing": 16,
      "padding": 24, "paddingBottom": 48,
      "children": [
        {
          "type": "instance", "componentKey": "BUTTON_KEY_FROM_STEP_2",
          "properties": { "Label": "Sign In", "Type": "Primary", "Size": "Large" },
          "layoutSizingHorizontal": "FILL"
        }
      ]
    }
  ]
}
```

#### Instance properties

Use `properties` to set component overrides (text, variants, booleans):

```json
{ "type": "instance", "componentKey": "abc123", "properties": { "Label": "Sign In", "Type": "Primary" } }
```

Use `variantProperties` when the component is a variant set:

```json
{ "type": "instance", "componentSetKey": "abc123", "variantProperties": { "Type": "Primary", "Size": "Large" } }
```

### Step 4: Validate

After creating each screen:

1. `export_image(nodeId: "<screen-id>", scale: 0.5)` — visual verification
2. Check for:
   - Placeholder text still showing ("Title", "Heading", "Button")
   - Wrong component variants
   - Missing token bindings (hardcoded colors)
   - Layout overflow or collapsed frames
3. `lint_fix_all` — auto-check and fix violations

### Step 5: Updating an Existing Screen

When updating rather than creating:

1. `nodes(method: "get", nodeId: "<screen-id>")` — inspect current structure
2. `nodes(method: "update", patches: [...])` — update properties, swap variants
3. `nodes(method: "delete", nodeId: "<old-section>")` — remove deprecated sections
4. Create new sections with `create_frame(parentId: "<screen-id>", ...)`
5. Validate with `export_image` after each modification

## Best Practices

- **Always search before building.** Manual construction should be the exception, not the rule.
- **Search broadly.** Try synonyms — a "NavigationPill" might be found under "pill", "nav", "tab", or "chip".
- **Prefer component instances over manual builds.** Instances stay linked to the source component and update automatically.
- **Prefer design system tokens over hardcoded values.** Use `fillVariableName`, `textStyleName`, `effectStyleName`.
- **Validate visually after each screen.** Use `export_image` to catch issues early.
- **Match existing conventions.** If the file already has screens, match their naming and layout patterns.
