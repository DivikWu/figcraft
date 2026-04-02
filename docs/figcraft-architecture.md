# FigCraft 技术架构文档

> 版本：2026-04-02 | 状态：存档

---

## 一、FigCraft 在 Figma 中的 UI 创建流程

### 1.1 强制工作流

FigCraft 对所有 AI IDE 强制执行统一的创建流程，通过运行时拦截确保不可跳过：

```
get_mode → _workflow → 设计方案 → ⛔ 用户确认 → create_frame → 验证 → lint_fix_all
```

**详细步骤**：

| 步骤 | 工具调用 | 作用 |
|------|---------|------|
| 1 | `get_mode` | 连接检查 + 返回 `_workflow`（设计 checklist、创建步骤、搜索行为）+ `designContext`（可用 Token/样式）+ `libraryComponents`（组件摘要） |
| 2 | 完成 `_workflow.designPreflight` | 5 项设计 checklist：purpose、platform、language、density、tone |
| 3 | 呈现设计方案 | AI 向用户展示完整设计计划 |
| 4 | ⛔ 等待确认 | **BLOCKING** — 未确认则 Bridge Guard 阻止创建 |
| 5 | `create_frame` + `children` | 声明式创建（Opinion Engine 自动推断） |
| 6 | `export_image` | 视觉验证 |
| 7 | `lint_fix_all` | 39 条规则自动检查 + 修复 |

### 1.2 三场景差异

`get_mode` 根据 `selectedLibrary` 状态返回不同的工作流配置：

| 维度 | 未选库 (`null`) | 本地样式 (`__local__`) | 外部组件库 |
|------|---------------|----------------------|-----------|
| `_workflow.mode` | `design-creator` | `design-guardian` | `design-guardian` |
| 设计规则 | 自选色彩、Design Thinking checklist | 优先本地 Token | 优先库 Token |
| `searchBehavior` | disabled（跳过搜索） | 仅搜本地变量/样式 | 本地 + REST API |
| Token 绑定 | 仅 `tryLocalColorMatch` | 本地变量 + 本地样式 | 全量绑定（颜色 + 间距 + 排版） |
| `libraryComponents` | 无 | 无 | 摘要（variantCount + propertyNames） |

当 `__local__` 模式下无 Token 时，`_workflow` 自动降级：`localTokensEmpty: true`，颜色/排版规则切换为 Creator 模式。

### 1.3 Bridge Guard 运行时拦截

```typescript
// packages/core-mcp/src/bridge.ts:266-280
private static readonly DESIGN_PREFLIGHT_METHODS = new Set([
  'create_frame', 'create_text', 'create_svg',
]);

// 每次调用创建工具时检查
if (DESIGN_PREFLIGHT_METHODS.has(method) && !this._modeQueried) {
  throw new Error('[FigCraft] Cannot call create_frame before get_mode.');
}
```

- `get_mode` 设置 `modeQueried = true`
- `set_mode` 重置 `modeQueried = false`（强制重新调用 `get_mode`）
- **硬性拦截**，非建议性

### 1.4 创建后验证链路

`create_frame` 的响应包含结构化引导字段：

| 字段 | 内容 | AI 应做什么 |
|------|------|-----------|
| `_hints` | 推断列表 `[confidence, field, value, reason]` | 了解哪些参数被自动设置 |
| `_warnings` | 非致命问题（样式未找到等） | 评估是否需要修正 |
| `_inferences` | 完整推断数组 | 检查 ambiguous 推断 |
| `_libraryBindings` | 已绑定的变量/样式 | 确认 Token 绑定结果 |
| `_lintSummary` | 创建后即时 lint | 预警设计违规 |
| `_previewHint` | `"Use export_image()"` | 触发视觉验证 |
| `_children` | 子节点 ID 列表 | 确认结构完整性 |
| `_correctedPayload` | 修正后参数（ambiguous 时） | 用于安全重试 |

