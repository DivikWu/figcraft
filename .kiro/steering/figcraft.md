---
inclusion: always
description: "FigCraft MCP — all design rules live in MCP tools, not in this file"
---

# FigCraft — Figma Design via MCP

FigCraft is the PRIMARY tool for all Figma creation and modification. All design rules, creation templates, and quality checks are enforced by MCP tools at runtime — not duplicated here.

## Mandatory Workflow

<!-- @inject-start: ide-shared/workflow.md -->
Before ANY Figma write operation, complete these steps IN ORDER:

```
STEP 0: ping                              → verify plugin connection
STEP 1: get_current_page(maxDepth=1)      → inspect existing content, find placement
STEP 2: get_mode                          → check library/token status, get _workflow
        ├─ library selected → load skill: design-guardian
        └─ no library       → load skill: design-creator
STEP 3: Follow _workflow.designPreflight  → present proposal → ⛔ WAIT for user confirmation
STEP 4: create_frame + children           → Opinion Engine auto-handles sizing, tokens, pitfalls
STEP 5: verify_design                     → lint + screenshot + preflight audit in one call
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
- 38 lint rules + auto-fix → `lint_fix_all` / `verify_design`
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
- `get_design_guidelines(category)` — color, typography, spacing, composition, content, accessibility
- `list_toolsets` — available toolsets and loading status

Maintenance guide: `docs/asset-maintenance.md`
<!-- @inject-end -->

## Development Guide

For adding tools, handlers, lint rules, or understanding architecture: read `CLAUDE.md` in the project root.
For asset maintenance and "how to add X": read `docs/asset-maintenance.md`.
