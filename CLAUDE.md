# Project: figcraft

AI 驱动的 Figma 插件，让 AI 遵循设计规范做设计。通过 MCP 协议桥接 IDE 与 Figma，支持两种规范来源（Figma 共享库 / DTCG 设计规范文档），提供 Token 同步、规范 Lint、自动修复、元素生成等能力。

独立产品，不绑定任何特定设计系统。任何团队的 DTCG Token 文件或 Figma Library 均可使用。

## Stack

- TypeScript (strict, ESM)
- MCP Server: @modelcontextprotocol/sdk + stdio transport
- WebSocket Relay: ws (port 3055)
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
```

## Architecture

### 三组件中继架构

```
IDE (Claude/Cursor)
    │ MCP (stdio)
    ▼
MCP Server (Node.js)           ← src/mcp-server/
    │ WebSocket
    ▼
WS Relay (port 3055)           ← src/relay/
    │ WebSocket
    ▼
Figma Plugin
    ├─ UI iframe                ← src/plugin/ui.html
    │     │ postMessage              (WebSocket 连接 + 消息桥接)
    │     ▼
    └─ code.js sandbox          ← src/plugin/code.ts
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
├── CLAUDE.md                       # 本文件
├── package.json
├── tsconfig.json                   # Server 端 TS 配置 (NodeNext)
├── tsconfig.plugin.json            # Plugin 端 TS 配置 (bundler)
├── tsup.config.ts                  # 全量构建
├── tsup.plugin.config.ts           # Plugin IIFE 构建
├── tsup.server.config.ts           # Server + Relay 构建
├── manifest.json                   # Figma 插件清单
│
├── src/
│   ├── shared/                     # MCP Server 和 Plugin 共享类型
│   │   ├── protocol.ts             # WebSocket 消息类型、UUID、超时/心跳常量
│   │   └── types.ts                # DesignToken, SyncResult, LintReport, CompressedNode 等
│   │
│   ├── relay/
│   │   └── index.ts                # WebSocket Relay — channel-based pub/sub, 心跳
│   │
│   ├── mcp-server/
│   │   ├── index.ts                # 入口 — 注册 30+ 工具 + 5 Prompts + stdio transport
│   │   ├── bridge.ts               # WebSocket 客户端 — UUID 追踪 + 30s 超时 + 自动重连
│   │   ├── dtcg.ts                 # W3C DTCG 格式解析器（仅 Server 端）
│   │   ├── tools/                  # MCP 工具（每个文件注册一组相关工具）
│   │   │   ├── ping.ts             # 连通性测试
│   │   │   ├── nodes.ts            # 节点读取（压缩、搜索）
│   │   │   ├── write-nodes.ts      # 节点写入（Frame、Text、批量更新、删除）
│   │   │   ├── variables.ts        # Variables 读取
│   │   │   ├── styles.ts           # Styles 读取
│   │   │   ├── library.ts          # Team Library Variables 读取 + 导入
│   │   │   ├── export.ts           # 图片导出 (PNG/SVG/PDF/JPG)
│   │   │   ├── tokens.ts           # DTCG Token 列表/同步/对比
│   │   │   ├── components.ts       # Component/Instance CRUD
│   │   │   ├── storage.ts          # clientStorage Token 缓存
│   │   │   ├── lint.ts             # Lint 检查/修复/规则/注解
│   │   │   └── mode.ts             # Library/Spec 模式切换
│   │   └── prompts/
│   │       └── index.ts            # 5 个 MCP Prompts（sync-tokens, lint-page, compare-spec, auto-fix, generate-element）
│   │
│   └── plugin/
│       ├── code.ts                 # Plugin sandbox 入口 — Handler 注册表 + 消息路由
│       ├── ui.html                 # Plugin UI — WebSocket 连接 + channel 显示 + 消息日志
│       ├── handlers/               # 命令处理器（通过 registerHandler 注册，import 即生效）
│       │   ├── nodes.ts            # 节点读取
│       │   ├── write-nodes.ts      # 节点写入
│       │   ├── variables.ts        # Variables 读取
│       │   ├── write-variables.ts  # Variables 写入 + Token 同步
│       │   ├── styles.ts           # Styles 读取
│       │   ├── write-styles.ts     # Styles 写入（typography/shadow → TextStyle/EffectStyle）
│       │   ├── library.ts          # Team Library 读取
│       │   ├── components.ts       # Component/Instance CRUD
│       │   ├── export.ts           # 图片导出
│       │   ├── storage.ts          # clientStorage 缓存
│       │   ├── lint.ts             # Lint 执行 + 自动修复 + 注解
│       │   └── scan.ts             # 样式扫描/Token 导出/对比
│       ├── adapters/               # 数据适配层
│       │   ├── node-simplifier.ts  # Figma 节点 → 压缩 JSON（~90% 压缩）
│       │   ├── variable-mapper.ts  # DTCG Token ↔ Figma Variable（类型转换 + scope 推断）
│       │   └── style-mapper.ts     # DTCG 复合类型 ↔ Figma Style（typography → TextStyle, shadow → EffectStyle）
│       ├── linter/                 # Lint 规则引擎（在 Plugin 侧运行，避免节点数据序列化开销）
│       │   ├── engine.ts           # 规则执行器 + 分页
│       │   ├── types.ts            # AbstractNode, LintRule, LintViolation, LintContext
│       │   └── rules/
│       │       ├── spec-color.ts         # 硬编码颜色 vs Token（精确 + 近似匹配）
│       │       ├── spec-typography.ts    # 字体属性 vs Typography Token
│       │       ├── spec-spacing.ts       # padding/gap vs Spacing Token
│       │       ├── spec-border-radius.ts # cornerRadius vs Radius Token
│       │       ├── wcag-contrast.ts      # WCAG AA 对比度 (4.5:1 / 3:1)
│       │       └── wcag-target-size.ts   # 交互元素 ≥ 44×44px
│       └── utils/
│           ├── batch.ts            # 批量操作（items[] + per-item error handling）
│           └── color.ts            # 颜色转换（hex ↔ Figma RGBA, 对比度计算）
│
└── dist/                           # 构建输出（.gitignore）
```

## 双模式操作

手动切换，通过 `set_mode` / `get_mode` 工具：

| 模式 | Token 来源 | Lint 检查方式 | 典型场景 |
|------|-----------|-------------|---------|
| **library** | Figma 共享库 Variables/Styles | 检查节点是否绑定了 Library Variable/Style | 设计师日常设计，使用团队共享库 |
| **spec** | DTCG JSON 文件 | 检查节点值是否匹配 DTCG Token 值 | 从设计规范文档同步，验证合规性 |

## MCP 工具清单 (30+)

### 基础
- `ping` — 测试连通性

### 读取 (P1)
- `get_node_info` / `get_current_page` / `get_document_info` / `get_selection` / `search_nodes` — 节点读取
- `list_variables` / `get_variable` / `list_collections` — Variables
- `list_styles` / `get_style` — Styles
- `list_library_collections` / `list_library_variables` / `import_library_variable` — Team Library
- `export_image` — 图片导出

### 写入 (P2)
- `create_frame` / `create_text` / `patch_nodes` / `delete_node` / `clone_node` — 节点 CRUD
- `list_tokens` / `sync_tokens` / `diff_tokens` — DTCG Token 同步
- `list_components` / `get_component` / `create_instance` / `swap_instance` / `detach_instance` / `reset_instance_overrides` — Component/Instance
- `cache_tokens` / `list_cached_tokens` / `delete_cached_tokens` — Token 缓存

### Lint (P3)
- `lint_check` — 运行 Lint 规则（支持分页、注解）
- `lint_fix` — 自动修复可修复的违规
- `lint_rules` — 列出可用规则
- `clear_annotations` — 清除 Lint 注解

### 模式 (P4)
- `get_mode` / `set_mode` — 切换 library/spec 模式

### MCP Prompts (5)
- `sync-tokens` / `lint-page` / `compare-spec` / `auto-fix` / `generate-element`

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
// src/plugin/handlers/nodes.ts
import { registerHandler } from '../code.js';

registerHandler('get_node_info', async (params) => {
  // ... Figma API 调用
});
```

