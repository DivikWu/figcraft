# FigCraft — Figma 规则体系架构文档

## 概述

FigCraft 的 Figma 设计规则分为四层，每层职责明确、互不重叠。规则通过不同的加载机制在不同时机注入模型 context，确保在最小 context 成本下覆盖所有质量维度。

```
Layer 0  审美方向        design-creator.md / design-guardian.md
Layer 1  执行规则        Steering 文件（auto / fileMatch / manual）
Layer 2  领域知识        Skills（按需 discloseContext）
Layer 3  自动兜底        Quality Engine（lint_fix_all / audit_node）
```

---

## Layer 0：审美方向（design-creator / design-guardian）

### 文件

| 文件 | 行数 | 场景 |
|------|------|------|
| `packages/core-mcp/src/prompts/design-creator.md` | ~73 | 无设计系统库时 |
| `packages/core-mcp/src/prompts/design-guardian.md` | ~61 | 有设计系统库时 |

### 职责

只管审美决策，不管布局结构、API 调用、代码模板。

- **Creator（无库）**：Design Thinking 前置清单、配色约束（≤5色、60%主色）、字体选择（不能无理由只用 Inter）、Anti-AI Slop、Composition、Complexity Matching
- **Guardian（有库）**：Spec Priority（先匹配库 token）、Quality（克制用色）、Typography（用库的 text styles）

### 加载方式

两种路径，取决于环境：

1. **Kiro 环境**：通过 `figma-essential-rules.md` Workflow 步骤 2 的 `readFile` 加载。模型先调 `get_mode` 判断有库/无库，再 readFile 对应文件。
2. **非 Kiro 环境**（Claude Code、Cursor 等）：通过 `get_design_guidelines` MCP 工具返回。根据当前模式自动返回 Creator 或 Guardian。

### 调用时机

- UI 创建任务开始前（Workflow 步骤 2）
- 非创建任务（inspect、lint、audit、token sync）跳过

---

## Layer 1：Steering 文件

### 自动加载（auto）— 每次 Figma 对话都在 context 中

| 文件 | 行数 | 作用 |
|------|------|------|
| `figma-essential-rules.md` | ~188 | **核心入口**。包含 15 条 execute_js Critical Rules、9 条 Layout & Quality Rules、Sizing Defaults 表、Context Budget 策略（含 Skill 加载禁止/允许清单）、12 步 Workflow（含 Step 0 Context Budget Gate）、Multi-Screen Flow PRESET 规则、Templates、Reference Docs 索引 |
| `figcraft.md` | ~31 | FigCraft MCP 工具使用指南。`use_figma` 不可用说明、Page Operation Order、Dual Mode |

**常驻 context 成本：~219 行**

### 条件加载（fileMatch）— 编辑 FigCraft 源码时

| 文件 | 行数 | fileMatchPattern | 作用 |
|------|------|-----------------|------|
| `execute-js-guide.md` | ~189 | `packages/adapter-figma/**,packages/core-mcp/src/tools/**` | execute_js 详细指南。Key Rules 引用 essential-rules，独有内容：When to Use execute_js vs Other Tools、Incremental Workflow 详细版、Error Handling、Step Order（Single/Multi/Large 三种）、Section Creation Strategy（含完整代码示例）、Post-Creation Lint、Anti-Patterns |
| `figma-generate-design.md` | ~172 | 同上 | 有设计系统时的页面组装工作流。覆盖 skill 的 Step 3-5，适配 FigCraft 的 execute_js + load_toolset |
| `figma-generate-library.md` | ~98 | 同上 | 建设计系统的多阶段工作流。覆盖 skill 的 FigCraft 适配版 |
| `figma-layout.md` | ~29 | `packages/adapter-figma/src/handlers/write-nodes*,...` | write-nodes 实现注意事项 |
| `ui-spacing.md` | ~30 | `packages/adapter-figma/src/ui.html,...` | Plugin UI 的 8dp 网格规则 |
| `references/gotchas.md` | ~700 | `packages/adapter-figma/**,packages/core-mcp/src/tools/**` | 所有 Plugin API 陷阱的 WRONG/CORRECT 代码示例 |
| `references/common-patterns.md` | ~447 | 同上 | 常用操作的完整代码模板 |

