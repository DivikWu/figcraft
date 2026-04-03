# FigCraft 用户使用指导

AI 驱动的 Figma MCP 插件，让 AI 在 IDE 中遵循设计规范做设计。

---

## 1. 产品介绍

FigCraft 通过 MCP 协议桥接 AI IDE 与 Figma，在 IDE 中用自然语言创建 UI、审查设计、同步 Token、Lint 合规检查、自动修复。独立产品，不绑定特定设计系统——任何团队的 Figma Library 或 DTCG Token 文件均可使用。

**架构概览：**

```
IDE (Claude Code / Cursor / Kiro / VS Code / Antigravity / Codex)
    │ MCP (stdio)
    ▼
MCP Server (Node.js)
    │ WebSocket
    ▼
WS Relay (port 3055-3060, auto-switch)
    │ WebSocket
    ▼
Figma Plugin (UI iframe ↔ code.js sandbox)
```

**核心特性：**
- 136 个 MCP 工具覆盖设计全流程
- 38 条 Lint 规则 + 自动修复
- 双模式：Figma 共享库 / DTCG 规范文档
- Opinion Engine 自动推断布局、尺寸、Token 绑定
- 9 种 UI 模板（login、dashboard、checkout 等）
- 200k+ 开源图标、Pexels 图库集成

---

## 2. 快速开始

### 2.1 前置要求

- Node.js >= 20
- Figma 桌面应用

### 2.2 安装 Figma 插件

```bash
git clone https://github.com/DivikWu/figcraft.git
cd figcraft
npm install
npm run build
```

在 Figma Desktop 中：
1. **Plugins → Development → Import plugin from manifest**
2. 选择仓库根目录的 `manifest.json`

> npm 包发布后可直接使用 `npx figcraft-design`，无需 clone。

### 2.3 配置 IDE MCP Server

所有 IDE 的核心配置相同，只是配置文件位置不同：

**Claude Code** — `.mcp.json`：

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "node",
      "args": ["dist/mcp-server/index.js"],
      "cwd": "/your/absolute/path/to/figcraft"
    }
  }
}
```

**Cursor** — `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "node",
      "args": ["dist/mcp-server/index.js"],
      "cwd": "/your/absolute/path/to/figcraft"
    }
  }
}
```

**Kiro** — `.kiro/settings/mcp.json`：

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "node",
      "args": ["dist/mcp-server/index.js"],
      "cwd": "/your/absolute/path/to/figcraft",
      "disabled": false
    }
  }
}
```

**VS Code** — `.vscode/mcp.json`：

```json
{
  "servers": {
    "figcraft": {
      "command": "node",
      "args": ["dist/mcp-server/index.js"],
      "cwd": "/your/absolute/path/to/figcraft"
    }
  }
}
```

**Codex** — `~/.codex/config.toml`：

```toml
[mcp_servers.figcraft]
command = "node"
args = ["dist/mcp-server/index.js"]
cwd = "/your/absolute/path/to/figcraft"
```

> 将 `cwd` 替换为你本地 clone 的绝对路径。

### 2.4 验证连接

1. 在 Figma 中打开插件，确认 UI 显示已连接状态
2. 在 IDE 中调用 `ping` 工具
3. 成功返回文档名称和页面信息即可

**常见问题：**
- 端口被占用：Relay 自动尝试 3055-3060
- 多文档场景：通过 `FIGCRAFT_CHANNEL` 环境变量或 `join_channel` 工具切换

---

## 3. 核心概念

### 3.1 双模式系统

| | Library 模式 | Spec 模式 |
|---|---|---|
| **Token 来源** | Figma 共享库 Variables/Styles | DTCG JSON 文件 |
| **Lint 策略** | 检查节点是否绑定 Library Token | 检查节点值是否匹配 DTCG Token |
| **设计规则** | Design Guardian（严格合规） | Design Creator（引导创意） |
| **适用场景** | 日常设计，团队共享库 | 规范文档验证，Token 同步 |

通过 `set_mode` 切换模式，`get_mode` 获取当前模式和工作流。

**选择建议：**
- 团队有 Figma 共享库 → Library 模式
- 从 DTCG JSON 同步到 Figma → Spec 模式
- 无库无规范，自由设计 → Library 模式（无库时自动降级为 Design Creator）

### 3.2 工具体系

**31 个核心工具**（始终可用）：

