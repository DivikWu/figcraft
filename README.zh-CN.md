# FigCraft

[English](README.md) | 中文

AI 驱动的 Figma 设计质量插件。让 AI IDE 与 Figma 双向联动——用自然语言完成设计审查、Token 同步、规范检查、审计与自动修复。UI 创建由 [Figma 官方 MCP server](https://developers.figma.com/docs/figma-mcp-server/) 负责，FigCraft 专注于官方 MCP 不覆盖的质量层。

## 它能做什么？

用自然语言告诉 AI 你想做什么，FigCraft + Figma 官方 MCP 帮你在 Figma 里完成：

> "创建一个登录页面，然后检查整个页面的合规性并自动修复"

> "把 DTCG JSON 里的 Token 同步到 Figma 变量，对比差异后更新"

> "检查当前页面的 WCAG 对比度和点击区域大小，自动修复能修的问题"

## 功能特性

- 🔍 **设计规范自动审查** — Token 绑定、颜色对比度、间距规范、组件健康度，一次扫描全覆盖
- 🔧 **检查+修复一步到位** — 35+ 条规则覆盖 Token 合规、WCAG、布局结构，一条命令批量自动修复
- 🔄 **Token 双向同步** — DTCG JSON ↔ Figma 变量，Light/Dark 多模式一步到位。改了代码里的 Token？同步过去就行
- 🔀 **双模式适配团队** — 用 Figma 共享库的团队选 Library 模式，用 DTCG JSON 管理规范的团队选 Spec 模式
- 📐 **原型交互→开发文档** — 自动解析页面里的原型跳转，输出 Mermaid 流程图 + 交互说明，设计师不用再手写交互文档
- 🎨 **创建由 Figma 官方 MCP server 负责** — UI 创建交给 [Figma 官方 MCP server](https://developers.figma.com/docs/figma-mcp-server/)，FigCraft 在其上提供质量层（审查、lint、审计、Token 同步）

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

FigCraft 负责设计质量（审查、lint、审计、Token 同步）。如需 AI 驱动的 UI 创建，请同时添加 [Figma 官方 MCP server](https://developers.figma.com/docs/figma-mcp-server/)。两个 server 并行运行——IDE 自动将创建请求路由到 Figma MCP，质量任务路由到 FigCraft。

FigCraft 配置（所有 IDE 通用）：

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

> 如果只需要审查/lint/审计/Token 同步，FigCraft 单独使用即可。需要 AI 创建 UI 时再添加 Figma MCP server。

<details>
<summary><strong>添加 Figma 官方 MCP server（用于 UI 创建）</strong></summary>

Figma 提供两种部署方式：

**Desktop server**（本地，运行在 Figma Desktop App 内）：
1. 打开 Figma Desktop → Dev Mode → 在 inspect 面板中启用 MCP server
2. 在 IDE 配置中添加：
```json
{
  "mcpServers": {
    "figma-desktop": {
      "url": "http://127.0.0.1:3845/mcp"
    }
  }
}
```

**Remote server**（云端，功能更全——Figma 推荐）：
参见 [Figma Remote server 设置指南](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)。

完整文档见 [Figma 官方 MCP 文档](https://developers.figma.com/docs/figma-mcp-server/)。
</details>

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

工具名以 `mcp_figcraft_` 为前缀（如 `mcp_figcraft_ping`、`mcp_figcraft_lint_fix_all`）。

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

## UI 创建

UI 创建（frame、形状、文本、组件）由 [Figma 官方 MCP server](https://developers.figma.com/docs/figma-mcp-server/) 负责。FigCraft 在其上提供质量工具：

- 用 Figma MCP 创建 UI 后，运行 `lint_fix_all` 检查并自动修复布局、Token、无障碍问题
- 用 `audit_node` 对特定元素做深度质量检查
- 创建前用 `get_design_guidelines` 查看设计规范

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
npm run test           # 测试通过
```

## 许可证

MIT