**编辑源码时的额外 context 成本：~692 行（不含 references）或 ~1839 行（含 references）**

> 注意：fileMatch pattern 已收窄，不再包含 `.kiro/steering/figma-*` 和 `.kiro/skills/figma-*`，避免 steering 文件互相触发。

### 手动加载（manual）— 用户通过 `#` 引用

| 文件 | 行数 | 触发方式 | 作用 |
|------|------|----------|------|
| `multi-screen-flow-guide.md` | ~146 | `#multi-screen-flow-guide` 或 Workflow 步骤 4 的 readFile | Style Presets（soft/square/device-mockup/flat-wireframe）、Layer Hierarchy、Helper 函数模板（makeButton/makeInput/makePill）、Build Order |
| `figma-design-creation.md` | ~518 | `#figma-design-creation` | 完整版创建规则。Pre-Creation Checklist（含 skill 加载表）、Wrapper Strategy、Build Order 详细版、Screen Layout §6（SPACE_BETWEEN 模板）、Input/Button/Link 模板、Mobile Screen Modes（概念 vs 高保真）、Multi-Screen Flow 数据驱动策略 |
| `figma-create-quality.md` | ~10 | `#figma-create-quality` | 已合并到 `figma-essential-rules.md`，现为重定向文件 |

---

## Layer 2：Skills

通过 `discloseContext` 按需加载。每个 skill 有独立的触发词。

### 依赖关系

```
figma-use (Plugin API 基础，235行)
  ├── figma-generate-design (组装页面，341行) — 在 Kiro 中不需要同时加载 figma-use（steering 已覆盖，见 AGENTS.md Rule 0）
  ├── figma-generate-library (建设计系统，312行) — 在 Kiro 中不需要同时加载 figma-use（同上）
  └── figma-create-new-file (建文件，69行) — 后续操作需要 figma-use

figma-implement-design (Figma → 代码，259行) — 独立，使用官方 Figma MCP 工具
figma-code-connect-components (Code Connect，350行) — 独立，使用官方 Figma MCP 工具
figma-create-design-system-rules (生成规则文件，538行) — 独立，使用官方 Figma MCP 工具
```

> **注意**：`figma-generate-design` 和 `figma-generate-library` 的 SKILL.md 中声明 "MUST also load figma-use"。在 Kiro 环境中，`figma-essential-rules.md` (auto steering) 已覆盖 figma-use 的核心规则，因此该指令被 steering 的 Precedence 规则覆盖。非 Kiro 环境（Claude Code、Cursor）仍需遵守原始依赖。

### 各 Skill 详情

| Skill | 触发词 | 调用时机 | 与 Steering 的关系 |
|-------|--------|----------|-------------------|
| `figma-use` | 任何 execute_js 调用前 | essential-rules 已覆盖核心规则，**不需要每次加载**。主要价值是 `references/` 目录（gotchas、common-patterns、component-patterns、variable-patterns 等，共 ~3579 行）按需 readFile | Steering 优先。essential-rules 的 Skill & Reference Loading 节明确说"Do NOT pre-load figma-use"。**AGENTS.md Rule 0 明确禁止在 UI 创建任务中调用 `discloseContext("figma-use")`** |
| `figma-generate-design` | "create a screen", "build a landing page" | 有设计系统时组装页面。Step 1-2（理解屏幕 + 发现设计系统资产）是独有价值，Step 3-5 被 steering 覆盖 | `figma-generate-design.md` steering 声明"当冲突时以 steering 为准"。**无设计系统时禁止加载（AGENTS.md Rule 0）** |
| `figma-generate-library` | 建设计系统、tokens、variables | 多阶段建库工作流（Phase 0-4）。含 `scripts/` 目录（9 个可复用脚本）和 `references/` 目录（~4489 行） | `figma-generate-library.md` steering 声明"当冲突时以 steering 为准" |
| `figma-implement-design` | "implement design", "generate code" | 从 Figma 生成代码。使用官方 Figma MCP 的 `get_design_context` / `get_screenshot` | 与 FigCraft steering 无交集 |
| `figma-code-connect-components` | "code connect", "connect this component" | 建立 Figma 组件到代码的映射 | 与 FigCraft steering 无交集 |
| `figma-create-design-system-rules` | "create design system rules" | 生成 CLAUDE.md / AGENTS.md / .cursor/rules 规则文件 | 与 FigCraft steering 无交集 |
| `figma-create-new-file` | 创建新 Figma 文件 | 调用 `create_new_file` 工具，需要 planKey | 后续操作通常需要 figma-use |