| 类别 | 工具 |
|---|---|
| 连接 & 模式 | `ping`, `get_mode`, `set_mode`, `join_channel`, `get_channel` |
| 读取 | `get_current_page`, `get_document_info`, `get_selection`, `list_fonts` |
| 创建 | `create_frame`, `create_text`, `create_svg` |
| 质量 | `lint_fix_all`, `verify_design`, `audit_node`, `get_design_guidelines`, `get_creation_guide` |
| 导出 | `export_image`, `save_version_history` |
| 图标 & 图片 | `icon_search`, `icon_create`, `icon_collections`, `image_search`, `image_preview` |
| 搜索 | `search_design_system`, `text_scan` |
| 元工具 | `load_toolset`, `unload_toolset`, `list_toolsets` |

**13 个可选工具集**（按需加载）：

| 工具集 | 工具数 | 用途 |
|---|---|---|
| `tokens` | 11 | DTCG Token 同步、diff、缓存 |
| `variables` | 7 | Variable/Collection/Mode 管理 |
| `components-advanced` | 16 | 组件创建、变体、属性、审计 |
| `library` | 7 | 浏览/导入共享库资源 |
| `shapes-vectors` | 9 | 基础图形、布尔运算、flatten |
| `styles` | 3 | Paint/Text/Effect Style 管理 |
| `prototype` | 6 | 原型交互、流程分析 |
| `lint` | 6 | 细粒度 Lint 检查/修复 |
| `annotations` | 4 | 标注管理 |
| `pages` | 3 | 页面创建/重命名 |
| `staging` | 4 | 暂存式工作流 |
| `auth` | 3 | Figma OAuth 登录 |
| `debug` | 1 | 执行任意 JS（调试用） |

使用方式：`load_toolset("tokens,components-advanced")` 一次加载多个。

**5 个资源端点**：`nodes`、`text`、`components`、`variables_ep`、`styles_ep`，每个端点支持 get/list/update/delete 等多种方法。

### 3.3 Opinion Engine

内置在 `create_frame` 中的智能推断引擎，自动处理 Figma 布局常见陷阱：

| 推断 | 说明 |
|---|---|
| layoutMode 推断 | 有 padding/spacing/alignment/children 时自动设为 VERTICAL |
| layoutSizing 推断 | auto-layout 子元素：交叉轴 FILL、主轴 HUG |
| FILL → HUG 降级 | 父 HUG + 子 FILL 会导致 0 尺寸，自动降级 |
| 父级提升 | 子元素需要 FILL/HUG 时，自动给父级加 layoutMode |
| FILL+width 冲突检测 | 同时指定 FILL 和固定宽度时报错 |
| Token 自动绑定 | `fillVariableName`/`textStyleName` 自动匹配库中 Variable/Style |
| 字体模糊匹配 | "SemiBold" → "Semi Bold"，"700" → "Bold" |
| 错误清理 | 子节点创建失败时自动删除已创建的孤立节点 |

**dryRun 模式**：`create_frame({ dryRun: true, ... })` 预览所有推断结果，不实际创建节点。

### 3.4 质量引擎

38 条 Lint 规则，覆盖 5 个类别：

| 类别 | 规则数 | 检查内容 |
|---|---|---|
| Token | 6 | 硬编码颜色/字号、未绑定 Library Token |
| WCAG | 5 | 对比度 ≥4.5:1、触摸目标 ≥44px、文字 ≥12px |
| Layout | 24 | 按钮/输入框结构、表单一致性、空容器、文本溢出、缺少 auto-layout、嵌套深度、Header 碎片化 |
| Naming | 2 | 默认名称 "Frame"、占位文本 "Lorem ipsum" |
| Component | 1 | 组件实例引用有效性 |

**使用方式：**
- `lint_fix_all` — 一键检查 + 自动修复所有可修复项
- `verify_design` — lint + 截图，一步完成验证
- `audit_node` — 对单个节点做深度审计

---

## 4. 功能详解与使用场景

### 4.1 UI 创建

**单元素创建：** 用自然语言描述组件，AI 通过 `create_frame` + `children` 声明式创建。

```
"创建一个主要按钮，蓝色背景白色文字，圆角 8px"
```

**整屏创建：** 9 种内置 UI 模板，每种包含节点层级、布局决策、常见陷阱、3 种风格变体（minimal / warm / bold）：