---

## 二、Figma 官方 MCP vs FigCraft：创建方式对比

### 2.1 Figma 官方 MCP 的定位

**通用平台工具**。服务所有 Figma 用户（前端开发、设计师、插件开发者），不针对特定场景。核心工具 `use_figma` 暴露完整 Plugin API，AI 写任意 JS 代码执行任何操作。

- 远程 HTTP 端点：`https://mcp.figma.com/mcp`
- 15+ 工具：`use_figma`、`get_design_context`、`get_screenshot`、`search_design_system`、`create_new_file` 等
- 7 个 skills：教 AI 如何正确使用 Plugin API（50+ 已知陷阱）

### 2.2 FigCraft 的定位

**垂直场景产品**。专注"AI 遵循设计规范做设计"，把最常用的操作封装为声明式工具，用 Opinion Engine 自动处理 Figma API 陷阱。

- 本地 stdio MCP Server
- 80+ 声明式工具：`create_frame`（含 Opinion Engine）、`nodes`（端点）、`lint_fix_all` 等
- 39 条 lint 规则 + 设计规则体系 + Token 同步

### 2.3 为什么要自建创建工具

**核心原因：AI 写代码的可靠性远低于 AI 传参数。**

Figma Plugin API 有 50+ 已知陷阱（官方 `gotchas.md` 记录），每一个都是 AI 容易踩的坑：

| 陷阱 | use_figma（AI 必须知道） | create_frame（Opinion Engine 自动处理） |
|------|------------------------|--------------------------------------|
| FILL 必须在 appendChild 后设置 | AI 必须控制代码顺序 | 内部自动先 append 再设 FILL |
| 颜色用 0-1 范围不是 0-255 | AI 必须记住范围转换 | 传 hex 字符串自动转换 |
| 字体必须先 loadFontAsync | AI 必须写加载代码 | 自动并行预加载所有字体 |
| resize 会重置 sizing mode | AI 必须控制调用顺序 | 5 阶段有序执行 |
| HUG 父 + FILL 子 = 坍缩 | AI 必须理解交叉影响 | 自动检测并降级 |
| 变量绑定需要查找 + 匹配 scope | AI 必须写查找代码 | `fillVariableName` 一个参数 |

### 2.4 两者的互补关系

| 场景 | 主力 | 辅助 |
|------|------|------|
| UI 创建（screens, forms, cards） | **FigCraft `create_frame`** | — |
| 设计系统构建 | **FigCraft** (`create_component`, `variables_ep`) | 官方 `figma-generate-library` 工作流参考 |
| 复杂 Plugin API 操作 | **官方 `figma-use`** (debug) | FigCraft `execute_js` (debug toolset) |
| Figma → 代码 | **官方 `figma-implement-design`** | FigCraft `export_image` |
| Code Connect | **官方 `figma-code-connect-components`** | FigCraft `components` 端点 |

FigCraft 没有完全抛弃 `use_figma` 的能力 — `execute_js` 是 FigCraft 版的 `use_figma`，放在 `debug` 工具集中（`load_toolset("debug")`），默认不暴露。

---

## 三、create_frame（声明式）vs execute_js / use_figma

### 3.1 Opinion Engine 自动推断

`create_frame` 内置 10 项自动推断（`write-nodes-create.ts`，1400+ 行）：

| 推断 | 置信度 | 说明 |
|------|--------|------|
| layoutMode | deterministic/ambiguous | 从 padding/spacing/alignment 参数推断 VERTICAL/HORIZONTAL |
| layoutSizing | deterministic | 根据父容器上下文推断 FILL/HUG/FIXED |
| FILL → HUG 降级 | deterministic | 父 HUG + 子 FILL 会坍缩 → 自动降级 |
| 父容器提升 | deterministic/ambiguous | 子元素需要 FILL → 父自动获得 layoutMode |
| textAutoResize | deterministic | 空文本 → HEIGHT; 溢出 → HEIGHT; lineHeight 修复 |
| 空 frame → rectangle | deterministic | 空固定尺寸 frame 降级为 rectangle |
| 字体样式标准化 | deterministic | "700" → "Bold", "SemiBold" → "Semi Bold" |
| 别名标准化 | deterministic | fillVariableName → fill._variable |
| 方向推断 | deterministic | WRAP → HORIZONTAL; name 匹配 row/toolbar → HORIZONTAL |
| 失败清理 | — | 创建失败时自动清理孤立节点 |

