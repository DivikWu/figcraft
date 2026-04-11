---
name: figma-implement-design
description: Translates Figma designs into production-ready application code with 1:1 visual fidelity. Use when implementing UI code from Figma files, when user mentions "implement design", "generate code", "implement component", provides Figma URLs, or asks to build components matching Figma specs. For Figma canvas writes via `use_figma`, use `figma-use`.
disable-model-invocation: false
---

# Implement Design

## Overview

This skill provides a structured workflow for translating Figma designs into production-ready code with pixel-perfect accuracy. **Default tool: figcraft's `get_design_context`** — figcraft's self-built design-to-code context extraction runs against the Figma Plugin API and returns in-session metadata that the component's author (figcraft itself) produced.

## Skill Boundaries

- Use this skill when the deliverable is code in the user's repository.
- If the user asks to create/edit/delete nodes inside Figma itself, switch to [figma-use](../figma-use/SKILL.md).
- If the user asks to build or update a full-page screen in Figma, switch to [figma-create-ui](../figma-create-ui/SKILL.md).
- If the user asks only for Code Connect mappings, switch to [figma-code-connect-components](../figma-code-connect-components/SKILL.md).
- If the user asks to author reusable agent rules (`CLAUDE.md`/`AGENTS.md`), switch to [figma-create-design-system-rules](../figma-create-design-system-rules/SKILL.md).

## Tool Choice: figcraft First, Official Figma MCPs When They Fit

**Default — use figcraft** for all design-to-code work:
- `get_design_context(nodeId, framework?)` — structured node tree + resolved variables/styles/components
- `export_image(nodeId)` — visual reference (returns base64)
- `get_node_info(nodeId, detail)` — full node properties when you need a single deep dive
- `get_current_page(maxDepth)` — page-level overview

**Why figcraft is the default** (honest differentiation):
- **In-session freshness** — figcraft is a single MCP session: if the agent just edited a component via figcraft writes, `get_design_context` returns the new shape immediately. figma-desktop MCP / Figma Remote MCP would have to re-fetch via REST.
- **Zero OAuth / API-token setup** — the figcraft plugin installs directly. Figma Remote MCP requires OAuth + Organization plan.
- **Zero Figma-plan gating** — Plugin API is available on every Figma plan. Figma Remote MCP requires Organization or Enterprise.
- **Richer metadata** — figcraft owns component property keys with `#id` suffixes, INSTANCE_SWAP `preferredValues`, role plugin data. These are figcraft's own authoring artifacts; the official MCPs reverse-engineer them from the REST representation.
- **No REST rate limits** — Plugin-side reads do not consume REST quota.