---

## Layer 3：Quality Engine（自动兜底）

| 工具 | 调用时机 | 作用 |
|------|----------|------|
| `lint_fix_all` | Workflow 步骤 9（创建完所有 UI 后，必须执行） | 35+ 条 lint 规则自动检查修复。传入单个 screen 的 nodeId，不传 wrapper。注意：只能兜底结构正确性（spacer frames、sizing 错误、命名），不能修复审美问题（配色、信息层级、视觉重心） |
| `audit_node` | 按需，对单个节点做深度审计 | 组合所有 lint 规则 + 设计指南检查，输出结构化报告 |
| `get_design_guidelines` | Layer 0 的加载机制之一（非 Kiro 环境） | 根据 get_mode 结果返回 Creator 或 Guardian 规则。Kiro 环境下通过 Workflow 步骤 2 的 readFile 替代。layout/buttons/inputs category 返回引导消息指向 lint |

---

## 典型场景的完整调用链

### 场景 1：画一个单屏登录页（无设计系统）

```
Context 中：figma-essential-rules.md (auto, 188行) + figcraft.md (auto, 31行)
⚠️ 不调用任何 discloseContext（AGENTS.md Rule 0）

1. ping
2. get_mode → 无库 → readFile design-creator.md (+73行)
   → 应用 Design Thinking：确定调性、配色、字体
3. get_current_page(maxDepth=1) → 检查现有内容
4. 估算任务规模：单屏，1 call per section
5. execute_js: 创建 screen shell
   → get_current_page 结构验证
6. execute_js: 创建 header + form section
   → get_current_page 结构验证
   → export_image 视觉验证
7. execute_js: 创建 buttons + bottom link
   → get_current_page 结构验证
   → export_image 视觉验证
8. lint_fix_all(nodeIds=[screenId])
9. execute_js: post-lint 结构检查
10. export_image: 最终验证

总 context 成本：~292 行 steering + 工具调用返回值
```

### 场景 2：画一个 5 屏 auth flow（无设计系统）

```
Context 中：figma-essential-rules.md (auto, 188行) + figcraft.md (auto, 31行)
⚠️ 不调用任何 discloseContext（AGENTS.md Rule 0）

1. ping
2. get_mode → 无库 → readFile design-creator.md (+73行)
3. get_current_page(maxDepth=1)
4. 估算任务规模：5 屏，1 call per FULL SCREEN
   → readFile multi-screen-flow-guide.md (+146行)
5. execute_js: 创建 wrapper + 5 个 screen shell (skeleton)
   → get_current_page 结构验证
   → export_image skeleton 验证（必须）
6-10. 每屏一个 execute_js（含 PRESET + helpers）
   → 每次 get_current_page 结构验证
   → 每次 export_image 视觉验证
11. lint_fix_all 逐屏执行
12. execute_js: post-lint 结构检查
13. export_image: 最终验证

总 context 成本：~438 行 steering + 工具调用返回值
```

### 场景 3：有设计系统时组装页面