### 3.2 Token 自动绑定

| 模式 | 颜色绑定 | 间距绑定 | 排版绑定 |
|------|---------|---------|---------|
| 外部库 | 库 COLOR 变量 + paint style | 库 FLOAT 变量 (by scope) | 库 text style (by fontSize) |
| `__local__` | 本地 COLOR 变量 + paint style | 本地 FLOAT 变量 | 本地 text style |
| 无库 | `tryLocalColorMatch`（尝试匹配） | 不绑定 | 不绑定 |

### 3.3 dryRun 预验证

`create_frame(dryRun: true)` 在不创建节点的情况下验证参数：
- 返回所有推断（deterministic + ambiguous）
- 检测冲突（FILL + 显式 width）
- 提供 `correctedPayload` 用于安全重试
- 零副作用

### 3.4 实际创建对比

**创建一个带文本的卡片**：

**execute_js / use_figma 方式**（~30 行 JS 代码）：
```javascript
const card = figma.createFrame()
card.name = "Card"
card.resize(320, 200)              // ← 必须在设置 sizing 之前
card.layoutMode = "VERTICAL"
card.paddingTop = card.paddingBottom = 16
card.paddingLeft = card.paddingRight = 16
card.itemSpacing = 8
card.cornerRadius = 12
card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]  // ← 0-1 不是 0-255
card.layoutSizingHorizontal = "FIXED"    // ← 必须显式设两轴
card.layoutSizingVertical = "HUG"

await figma.loadFontAsync({ family: "Inter", style: "Regular" })  // ← 必须先加载
const title = figma.createText()
title.characters = "Card Title"
title.fontSize = 18
card.appendChild(title)              // ← 必须先 append
title.layoutSizingHorizontal = "FILL"  // ← 必须在 appendChild 之后

figma.currentPage.appendChild(card)
return { id: card.id }
```

**create_frame 方式**（~10 行 JSON 参数）：
```json
{
  "name": "Card",
  "width": 320,
  "padding": 16,
  "itemSpacing": 8,
  "cornerRadius": 12,
  "fill": "#FFFFFF",
  "children": [
    { "type": "text", "content": "Card Title", "fontSize": 18 }
  ]
}
```

Opinion Engine 自动处理：layoutMode 推断为 VERTICAL、sizing 推断为 HUG、FILL 在 appendChild 后设置、字体自动预加载、hex 自动转 0-1。

### 3.5 各自的适用场景

| 场景 | create_frame | execute_js / use_figma |
|------|-------------|----------------------|
| 创建 UI（screens, forms, cards） | ✅ 主力 | ❌ 不必要 |
| 条件逻辑创建 | ❌ 不支持 | ✅ 需要运行时判断 |
| 批量遍历修改 | ❌ 不支持 | ✅ 需要循环 |
| 未封装的 Plugin API | ❌ 无法覆盖 | ✅ 完整 API |
| 复杂组件变体矩阵 | ❌ 有限 | ✅ 灵活 |
| 出错概率 | 低（Opinion Engine 兜底） | 高（50+ 陷阱） |

**结论**：常见 UI 创建（90%+ 场景）用 `create_frame`，高级/边界场景（~10%）用 `execute_js`。

---

## 四、设计规则三层架构

### 4.1 Layer 0：UI/UX Fundamentals