添加新 handler 时：
1. 在 `src/plugin/handlers/` 创建文件
2. 使用 `registerHandler` 注册方法
3. 在 `src/plugin/code.ts` 中添加 `import './handlers/xxx.js'`
4. 在 `src/mcp-server/tools/` 创建对应的 MCP 工具包装

## 添加新 MCP 工具

```typescript
// src/mcp-server/tools/xxx.ts
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

然后在 `src/mcp-server/index.ts` 中导入并调用 `registerXxxTools(server, bridge)`。

## 添加新 Lint 规则

1. 在 `src/plugin/linter/rules/` 创建文件，实现 `LintRule` 接口
2. 在 `src/plugin/linter/engine.ts` 的 `ALL_RULES` 数组中注册
3. `check()` 方法接收 `AbstractNode`（与 Figma API 解耦），返回 `LintViolation[]`
4. 设置 `autoFixable: true` + `fixData` 以支持自动修复
5. 在 `src/plugin/handlers/lint.ts` 的 `lint_fix` handler 中添加对应的修复逻辑

## IDE 诊断说明

Plugin 文件（`src/plugin/**`）中的 `figma`、`__html__` 等全局变量会在 IDE 中显示 "Cannot find name" 错误。这是正常的——这些全局变量由 Figma Plugin 运行时注入，`@figma/plugin-typings` 提供类型定义，Plugin 使用独立的 `tsconfig.plugin.json`。

Server 端类型检查命令：`npm run typecheck`（使用主 `tsconfig.json`，排除 plugin 文件）。

## 环境变量

```env
FIGCRAFT_RELAY_URL=ws://localhost:3055    # Relay 地址（默认）
FIGCRAFT_RELAY_PORT=3055                  # Relay 端口（默认）
FIGCRAFT_CHANNEL=default                  # 默认 channel（通常由 Plugin UI 动态生成）
```

## 运行方式

### 开发

```bash
# 终端 1: 启动 Relay
npm run dev:relay

# 终端 2: 在 Figma 桌面应用中加载插件
# Plugins → Development → Import plugin from manifest → 选择 manifest.json
# （需要先 npm run build:plugin 构建 dist/plugin/）

# IDE 中配置 MCP Server:
# {
#   "mcpServers": {
#     "figcraft": {
#       "command": "npx",
#       "args": ["tsx", "src/mcp-server/index.ts"],
#       "cwd": "/path/to/figcraft",
#       "env": { "FIGCRAFT_CHANNEL": "<Plugin UI 显示的 channel ID>" }
#     }
#   }
# }
```

### 端到端验证

1. `npm run dev:relay` → Relay 启动，监听 :3055
2. Figma 中打开插件 → UI 显示 "Connected"，展示 channel ID
3. IDE 启动 MCP Server（带正确 channel） → `ping` 工具返回文档名称和页面信息

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