- `login` — 登录页
- `signup` — 注册页
- `onboarding` — 引导页
- `dashboard` — 仪表盘
- `list-detail` — 列表-详情
- `settings` — 设置页
- `profile` — 个人资料页
- `card-grid` — 卡片网格
- `checkout` — 结账流程

通过 `get_creation_guide(topic:"ui-patterns", uiType:"dashboard")` 获取模板指导。

**多屏流程：** 四级层级结构 Wrapper → Flow Row → Stage → Screen，通过 `get_creation_guide(topic:"multi-screen")` 获取指导。

**响应式设计：** 移动端(375px) / 平板(768px) / 桌面(1280px) 断点策略，通过 `get_creation_guide(topic:"responsive")` 获取。

**内容状态：** 空状态、加载骨架、错误状态的模式和代码示例，通过 `get_creation_guide(topic:"content-states")` 获取。

### 4.2 设计审查与修复

| 场景 | 工具 | 说明 |
|---|---|---|
| 全页质量检查 | `lint_fix_all` | 检查 + 自动修复所有可修复违规 |
| 创建后验证 | `verify_design` | lint + 截图，一步完成 |
| 深度审计 | `audit_node` | 对单节点运行所有规则 + 设计规范检查 |
| 预览修复 | `lint_fix_all(dryRun:true)` | 只报告，不实际修复 |

**常见违规示例：**
- 硬编码 `#333333` 而非绑定 `text/primary` Token → `hardcoded-token`
- 按钮高度 32px 不满足 44px 触摸目标 → `wcag-target-size`
- Frame 命名为 "Frame 1" → `default-name`
- 容器内 2+ 子元素未设 auto-layout → `no-autolayout`

### 4.3 Token 管理

需先加载工具集：`load_toolset("tokens")`

| 操作 | 工具 | 说明 |
|---|---|---|
| JSON → Figma | `sync_tokens` | DTCG JSON 同步为 Figma Variables/Styles |
| 查看差异 | `diff_tokens` | 对比 JSON 与 Figma 现有 Token |
| Figma → JSON | `reverse_sync_tokens` | 从 Figma 导出为 DTCG JSON |
| 缓存管理 | `cache_tokens` / `list_cached_tokens` | Token 缓存操作 |

**类型映射：**

| DTCG $type | Figma 目标 |
|---|---|
| `color` | Variable (COLOR) |
| `dimension` / `number` | Variable (FLOAT) |
| `fontFamily` | Variable (STRING) |
| `typography` | Text Style（复合类型） |
| `shadow` | Effect Style（复合类型） |

### 4.4 组件操作

需先加载：`load_toolset("components-advanced")`

- 创建组件和组件集（Component Set + Variants）
- 管理组件属性（Boolean、Text、Instance Swap 等）
- 审计组件健康度
- 从共享库导入组件实例

### 4.5 图标与图片

**图标**（200k+ 开源图标，来自 Iconify）：
1. `icon_search("home")` — 搜索图标
2. `icon_create("lucide:home", size: 24)` — 创建图标节点

常用图标集：`lucide`、`mdi`、`tabler`、`heroicons`、`ph`

**图片**（Pexels 图库）：
1. `image_search("sunset")` — 搜索图片
2. `create_frame({ imageUrl: "pexel:<id>" })` — 以图片填充 Frame

### 4.6 原型与交互

需先加载：`load_toolset("prototype")`

- `analyze_prototype_flow` — 解析原型流程为交互规格
- 管理页面间导航和交互动作
- 生成 Mermaid 流程图

### 4.7 节点操作

通过 `nodes` 端点统一操作：

```
nodes(method: "get", nodeId: "123:456")       // 获取节点信息
nodes(method: "list", types: ["TEXT"])          // 列出文本节点
nodes(method: "update", patches: [...])        // 批量更新
nodes(method: "clone", items: [...])           // 克隆节点
nodes(method: "reparent", items: [...])        // 移动节点
nodes(method: "delete", nodeId: "123:456")     // 删除节点
```

---

## 5. 最佳实践

### 5.1 推荐创建工作流

```
1. get_mode                    ← 获取模式、Token、workflow
2. designPreflight checklist    ← purpose / platform / language / density / tone
3. 向用户提出设计方案            ← 等待确认后再创建
4. create_frame + children      ← 声明式一次性创建整个层级
5. export_image(scale: 0.5)     ← 视觉验证
6. lint_fix_all                 ← 质量检查 + 自动修复
7. 迭代修复                     ← 根据 lint 结果调整
```

