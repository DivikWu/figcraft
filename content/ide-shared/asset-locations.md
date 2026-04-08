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
