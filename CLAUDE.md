# Project: FigCraft

AI 驱动的 Figma 插件，让 AI 遵循设计规范做设计。通过 MCP 协议桥接 IDE 与 Figma，支持两种规范来源（Figma 共享库 / DTCG 设计规范文档），提供 Token 同步、规范 Lint、自动修复、元素生成等能力。

独立产品，不绑定任何特定设计系统。任何团队的 DTCG Token 文件或 Figma Library 均可使用。

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

## MCP 工具清单 (65+)

### 基础
- `ping` — 测试连通性

### 读取 (P1)
- `get_node_info` / `get_current_page` / `get_document_info` / `get_selection` / `search_nodes` — 节点读取
- `list_fonts` — 枚举可用字体族及字重（创建文字前查询）
- `list_variables` / `get_variable` / `list_collections` — Variables
- `list_styles` / `get_style` — Styles
- `list_library_collections` / `list_library_variables` / `import_library_variable` — Team Library Variables
- `list_library_styles` / `get_library_style_details` / `import_library_style` — Team Library Styles（REST API，需 FIGMA_API_TOKEN）
- `export_image` — 图片导出

### 写入 (P2)
- `create_frame` / `create_text` / `create_rectangle` / `create_ellipse` / `create_line` / `create_section` / `create_document` / `patch_nodes` / `delete_node` / `clone_node` / `insert_child` / `boolean_operation` — 节点 CRUD
- `set_image_fill` — 设置节点的图片填充（base64 PNG/JPG）
- `create_vector` — 从 SVG 字符串创建矢量节点
- `create_star` / `create_polygon` — 星形/多边形
- `flatten_node` — 将节点扁平化为单一矢量
- `save_version_history` — 创建命名版本历史快照（AI 迭代设计前的 checkpoint）- `create_variable` / `update_variable` / `delete_variable` — Variable CRUD
- `create_collection` / `delete_collection` / `rename_collection` — Collection 管理
- `add_collection_mode` / `rename_collection_mode` / `remove_collection_mode` — Mode 管理
- `list_tokens` / `sync_tokens` / `sync_tokens_multi_mode` / `diff_tokens` / `reverse_sync_tokens` — DTCG Token 同步（含多模式）
- `list_components` / `get_component` / `create_component` / `update_component` / `delete_component` — Component CRUD
- `list_component_properties` — 枚举组件暴露的属性和变体选项
- `create_component_set` — 将多个 Component 合并为 Variant Set
- `create_instance` / `swap_instance` / `detach_instance` / `reset_instance_overrides` — Instance 管理
- `get_instance_overrides` / `set_instance_overrides` — Override 读取与批量传播
- `add_component_property` / `update_component_property` / `delete_component_property` — 组件属性管理
- `audit_components` — 组件结构审计（缺失描述、未暴露文本、空组件等）
- `create_variable_alias` — 变量别名（语义 Token 引用原始 Token）
- `export_variables` — 导出 Figma 变量为 DTCG 兼容格式
- `batch_create_variables` — 批量创建变量（内存数组 → Figma Variables）
- `reverse_sync_tokens` — 反向同步（Figma Variables → DTCG JSON 文件）
- `update_paint_style` / `update_text_style` / `update_effect_style` — Style 更新
- `cache_tokens` / `list_cached_tokens` / `delete_cached_tokens` — Token 缓存

### 注解 (P2)
- `get_annotations` — 读取当前页面或指定节点的所有注解
- `set_annotation` — 在节点上添加/覆盖注解（支持 Markdown）
- `set_multiple_annotations` — 批量注解多个节点

### 图片与矢量 (P2)
- `set_image_fill` — 设置节点的图片填充（base64 PNG/JPG，支持 FILL/FIT/CROP/TILE 模式）
- `create_vector` — 从 SVG 字符串创建矢量节点
- `create_star` — 创建星形（可配置角数和内径比）
- `create_polygon` — 创建正多边形（三角形、五边形等）
- `flatten_node` — 将节点扁平化为单一矢量路径

### Lint (P3)
- `lint_check` — 运行 Lint 规则（支持分页、注解、按类别过滤）
- `lint_fix` — 自动修复可修复的违规
- `lint_fix_all` — 一键扫描 + 自动修复所有可修复项
- `lint_rules` — 列出可用规则（含类别和严重级别）
- `clear_annotations` — 清除 Lint 注解
- `compliance_report` — 综合合规报告（Lint + 组件审计 + 评分）

### 原型流分析 (P4)
- `analyze_prototype_flow` — 分析原型交互，生成流程图（Mermaid）+ 交互文档（Markdown）+ 结构化有向图

### 模式 (P4)
- `get_mode` / `set_mode` — 切换 library/spec 模式

### MCP Prompts (8)
- `sync-tokens` / `lint-page` / `compare-spec` / `auto-fix` / `generate-element` / `review-design` / `prototype-flow` / `document-components`

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

所有 handler 通过 `registerHandler(method, handler)` 注册到全局 Map。handler 文件通过 import 副作用自动注册：

```typescript
// packages/adapter-figma/src/handlers/nodes.ts
import { registerHandler } from '../code.js';

registerHandler('get_node_info', async (params) => {
  // ... Figma API 调用
});
```

添加新 handler 时：
1. 在 `packages/adapter-figma/src/handlers/` 创建文件
2. 使用 `registerHandler` 注册方法
3. 在 `packages/adapter-figma/src/code.ts` 中添加 `import './handlers/xxx.js'`
4. 在 `packages/core-mcp/src/tools/` 创建对应的 MCP 工具包装

## 添加新 MCP 工具

```typescript
// packages/core-mcp/src/tools/xxx.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerXxxTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'tool_name',
    'Tool description for AI.',
    { param: z.string().describe('Param description') },
    async ({ param }) => {
      const result = await bridge.request('handler_method', { param });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
```

然后在 `packages/core-mcp/src/index.ts` 中导入并调用对应注册逻辑。

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
