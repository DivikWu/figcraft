# Project: FigCraft

AI 驱动的 Figma 插件，让 AI 遵循设计规范做设计。通过 MCP 协议桥接 IDE 与 Figma，支持两种规范来源（Figma 共享库 / DTCG 设计规范文档），提供 Token 同步、规范 Lint、自动修复、元素生成等能力。

独立产品，不绑定任何特定设计系统。任何团队的 DTCG Token 文件或 Figma Library 均可使用。

## ⛔ Figma UI 创建 — 工具驱动的强制流程

创建流程由 MCP 工具在运行时强制执行，所有 IDE 共享同一套规则。
调用 `get_mode` 获取 `_workflow`，按 `_workflow` 步骤执行即可。

规则 single source of truth（更新 MCP 工具代码即可，所有 IDE 自动生效）：
- 创建流程 + 设计 checklist → `get_mode._workflow`
- Opinion Engine → `get_creation_guide(topic:"opinion-engine")`
- UI 类型模板（9 种）→ `get_creation_guide(topic:"ui-patterns", uiType:"xxx")`
- 设计规则 → `get_design_guidelines(category)`
- 多屏流程 → `get_creation_guide(topic:"multi-screen")`
- 响应式 Web → `get_creation_guide(topic:"responsive")`
- 内容状态 → `get_creation_guide(topic:"content-states")`

> 不要在 CLAUDE.md 或 IDE 配置文件中复制这些规则。规则实现在 `packages/core-mcp/src/tools/logic/mode-logic.ts`。

## Stack

- TypeScript (strict, ESM)
- MCP Server: @modelcontextprotocol/sdk + stdio transport
- WebSocket Relay: ws (port 3055-3060, auto-switch)
- Figma Plugin: Plugin API (code.js sandbox + ui.html iframe)
- 构建: tsup (Plugin IIFE + Server ESM)
- Schema: Zod (MCP 工具参数校验)
- 包管理: npm

IMPORTANT: 不要安装额外的 CSS/UI 框架。Plugin UI 是纯 HTML/CSS 内联在 ui.html 中。

## Commands

```bash
npm run dev:relay      # 启动 WebSocket 中继服务器 (port 3055)
npm run dev:mcp        # 启动 MCP Server (stdio transport)
npm run build          # 构建所有 (tsup)
npm run build:plugin   # 构建 Figma Plugin (IIFE bundle)
npm run build:server   # 构建 MCP Server + Relay (ESM)
npm run typecheck      # TypeScript 类型检查
npm run test           # 运行单元测试 (vitest)
npm run test:watch     # 测试 watch 模式
```

## Architecture

### 三组件中继架构

```
IDE (Kiro / Cursor / Claude Code / Antigravity / Codex)
    │ MCP (stdio)
    ▼
MCP Server (Node.js)           ← packages/core-mcp/src/
    │ WebSocket
    ▼
WS Relay (port 3055)           ← packages/relay/src/
    │ WebSocket
    ▼
Figma Plugin
    ├─ UI iframe                ← packages/adapter-figma/src/ui.html
    │     │ postMessage              (WebSocket 连接 + 消息桥接)
    │     ▼
    └─ code.js sandbox          ← packages/adapter-figma/src/code.ts
         (Figma Plugin API)          (命令分发 + Handler 注册)
```

关键约束：
- **code.js sandbox** 可以调用 Figma Plugin API，但没有网络访问
- **ui.html iframe** 有浏览器 API（WebSocket），但不能调用 Figma API
- 两者通过 `postMessage` 通信

### Channel 路由

每个 Figma 文档会话生成随机 channel ID，MCP Server 加入同一 channel 实现多会话隔离。Plugin UI 显示 channel ID 供用户配置 MCP Server。

### 请求追踪

每个 MCP 命令分配 UUID，Plugin 响应带回 UUID 关联。30 秒超时 + 30 秒心跳。

## 目录结构

