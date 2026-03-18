# FigCraft

AI-powered Figma plugin for design system compliance. Token sync, lint, auto-fix, and element generation via MCP.

## Features

- **65+ MCP tools** — read/write nodes, variables, styles, components, tokens, images, vectors
- **23 lint rules** — token compliance, WCAG accessibility, layout structure, naming, component health
- **DTCG token sync** — W3C Design Token Community Group format, multi-mode support
- **Auto-fix** — one-click fix for token binding, spacing, radius, text size violations
- **Dual mode** — Library mode (Figma shared library) or Spec mode (DTCG JSON files)
- **Prototype analysis** — flow diagrams (Mermaid) + interaction documentation

## Quick Start

### 1. Install the Figma Plugin

Import the plugin from `manifest.json` in Figma Desktop:
**Plugins → Development → Import plugin from manifest**

### 2. Configure your IDE

FigCraft supports all major AI IDEs via MCP. Choose your IDE below:

<details>
<summary><strong>Cursor</strong></summary>

Create or edit `.cursor/mcp.json` in your project root (or use global config):

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "npx",
      "args": ["figcraft"],
      "env": {
        "FIGCRAFT_CHANNEL": "figcraft"
      }
    }
  }
}
```
</details>

<details>
<summary><strong>Claude Code</strong></summary>

**Option A: CLI command**

```bash
claude mcp add figcraft -s project -- npx figcraft
```

**Option B: Edit `.mcp.json`** in your project root:

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "npx",
      "args": ["figcraft"],
      "env": {
        "FIGCRAFT_CHANNEL": "figcraft"
      }
    }
  }
}
```
</details>

<details>
<summary><strong>Kiro</strong></summary>

Create `.kiro/settings/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "npx",
      "args": ["figcraft"],
      "env": {
        "FIGCRAFT_CHANNEL": "figcraft"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Tools are exposed as `mcp_figcraft_*` (e.g. `mcp_figcraft_ping`, `mcp_figcraft_create_frame`).

> **Tip**: Add a [steering file](https://kiro.dev/docs/steering/) to `.kiro/steering/` for workflow guidance. This repo includes `.kiro/steering/figcraft.md` as a ready-to-use template.
</details>

<details>
<summary><strong>Antigravity (Google)</strong></summary>

Open Antigravity → Agent dropdown → **Manage MCP Servers** → **View raw config**, then add to `mcp_config.json`:

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "npx",
      "args": ["figcraft"],
      "env": {
        "FIGCRAFT_CHANNEL": "figcraft"
      }
    }
  }
}
```
</details>

<details>
<summary><strong>Codex CLI (OpenAI)</strong></summary>

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.figcraft]
command = "npx"
args = ["figcraft"]

[mcp_servers.figcraft.env]
FIGCRAFT_CHANNEL = "figcraft"
```
</details>

### 3. Connect

Open the plugin in Figma — both sides auto-connect via the WebSocket relay.

## Architecture

```
IDE (Cursor / Claude Code / Kiro / Antigravity / Codex)
    │ MCP (stdio)
    ▼
MCP Server (Node.js)
    │ WebSocket
    ▼
WS Relay (port 3055)
    │ WebSocket
    ▼
Figma Plugin (code.js sandbox + UI iframe)
```

## Development

```bash
npm install
npm run build          # Build all (MCP server + relay + plugin)
npm run build:plugin   # Build Figma plugin only
npm run typecheck      # TypeScript type check
npm run test           # Run unit tests
```

For development with hot reload, configure your IDE to use the dev server:

<details>
<summary><strong>Cursor / Claude Code / Antigravity</strong> (JSON config)</summary>

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server/index.ts"],
      "cwd": "/path/to/figcraft"
    }
  }
}
```
</details>

<details>
<summary><strong>Kiro</strong> (`.kiro/settings/mcp.json`)</summary>

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server/index.ts"],
      "cwd": "/path/to/figcraft",
      "disabled": false
    }
  }
}
```
</details>

<details>
<summary><strong>Codex CLI</strong> (`~/.codex/config.toml`)</summary>

```toml
[mcp_servers.figcraft]
command = "npx"
args = ["tsx", "src/mcp-server/index.ts"]
cwd = "/path/to/figcraft"
```
</details>

## IDE-Specific Notes

### Kiro

Kiro exposes MCP tools with a `mcp_figcraft_` prefix. For example:
- `mcp_figcraft_ping` — test connection
- `mcp_figcraft_create_frame` — create a frame
- `mcp_figcraft_lint_check` — run lint

Add a steering file to `.kiro/steering/figcraft.md` to give the agent context about all available tools. A ready-to-use template is included in this repo.

### Claude Code

Claude Code supports project-scoped (`.mcp.json`) and user-scoped (`~/.claude.json`) configs. Use project scope for team sharing:

```bash
# Quick add via CLI
claude mcp add figcraft -s project -- npx figcraft
```

### Codex CLI

Codex uses TOML format (`~/.codex/config.toml`). The config is shared between Codex CLI and the VS Code extension.

### Antigravity

Antigravity uses `mcp_config.json`. Access via Agent dropdown → Manage MCP Servers → View raw config.

## Dual Mode

| Mode | Token Source | Lint Behavior | Use Case |
|------|-------------|---------------|----------|
| **Library** | Figma shared library | Check variable/style bindings | Daily design with team library |
| **Spec** | DTCG JSON files | Check values against token specs | Spec-driven validation |

Switch modes via `set_mode` tool or the plugin UI.

## Lint Rules (23)

**Token compliance**: spec-color, spec-typography, spec-spacing, spec-border-radius, hardcoded-token, no-text-style

**WCAG accessibility**: wcag-contrast (AA), wcag-contrast-enhanced (AAA), wcag-target-size, wcag-text-size, wcag-line-height, wcag-non-text-contrast

**Layout**: no-autolayout, fixed-in-autolayout, empty-container, overlapping-children, max-nesting-depth, missing-responsive

**Naming**: default-name, stale-text-name

**Component**: component-bindings, no-text-property, consistent-icon-size

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FIGCRAFT_RELAY_PORT` | Relay WebSocket port | `3055` |
| `FIGCRAFT_CHANNEL` | Default channel ID | `figcraft` |
| `FIGMA_API_TOKEN` | Figma Personal Access Token | — |

## License

MIT
