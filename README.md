# FigCraft

English | [中文](README.zh-CN.md)

AI-powered Figma plugin with 100+ MCP tools. Two-way bridge between AI IDEs and Figma — design creation, token sync, compliance linting, and auto-fix, all via natural language.

## What can you do with it?

Describe what you want in natural language, and FigCraft makes it happen in Figma:

> "Create a card component with 16px padding, bind colors to my design tokens, then lint the whole page"

> "Sync tokens from my DTCG JSON to Figma variables, diff and update"

> "Check WCAG contrast and target sizes on this page, auto-fix what you can"

## Features

- 🎨 **Design by talking** — tell the AI what UI you need, it builds frames, components, and styles right in Figma — from layout to export
- 🔍 **Automated design audit** — token bindings, color contrast, spacing, component health — all checked in one pass
- 🔧 **Lint + fix in one step** — token bindings, spacing, border radius, text size — one command to batch-fix everything flagged
- 🔄 **Two-way token sync** — DTCG JSON ↔ Figma variables, Light/Dark multi-mode in one step. Changed tokens in code? Just sync
- 🔀 **Dual mode for any team** — Library mode for Figma shared libraries, Spec mode for DTCG JSON — pick what fits your workflow
- 📐 **Prototype → dev docs** — parse prototype interactions into Mermaid flow diagrams + interaction specs, no more manual handoff docs

## Quick Start

> Requires Node.js >= 20.

### 1. Install the Figma Plugin

FigCraft is not yet on the Figma Community. Build from source:

```bash
git clone https://github.com/DivikWu/figcraft.git
cd figcraft
npm install
npm run build
```

Then in Figma Desktop:
1. **Plugins → Development → Import plugin from manifest**
2. Select the `manifest.json` file from the cloned repo

### 2. Add MCP Server to your IDE

The Figma plugin runs inside Figma, but your AI IDE needs an MCP Server to talk to it. The npm package [`figcraft-design`](https://www.npmjs.com/package/figcraft-design) provides this bridge — just tell your IDE how to start it.

Core config (same for all IDEs):

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "npx",
      "args": ["figcraft-design"]
    }
  }
}
```

Put it in the right file for your IDE:

<details>
<summary><strong>Cursor</strong> — <code>.cursor/mcp.json</code></summary>

Create `.cursor/mcp.json` in your project root with the config above.
</details>

<details>
<summary><strong>Claude Code</strong> — <code>.mcp.json</code></summary>

```bash
claude mcp add figcraft -s project -- npx figcraft-design
```

Or create `.mcp.json` in your project root with the config above.
</details>

<details>
<summary><strong>Kiro</strong> — <code>.kiro/settings/mcp.json</code></summary>

Create `.kiro/settings/mcp.json` in your project root. Kiro supports additional fields like `autoApprove`:

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "npx",
      "args": ["figcraft-design"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Tools are exposed as `mcp_figcraft_*` (e.g. `mcp_figcraft_ping`, `mcp_figcraft_create_frame`).

> **Tip**: This repo includes `.kiro/steering/figcraft.md` as a workflow guide. Copy it to your project's `.kiro/steering/` folder.
</details>

<details>
<summary><strong>Antigravity (Google)</strong> — MCP Server management panel</summary>

Open Antigravity → Agent dropdown → **Manage MCP Servers** → **View raw config**, then paste the config above.
</details>

<details>
<summary><strong>Codex CLI (OpenAI)</strong> — <code>~/.codex/config.toml</code></summary>

```toml
[mcp_servers.figcraft]
command = "npx"
args = ["figcraft-design"]
```
</details>

### 3. Connect & Verify

Open the FigCraft plugin in Figma — both sides auto-connect via the WebSocket relay. The plugin UI shows the channel ID and connection status.

To verify the connection works, ask your AI IDE to run the `ping` tool. If it returns a response, you're all set.

> **Troubleshooting**: If the connection fails, check that port 3055 is not occupied by another process. The relay will auto-try ports 3056–3060 as fallback.

## Architecture

```
AI IDE (Kiro / Cursor / Claude Code / Antigravity / Codex)
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

