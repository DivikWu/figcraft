# FigCraft Skills

Skills are first-class project assets. All skills are managed flat under `skills/`.

## Shared Design Rules

| Skill | Description |
|-------|-------------|
| **ui-ux-fundamentals** | Universal design quality rules (typography, spacing, content, accessibility). Always applies. |
| **design-creator** | No-library mode rules (intentional design thinking, color, iconography). Extends ui-ux-fundamentals. |
| **design-guardian** | Library mode rules (token priority, dark mode, conflict resolution). Extends ui-ux-fundamentals. |

Source of truth for MCP runtime `get_design_guidelines()`. Build copies content (stripped of frontmatter) to `dist/mcp-server/`.

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
