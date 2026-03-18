# FigCraft

[English](#english) | [中文](#中文)

---

<a id="english"></a>

AI-powered Figma plugin for design system compliance. Token sync, lint, auto-fix, and element generation via MCP.

## Features

- **65+ MCP tools** — read/write nodes, variables, styles, components, tokens, images, vectors
- **15 lint rules** — token compliance, WCAG accessibility, layout structure, naming, component health
- **DTCG token sync** — W3C Design Token Community Group format, multi-mode support
- **Auto-fix** — one-click fix for token binding, spacing, radius, text size violations
- **Dual mode** — Library mode (Figma shared library) or Spec mode (DTCG JSON files)
- **Prototype analysis** — flow diagrams (Mermaid) + interaction documentation

## Quick Start

### 1. Install the Figma Plugin

> FigCraft has not been published to the Figma Community yet. Install from source:

```bash
git clone https://github.com/DivikWu/figcraft.git
cd figcraft
npm install
npm run build
```

Then in Figma Desktop:
1. **Plugins → Development → Import plugin from manifest**
2. Select the `manifest.json` file from the cloned repo

### 2. Configure your AI IDE

FigCraft works with all major AI IDEs via MCP. The npm package is [`figcraft-design`](https://www.npmjs.com/package/figcraft-design).

<details>
<summary><strong>Cursor</strong></summary>

Create `.cursor/mcp.json` in your project root:

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
</details>

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add figcraft -s project -- npx figcraft-design
```

Or edit `.mcp.json` in your project root:

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
</details>

<details>
<summary><strong>Kiro</strong></summary>

Create `.kiro/settings/mcp.json` in your project root:

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
<summary><strong>Antigravity (Google)</strong></summary>

Open Antigravity → Agent dropdown → **Manage MCP Servers** → **View raw config**, then add:

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
</details>

<details>
<summary><strong>Codex CLI (OpenAI)</strong></summary>

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.figcraft]
command = "npx"
args = ["figcraft-design"]
```
</details>

### 3. Connect

Open the FigCraft plugin in Figma — both sides auto-connect via the WebSocket relay. The plugin UI shows the channel ID and connection status.

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

## Lint Rules (15)

| Category | Rules |
|----------|-------|
| Token compliance | `spec-color`, `spec-typography`, `spec-spacing`, `spec-border-radius`, `hardcoded-token`, `no-text-style` |
| WCAG accessibility | `wcag-contrast`, `wcag-target-size`, `wcag-text-size`, `wcag-line-height` |
| Layout | `fixed-in-autolayout`, `empty-container`, `max-nesting-depth` |
| Naming | `default-name` |
| Component | `component-bindings` |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FIGCRAFT_RELAY_PORT` | Relay WebSocket port | `3055` |
| `FIGCRAFT_CHANNEL` | Channel ID | `figcraft` |
| `FIGMA_API_TOKEN` | Figma Personal Access Token (optional) | — |

## Development

```bash
npm install
npm run build          # Build all (MCP server + relay + plugin)
npm run build:plugin   # Build Figma plugin only
npm run typecheck      # TypeScript type check
npm run test           # Run unit tests (vitest)
```

<details>
<summary><strong>Run MCP server from source (for development)</strong></summary>

Instead of `npx figcraft-design`, point your IDE to the local source:

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

## License

MIT

---

<a id="中文"></a>

# FigCraft（中文）

AI 驱动的 Figma 插件，用于设计系统合规检查。通过 MCP 协议提供 Token 同步、设计检查、自动修复和元素生成能力。

## 功能特性

- **65+ MCP 工具** — 读写节点、变量、样式、组件、Token、图片、矢量
- **15 条检查规则** — Token 合规、WCAG 无障碍、布局结构、命名规范、组件健康度
- **DTCG Token 同步** — W3C 设计令牌社区组格式，支持多模式（如 Light/Dark）
- **自动修复** — 一键修复 Token 绑定、间距、圆角、文字大小等违规
- **双模式** — Library 模式（Figma 共享库）或 Spec 模式（DTCG JSON 文件）
- **原型分析** — 流程图（Mermaid）+ 交互文档

## 快速开始

### 1. 安装 Figma 插件

> FigCraft 尚未发布到 Figma 社区，需从源码安装：

```bash
git clone https://github.com/DivikWu/figcraft.git
cd figcraft
npm install
npm run build
```

然后在 Figma 桌面版中：
1. **Plugins → Development → Import plugin from manifest**
2. 选择克隆仓库中的 `manifest.json` 文件

### 2. 配置 AI IDE

FigCraft 通过 MCP 支持所有主流 AI IDE。npm 包名为 [`figcraft-design`](https://www.npmjs.com/package/figcraft-design)。

<details>
<summary><strong>Cursor</strong></summary>

在项目根目录创建 `.cursor/mcp.json`：

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
</details>

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add figcraft -s project -- npx figcraft-design
```

或编辑项目根目录的 `.mcp.json`：

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
</details>

<details>
<summary><strong>Kiro</strong></summary>

在项目根目录创建 `.kiro/settings/mcp.json`：

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

工具名以 `mcp_figcraft_` 为前缀（如 `mcp_figcraft_ping`、`mcp_figcraft_create_frame`）。

> **提示**：本仓库包含 `.kiro/steering/figcraft.md` 工作流指南，可复制到你的项目 `.kiro/steering/` 目录中使用。
</details>

<details>
<summary><strong>Antigravity (Google)</strong></summary>

打开 Antigravity → Agent 下拉菜单 → **Manage MCP Servers** → **View raw config**，添加：

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
</details>

<details>
<summary><strong>Codex CLI (OpenAI)</strong></summary>

编辑 `~/.codex/config.toml`：

```toml
[mcp_servers.figcraft]
command = "npx"
args = ["figcraft-design"]
```
</details>

### 3. 连接

在 Figma 中打开 FigCraft 插件，两端通过 WebSocket 中继自动连接。插件 UI 会显示频道 ID 和连接状态。

## 架构

```
AI IDE (Kiro / Cursor / Claude Code / Antigravity / Codex)
    │ MCP (stdio)
    ▼
MCP Server (Node.js)
    │ WebSocket
    ▼
WS Relay (端口 3055)
    │ WebSocket
    ▼
Figma Plugin (code.js 沙箱 + UI iframe)
```

## 双模式

| 模式 | Token 来源 | 检查方式 | 使用场景 |
|------|-----------|---------|---------|
| **Library** | Figma 共享库 | 检查变量/样式绑定 | 日常设计，使用团队库 |
| **Spec** | DTCG JSON 文件 | 检查值是否匹配 Token 规范 | 规范驱动验证 |

通过 `set_mode` 工具或插件 UI 切换模式。

## 检查规则（15 条）

| 类别 | 规则 |
|------|------|
| Token 合规 | `spec-color`、`spec-typography`、`spec-spacing`、`spec-border-radius`、`hardcoded-token`、`no-text-style` |
| WCAG 无障碍 | `wcag-contrast`、`wcag-target-size`、`wcag-text-size`、`wcag-line-height` |
| 布局 | `fixed-in-autolayout`、`empty-container`、`max-nesting-depth` |
| 命名 | `default-name` |
| 组件 | `component-bindings` |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|-------|
| `FIGCRAFT_RELAY_PORT` | Relay WebSocket 端口 | `3055` |
| `FIGCRAFT_CHANNEL` | 频道 ID | `figcraft` |
| `FIGMA_API_TOKEN` | Figma 个人访问令牌（可选） | — |

## 开发

```bash
npm install
npm run build          # 构建全部（MCP Server + Relay + Plugin）
npm run build:plugin   # 仅构建 Figma 插件
npm run typecheck      # TypeScript 类型检查
npm run test           # 运行单元测试 (vitest)
```

<details>
<summary><strong>从源码运行 MCP Server（开发用）</strong></summary>

开发时可以不用 `npx figcraft-design`，直接指向本地源码：

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

## 许可证

MIT
