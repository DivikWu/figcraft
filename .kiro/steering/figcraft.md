---
inclusion: always
description: "FigCraft MCP — all design rules live in MCP tools, not in this file"
---

# FigCraft — Figma Design via MCP

FigCraft is the PRIMARY tool for all Figma creation and modification. All design rules, creation templates, and quality checks are enforced by MCP tools at runtime — not duplicated here.

## Mandatory Workflow

<!-- @inject-start: ide-shared/workflow.md -->
**Tool routing by intent** (decide BEFORE entering the workflow):
- CREATE/DESIGN UI → FigCraft tools only (workflow below)
- IMPLEMENT CODE from existing design → Figma Desktop MCP: get_design_context
- Figma URL in a creation request = WHERE to create, not what to read
- NEVER call get_design_context on empty pages/frames — it will error and block

Before ANY Figma write operation, complete these steps IN ORDER:

```
STEP 0: get_mode                          → verifies connection (built-in ping), inspects page
                                             (built-in pageContext), gets _workflow
        ├─ always           → load skill: ui-ux-fundamentals
        ├─ library selected → load skill: design-guardian
        └─ no library       → load skill: design-creator
STEP 1: Follow _workflow.designPreflight  → present proposal → ⛔ WAIT for user confirmation
        After platform confirmed → load skill: platform-ios / platform-android / responsive-design
STEP 2: CLASSIFY TASK SCALE → pick creation method:
        ├─ single element   → 1 create_frame call
        ├─ single screen    → 1 create_frame call with full children tree
        ├─ multi-screen 3-5 → load skill: multi-screen-flow → 1 create_frame per screen
        └─ large flow 6+    → load skill: multi-screen-flow → batch 2-3 screens per turn
STEP 3: create_frame + children           → Opinion Engine auto-handles sizing, tokens, pitfalls
        IF multi-screen → follow multi-screen-flow skill hierarchy (Wrapper → Header → Flow Row → Stage → Screen)
STEP 4: verify_design                     → lint + screenshot + preflight audit in one call
```

During execution: verify after every write (`export_image` at milestones). Run `lint_fix_all` before replying.
<!-- @inject-end -->

`get_mode._workflow` is the single source of truth. Follow it exactly.

## Key Tools

| Task | Tool |
|------|------|
| Start any design task | `get_mode` (mandatory first call) |
| UI type templates | `get_creation_guide(topic:"ui-patterns", uiType:"login")` |
| Layout/structure rules | `get_creation_guide(topic:"layout")` |
| Multi-screen flows | `get_creation_guide(topic:"multi-screen")` |
| Responsive web | `get_creation_guide(topic:"responsive")` |
| Content states | `get_creation_guide(topic:"content-states")` |
| Design direction rules | `get_design_guidelines(category)` |
| UI creation | `create_frame` + `children` (declarative, with Opinion Engine) |
| Text styling | `text(method:"set_range")` |
| Icons | `icon_search` → `icon_create` |
| Images | `image_search` → `create_frame` with `imageUrl` |
| Quality check | `verify_design` (lint + export + audit in one call) |
| Lint only | `lint_fix_all` |
| Node operations | `nodes` endpoint (get, get_batch, list, update, delete, clone, reparent) |
| Design system search | `search_design_system` |
| Extra toolsets | `load_toolset("variables")`, `load_toolset("tokens")`, etc. |

## Rules NOT in This File

All of these are returned by MCP tools and enforced at runtime:
- Design preflight checklist → `get_mode._workflow.designPreflight`
- Color/typography/spacing rules → `get_design_guidelines`
- UI type templates (9 types) → `get_creation_guide(topic:"ui-patterns")`
- Opinion Engine inferences → built into `create_frame`
- Lint rules + auto-fix → `lint_fix_all` / `verify_design`
- Token binding → automatic in library mode

Do NOT duplicate these rules in steering files. They update with the MCP Server code.

## Project Assets

<!-- @inject-start: ide-shared/asset-locations.md -->
Project assets and their locations:

- **Skills** (design rules + workflows): `skills/*/SKILL.md` (flat, IDE auto-discovered)
- **Content** (templates + guides + prompts): `content/` (YAML/Markdown, `npm run content` to compile)
- **MCP tools**: `schema/tools.yaml` (`npm run schema` to compile)
- **Lint rules**: `packages/quality-engine/src/rules/` (TypeScript)
- **Opinion Engine**: `packages/adapter-figma/src/handlers/inline-tree.ts`

On-demand docs via MCP tools:
- `get_creation_guide(topic)` — layout, multi-screen, batching, tool-behavior, opinion-engine, responsive, content-states, ui-patterns
- `get_design_guidelines(category)` — all, color, typography, spacing, layout, composition, content, accessibility, buttons, inputs
- `list_toolsets` — available toolsets and loading status

Maintenance guide: `docs/asset-maintenance.md`
<!-- @inject-end -->

## Development Guide

For adding tools, handlers, lint rules, or understanding architecture: read `CLAUDE.md` in the project root.
For asset maintenance and "how to add X": read `docs/asset-maintenance.md`.