### 5.2 Library 模式技巧

- 用 `search_design_system("button")` 先找现有组件，避免重复造轮子
- 用 `fillVariableName: "primary"` 让 Opinion Engine 自动绑定 Token
- 用 `textStyleName: "Heading/Large"` 自动匹配文字样式
- mode-aware 变量自动支持 Light/Dark 模式切换

### 5.3 大规模设计技巧

- **批量 vs 逐个**：骨架布局用 `items[]` 批量创建，复杂填充逐个处理
- **预检**：复杂布局先 `dryRun:true` 预览 Opinion Engine 推断
- **多屏流程**：按 Wrapper → Flow Row → Stage → Screen 分阶段构建
- **并行调用**：多个独立的 `nodes(method:"get")` 可在同一消息中并行

---

## 6. IDE Skills 优化指南

### 6.1 什么是 Skills

Skills 是 IDE 中预配置的 prompt 模板，将多步操作封装为一条命令。不同 IDE 的实现方式略有差异：

- **Claude Code**：`/skill-name` slash command
- **Cursor**：`.cursorrules` 或自定义 prompt
- **Kiro**：`.kiro/skills/` 目录下的 skill 文件

### 6.2 推荐 Skill 配置

**UI 创建 Skill**：
```
流程：get_mode → designPreflight → 提出方案 → 等待确认 → create_frame → export_image → lint_fix_all
```

**设计审查 Skill**：
```
流程：lint_fix_all(dryRun:true) → 报告违规 → 确认修复 → lint_fix_all → verify_design
```

**Token 同步 Skill**：
```
流程：load_toolset("tokens") → diff_tokens → 确认差异 → sync_tokens → 验证结果
```

**组件审计 Skill**：
```
流程：load_toolset("components-advanced") → audit_components → 报告问题 → 修复建议
```

### 6.3 自定义 Skill 编写技巧

**核心原则：规则在 MCP 工具中维护，Skill 只做流程编排。**

- 用 `get_creation_guide(topic)` 获取运行时指导，不在 Skill 中硬编码规则
- 用 `get_mode._workflow` 动态获取当前模式的完整工作流步骤
- 用 `get_design_guidelines(category)` 按需加载设计规则
- 好处：MCP 工具更新规则后，所有 IDE 的 Skill 自动获取最新版本

**反模式：** 不要在 Skill 中写死颜色值、间距规则、布局约束——这些全部由 `get_mode` 和 `get_design_guidelines` 运行时提供。

### 6.4 autoApprove 配置建议

在 IDE 配置中设置 `autoApprove` 可避免每次工具调用的手动确认弹窗：

**安全级别分类：**

| 级别 | 工具示例 | 建议 |
|---|---|---|
| 只读（零风险） | `ping`, `get_mode`, `get_current_page`, `list_toolsets`, `get_selection` | 始终 autoApprove |
| 创建（可撤销） | `create_frame`, `create_text`, `icon_create`, `load_toolset` | 推荐 autoApprove |
| 修改（可逆但需注意） | `nodes(update)`, `lint_fix_all`, `set_mode` | 按需 autoApprove |
| 删除（不可逆） | `nodes(delete)`, `delete_variable` | 谨慎考虑 |

> 完整 autoApprove 列表可参考项目根目录 `.mcp.json` 中的配置。

---

## 7. 环境变量与高级配置

| 变量 | 默认值 | 说明 |
|---|---|---|
| `FIGCRAFT_CHANNEL` | `figcraft` | Channel ID，单文档零配置，多文档按需设置 |
| `FIGCRAFT_RELAY_PORT` | `3055` | Relay 端口，被占用时自动切换至 3056-3060 |
| `FIGCRAFT_RELAY_URL` | `ws://localhost:3055` | Relay 地址 |
| `FIGCRAFT_ACCESS` | `edit` | 访问控制：`read` / `create` / `edit` |
| `FIGMA_API_TOKEN` | — | Figma Personal Access Token（可选） |
| `FIGMA_CLIENT_ID` | — | OAuth Client ID（可选） |
| `FIGMA_CLIENT_SECRET` | — | OAuth Client Secret（可选） |