**文件**：`packages/core-mcp/src/prompts/ui-ux-fundamentals.md`（~45 行）

无论是否有设计系统库，都必须遵守的底层 UI/UX 最佳实践：

| 类别 | 规则 |
|------|------|
| Typography | MUST heading/body 区分, SHOULD ≤3 层级 |
| Spacing | MUST 8dp 基准, SHOULD 组间距 > 组内距 |
| Content | MUST 真实文本, NEVER Lorem ipsum, NEVER placeholder |
| Iconography | MUST 单一风格, SHOULD 笔画一致 |
| Elevation | MUST ≤3 shadow, NEVER 叠加 |
| Composition | MUST 视觉焦点, SHOULD 非对称, NEVER 均匀网格 |
| Quality | NEVER 廉价渐变/辉光, SHOULD 层级化圆角 |
| Accessibility | MUST 4.5:1 对比度, MUST 最小触摸目标 |

### 4.2 Layer 1：Design Guardian / Design Creator

**仅包含各模式独有的规则**，共享规则在 Layer 0：

| | Guardian（有库）| Creator（无库）|
|---|---|---|
| 文件 | `design-guardian.md` (~20 行) | `design-creator.md` (~30 行) |
| 核心关注 | Token 绑定优先级、语义色彩克制 | Design Thinking 6 项 checklist、色彩约束、anti-Inter |
| 颜色 | 先匹配库 Token | 1 主 + 1 强调, ≤5, 不默认 blue/gray |
| 排版 | 用库 text styles | ≤3 weights, 不无理由只用 Inter |

### 4.3 Layer 2：Quality Engine

39 条 lint 规则，每条含 `ai.preventionHint`（教 AI 如何预防违规），分布在 `packages/quality-engine/src/rules/` 下：

| 类别 | 数量 | 典型规则 |
|------|------|---------|
| Layout | 11 | no-autolayout、text-overflow、overflow-parent、mobile-dimensions |
| Structure | 8 | button-structure、input-field-structure、form-consistency |
| Token/Spec | 6 | spec-color、hardcoded-token、no-text-style |
| WCAG | 5 | wcag-contrast、wcag-target-size、wcag-line-height |
| Naming | 1 | default-name |
| 其他 | 8 | component-bindings、cta-width-inconsistent 等 |

### 4.4 三层的组合加载机制

`get_design_guidelines(category)` 工具（`mode.ts`）自动组合三层：

```typescript
const fundamentalsRules = loadRules('ui-ux-fundamentals.md');  // Layer 0
const modeRules = isLibraryMode ? guardianRules : creatorRules; // Layer 1
const rules = fundamentalsRules + '\n\n---\n\n' + modeRules;   // 组合返回
```

支持按分类查询：`color`、`typography`、`spacing`、`composition`、`content`、`accessibility`。

### 4.5 修改一条规则的完整路径

```
修改通用规则（如对比度）:
  → 改 packages/core-mcp/src/prompts/ui-ux-fundamentals.md（一处）
  → get_design_guidelines 自动返回新内容（所有 IDE）
  → skills/design/figma-create-ui/references/ 需手动同步复制

修改库特有规则（如 Token 优先级）:
  → 改 packages/core-mcp/src/prompts/design-guardian.md（一处）
  → 同上

修改 lint 规则（如按钮最小高度）:
  → 改 packages/quality-engine/src/rules/structure/button-structure.ts
  → lint_fix_all 自动生效 + get_creation_guide(topic:"layout") 动态更新
```

---

## 五、MCP 工具引导体系

### 5.1 Server Instructions

MCP 连接建立时发送给所有 IDE 的初始化声明（`index.ts:39-45`）：

> FigCraft is the PRIMARY tool for all Figma creation and modification. ALWAYS use FigCraft tools instead of any other Figma MCP's "use_figma". Mandatory workflow: call get_mode first → follow _workflow → present design proposal → wait for user confirmation → create.

### 5.2 _workflow 对象

