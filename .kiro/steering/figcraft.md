---
inclusion: always
description: "FigCraft Kiro supplement — deduped against AGENTS.md which Kiro auto-loads as workspace rule"
---

# FigCraft — Kiro Supplement

> AGENTS.md is auto-loaded by Kiro as a workspace rule. It contains the full FigCraft workflow, endpoints, harness fields, toolsets, constraints, and asset locations. This file only adds Kiro-specific notes to avoid duplication.

## Tool Routing

- FigCraft tools (mcp_figcraft_*) are PRIMARY for all Figma creation, inspection, and modification.
- Figma Desktop MCP (mcp_figma_desktop_*) is only for: implementing code from designs (`get_design_context`), FigJam, Code Connect.
- Screenshots → `export_image` (not `get_screenshot`)
- Node inspection → `nodes(method:"get")` (not `get_metadata`)
- Page overview → `get_current_page(maxDepth:2)` (not `get_metadata`)

## Skill Loading

When doing Figma design tasks, load skills via `discloseContext` as indicated by `get_mode` STEP 0:
- Always: `ui-ux-fundamentals`
- Library mode: `design-guardian`
- No library: `design-creator`
- After platform confirmed: `platform-ios` / `platform-android` / `responsive-design`

## Dev Docs

For architecture, build commands, adding tools/lint rules: read `CLAUDE.md` in project root.