```
Context 中：figma-essential-rules.md (auto, 188行) + figcraft.md (auto, 31行)

1. ping
2. get_mode → 有库 → readFile design-guardian.md (+61行)
3. discloseContext("figma-generate-design") (+341行 skill)
   → Step 2a: 发现 components（inspect existing screens 或 list_library_components）
   → Step 2b: 发现 variables
   → Step 2c: 发现 styles
4. 按 figma-generate-design steering 的工作流组装
   → 用 importComponentSetByKeyAsync 而不是手动画
   → 用 setBoundVariableForPaint 而不是硬编码颜色

总 context 成本：~621 行 steering/skill + 工具调用返回值
```

### 场景 4：建设计系统

```
Context 中：figma-essential-rules.md (auto, 188行) + figcraft.md (auto, 31行)

1. ping
2. discloseContext("figma-generate-library") (+312行 skill)
   → Phase 0: Discovery（readFile discovery-phase.md, +494行）
   → ⛔ USER CHECKPOINT
3. Phase 1: Foundations（readFile token-creation.md, +888行）
   → ⛔ USER CHECKPOINT
4. Phase 2: File Structure（readFile documentation-creation.md, +834行）
   → ⛔ USER CHECKPOINT
5. Phase 3: Components（readFile component-creation.md, +972行）
   → 每个组件 ⛔ USER CHECKPOINT
6. Phase 4: QA

注意：这是最重的场景，reference docs 按阶段加载，不同时在 context 中。
但 readFile 的内容不会从对话 context 中真正消失，只是随着新内容加入被"推远"。
实际 context 负担会比上面的阶段性估计更重，尤其在长对话中。
generate-library skill 的 "When Context Is Running Low" 策略（15+ tool calls 时停止，让用户开新对话）是应对这个问题的主要手段。
```

### 场景 5：编辑 FigCraft 源码（不画 UI）

```
Context 中：
- figma-essential-rules.md (auto, 188行)
- figcraft.md (auto, 31行)
- execute-js-guide.md (fileMatch, 189行)
- figma-generate-design.md (fileMatch, 172行)
- figma-generate-library.md (fileMatch, 98行)

如果编辑 adapter-figma 或 core-mcp/tools：
- references/gotchas.md (fileMatch, 700行)
- references/common-patterns.md (fileMatch, 447行)

总 context 成本：~678 行（不含 references）或 ~1825 行（含 references）
```

---

## 优先级规则

```
Steering (auto-loaded) > Steering (fileMatch/manual) > Skill > MCP 工具返回
```

具体冲突解决：

| 冲突点 | 谁赢 | 说明 |
|--------|------|------|
| execute_js 失败是否 atomic | Steering | figma-use skill 说 atomic，steering 说 NOT always atomic。以 steering 为准 |
| Workflow 步骤 | Steering | figma-generate-design skill 的 Step 3-5 被 steering 覆盖 |
| 验证工具 | Steering | skill 用 `get_metadata` + `get_screenshot`（官方 MCP），steering 用 `get_current_page` + `export_image`（FigCraft） |
| 设计系统发现 | Steering | skill 用 `search_design_system`（官方 MCP），steering 用 `load_toolset("library")` + `list_library_components`（FigCraft） |

---

## 文件间引用关系图

```
figma-essential-rules.md (auto)
  ├── readFile → design-creator.md / design-guardian.md (Workflow 步骤 2)
  ├── readFile → multi-screen-flow-guide.md (Workflow 步骤 4)
  ├── readFile → execute-js-guide.md (Reference Docs)
  ├── readFile → figma-use/references/*.md (Reference Docs)
  └── 引用 → figma-design-creation.md §6 (Rule #16)

execute-js-guide.md (fileMatch)
  ├── 引用 → figma-essential-rules.md Critical Rules (Key Rules 节)
  ├── 引用 → figma-essential-rules.md Sizing Defaults (Sizing 节)
  └── #[[file:]] → references/gotchas.md, references/common-patterns.md

figma-generate-design.md (fileMatch)
  └── #[[file:]] → execute-js-guide.md

figma-generate-library.md (fileMatch)
  └── #[[file:]] → execute-js-guide.md
```