## Dual Mode

| Mode | Token Source | Lint Behavior | Use Case |
|------|-------------|---------------|----------|
| **Library** | Figma shared library | Check variable/style bindings | Daily design with team library |
| **Spec** | DTCG JSON files | Check values against token specs | Spec-driven validation |

Switch modes via `set_mode` tool or the plugin UI.

## Screen Creation Quality

- Use `create_screen` for complete screens. It builds the shell first, then appends sections progressively, and finishes with scoped lint/fix.
- Treat `create_document` as the raw tree path. Use it for smaller subtree inserts or when you need lower-level control over a batch node tree.
- Add semantic `role` fields on major frames when possible: `screen`, `header`, `hero`, `nav`, `content`, `list`, `row`, `stats`, `card`, `form`, `input`, `button`, `footer`, `actions`, `social_row`, `system_bar`.
- Explicit `role` defaults and `marginHorizontal` / `marginLeft` / `marginRight` inset wrappers are normalized consistently across both `create_screen` and raw `create_document`.
- When a filled child needs real outer margin, use `marginHorizontal`, `marginLeft`, or `marginRight`. FigCraft converts them into transparent inset wrappers automatically.

## Lint Rules (30)

Current lint coverage spans token compliance, WCAG accessibility, layout structure, naming, component health, and screen-level quality checks.

- Token compliance: color, typography, spacing, radius, hardcoded token usage, missing text style
- WCAG accessibility: contrast, target size, text size, line height
- Layout structure: auto-layout misuse, spacer frames, nesting depth, overflow, button/input/form consistency
- Screen quality: header fragmentation, header placement, CTA width consistency, section spacing collapse, bottom overflow, social/nav/stats crowding
- Naming and component health: default names, component binding checks

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FIGCRAFT_RELAY_PORT` | Relay WebSocket port | `3055` |
| `FIGCRAFT_CHANNEL` | Channel ID | `figcraft` |
| `FIGMA_API_TOKEN` | Figma Personal Access Token (optional — for REST API access to library components/styles; can also be set in plugin UI or via OAuth) | — |

## Development

Requires Node.js >= 20.

```bash
npm install
npm run build          # Build all (MCP server + relay + plugin)
npm run build:plugin   # Build Figma plugin only
npm run typecheck      # TypeScript type check
npm run bench:quality  # Run screen-level quality benchmark report
npm run bench:quality:save         # Save reports/benchmarks/latest.json + history snapshot
npm run bench:dashboard:from-latest  # Render reports/benchmarks/dashboard.md from latest artifact
npm run bench:gate:from-latest       # Enforce release gate against latest saved artifact
npm run test           # Run unit tests (vitest)
```

Benchmark artifacts:
- `reports/benchmarks/latest.json` — latest saved benchmark payload
- `reports/benchmarks/history/*.json` — historical snapshots for comparison
- `reports/benchmarks/dashboard.md` — dashboard with rule-regression metrics plus generation-quality / release-gate metrics

<details>
<summary><strong>Run MCP server from source (for development)</strong></summary>

Instead of `npx figcraft-design`, point your IDE to the local source:

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "npx",
      "args": ["tsx", "packages/figcraft-design/src/index.ts"],
      "cwd": "/path/to/figcraft"
    }
  }
}
```
</details>

## Contributing

Contributions welcome! Fork the repo and open a Pull Request.

Before submitting, make sure:

```bash
npm run typecheck      # Type check passes
npm run bench:quality:save         # Save benchmark artifact + history
npm run bench:dashboard:from-latest  # Refresh dashboard from saved artifact
npm run bench:gate:from-latest       # Release gate passes on clean benchmark cases
npm run test           # Tests pass
```

## License

MIT
