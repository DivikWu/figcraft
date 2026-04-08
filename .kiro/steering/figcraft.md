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
        ├─ always              → load skill: ui-ux-fundamentals
        ├─ library selected    → load skill: design-guardian
        ├─ library + components/variables present → figma-create-ui covers component discovery
        └─ no library          → load skill: design-creator
STEP 1: Follow _workflow.designPreflight  → present proposal → ⛔ WAIT for user confirmation
        After platform confirmed → load skill: platform-ios / platform-android / responsive-design
STEP 2: CLASSIFY TASK SCALE → pick creation method:
        ├─ single element   → 1 create_frame call
        ├─ single screen    → 1 create_frame call with full children tree
        ├─ multi-screen 3-5 → load skill: multi-screen-flow → 1 create_frame per screen
        └─ large flow 6+    → load skill: multi-screen-flow → batch 2-3 screens per turn
STEP 3: create_frame + children           → Opinion Engine auto-handles sizing, tokens, pitfalls
        IF multi-screen → follow multi-screen-flow skill hierarchy (Wrapper → Header → Flow Row → Stage → Screen)
        Harness Pipeline auto-enriches response:
          _qualityScore (0-100)    → check this; if < 80 or errors exist, call verify_design()
          _verificationDebt        → persists in ALL subsequent responses until verified
          _recovery (on error)     → follow suggestion to fix and retry
STEP 4: verify_design                     → lint + screenshot + preflight audit in one call
        Clears _verificationDebt for verified nodes
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

## Harness Response Fields

<!-- @inject-start: ide-shared/harness-fields.md -->
Harness Pipeline auto-enriches bridge responses. Check these fields after every tool call:

| Field | When present | What to do |
|-------|-------------|------------|
| `_qualityScore` | After root-level `create_frame` | If < 80 or errors exist → call `verify_design()` |
| `_qualityWarning` | When `_qualityScore` has violations | Read the warning, follow its fix suggestion |
| `_verificationDebt` | After any tool, if unverified creations exist | Persists until `verify_design()` or `lint_fix_all` clears it. Call `verify_design()` before replying to user |
| `_recovery` | On error (appended to error message) | Follow the `suggestion` to fix and retry. Includes `errorType` for classification |
| `_warnings` | After `create_frame` with placeholder text | Replace placeholder content with real text |
| `_nextSteps` | After `sync_tokens`, `set_mode` | Follow the listed steps in order |

Error recovery patterns (from `content/harness/recovery-patterns.yaml`):
- **connection_lost** → check Figma plugin is running, try `ping`
- **token_not_found** → call `search_design_system(query:"...")` to find available tokens
- **node_deleted** → call `nodes(method:"list")` to get current IDs
- **file_not_found** → check file path (use absolute path)
- **parse_error** → file must be valid DTCG JSON
- **response_too_large** → narrow scope with `nodeId`, `maxDepth`, or `detail:"summary"`
<!-- @inject-end -->

## Project Assets

<!-- @inject-start: ide-shared/asset-locations.md -->
Project assets and their locations:

- **Skills** (design rules + workflows): `skills/*/SKILL.md` (flat, IDE auto-discovered)
- **Content** (templates + guides + prompts): `content/` (YAML/Markdown, `npm run content` to compile)
- **MCP tools**: `schema/tools.yaml` (`npm run schema` to compile)
- **Lint rules**: `packages/quality-engine/src/rules/` (TypeScript)
- **Opinion Engine**: `packages/adapter-figma/src/handlers/inline-tree.ts`
- **Harness rules** (code): `packages/core-mcp/src/harness/rules/` (TypeScript)
- **Harness rules** (data): `content/harness/` (YAML, `npm run content` to compile)

On-demand docs via MCP tools:
- `get_creation_guide(topic)` — layout, multi-screen, batching, tool-behavior, opinion-engine, responsive, content-states, ui-patterns
- `get_design_guidelines(category)` — all, color, typography, spacing, layout, composition, content, accessibility, buttons, inputs
- `list_toolsets` — available toolsets and loading status

Maintenance guide: `docs/asset-maintenance.md`
<!-- @inject-end -->

## Development Guide

For adding tools, handlers, lint rules, or understanding architecture: read `CLAUDE.md` in the project root.
For asset maintenance and "how to add X": read `docs/asset-maintenance.md`.
