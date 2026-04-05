---
name: design-review
description: "Review existing Figma designs against design quality rules. Outputs structured violation report with actionable fixes. Use when: review/audit/check/critique + design/screen/page/component, or after UI creation to verify quality."
---

# Design Review — Structured Quality Audit

Review existing Figma designs against design quality rules. Produces a structured violation report with concrete fix suggestions. Pairs with `design-lint` for the automated fix step, forming a "create → review → fix" quality loop.

## Skill Boundaries

- Use this skill to **review and critique** existing designs against quality rules.
- If the task is **automated lint + auto-fix**, switch to [design-lint](../design-lint/SKILL.md).
- If the task is **creating new UI**, switch to [figma-create-ui](../figma-create-ui/SKILL.md).
- If the task is **implementing code from Figma**, switch to [figma-implement-design](../figma-implement-design/SKILL.md).

## Design Direction

Design rules are delivered by `_workflow.designPreflight` (from `get_mode`). For detailed rules by category, call `get_design_guidelines(category)`.

## Workflow

Follow all steps in sequence without stopping:

### Step 1: Connect and Discover Context

```
ping                          → verify plugin connection
get_mode                      → determine mode + selected library
```

### Step 2: Identify Review Targets

```
get_selection                 → get selected nodes
  └─ if nothing selected → get_current_page(maxDepth=2) → use top-level children
```

### Step 3: Read Node Properties

For each target node, call `nodes(method: "get")` to read:
- Fills, strokes, effects (colors, shadows)
- fontSize, fontName, fontWeight, lineHeight
- Spacing (padding, itemSpacing)
- Dimensions (width, height)
- cornerRadius
- layoutMode, layoutSizingHorizontal/Vertical
- Variable bindings (boundVariables)

For complex frames, also use `text_scan` to discover all text content.

For deep inspection of a single element, use `audit_node(nodeId)` — it combines all lint rules + design guideline checks into one structured report with severity, suggestions, and auto-fix availability.

### Step 4: Apply Design Rules

Load the appropriate design guidelines based on mode:

**If library selected (Design Guardian):**
- `get_design_guidelines()` for full ruleset, or `get_design_guidelines(category)` for focused review
- Review focus:
  - Are colors/fonts bound to library tokens? Flag hardcoded values when tokens exist
  - Is there a clear visual hierarchy and focal point?
  - Is composition intentional (asymmetry where appropriate, no uniform grids)?
  - Is spacing consistent and using library tokens (or 8dp multiples)?
  - Are text contents realistic and contextually appropriate (not placeholder)?
  - Are icons consistent in style (outline/filled/duotone not mixed)?
  - Are shadow levels consistent and within ≤ 3 tiers?
  - Does node structure complexity match the design tone?
  - Are accessibility standards met (contrast ≥ 4.5:1, touch targets)?

**If no library (Design Creator):**
- `get_design_guidelines()` for full ruleset
- Review focus:
  - Is there a clear design intent (not just AI defaults)?
  - Do color choices serve a purpose (≤ 5 colors, 60% dominant)?
  - Are fonts chosen with intention (not just Inter without reason)?
  - Is spacing rhythmic, consistent, based on a clear base unit?
  - Is there a clear visual focal point?
  - Are text contents realistic (no "Lorem ipsum", no "Button")?
  - Are icons consistent in style?
  - Are shadow levels consistent?
  - Are accessibility standards met?

### Step 5: Output Structured Report

For each violation found, output:

```
- **violation**: [node name] → [property]: [current value]
- **why**: [one sentence explaining the problem]
- **fix**: [concrete fix with MCP tool call example]
```

### Step 6: Summarize

```
✅ X passed  |  ⚠️ Y violations  |  🔧 Z auto-fixable
```

### Step 7: Auto-Fix

Run `lint_fix_all` to auto-fix what's possible, then report remaining violations that need manual attention.

## Review Categories

Use `get_design_guidelines(category)` for focused reviews:

| Category | What it checks |
|----------|---------------|
| `color` | Token binding, palette restraint, contrast |
| `typography` | Text styles, hierarchy, font choice |
| `spacing` | 8dp grid, token usage, rhythm |
| `layout` | Auto-layout, sizing, overflow |
| `composition` | Focal point, asymmetry, whitespace |
| `content` | Realistic text, no placeholders |
| `accessibility` | Contrast, touch targets, text size |
| `buttons` | Structure, padding, height |
| `inputs` | Structure, stroke, placeholder |

## Integration with Quality Loop

This skill is designed to chain with other skills:

```
figma-create-ui → design-review → design-lint
                   (this skill)    (auto-fix)
```

After creation, run design-review to catch quality issues. Then run design-lint for automated fixes. This forms the complete quality assurance loop.
