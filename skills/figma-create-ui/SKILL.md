---
name: figma-create-ui
description: "Create UI in Figma using FigCraft declarative tools (create_frame, create_text). Use when: create/design/build/make + Figma/UI/screen/page/component. IMPORTANT: Use create_frame instead of use_figma for all UI creation."
---

# FigCraft UI Creation

Use FigCraft declarative tools for UI creation — NOT use_figma. `create_frame` includes an **Opinion Engine** that auto-handles sizing inference, FILL ordering, token binding, and failure cleanup. This eliminates common Figma API pitfalls that `use_figma` scripts must handle manually.

## How This Skill Works

This SKILL.md is a **lightweight entry point**. The detailed, context-aware creation guidance is delivered at runtime by `get_mode._workflow`. Call `get_mode` first — it returns a `_workflow` object containing:

- `designPreflight` — blocking checklist (purpose, platform, language, density, tone, color/typography rules)
- `creationSteps` — ordered steps with tool-specific guidance
- `toolBehavior` — key rules for batch tools and ordered execution
- `references` — links to on-demand guides via MCP tools
- `searchBehavior` — whether `search_design_system` is available in current mode
- `nextAction` — what to do immediately

**Follow `_workflow` as your primary guide.** This SKILL.md provides the boundaries, decision rules, and best practices that `_workflow` does not cover.

## Workflow

1. **`get_mode`** → read `_workflow` (designPreflight + creationSteps + references)
2. **Complete `_workflow.designPreflight`** → present design proposal to user → ⛔ **WAIT for explicit confirmation**
3. **`get_current_page(maxDepth=1)`** → inspect existing content, find placement position
4. **`create_frame` + `children`** → build the design declaratively (one call per screen/element)
5. **`export_image(scale:0.5)`** → visual verification
6. **`lint_fix_all`** → auto-check and fix violations (supports `dryRun:true` to preview)

## Skill Boundaries

- Use this skill to **create new UI** using declarative tools (`create_frame`, `create_text`).
- This skill covers **both** simple layouts and **library component assembly**. In library mode, use `search_design_system` and `type:"instance"` as described in the Library Components section below.
- If the task is **building a design system** (variables, component libraries, theming), switch to [figma-generate-library](../figma-generate-library/SKILL.md).
- If the task is **reviewing existing designs**, switch to [design-review](../design-review/SKILL.md).
- If the task is **implementing code from Figma**, switch to [figma-implement-design](../figma-implement-design/SKILL.md).

## Library Components — Reuse Design System

When `get_mode` returns `libraryComponents`, **always prefer component instances over hand-built frames**.

### Component Discovery

⛔ **MANDATORY: Always search before building.** The design system likely has the component you need.

1. **Check `libraryComponents` from `get_mode`** — it lists all component sets (name, key, containingFrame, propertyNames) and standalone components. Use this as your starting inventory.

2. **Search for specific components** via `search_design_system`:
   ```
   search_design_system(query: "button")
   search_design_system(query: "input")
   ```

3. **Disambiguate with `containingFrame`** — property names like "Placeholder"/"Size" appear across unrelated component types:
   - `containingFrame: "Forms"` → form components (inputs, selects, checkboxes)
   - `containingFrame: "Avatars"` → profile/user image components — NEVER use for form inputs
   - For form inputs, verify **State/Error/Focused** variants — Avatars never have these.

4. **Inspect variant details** when needed:
   ```
   components(method: "list_properties", nodeId: "<component-id>")
   ```

5. **Build a component map** before creating:
   ```
   Component Map:
   - Button → key: "abc123", variants: Type=Primary/Secondary, Size=Small/Medium/Large
   - Input  → key: "def456", variants: Size=md/lg, State=Default/Focused/Error
   - Card   → key: "ghi789", standalone component
   ```

### Creating with Library Components

Use `create_frame` with `type:"instance"` in children:

| Build manually | Import from design system |
|----------------|--------------------------|
| Page wrapper frame | **Components**: buttons, cards, inputs, toggles, tabs, etc. |
| Section container frames | **Variables**: colors (`fillVariableName`), spacing, radii |
| Layout structure (rows, columns) | **Text styles**: `textStyleName: "body-md"` |
| Dividers, spacers | **Effect styles**: `effectStyleName: "elevation-200"` |

### Instance Properties

- **`variantProperties`** — selects which variant to instantiate from a component **set**:
  ```json
  { "type": "instance", "componentSetKey": "abc123", "variantProperties": { "Type": "Primary", "Size": "Large" } }
  ```

- **`properties`** — sets instance overrides (text, booleans) on a **single component** or after variant selection:
  ```json
  { "type": "instance", "componentKey": "abc123", "properties": { "Label": "Sign In" } }
  ```