```
figcraft/
├── CLAUDE.md
├── package.json                    # private workspace root
├── manifest.json                   # 生成的 root 兼容插件清单
├── schema/tools.yaml               # 工具定义单一事实来源
├── scripts/
│   ├── compile-schema.ts           # tools.yaml → 生成 tool registry
│   └── compile-content.ts          # content/ → 生成 _guides/_prompts/_templates
├── skills/                         # Skills（IDE 发现，扁平结构）
│   ├── ui-ux-fundamentals/         # 设计规则（MCP Server 的 source of truth）
│   ├── design-creator/
│   ├── design-guardian/
│   ├── figma-create-ui/            # 声明式创建流程
│   └── figma-use/ ...              # (共 11 个 skill)
├── content/                        # 可编辑内容资产（YAML/Markdown）
│   ├── templates/*.yaml            # 9 个 UI 模板 → _templates.ts
│   ├── guides/*.md                 # 6 个创建指南 → _guides.ts
│   └── prompts/*.yaml              # 9 个 MCP Prompt → _prompts.ts
├── packages/
│   ├── figcraft-design/src/        # 对外发布的 CLI 壳
│   ├── core-mcp/src/               # MCP Server runtime、bridge、tools、prompts
│   ├── relay/src/                  # WebSocket Relay
│   ├── shared/src/                 # 共享协议、类型、版本
│   ├── quality-engine/src/         # Lint 规则与质量引擎
│   └── adapter-figma/
│       ├── manifest.base.json      # 插件清单源码事实来源
│       ├── build.plugin.mjs        # 生成 root manifest + dist/plugin/*
│       └── src/                    # Plugin code、handlers、adapters、utils
├── tests/
│   ├── contracts/                  # monorepo/public surface guards
│   └── ...
└── dist/                           # 构建输出（.gitignore）
```

## 双模式操作

手动切换，通过 `set_mode` / `get_mode` 工具：

| 模式 | Token 来源 | Lint 检查方式 | 典型场景 |
|------|-----------|-------------|---------|
| **library** | Figma 共享库 Variables/Styles | 检查节点是否绑定了 Library Variable/Style | 设计师日常设计，使用团队共享库 |
| **spec** | DTCG JSON 文件 | 检查节点值是否匹配 DTCG Token 值 | 从设计规范文档同步，验证合规性 |

## MCP 工具体系

MCP 工具分为核心（始终加载）和可选工具集（按需 `load_toolset`），含资源端点。

- 工具定义 single source of truth：`schema/tools.yaml`
- 运行 `npm run schema` 重新生成 registry
- AI 调 `list_toolsets` 查看完整工具列表和加载状态
- 质量引擎：lint 规则 + 自动修复（`packages/quality-engine/src/rules/`）
- 内容资产：`content/` 下 YAML/Markdown → `npm run content` 生成 TypeScript（见 `docs/asset-maintenance.md`）

<!-- @inject-start: ide-shared/toolsets.md -->
Core tools are always enabled. Load additional toolsets as needed via `load_toolset`:

| Toolset | When to load |
|---------|-------------|
| `variables` | Managing Figma variables, collections, modes |
| `tokens` | Syncing DTCG design tokens |
| `styles` | Managing paint/text/effect styles |
| `components-advanced` | Building component libraries, managing variants |
| `library` | Importing from shared Figma libraries |
| `shapes-vectors` | Stars, polygons, sections, boolean ops, flatten |
| `annotations` | Adding, reading, and clearing annotations on nodes |
| `prototype` | Prototype interactions, flow analysis, batch-connect screens |
| `lint` | Fine-grained lint (beyond lint_fix_all) |
| `auth` | Figma OAuth setup |
| `pages` | Creating/renaming pages |
| `staging` | Staged workflow — preview changes before finalizing |
| `debug` | execute_js (raw Plugin API) |

Use `list_toolsets` to see current status. Load multiple: `load_toolset({ names: "tokens,variables" })`.
<!-- @inject-end -->

<!-- @inject-start: ide-shared/endpoints.md -->
Resource-oriented endpoints with method dispatch:

| Endpoint | Methods |
|----------|---------|
| `nodes` | `get`, `get_batch`, `list`, `update`, `delete`, `clone`, `reparent` |
| `text` | `set_content`, `set_range` |
| `components` | `list`, `list_library`, `get`, `list_properties` |
| `variables_ep` | `list`, `get`, `list_collections`, `get_bindings`, `set_binding`, `create`, `update`, `delete`, `create_collection`, `delete_collection`, `batch_create`, `export` (requires `load_toolset("variables")`) |
| `styles_ep` | `list`, `get`, `create_paint`, `update_paint`, `update_text`, `update_effect`, `delete`, `sync` (requires `load_toolset("styles")`) |

Call syntax: `nodes({ method: "get", nodeId: "1:23" })`
<!-- @inject-end -->

## DTCG → Figma 类型映射

| DTCG $type | Figma 目标 | Scope 推断 |
|------------|-----------|-----------|
| `color` | Variable (COLOR) | ALL_FILLS + STROKE_COLOR + EFFECT_COLOR |
| `dimension` / `number` | Variable (FLOAT) | 按名称推断：radius→CORNER_RADIUS, spacing→GAP, font-size→FONT_SIZE |
| `fontFamily` | Variable (STRING) | FONT_FAMILY |
| `fontWeight` | Variable (FLOAT) | FONT_WEIGHT |
| `boolean` | Variable (BOOLEAN) | ALL_SCOPES |
| `typography` | **Text Style** | N/A（复合类型，拆解为独立 Variable + 创建 Style） |
| `shadow` | **Effect Style** | N/A（复合类型） |

## Plugin Handler 注册模式

所有 handler 通过 `registerHandler(method, handler)` 注册到全局 Map。handler 文件通过 import 副作用自动注册。

> **注意**: Plugin 侧的 handler 方法名（如 `get_node_info`、`patch_nodes`）是内部桥接协议名称，与 MCP 工具名无关。MCP 层使用 endpoint 模式（如 `nodes(method: "get")`），endpoint 内部通过 `bridge.request('get_node_info', ...)` 调用 Plugin handler。

```typescript
// packages/adapter-figma/src/handlers/nodes.ts
import { registerHandler } from '../code.js';

// 内部桥接协议名 — 不是 MCP 工具名
registerHandler('get_node_info', async (params) => {
  // ... Figma API 调用
});
```

添加新 handler 时：
1. 在 `packages/adapter-figma/src/handlers/` 创建文件
2. 使用 `registerHandler` 注册方法（内部桥接协议名）
3. 在 `packages/adapter-figma/src/code.ts` 中添加 `import './handlers/xxx.js'`
4. 在 `schema/tools.yaml` 中添加工具定义（endpoint 或 standalone）

## 添加新 MCP 工具

新工具通过 `schema/tools.yaml` 定义，支持三种 handler 类型：

1. **`handler: bridge`** — 自动生成，YAML 定义即可，无需手写 MCP 包装
2. **`handler: endpoint`** — 资源端点，在 YAML 中定义 `methods` map，dispatch 在 `packages/core-mcp/src/tools/endpoints.ts`
3. **`handler: custom`** — 手写 MCP 包装在 `packages/core-mcp/src/tools/`，注册在 `toolset-manager.ts`

运行 `npm run schema` 重新生成 registry。

## 添加新 Lint 规则

1. 在 `packages/quality-engine/src/rules/` 创建文件，实现 `LintRule` 接口
2. 在 `packages/quality-engine/src/engine.ts` 的 `ALL_RULES` 数组中注册
3. `check()` 方法接收 `AbstractNode`（与 Figma API 解耦），返回 `LintViolation[]`
4. 设置 `autoFixable: true` + `fixData` 以支持自动修复
5. 在 `packages/adapter-figma/src/handlers/lint.ts` 的 `lint_fix` handler 中添加对应的修复逻辑

## IDE 诊断说明

Plugin 文件（`packages/adapter-figma/src/**`）中的 `figma`、`__html__` 等全局变量会在 IDE 中显示 "Cannot find name" 错误。这是正常的——这些全局变量由 Figma Plugin 运行时注入，`@figma/plugin-typings` 提供类型定义，Plugin 使用独立的 `tsconfig.plugin.json`。

