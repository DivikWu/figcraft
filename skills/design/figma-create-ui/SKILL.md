---
name: figma-create-ui
description: "Create UI in Figma using FigCraft declarative tools (create_frame, create_text). Use when: create/design/build/make + Figma/UI/screen/page/component. IMPORTANT: Use create_frame instead of use_figma for all UI creation."
---

# FigCraft UI Creation

Use FigCraft declarative tools for UI creation — NOT use_figma. create_frame includes an Opinion Engine
that auto-handles sizing, FILL ordering, token binding, and failure cleanup.

## Workflow
1. `get_mode` → read `_workflow` (designPreflight + creationSteps)
2. Complete `_workflow.designPreflight` → present proposal → ⛔ WAIT for confirmation
3. `create_frame` + `children` to build design
4. `lint_fix_all` → auto-check and fix violations

## On-Demand Guides
- `get_creation_guide(topic:"layout")` — 39 structural rules
- `get_creation_guide(topic:"multi-screen")` — multi-screen flow architecture
- `get_creation_guide(topic:"batching")` — context budget strategy
- `get_creation_guide(topic:"opinion-engine")` — auto-inference details
- `get_design_guidelines(category)` — design direction (color, typography, etc.)

## Design Direction
1. Always first → `readFile references/ui-ux-fundamentals.md` (shared rules)
2. Library selected → then `readFile references/design-guardian.md`
3. No library → then `readFile references/design-creator.md`