- **`componentKey`** — imports a single component from the library
- **`componentSetKey`** — imports a full variant set (use with `variantProperties`)
- **`componentId`** — references a local component by node ID

### Example: Login Screen

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
          "type": "instance", "componentKey": "INPUT_KEY",
          "properties": { "Placeholder": "your@email.com", "Size": "lg" }
        },
        {
          "type": "instance", "componentKey": "INPUT_KEY",
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
          "type": "instance", "componentKey": "BUTTON_KEY",
          "properties": { "Label": "Sign In", "Type": "Primary", "Size": "Large" },
          "layoutSizingHorizontal": "FILL"
        }
      ]
    }
  ]
}
```

## Opinion Engine

`create_frame` includes an Opinion Engine that automatically infers best practices. Key behaviors:

1. **layoutMode inference** — auto-set to VERTICAL when padding/spacing/alignment/children are present
2. **Sizing defaults** — cross-axis FILL, primary-axis HUG inside auto-layout parents
3. **FILL ordering** — internally sets FILL after appendChild (avoids Figma API error)
4. **Token auto-binding** — `fillVariableName`/`strokeVariableName` matched to library variables
5. **Conflict detection** — rejects contradictory params (e.g., FILL + explicit width)
6. **Per-child error cleanup** — failed child creation auto-removes orphan nodes

Use `dryRun:true` to preview all inferences before creating nodes. For full details: `get_creation_guide(topic:"opinion-engine")`.

## Best Practices

- **Root screen frames** MUST include `layoutSizingHorizontal:"FIXED"` + `layoutSizingVertical:"FIXED"`. Without this, Opinion Engine infers HUG and the frame collapses.
- **Semantic role**: Screen containers MUST include `role: "screen"`. Buttons SHOULD include `role: "button"`. This enables deterministic lint identification instead of name-regex guessing, especially important for non-English names.
- **SPACE_BETWEEN children**: Direct child of a SPACE_BETWEEN parent MUST declare `layoutSizingVertical: "FILL"` explicitly — Opinion Engine defaults to HUG which defeats SPACE_BETWEEN.
- **Placeholders** for logos/avatars/charts: use `type:"frame"` (not `"rectangle"`), because rectangles cannot have children.
- **Icons**: use `icon_search` + `icon_create` with `index` param for ordering. NEVER text characters as placeholders. See [iconography](../iconography/SKILL.md).
- **Content**: realistic, contextually appropriate text. NEVER "Lorem ipsum", "Button", "Title".
- **dryRun:true** for complex or ambiguous parameters — preview before committing.
- **After first failure**, review ALL remaining planned payloads for the same pattern before retrying.
- **Icon ordering (CRITICAL)**: `icon_create` appends to END by default — use `index: 0` to place BEFORE text. Array order = visual order in auto-layout. Full patterns: `get_creation_guide(topic:"iconography")`.
- **Always search before building** in library mode. Manual construction should be the exception, not the rule.
- **Prefer component instances over manual builds.** Instances stay linked to the source component and update automatically.
- **Validate visually after each screen.** Use `export_image` to catch issues early.
- **Match existing conventions.** If the file already has screens, match their naming and layout patterns.

## Updating an Existing Screen

When updating rather than creating:

1. `nodes(method: "get", nodeId: "<screen-id>")` — inspect current structure
2. `nodes(method: "update", patches: [...])` — update properties, swap variants
3. `nodes(method: "delete", nodeId: "<old-section>")` — remove deprecated sections
4. Create new sections with `create_frame(parentId: "<screen-id>", ...)`
5. Validate with `export_image` after each modification

## On-Demand Guides

Call these MCP tools when you need deeper guidance on a specific topic:

| Guide | When to load |
|-------|-------------|
| `get_creation_guide(topic:"layout")` | Structural layout rules (39 rules from Quality Engine) |
| `get_creation_guide(topic:"multi-screen")` | Multi-screen flow details (skill `multi-screen-flow` is auto-loaded at STEP 4) |
| `get_creation_guide(topic:"batching")` | Context budget and batching strategy |
| `get_creation_guide(topic:"opinion-engine")` | Full Opinion Engine auto-inference documentation |
| `get_creation_guide(topic:"ui-patterns", uiType:"xxx")` | UI type templates (login, dashboard, settings, etc.) |
| `get_creation_guide(topic:"responsive")` | Responsive web breakpoints + auto-layout |
| `get_creation_guide(topic:"content-states")` | Empty/loading/error state patterns |
| `get_design_guidelines(category)` | Design direction rules (color, typography, spacing, etc.) |

## Design Direction

Design rules are delivered by `_workflow.designPreflight` (from `get_mode`). For detailed rules by category, call `get_design_guidelines(category)`.