Server 端类型检查命令：`npm run typecheck`（使用主 `tsconfig.json`，排除 plugin 文件）。

## 环境变量

```env
FIGCRAFT_RELAY_URL=ws://localhost:3055    # Relay 地址（默认，通常无需设置）
FIGCRAFT_RELAY_PORT=3055                  # Relay 首选端口（默认 3055，被占用时自动切换至 3056-3060）
FIGCRAFT_CHANNEL=figcraft                 # 默认 channel（Plugin 和 MCP Server 都默认 figcraft）
FIGMA_API_TOKEN=figd_xxx                  # Figma Personal Access Token（可选，也可在插件面板中配置）
FIGMA_CLIENT_ID=xxx                       # OAuth 2.0 Client ID（可选，用于 figma_login）
FIGMA_CLIENT_SECRET=xxx                   # OAuth 2.0 Client Secret（可选，用于 figma_login）
```

> **注意**: `FIGMA_API_TOKEN` 有三种配置方式（优先级从高到低）：
> 1. 环境变量 `FIGMA_API_TOKEN`
> 2. FigCraft 插件面板中的 API Token 输入框（存储在 Figma clientStorage，通过 WebSocket 传递给 MCP Server）
> 3. OAuth 登录（`figma_login` 工具，需要 `FIGMA_CLIENT_ID` + `FIGMA_CLIENT_SECRET`）

## 运行方式

### 用户使用（npm 包发布后）

```bash
# IDE 中配置 MCP Server（无需 clone 源码）:
# {
#   "mcpServers": {
#     "figcraft": {
#       "command": "npx",
#       "args": ["figcraft-design"]
#     }
#   }
# }
```

### 开发

```bash
# 1. 在 Figma 桌面应用中加载插件
# Plugins → Development → Import plugin from manifest → 选择 manifest.json
# （需要先 npm run build:plugin 构建 dist/plugin/）

# 2. IDE 中配置 MCP Server（无需手动启动 Relay，MCP Server 会自动内嵌启动）:
# {
#   "mcpServers": {
#     "figcraft": {
#       "command": "npx",
#       "args": ["tsx", "packages/figcraft-design/src/index.ts"],
#       "cwd": "/path/to/figcraft"
#     }
#   }
# }

# 也可单独启动 Relay（可选，用于调试）:
npm run dev:relay
```

### 端到端验证

1. Figma 中打开插件 → UI 自动探测 Relay 端口并连接
2. IDE 启动 MCP Server → 自动内嵌 Relay（或连接已有 Relay） → `ping` 工具返回文档名称和页面信息

> **注意**: Plugin 和 MCP Server 默认使用 `figcraft` channel，单文档场景零配置。多文档场景可通过 `join_channel` 工具或 `FIGCRAFT_CHANNEL` 环境变量切换。Relay 端口默认 3055，被占用时自动切换至 3056-3060。

## 与 design-guidelines 项目的关系

figcraft 是独立产品。design-guidelines 项目的 DTCG Token 文件是 figcraft 的可选消费来源之一：

```
design-guidelines/
  ├── tokens/*.json          # Token 源文件
  └── mcp-server/            # 设计规范查询 MCP Server（独立于 figcraft）

figcraft/
  └── sync_tokens(filePath)  # 可指向 design-guidelines 的 token 文件
```

## Constraints

<!-- @inject-start: ide-shared/constraints.md -->
Key architectural constraints:

- Plugin UI is pure HTML/CSS inline in ui.html — no frontend frameworks
- Linter runs in Plugin side (not MCP Server) — avoids transmitting large node data over WebSocket
- DTCG parsing runs in MCP Server only — Plugin receives parsed `DesignToken[]`
- Composite types (typography/shadow) map to Figma Styles, not Variables — Figma Variables don't support compound types
- `figma.teamLibrary` API can enumerate Library Variables but not Library Styles (REST API supplement needed)
- Plugin API bypasses REST API Enterprise restrictions — Variable writes work on all Figma plans
- Batch operations use `items[]` + per-item error handling — single-item failure doesn't block batch
- Token sync is idempotent — second run: created=0
<!-- @inject-end -->