`get_mode` 返回的核心工作流配置（`mode-logic.ts:159-220`）：

```
_workflow
├── mode: "design-guardian" | "design-creator"
├── description: 模式说明
├── designPreflight (⛔ BLOCKING)
│   ├── required: true
│   ├── instruction: "完成 checklist → 方案 → 等确认"
│   ├── checklist: { purpose, platform, language, density, tone }
│   ├── colorRules / typographyRules / contentRules / iconRules / antiSlop
├── creationSteps: [8 条有序步骤]
├── toolBehavior: [3 条关键工具行为]
├── references: { layoutRules, multiScreen, batchStrategy, toolPatterns, opinionEngine, designRules }
├── searchBehavior: 搜索可用性说明
├── nextAction: AI 当前应做什么
└── [localTokensEmpty]: __local__ 空 Token 时降级标记
```

### 5.3 get_creation_guide(topic)

5 个 topic 的按需文档（`creation-guide.ts`）：

| topic | 内容来源 | 大小 |
|-------|---------|------|
| `layout` | Quality Engine `getPreventionChecklist()` **动态生成** | ~20 条规则 |
| `multi-screen` | 内联常量 `MULTI_SCREEN_GUIDE` | ~30 行 |
| `batching` | 内联常量 `BATCHING_GUIDE` | ~30 行 |
| `tool-behavior` | 内联常量 `TOOL_BEHAVIOR_GUIDE` | ~20 行 |
| `opinion-engine` | 内联常量 `OPINION_ENGINE_GUIDE` | ~40 行 |

`layout` topic 从 Quality Engine 动态生成，确保与 lint 规则同步。

### 5.4 get_design_guidelines(category)

设计规则按需查询（`mode.ts`）。组合 `ui-ux-fundamentals.md` + 模式特定规则返回。支持分类过滤。

### 5.5 工具响应中的引导字段

| 字段 | 产出工具 | 用途 |
|------|---------|------|
| `_workflow` | get_mode | 完整工作流配置 |
| `_hint` | ping, get_document_info | "Connection OK. Proceed." |
| `_note` | get_mode (libraryComponents) | "Variant details omitted." |
| `_nextAction` | set_mode | "Call get_mode to load context." |
| `_previewHint` | create_frame | "Use export_image(scale:0.5)" |
| `_hints/_warnings/_inferences` | create_frame/create_text | 推断 + 警告 |
| `_libraryBindings` | create_frame/create_text | Token 绑定结果 |
| `_lintSummary` | create_frame, lint_fix_all | Lint 摘要 |

### 5.6 MCP Resources

`design-rules://` URI 提供 lint 规则的按需查询（`design-rules.ts`）：

- `design-rules://all` — 所有规则 + preventionHints
- `design-rules://phase/{layout|structure|content|styling|accessibility}` — 按阶段
- `design-rules://tag/{button|input|screen|text}` — 按元素类型
- `design-rules://constants` — 设计常量（阈值、尺寸）

---

## 六、Skills 体系

### 6.1 目录结构

```
skills/                              ← 项目根目录，所有 IDE 共用
├── README.md
├── figma/                           ← Figma 官方 skills（原版，教 AI 用 Plugin API）
│   ├── figma-use/                   ← Plugin API 参考（含 references/ 13 个文档）
│   ├── figma-generate-design/       ← 设计系统页面组装工作流
│   ├── figma-generate-library/      ← 设计系统构建（含 references/ + scripts/）
│   ├── figma-create-new-file/
│   ├── figma-implement-design/      ← Figma → 代码
│   ├── figma-code-connect-components/
│   └── figma-create-design-system-rules/
└── design/                          ← FigCraft Design skills
    ├── ui-ux-fundamentals/          ← 通用 UI/UX 规则 skill
    └── figma-create-ui/             ← 声明式创建工作流触发器
        └── references/
            ├── ui-ux-fundamentals.md
            ├── design-guardian.md
            └── design-creator.md
```