**访问控制：**
- `read`：仅读取操作
- `create`：读取 + 创建新内容
- `edit`：完全访问（默认）

**Figma API Token 优先级：**
1. 环境变量 `FIGMA_API_TOKEN`
2. 插件面板输入框（存储在 Figma clientStorage）
3. OAuth 登录（`figma_login` 工具）

**多文档路由：** 每个 Figma 文档会话有独立 channel。通过 `join_channel` 工具或 `FIGCRAFT_CHANNEL` 环境变量切换。

---

## 8. 故障排查

| 问题 | 原因 | 解决方案 |
|---|---|---|
| `ping` 无响应 | Plugin 未连接 Relay | 确认 Figma 中插件已打开且显示已连接 |
| 端口被占用 | 其他进程使用 3055 | Relay 自动切换 3055-3060，无需手动处理 |
| 频繁 eviction 警告 | 多个 MCP Server 连同一 channel | 检查 `.mcp.json` 等配置文件是否有重复 figcraft 配置 |
| 工具不可用 | 工具集未加载 | `list_toolsets` 查看 → `load_toolset("xxx")` 加载 |
| Lint 规则报 warning 而非 error | 无 Token/Library | Token 规则在无规范时自动降级严重度 |
| IDE 报 "Cannot find name 'figma'" | Plugin 全局变量 | 正常现象，Figma 运行时注入的全局变量 |
| 创建工具报 "call get_mode first" | 未执行 designPreflight | 在创建前先调用 `get_mode` |

---

## 9. 附录

### 9.1 可选工具集速查

```
load_toolset("tokens")                # Token 同步
load_toolset("variables")             # Variable 管理
load_toolset("components-advanced")   # 高级组件操作
load_toolset("library")               # 共享库浏览/导入
load_toolset("shapes-vectors")        # 基础图形
load_toolset("styles")                # Style 管理
load_toolset("prototype")             # 原型交互
load_toolset("lint")                  # 细粒度 Lint
load_toolset("annotations")           # 标注管理
load_toolset("pages")                 # 页面管理
load_toolset("staging")               # 暂存工作流
load_toolset("auth")                  # OAuth 登录
load_toolset("debug")                 # 调试用 JS 执行
```

### 9.2 UI 模板速查

| 模板 | 用途 | 风格变体 |
|---|---|---|
| `login` | 登录页 | minimal / warm / bold |
| `signup` | 注册页 | minimal / warm / bold |
| `onboarding` | 引导流程 | minimal / warm / bold |
| `dashboard` | 数据仪表盘 | minimal / warm / bold |
| `list-detail` | 列表-详情 | minimal / warm / bold |
| `settings` | 设置页 | minimal / warm / bold |
| `profile` | 个人资料 | minimal / warm / bold |
| `card-grid` | 卡片网格 | minimal / warm / bold |
| `checkout` | 结账流程 | minimal / warm / bold |

使用：`get_creation_guide(topic:"ui-patterns", uiType:"dashboard")`

### 9.3 创建指南主题速查

| 主题 | 说明 |
|---|---|
| `layout` | 20+ 布局结构规则 |
| `multi-screen` | 多屏流程层级与构建顺序 |
| `responsive` | 移动/平板/桌面断点策略 |
| `content-states` | 空状态/加载/错误模式 |
| `batching` | 批量 vs 逐个创建策略 |
| `tool-behavior` | 工具使用模式与并行化 |
| `opinion-engine` | 自动推断机制详解 |
| `ui-patterns` | 9 种 UI 模板（需指定 uiType） |

使用：`get_creation_guide(topic:"layout")`

### 9.4 DTCG → Figma 类型映射

| DTCG $type | Figma 目标 | Scope |
|---|---|---|
| `color` | Variable (COLOR) | ALL_FILLS + STROKE_COLOR + EFFECT_COLOR |
| `dimension` / `number` | Variable (FLOAT) | 按名称推断：radius→CORNER_RADIUS, spacing→GAP |
| `fontFamily` | Variable (STRING) | FONT_FAMILY |
| `fontWeight` | Variable (FLOAT) | FONT_WEIGHT |
| `boolean` | Variable (BOOLEAN) | ALL_SCOPES |
| `typography` | Text Style | 复合类型，拆解为独立 Variable + Style |
| `shadow` | Effect Style | 复合类型 |
