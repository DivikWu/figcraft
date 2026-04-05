# FigCraft Skills

Skills are first-class project assets. All skills are managed flat under `skills/`.

## Shared Design Rules

| Skill | Description |
|-------|-------------|
| **ui-ux-fundamentals** | Universal design quality rules (typography, spacing, content, accessibility). Always applies. |
| **design-creator** | No-library mode rules (intentional design thinking, color, iconography). Extends ui-ux-fundamentals. |
| **design-guardian** | Library mode rules (token priority, dark mode, conflict resolution). Extends ui-ux-fundamentals. |

Source of truth for MCP runtime `get_design_guidelines()`. Build copies content (stripped of frontmatter) to `dist/mcp-server/`.

## Quality Assurance

| Skill | Description |
|-------|-------------|
| **design-review** | Review existing designs against quality rules. Outputs structured violation report with fixes. |
| **design-lint** | Lint designs for compliance and auto-fix violations. 40 rules, 22 auto-fixable. |
| **component-docs** | Generate component documentation — properties, variants, usage, structural health audit. |
| **prototype-analysis** | Analyze prototype interactions — flow graph, dead ends, loops, Mermaid diagrams. |
| **text-replace** | Bulk replace text content — localization, data filling, content updates. |
| **spec-compare** | Compare DTCG token spec against Figma variables — audit token drift. |
| **token-sync** | Sync DTCG design tokens to Figma variables and styles. |

Forms the "create → review → fix" quality loop: `figma-create-ui` → `design-review` → `design-lint`.

## Design Patterns

| Skill | Description |
|-------|-------------|
| **responsive-design** | Responsive web design — breakpoints, auto-layout strategy, sizing patterns. |
| **content-states** | Empty, loading, and error state design patterns for data-driven views. |
| **design-handoff** | Annotate designs with specs for developer handoff. |
| **platform-ios** | iOS platform rules — screen dimensions, safe areas, SF Pro, HIG navigation. |
| **platform-android** | Android platform rules — screen dimensions, Material Design 3, Roboto, navigation. |

## Advanced Orchestration

| Skill | Description |
|-------|-------------|
| **design-system-audit** | Audit design system health — token coverage, component quality, naming compliance. |
| **migration-assistant** | Design system version migration — token mapping, component swapping, verification. |
| **multi-brand** | Multi-brand token management — brand themes, mode switching, cross-brand verification. |

## Declarative Path (create_frame)

| Skill | Description |
|-------|-------------|
| **figma-create-ui** | Create UI using FigCraft declarative tools with Opinion Engine. References 3 design rule skills. |

## Plugin API Path (execute_js / use_figma)

| Skill | Description |
|-------|-------------|
| **figma-use** | Mandatory prerequisite for all `use_figma`/`execute_js` calls. Plugin API rules. |
| **figma-generate-design** | Build/update full screens from design system. References design rules + figma-use. |
| **figma-generate-library** | Build professional design systems (20-100+ calls). References design rules + figma-use. |

## Auxiliary

| Skill | Description |
|-------|-------------|
| **figma-implement-design** | Translate Figma designs into production code. |
| **figma-code-connect-components** | Map Figma components to code via Code Connect. |
| **figma-create-design-system-rules** | Generate project-specific IDE design rules. |
| **figma-create-new-file** | Create blank Figma design/FigJam files. |

## Strategy

See [docs/skills-strategy.md](../docs/skills-strategy.md) for long-term roadmap, expansion phases, and maintenance guidelines.
