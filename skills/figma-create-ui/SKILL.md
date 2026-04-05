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
- If the task requires **importing design system component instances** (via `search_design_system` + `importComponentByKeyAsync`), switch to [figma-generate-design](../figma-generate-design/SKILL.md).
- If the task is **building a design system** (variables, component libraries, theming), switch to [figma-generate-library](../figma-generate-library/SKILL.md).
- If the task is **reviewing existing designs**, switch to [design-review](../design-review/SKILL.md).
- If the task is **implementing code from Figma**, switch to [figma-implement-design](../figma-implement-design/SKILL.md).

### When to Use This Skill vs figma-generate-design

| Signal | This skill (create-ui) | figma-generate-design |
|--------|----------------------|----------------------|
| Tool | `create_frame` (declarative) | `use_figma` (Plugin API scripts) |
| Design system | Optional — can use token binding via `fillVariableName` | Required — imports components by key |
| Typical task | "Design a login page", "Build a card" | "Recreate this React page in Figma" |
| Component reuse | Creates new frames from scratch | Discovers and instantiates existing library components |
| Complexity | Single elements to full screens | Full pages with design system component assembly |

**Rule of thumb**: If you need `search_design_system` to find and import component instances, use figma-generate-design. If you're creating UI from scratch (with or without token binding), use this skill.

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
- **Placeholders** for logos/avatars/charts: use `type:"frame"` (not `"rectangle"`), because rectangles cannot have children.
- **Icons**: use `icon_search` + `icon_create`, NEVER text characters as placeholders (">" for chevron).
- **Content**: realistic, contextually appropriate text. NEVER "Lorem ipsum", "Button", "Title".
- **dryRun:true** for complex or ambiguous parameters — preview before committing.
- **After first failure**, review ALL remaining planned payloads for the same pattern before retrying.

## On-Demand Guides

Call these MCP tools when you need deeper guidance on a specific topic:

| Guide | When to load |
|-------|-------------|
| `get_creation_guide(topic:"layout")` | Structural layout rules (39 rules from Quality Engine) |
| `get_creation_guide(topic:"multi-screen")` | Multi-screen flow architecture (3-5+ screens) |
| `get_creation_guide(topic:"batching")` | Context budget and batching strategy |
| `get_creation_guide(topic:"opinion-engine")` | Full Opinion Engine auto-inference documentation |
| `get_creation_guide(topic:"ui-patterns", uiType:"xxx")` | UI type templates (login, dashboard, settings, etc.) |
| `get_creation_guide(topic:"responsive")` | Responsive web breakpoints + auto-layout |
| `get_creation_guide(topic:"content-states")` | Empty/loading/error state patterns |
| `get_design_guidelines(category)` | Design direction rules (color, typography, spacing, etc.) |

## Design Direction

Design rules are delivered by `_workflow.designPreflight` (from `get_mode`). For detailed rules by category, call `get_design_guidelines(category)`.