### 6.2 Figma 官方 Skills（7 个）

从 Figma 官方仓库（`github.com/figma/mcp-server-guide`）复制的原版 skills，**未做修改**。核心假设是 AI 用 `use_figma` 写 Plugin API 代码。

| Skill | 行数 | 用途 |
|-------|------|------|
| `figma-use` | 265 | Plugin API 参考（50+ 陷阱、代码模板、验证流程） |
| `figma-generate-design` | 343 | 设计系统页面组装（组件发现、导入、逐 section 构建） |
| `figma-generate-library` | 316 | 设计系统构建（5 阶段、9 个复用脚本） |
| `figma-implement-design` | 260 | Figma → 代码（1:1 视觉还原） |
| `figma-code-connect-components` | 351 | Code Connect 映射 |
| `figma-create-design-system-rules` | 539 | 规则文件生成 |
| `figma-create-new-file` | 70 | 新建 Figma 文件 |

### 6.3 FigCraft Design Skills（2 个）

| Skill | 内容 | 大小 |
|-------|------|------|
| `ui-ux-fundamentals` | 通用 UI/UX 规则 skill 入口 + key rules 摘要 | ~20 行 |
| `figma-create-ui` | 声明式创建工作流触发器 → MCP 工具引用 | ~25 行 |

`figma-create-ui` 是薄触发器——不包含具体规则，通过 MCP 工具按需获取：
- `get_creation_guide(topic)` → 结构知识
- `get_design_guidelines(category)` → 设计规则
- `readFile references/` → 设计方向文档

### 6.4 Skills 与 MCP 工具的分工

| | Skills（主动注入） | MCP 工具（被动查询） |
|---|---|---|
| 时机 | AI 开始任务前加载 | AI 主动调用获取 |
| 内容 | 工作流编排、触发条件 | 具体规则、动态数据 |
| 优势 | 上下文中直接可见 | 按需加载、不浪费上下文 |
| 依赖 | IDE skill 系统 | MCP 协议（所有 IDE 通用） |

### 6.5 Figma 官方 Skills 对 create_frame 的适用性

| Skill | 对 create_frame 有用？ | 原因 |
|-------|----------------------|------|
| `figma-use` | ❌ | 教 Plugin API 写法，create_frame 不需要 |
| `figma-generate-design` | ✅ 工作流有用 | 设计系统组件发现流程有参考价值 |
| `figma-generate-library` | ✅ 工作流有用 | 设计系统构建流程有参考价值 |
| `figma-implement-design` | ❌ | Figma → 代码方向 |
| `figma-code-connect-components` | ❌ | Code Connect |
| `figma-create-new-file` | ⚠️ 间接 | 创建文件，与创建方式无关 |
| `figma-create-design-system-rules` | ⚠️ 间接 | 规则生成 |

官方 skills 的**工作流知识**有价值，但**操作指令**（use_figma 写代码）不适配 create_frame。

---

## 七、多 IDE 适配架构

### 7.1 各 IDE 配置总览

| IDE | MCP Server | Skills 来源 | Rules 来源 | Skill 机制 |
|-----|-----------|------------|-----------|-----------|
| **Claude Code** | figcraft (本地 stdio) | `.claude/skills` → symlink → `skills/` | `CLAUDE.md` + `AGENTS.md` | 自动发现嵌套目录 |
| **Kiro** | figcraft (本地 stdio) | `.kiro/skills` → symlink → `skills/` | `.kiro/steering/` (14 文件) | `discloseContext()` |
| **Cursor** | figcraft (本地 stdio) | 无 skill 系统 | `AGENTS.md` + `.cursor/rules/figcraft.mdc` | 无 |
| **Codex** | 通过 AGENTS.md 引导 | 无 skill 系统 | `AGENTS.md` | 无 |

### 7.2 AGENTS.md 的角色

