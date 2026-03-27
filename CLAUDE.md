# Project: FigCraft

AI 驱动的 Figma 插件，让 AI 遵循设计规范做设计。通过 MCP 协议桥接 IDE 与 Figma，支持两种规范来源（Figma 共享库 / DTCG 设计规范文档），提供 Token 同步、规范 Lint、自动修复、元素生成等能力。

独立产品，不绑定任何特定设计系统。任何团队的 DTCG Token 文件或 Figma Library 均可使用。

## ⛔ Figma UI 创建 — 强制前置检查（所有 AI IDE 通用）

在执行任何 Figma 写操作之前，必须按顺序完成以下步骤。跳过任何一步都是严重错误。

```
STEP 0: ping                                          → 验证插件连接
STEP 1: get_current_page(maxDepth=1)                  → 检查现有内容，确定放置位置
STEP 2: get_mode                                      → 检查是否有 design system
STEP 3: 判断任务规模                                    → 单元素 / 单屏 / 多屏流程(3-5) / 大型流程(6+)
STEP 4: 多屏流程必须读取 multi-screen-flow-guide.md     → 包含层级结构、PRESET、helper 模板
        ❌ 禁止：多屏流程使用 create_frame/create_text 逐个创建
        ❌ 禁止：跳过 Wrapper → Header → Flow Row → Stage → Screen 层级
        ✅ 必须：使用 execute_js，一个脚本创建一整个屏幕
STEP 5: 每次写操作后验证                                → get_current_page + export_image
STEP 6: 完成后 lint_fix_all                            → 在回复用户之前
```

详细规则见 `.kiro/steering/figma-essential-rules.md`（Kiro）或本文件下方的 Multi-Screen Flow 章节。

## Multi-Screen Flow 创建规则

多屏流程（登录注册、引导、结账等）必须遵循以下结构和工具策略。

### 层级结构（不可跳过）

```
Wrapper (VERTICAL, HUG/HUG, counterAxisAlignItems=MIN, clipsContent=false, cornerRadius=20-40, fill=lightGray, padding, itemSpacing)
  ├── Header (title + description)
  └── Flow Row (HORIZONTAL, HUG/HUG, clipsContent=false, itemSpacing between screens)
        └── Stage / {label} (VERTICAL, HUG/HUG, clipsContent=false) — one per screen
              ├── Step Pill (badge: "01 Welcome")
              └── Screen / {label} (VERTICAL, FIXED 402×874, cornerRadius=28, clipsContent=true, padding, SPACE_BETWEEN, dropShadow)
                    ├── Top Content (VERTICAL, FILL/HUG)
                    └── Bottom Content (HORIZONTAL or VERTICAL, FILL/HUG)
```

### PRESET 变量（每个 execute_js 脚本开头必须定义）

```js
const PRESET = {
  screen: { radius: 28, shadow: {type:"DROP_SHADOW",color:{r:0,g:0,b:0,a:0.08},offset:{x:0,y:4},radius:24,spread:0,visible:true,blendMode:"NORMAL"} },
  button: { radius: 12 }, input: { radius: 12 }, card: { radius: 20 }, pill: { radius: 100 },
};
```

### 构建顺序

```
Call 1: 创建 Wrapper + Header + Flow Row + 所有 Stage/Screen 骨架 → export_image 验证
Call 2: 填充 Screen 1 全部内容（TopContent + 表单 + 按钮 + BottomContent）→ export_image
Call 3-N: 逐个填充剩余 Screen → 每个完成后 export_image
Final: lint_fix_all → 结构验证 → 最终 export_image
```

### 关键规则

- 每个 execute_js 脚本重新定义 PRESET 和 helper 函数（不跨调用持久化）
- Screen 使用 `primaryAxisAlignItems: "SPACE_BETWEEN"` 分布上下内容，禁止空 spacer frame
- 所有 helper 的圆角从 PRESET 读取，禁止硬编码
- Shadow 元素的所有祖先容器必须 `clipsContent=false`（Rule #24）
- 每次写操作后 `get_current_page(maxDepth=1)` 验证结构

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
├── scripts/compile-schema.ts       # 生成 core-mcp tool registry / schemas
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

## MCP 工具清单 (Endpoint 模式)

### 基础
- `ping` — 测试连通性

### 节点操作 (`nodes` endpoint)
- `nodes(method: "get")` / `nodes(method: "list")` — 节点读取与搜索
- `nodes(method: "update")` — 更新节点属性
- `nodes(method: "delete")` — 删除节点
- `get_current_page` / `get_document_info` / `get_selection` — 页面/文档/选区读取
- `list_fonts` — 枚举可用字体族及字重

### 文本 (`text` endpoint)
- `text(method: "set_content")` — 更新文本内容

### 组件 (`components` endpoint)
- `components(method: "list")` / `components(method: "get")` — 本地组件
- `components(method: "list_library")` — 库组件（REST API，需 FIGMA_API_TOKEN）
- `components(method: "list_properties")` — 枚举组件暴露的属性和变体选项

> 注意：UI 创建（frame、shape、text、instance）已委托给 Figma 官方 MCP。FigCraft 专注于审查、lint、审计和 token 同步。

### 变量 (`variables_ep` endpoint, 需 `load_toolset("variables")`)
- 12 个方法：list, get, create, update, delete, list_collections, create_collection, delete_collection, rename_collection, add_mode, rename_mode, remove_mode
- `export_variables` — 导出 Figma 变量为 DTCG 兼容格式
- `batch_create_variables` — 批量创建变量
- `create_variable_alias` — 变量别名

### 样式 (`styles_ep` endpoint, 需 `load_toolset("styles")`)
- 8 个方法：list, get, update_paint, update_text, update_effect, list_library, get_library_details, import_library

### 图片与矢量
- `set_image_fill` — 设置节点的图片填充（base64 PNG/JPG）
- `export_image` — 图片导出

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

运行 `npm run schema` 重新生成 registry。详见 AGENTS.md "Adding New Tools" 章节。

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

- IMPORTANT: Plugin UI 是纯 HTML/CSS 内联在 ui.html，不使用任何前端框架
- IMPORTANT: Linter 在 Plugin 侧运行（不在 MCP Server 侧），避免通过 WebSocket 传输大量节点数据
- IMPORTANT: DTCG 解析仅在 MCP Server 侧执行，Plugin 只接收已解析的 `DesignToken[]`
- IMPORTANT: 复合类型（typography/shadow）映射为 Figma Style 而非 Variable，因为 Figma Variable 不支持复合类型
- IMPORTANT: `figma.teamLibrary` API 可以枚举 Library Variables，但不能枚举 Library Styles（需 REST API 补充）
- Plugin API 绕过 REST API 的 Enterprise 付费限制，所有 Figma 计划均可使用 Variable 写入
- 批量操作使用 `items[]` + per-item error handling，单项失败不中断批量
- Token 同步是幂等的：第二次执行 created=0