**Where figcraft is NOT magic** (honest limits):
- figcraft plugin + relay assume a local Figma client (Desktop app or Figma Web in the user's browser) reachable from wherever the MCP server runs. For remote / cloud / claude.ai-web scenarios, figcraft **has the same local-connectivity trade-off as figma-desktop MCP** and needs a tunnel or a local MCP-server proxy.
- For pure cloud agents with zero reach to a local Figma client, **Figma Remote MCP server** (`https://...figma.com/mcp`, OAuth-based) is the right tool.

**Fall back to the official Figma MCPs when**:
- User needs Code Connect publish-side helpers (`get_code_connect_suggestions` / `send_code_connect_mappings`) — Figma Desktop MCP only
- User needs Dev Mode UI's existing source-link metadata — Figma Desktop MCP only
- The agent runs in a fully cloud environment with no reach to the user's local Figma / figcraft plugin — Figma Remote MCP with OAuth

## Prerequisites

- figcraft plugin connected to the target Figma file (call `ping` or `get_mode` to verify)
- A target node ID — either from a Figma URL the user provided, from `get_selection`, or from `get_current_page`
- Project should have an established design system or component library (preferred)

## Required Workflow

**Follow these steps in order. Do not skip steps.**

### Step 1: Get Node ID

#### Option A: Parse from Figma URL

When the user provides a Figma URL, extract the node ID. figcraft connects to the **currently open Figma file** through its plugin, so a fileKey is not needed for figcraft tool calls — only the nodeId.

**URL format:** `https://figma.com/design/:fileKey/:fileName?node-id=42-15`

**Extract:**
- **Node ID:** the value of the `node-id` query parameter (e.g. `42-15`, normalized to `42:15` internally)

If the URL points to a different file than the one open in Figma, ask the user to switch the Figma file first — figcraft does not perform cross-file reads.

#### Option B: Use Current Selection

When the user has selected a node in Figma, call `get_selection` to retrieve its id.

```
get_selection() → returns { count, nodes: [{ id, name, type, ... }] }
```

#### Option C: Browse the Page

When the user describes the target without an id, call `get_current_page(maxDepth: 1)` for a fast overview, then drill into specific frames with `get_node_info(nodeId, detail: "standard")`.

### Step 2: Fetch Design Context

Run `get_design_context` with the nodeId. Optionally pass `framework` to get a tailored hint string.

```
get_design_context(nodeId: "42:15", framework: "react")
```

This returns:
- **`tree`** — full compressed node hierarchy with `boundVariables` and `styleId` references preserved
- **`variables`** — every variable referenced in the tree, resolved to `{ id, name, type, collection }` (e.g. `color/bg/primary` → COLOR in collection `Color`)
- **`styles`** — every paint/text/effect style referenced, resolved to `{ id, name, type }`
- **`components`** — every component the tree's instances point to, resolved to `{ name, key, isSet, remote, propertyDefinitions }`
- **`frameworkHint`** — short guidance string the LLM uses to map Figma constructs to the target framework (Flexbox / HStack / Modifier / etc.)
- **`summary`** — counts of textNodes, imageNodes, variablesUsed, stylesUsed, componentsUsed

**framework values**: `react` | `vue` | `swiftui` | `compose` | `tailwind` | `unspecified` (default).

**If the response is too large**:
1. Call `get_current_page(maxDepth: 2)` for a high-level node map
2. Identify the specific child nodes worth zooming in on
3. Call `get_design_context(nodeId: "<childId>")` for each child individually

### Step 3: Capture Visual Reference

Run `export_image` for a visual reference.

```
export_image(nodeId: "42:15", format: "PNG", scale: 2)
```

This returns base64-encoded image data. Keep it accessible throughout implementation as the source of truth for visual validation.

### Step 4: Resolve Asset References

The `tree` from Step 2 contains image fill references. For each `IMAGE` paint:
- The `imageHash` identifies the image inside the Figma file
- Call `export_image` on the specific node containing the image fill to get its rasterized version
- Save the exported image to the project's asset directory

For SVG/icon nodes (vector nodes with no children):
- Call `export_image(nodeId, format: "SVG")` to get clean SVG markup
- DO NOT add new icon packages — assets should come from the Figma export

### Step 5: Translate to Project Conventions

Translate the Figma context into the target framework, styles, and conventions.

**Use the resolved arrays from Step 2 directly**:
- `variables[].name` → map slash-separated names to your CSS variables / theme tokens (e.g. `color/bg/primary` → `var(--color-bg-primary)` for web, `Color.bgPrimary` for SwiftUI)
- `styles[].name` → map to text style classes / typography utilities
- `components[]` → if `remote: true`, the component lives in a published library; if `key` is set, it's importable. Match by name to existing project components first.

**Framework-specific mappings (driven by `frameworkHint`)**:
| Figma | React/Tailwind | SwiftUI | Compose |
|---|---|---|---|
| `layoutMode: HORIZONTAL` | `flex flex-row` | `HStack { ... }` | `Row { ... }` |
| `layoutMode: VERTICAL` | `flex flex-col` | `VStack { ... }` | `Column { ... }` |
| `itemSpacing: 16` | `gap-4` | `spacing: 16` | `Arrangement.spacedBy(16.dp)` |
| `padding: 24` | `p-6` | `.padding(24)` | `Modifier.padding(24.dp)` |
| Variable bound fill | `bg-[var(--color-bg-primary)]` or matched token | `Color.bgPrimary` | `MaterialTheme.colors.primary` |

**Reuse over recreation**: Always check for existing components before creating new ones. Use `search_design_system(query: "<component name>")` if the project also has a Figma library, to confirm the design system component is published.

### Step 6: Achieve 1:1 Visual Parity

Strive for pixel-perfect visual parity with the Figma design.

**Guidelines:**
- Prioritize Figma fidelity to match designs exactly
- Avoid hardcoded values — use the `variables`/`styles` arrays from Step 2 to drive every color, spacing, radius, and font
- When project tokens diverge from Figma, prefer project tokens but adjust spacing/sizes minimally to preserve visuals
- Follow WCAG requirements for accessibility
- Add component documentation as needed

### Step 7: Validate Against Figma

Before marking complete, validate the final UI against the Step 3 screenshot.

**Validation checklist:**

- [ ] Layout matches (spacing, alignment, sizing)
- [ ] Typography matches (font, size, weight, line height)
- [ ] Colors match exactly — every color comes from the resolved variables, not eyeballed
- [ ] Interactive states work as designed (hover, active, disabled)
- [ ] Responsive behavior follows Figma constraints
- [ ] Assets render correctly
- [ ] Accessibility standards met

For an automated structural check on the result you implemented in Figma, call `audit_node(nodeId)` or `verify_design(nodeId)`.

## Implementation Rules

### Component Organization

- Place UI components in the project's designated design system directory
- Follow the project's component naming conventions
- Avoid inline styles unless truly necessary for dynamic values

### Design System Integration

- ALWAYS use components from the project's design system when possible
- Map Figma design tokens (from `get_design_context.variables`) to project design tokens by **name match**, not by raw value
- When a matching component exists, extend it rather than creating a new one
- Document any new components added to the design system

### Code Quality

- Avoid hardcoded values — extract to constants or design tokens
- Keep components composable and reusable
- Add TypeScript types for component props
- Include JSDoc comments for exported components

## Examples

### Example 1: Implementing a Button Component

User says: "Implement this Figma button component: https://figma.com/design/kL9xQn2VwM8pYrTb4ZcHjF/DesignSystem?node-id=42-15"

**Actions:**

1. Parse URL → `nodeId = "42:15"`. Confirm the file is currently open in Figma (figcraft only reads the live file).
2. Run `get_design_context(nodeId: "42:15", framework: "react")` — returns the button tree, the `color/text/inverse` variable, the `Button/Primary` component metadata, and the React framework hint.
3. Run `export_image(nodeId: "42:15", format: "PNG", scale: 2)` for the screenshot.
4. From the `components` array: the button is a remote library component with property definitions `{ Label: TEXT, Icon: INSTANCE_SWAP, State: VARIANT }`.
5. Check if project has an existing button component with matching API. If yes, extend it; if no, create new component using project conventions.
6. Map Figma variables to project tokens by name: `color/bg/primary` → `var(--color-bg-primary)`.
7. Validate against the Step 3 screenshot for padding, border radius, typography.

**Result:** Button component matching Figma design, integrated with project design system.

### Example 2: Building a Dashboard Layout

User says: "Build this dashboard: https://figma.com/design/pR8mNv5KqXzGwY2JtCfL4D/Dashboard?node-id=10-5"

**Actions:**

1. Parse URL → `nodeId = "10:5"`. Confirm the dashboard file is open in Figma.
2. Run `get_current_page(maxDepth: 2)` to understand the page structure (header, sidebar, content area, cards).
3. Run `get_design_context(nodeId: "10:5", framework: "react")` for the full dashboard. If the response is too large, switch to per-section calls using the child nodeIds from Step 2.
4. Run `export_image(nodeId: "10:5", format: "PNG", scale: 2)` for a full-page reference.
5. Export logos and chart assets via `export_image(nodeId: "<assetId>", format: "SVG")` per asset.
6. Build layout using the project's layout primitives, driven by the `tree.layoutMode` and `tree.itemSpacing` values from Step 3.
7. Implement each section using existing components where possible, matching by name from `components[]`.
8. Validate responsive behavior against Figma constraints in the screenshot.

**Result:** Complete dashboard matching Figma design with responsive layout.

## Best Practices

### Always Start with Context

Never implement based on assumptions. Always run `get_design_context` and `export_image` first.

### Incremental Validation

Validate frequently during implementation, not just at the end. This catches issues early.

### Document Deviations

If you must deviate from the Figma design (e.g., for accessibility or technical constraints), document why in code comments.

### Reuse Over Recreation

Always check for existing components before creating new ones. Consistency across the codebase is more important than exact Figma replication.

### Design System First

When in doubt, prefer the project's design system patterns over literal Figma translation.

### Token-Driven Styling

Every color, spacing, radius, and font in the generated code should map to a name from `get_design_context.variables` or `get_design_context.styles`. If you find yourself writing a raw hex or px value, stop and check if a token exists.

## Common Issues and Solutions

### Issue: Response too large from get_design_context

**Cause:** The target node has too many descendants to return in a single call.
**Solution:** Call `get_current_page(maxDepth: 2)` to find logical sub-frames, then `get_design_context` on each child individually.

### Issue: Design doesn't match after implementation

**Cause:** Visual discrepancies between the implemented code and the original Figma design.
**Solution:** Compare side-by-side with the screenshot from Step 3. Cross-check color/spacing values against the `variables` array — if a value didn't come from a token, that's the likely source of drift.

### Issue: Variable names don't match project tokens

**Cause:** The Figma library uses different naming conventions than the project's CSS / theme tokens.
**Solution:** Maintain a one-time naming map in the project (e.g. `color/bg/primary` → `--color-bg-primary`). If a Figma variable has no project equivalent, propose adding it to the project's design system rather than hardcoding.

### Issue: Component with `remote: true` not found in code

**Cause:** The Figma instance points to a published library component that doesn't have a matching code component yet.
**Solution:** Confirm with the user whether to create the missing component or detach the instance and inline the design.

## Understanding Design Implementation

The Figma implementation workflow establishes a reliable process for translating designs to code:

**For designers:** Confidence that implementations will match their designs with pixel-perfect accuracy.
**For developers:** A structured approach that eliminates guesswork and reduces back-and-forth revisions.
**For teams:** Consistent, high-quality implementations that maintain design system integrity.

By following this workflow, you ensure that every Figma design is implemented with the same level of care and attention to detail.

## Additional Resources

- figcraft tool reference: call `list_toolsets` and `get_creation_guide(topic: "tool-behavior")`
- [Figma Variables and Design Tokens](https://help.figma.com/hc/en-us/articles/15339657135383-Guide-to-variables-in-Figma)