**5 IDE 共读的核心文件**（Claude Code、Codex、Cursor、Windsurf、Augment），包含自足内容：

- ⛔ Mandatory Pre-Flight（5 步预检）
- Tool Behavior（8 条工具使用规则）
- Layout & Design Rules（14 条布局规则摘要）
- Multi-Screen Flow / Batching Strategy / Opinion Engine / Design Direction 摘要
- 每段尾部附 MCP 工具引用作为详细入口

### 7.3 .kiro/steering/ 的角色

Kiro 特有的引导层（14 个 md 文件，~1819 行），按加载方式分类：

| 方式 | 文件 | 说明 |
|------|------|------|
| auto | figma-essential-rules.md 等 4 个 | 每次 Figma 对话加载 |
| always | figma-design-preflight.md | 始终加载 |
| manual | multi-screen-flow-guide.md 等 | 用户引用时加载 |
| fileMatch | execute-js-guide.md 等 | 编辑匹配文件时加载 |

### 7.4 .cursor/rules/ 的角色

`.cursor/rules/figcraft.mdc`（`alwaysApply: true`）：指引到 AGENTS.md + 声明 FigCraft 声明式工具优先。

`.cursor/mcp.json`：配置本地 FigCraft MCP Server。

### 7.5 Skills symlink 架构

```
skills/                          ← 唯一源（项目根目录）
  ├── figma/ (7 个官方 skills)
  └── design/ (2 个 FigCraft skills)

.claude/skills → symlink → ../skills    ← Claude Code 读取
.kiro/skills → symlink → ../skills      ← Kiro 读取
```

改一个 skill → 所有 IDE 即时生效。

### 7.6 各 IDE 的完整获取链路

```
Claude Code:
  CLAUDE.md (自动)
  + AGENTS.md (自动)
  + /figma-create-ui skill (按需触发)
  + FigCraft MCP (get_mode → _workflow → get_creation_guide → get_design_guidelines)

Kiro:
  .kiro/steering/ (auto/always)
  + .kiro/skills/ (按需 discloseContext)
  + FigCraft MCP (同上)

Cursor:
  AGENTS.md (自动)
  + .cursor/rules/figcraft.mdc (alwaysApply)
  + FigCraft MCP (同上)

Codex:
  AGENTS.md (自动)
  + FigCraft MCP (同上)
```

---

## 附录：关键文件路径

| 文件 | 作用 |
|------|------|
| `packages/core-mcp/src/index.ts` | MCP Server 入口 + Server Instructions |
| `packages/core-mcp/src/bridge.ts` | WebSocket Bridge + DESIGN_PREFLIGHT guard |
| `packages/core-mcp/src/tools/logic/mode-logic.ts` | `_workflow` 构建逻辑 |
| `packages/core-mcp/src/tools/mode.ts` | get_mode / set_mode / get_design_guidelines 工具 |
| `packages/core-mcp/src/tools/creation-guide.ts` | get_creation_guide 工具（5 topics） |
| `packages/core-mcp/src/resources/design-rules.ts` | MCP Resources（design-rules:// URI） |
| `packages/core-mcp/src/prompts/ui-ux-fundamentals.md` | 通用 UI/UX 规则 |
| `packages/core-mcp/src/prompts/design-guardian.md` | 库模式特有规则 |
| `packages/core-mcp/src/prompts/design-creator.md` | 无库模式特有规则 |
| `packages/adapter-figma/src/handlers/write-nodes-create.ts` | Opinion Engine + 创建逻辑 |
| `packages/quality-engine/src/rules/` | 39 条 lint 规则 |
| `skills/` | 统一 Skills 目录 |
| `AGENTS.md` | 多 IDE 共读规则 |
| `CLAUDE.md` | Claude Code 项目指令 |
| `.cursor/rules/figcraft.mdc` | Cursor 适配 |
| `.kiro/steering/` | Kiro 引导文件 |
