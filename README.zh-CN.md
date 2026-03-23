# FigCraft

[English](README.md) | 中文

AI 驱动的 Figma 插件，提供 100+ MCP 工具。让 AI IDE 与 Figma 双向联动——用自然语言完成设计创建、Token 同步、规范检查与自动修复。

## 它能做什么？

用自然语言告诉 AI 你想做什么，FigCraft 帮你在 Figma 里完成：

> "创建一个卡片组件，16px 内边距，颜色绑定到设计 Token，然后检查整个页面的合规性"

> "把 DTCG JSON 里的 Token 同步到 Figma 变量，对比差异后更新"

> "检查当前页面的 WCAG 对比度和点击区域大小，自动修复能修的问题"

## 功能特性

- 🎨 **自然语言驱动设计** — 告诉 AI 你想要什么界面，它直接在 Figma 里创建节点、组件和样式，从画框到导出全流程覆盖
- 🔍 **设计规范自动审查** — Token 绑定、颜色对比度、间距规范、组件健康度，一次扫描全覆盖
- 🔧 **检查+修复一步到位** — 扫出的 Token 绑定、间距、圆角、文字大小问题，直接批量自动修复
- 🔄 **Token 双向同步** — DTCG JSON ↔ Figma 变量，Light/Dark 多模式一步到位。改了代码里的 Token？同步过去就行
- 🔀 **双模式适配团队** — 用 Figma 共享库的团队选 Library 模式，用 DTCG JSON 管理规范的团队选 Spec 模式
- 📐 **原型交互→开发文档** — 自动解析页面里的原型跳转，输出 Mermaid 流程图 + 交互说明，设计师不用再手写交互文档

## 快速开始

> 需要 Node.js >= 20。

### 1. 安装 Figma 插件

FigCraft 尚未发布到 Figma 社区，需从源码构建安装：

```bash
git clone https://github.com/DivikWu/figcraft.git
cd figcraft
npm install
npm run build
```

然后在 Figma 桌面版中：
1. **Plugins → Development → Import plugin from manifest**
2. 选择克隆仓库中的 `manifest.json` 文件

### 2. 在 IDE 中添加 MCP Server

Figma 插件运行在 Figma 内部，但你的 AI IDE 需要一个 MCP Server 来与它通信。npm 包 [`figcraft-design`](https://www.npmjs.com/package/figcraft-design) 提供了这个桥梁——只需告诉 IDE 如何启动它。

核心配置（所有 IDE 通用）：

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

各 IDE 的配置文件路径不同，展开查看：

<details>
<summary><strong>Cursor</strong> — <code>.cursor/mcp.json</code></summary>

在项目根目录创建 `.cursor/mcp.json`，写入上面的配置即可。
</details>

<details>
<summary><strong>Claude Code</strong> — <code>.mcp.json</code></summary>

```bash
claude mcp add figcraft -s project -- npx figcraft-design
```

或在项目根目录创建 `.mcp.json`，写入上面的配置。
</details>

<details>
<summary><strong>Kiro</strong> — <code>.kiro/settings/mcp.json</code></summary>

在项目根目录创建 `.kiro/settings/mcp.json`。Kiro 支持额外的 `autoApprove` 等字段：

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
<summary><strong>Antigravity (Google)</strong> — MCP Server 管理面板</summary>

打开 Antigravity → Agent 下拉菜单 → **Manage MCP Servers** → **View raw config**，写入上面的配置。
</details>

<details>
<summary><strong>Codex CLI (OpenAI)</strong> — <code>~/.codex/config.toml</code></summary>

```toml
[mcp_servers.figcraft]
command = "npx"
args = ["figcraft-design"]
```
</details>

### 3. 连接并验证

在 Figma 中打开 FigCraft 插件，两端通过 WebSocket 中继自动连接。插件 UI 会显示频道 ID 和连接状态。

连接后，在 AI IDE 中运行 `ping` 工具验证连通性。如果返回响应，说明一切就绪。

> **排查连接问题**：如果连接失败，检查端口 3055 是否被其他进程占用。Relay 会自动尝试 3056–3060 作为备用端口。

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

## 整屏创建质量

- 完整页面优先使用 `create_screen`。它会先创建 screen shell，再按 section 逐步追加内容，并在结尾自动做 scoped lint/fix。
- `create_document` 定位为 raw tree path，更适合局部子树插入，或你确实需要更底层的批量节点控制时使用。
- 建议在主要 frame 上显式提供 `role`：`screen`、`header`、`hero`、`nav`、`content`、`list`、`row`、`stats`、`card`、`form`、`input`、`button`、`footer`、`actions`、`social_row`、`system_bar`。
- 显式 `role` 默认值与 `marginHorizontal` / `marginLeft` / `marginRight` inset wrapper 规范，现在会在 `create_screen` 和 raw `create_document` 两条路径上保持一致。
- 如果带背景填充的子节点需要真实外边距，可以使用 `marginHorizontal`、`marginLeft`、`marginRight`。FigCraft 会自动把它转换成透明 inset wrapper。

## 检查规则（30 条）

当前规则集已经覆盖 Token 合规、WCAG 无障碍、布局结构、命名、组件健康度，以及整屏质量检查。

- Token 合规：颜色、字体、间距、圆角、硬编码 token、缺失文字样式
- WCAG 无障碍：对比度、点击区域、字号、行高
- 布局结构：auto-layout 误用、Spacer frame、嵌套深度、溢出、按钮/输入框/表单一致性
- 整屏质量：header 碎片化、header 位置异常、CTA 宽度不一致、section spacing 塌缩、底部溢出、social/nav/stats 拥挤
- 命名与组件：默认命名检查、组件绑定检查

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|-------|
| `FIGCRAFT_RELAY_PORT` | Relay WebSocket 端口 | `3055` |
| `FIGCRAFT_CHANNEL` | 频道 ID | `figcraft` |
| `FIGMA_API_TOKEN` | Figma 个人访问令牌（可选，用于 REST API 访问库组件/样式；也可通过插件 UI 配置或使用 OAuth） | — |

## 开发

需要 Node.js >= 20。

```bash
npm install
npm run build          # 构建全部（MCP Server + Relay + Plugin）
npm run build:plugin   # 仅构建 Figma 插件
npm run typecheck      # TypeScript 类型检查
npm run bench:quality  # 运行整屏质量基准报告
npm run bench:quality:save           # 保存 reports/benchmarks/latest.json 与历史快照
npm run bench:dashboard:from-latest  # 用最新产物生成 reports/benchmarks/dashboard.md
npm run bench:gate:from-latest       # 基于最新保存产物执行发布门槛检查
npm run test           # 运行单元测试 (vitest)
```

Benchmark 产物：
- `reports/benchmarks/latest.json` — 最新一次保存的 benchmark payload
- `reports/benchmarks/history/*.json` — 可用于历史对比的快照
- `reports/benchmarks/dashboard.md` — 同时展示规则回归指标与 generation-quality / release-gate 指标的 dashboard

<details>
<summary><strong>从源码运行 MCP Server（开发用）</strong></summary>

开发时可以不用 `npx figcraft-design`，直接指向本地源码：

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

欢迎贡献！请 fork 本仓库并提交 Pull Request。

提交前请确保：

```bash
npm run typecheck      # 类型检查通过
npm run bench:quality:save           # 保存 benchmark 产物与历史
npm run bench:dashboard:from-latest  # 根据最新产物刷新 dashboard
npm run bench:gate:from-latest       # clean benchmark case 通过发布门槛
npm run test           # 测试通过
```

## 许可证

MIT
