---
name: design-system-audit
description: "Audit design system health — token coverage, component consistency, unused variables, naming compliance. Use when: audit/health check/coverage + design system/library/tokens, or when assessing design system quality before publishing."
---

# Design System Audit — Health & Coverage Check

Comprehensive audit of a Figma design system's health: token coverage, component structural quality, variable usage, naming consistency, and style completeness. Combines multiple tools into a single audit workflow.

## Skill Boundaries

- Use this skill to **audit an existing design system's health**.
- If the task is **building a new design system**, switch to [figma-generate-library](../figma-generate-library/SKILL.md).
- If the task is **auditing a single component**, switch to [component-docs](../component-docs/SKILL.md).
- If the task is **linting a design page**, switch to [design-lint](../design-lint/SKILL.md).
- If the task is **comparing tokens against a spec**, switch to [spec-compare](../spec-compare/SKILL.md).

## Workflow

### Step 1: Connect and Load Tools

```
ping                                          → verify plugin connection
load_toolset("components-advanced")           → component audit tools
load_toolset("variables")                     → variable inspection tools
load_toolset("tokens")                        → token export/scan tools
```

### Step 2: Inventory — What Exists

Run a full inventory of the design system file:

```
get_document_info                             → list all pages
get_current_page(maxDepth: 1)                 → overview per page
components(method: "list")                    → all local components
variables_ep(method: "list")                  → all local variables
variables_ep(method: "list_collections")      → all variable collections
scan_styles                                   → all local styles (paint, text, effect)
```

Compile an inventory summary:
- Total pages, components, component sets, variables, styles
- Variable collections with mode counts
- Component distribution across pages

### Step 3: Component Health Audit

```
audit_components                              → structural health scan
```

For each page with components, check:
- ⚠️ Missing descriptions — components without documentation
- ⚠️ Unexposed text — text nodes not editable via properties
- ⚠️ Empty components — no visible children
- ⚠️ Single-variant sets — component sets with only one variant
- ⚠️ Unbound properties — properties not connected to child layers

### Step 4: Token Coverage Audit

For each component, inspect variable bindings:

```
nodes(method: "get", nodeId: "...")           → read component properties
```

Check:
- ✅ Fill colors bound to variables
- ✅ Stroke colors bound to variables
- ✅ Spacing (padding, gap) bound to variables
- ✅ Corner radius bound to variables
- ✅ Text styles applied
- ✅ Effect styles applied
- ⚠️ Hardcoded values where tokens exist

Calculate token binding rate: `(bound properties / total bindable properties) × 100%`

### Step 5: Variable Quality Audit

For each variable, check:
- ⚠️ `ALL_SCOPES` — variables without specific scopes pollute property pickers
- ⚠️ Missing code syntax — breaks Dev Mode round-tripping
- ⚠️ Duplicate raw values in semantic layer — should alias primitives instead
- ⚠️ Orphan variables — variables not bound to any node
- ⚠️ Naming inconsistency — mixed casing or naming conventions

### Step 6: Naming Audit

Scan all nodes for naming issues:

```
lint_fix_all(categories: ["naming"])          → check naming rules
```

Additionally check:
- ⚠️ Default names ("Frame 1", "Rectangle 2")
- ⚠️ Inconsistent casing (mixed camelCase/kebab-case/PascalCase)
- ⚠️ Duplicate component names
- ⚠️ Missing page separators between sections

### Step 7: Generate Audit Report

Compile a structured report:

```markdown
## Design System Audit Report

### Summary
- Components: X total (Y sets, Z standalone)
- Variables: N across M collections
- Styles: P text, Q paint, R effect
- Token binding rate: XX%
- Health score: X/10

### Component Health
- ✅ With descriptions: X/Y
- ⚠️ Missing descriptions: [list]
- ⚠️ Unexposed text: [list]
- ⚠️ Single-variant sets: [list]

### Token Coverage
- ✅ Bound fills: X%
- ✅ Bound strokes: X%
- ✅ Bound spacing: X%
- ⚠️ Hardcoded values: [list with suggestions]

### Variable Quality
- ⚠️ ALL_SCOPES variables: [list]
- ⚠️ Missing code syntax: [list]
- ⚠️ Orphan variables: [list]

### Naming
- ⚠️ Default names: X nodes
- ⚠️ Placeholder text: X nodes

### Recommendations
1. [Priority fixes]
2. [Quick wins]
3. [Long-term improvements]
```

## Health Score Calculation

| Criterion | Weight | Scoring |
|-----------|--------|---------|
| Component descriptions | 15% | % of components with descriptions |
| Token binding rate | 25% | % of bindable properties bound |
| Variable scopes set | 15% | % of variables with specific scopes |
| Code syntax set | 10% | % of variables with code syntax |
| No default names | 10% | % of nodes with descriptive names |
| No placeholder text | 10% | % of text nodes with real content |
| Text styles applied | 10% | % of text nodes using shared styles |
| No empty containers | 5% | % of frames with visible children |

Score 8–10: Healthy. Score 5–7: Needs attention. Score < 5: Significant gaps.
