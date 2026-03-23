# FigCraft Monorepo Migration

## Goal

Migrate FigCraft from a single-package repository with multiple source roots into a workspace-based monorepo without changing its public behavior during the migration window.

## Frozen Public Surface

The following surfaces stay compatible throughout the migration:

- `figcraft-design` remains the MCP CLI command name
- The repository root `manifest.json` remains importable in Figma Desktop
- `schema/tools.yaml` remains the single source of truth for tool definitions
- MCP tool names, endpoint names, environment variable names, and response shapes stay unchanged
- Benchmark release-gate thresholds do not loosen during migration

## Target Packages

- `packages/figcraft-design`
- `packages/shared`
- `packages/relay`
- `packages/quality-engine`
- `packages/core-mcp`
- `packages/adapter-figma`

## Phase Plan

### Phase 0

- Freeze current public contract
- Add migration docs and contract tests
- Record the current benchmark baseline

### Phase 1

- Introduce workspace skeleton
- Add package shells
- Keep all existing build/test commands pointing at the current root source tree

### Phase 2

- Move `src/shared` and `src/relay` into packages
- Keep shim files at the old paths

### Phase 3

- Make the schema compiler support configurable output targets
- Dual-write generated tool registry files
- Move `src/mcp-server` into `packages/core-mcp`
- Introduce a compatibility CLI package

### Phase 4

- Move plugin code, manifest base, and plugin build into `packages/adapter-figma`
- Continue generating the root `manifest.json` and root `dist/plugin/*` for compatibility

### Phase 5

- Move lint engine, rules, and benchmark computation into `packages/quality-engine`
- Keep all direct `figma.*` interactions in `adapter-figma`

### Phase 6

- Add migration-specific integration tests
- Switch CI and release to workspace-aware flows
- Remove obsolete shims after compatibility is proven
- Move the root dev/build shell to package-owned source entrypoints while keeping command names and output paths stable
- Introduce `packages/figcraft-design` as the dedicated published CLI package
- Keep the repository root as a private workspace orchestrator plus local compatibility shell

## Phase 1 Deliverables

- Workspace root with `workspaces`
- Shared TypeScript base config
- Vitest workspace entrypoint
- Package shells with placeholder source entrypoints
- Documentation for migration scope and contract constraints

## Phase 1 Non-Goals

- No source-code moves from `src/`
- No schema output relocation
- No plugin manifest path changes
- No published package shape changes
