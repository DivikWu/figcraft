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

## Skill Boundaries

- Use this skill to **create new UI** using declarative tools (create_frame, create_text).
- If the task is **building full screens from a design system with Plugin API**, switch to [figma-generate-design](../figma-generate-design/SKILL.md).
- If the task is **reviewing existing designs**, switch to [design-review](../design-review/SKILL.md).
- If the task is **implementing code from Figma**, switch to [figma-implement-design](../figma-implement-design/SKILL.md).

## On-Demand Guides
- `get_creation_guide(topic:"layout")` — 39 structural rules
- `get_creation_guide(topic:"multi-screen")` — multi-screen flow architecture
- `get_creation_guide(topic:"batching")` — context budget strategy
- `get_creation_guide(topic:"opinion-engine")` — auto-inference details
- `get_design_guidelines(category)` — design direction (color, typography, etc.)

## Design Direction
1. Always first → load skill: `ui-ux-fundamentals` (shared rules)
2. Library selected → then load skill: `design-guardian`
3. No library → then load skill: `design-creator`
