# FigCraft 架构审查：增长资产最终方案

审查日期：2026-04-03

## 设计目标

1. **开发者维护效率** — 快速找到、快速修改、不出错
2. **多角色协作** — 设计师/PM 可编辑模板和规则，无需 TypeScript 知识
3. **产品化输出** — 未来用户可自定义模板/规则/提示词

## 核心结论：混合架构

**不能统一集中**（一个 `assets/` 放所有）——六类资产的消费者和运行环境完全不同：

| 消费者 | 运行环境 | 约束 |
|--------|---------|------|
| IDE（Claude Code/Kiro） | IDE 进程 | 只扫描 `skills/*/SKILL.md` 直接子目录 |
| Figma Plugin 沙箱 | 无网络、无文件系统 | 资产必须编译进 IIFE bundle |
| MCP Server | Node.js stdio | 资产必须在 npm 发布包内 |

**也不能全部就地嵌入**——UI 模板(1,021行)、Prompts(349行)、Guides 的数据嵌入 TypeScript，非开发者无法编辑。

**正确做法：按性质分两类处理**：

| 类型 | 资产 | 管理方式 |
|------|------|---------|
| **内容型**（声明式数据） | UI 模板(9)、Guides(6)、Prompts(9) | 提取到 `content/`（YAML/Markdown），构建时编译为 TypeScript |
| **代码型**（算法逻辑） | Lint 规则(38)、Opinion Engine(10) | 留在 packages/（TypeScript） |
| **已优化** | Skills(11)、MCP Schema(97) | 不变 |

---

## 最终目录结构

```
figcraft/
├── schema/
│   └── tools.yaml                    ★ MCP 工具定义（数据 → 代码生成）
│
├── skills/                           ★ Skills + 设计规则（IDE 发现 + 构建拷贝）
│   ├── ui-ux-fundamentals/SKILL.md
│   ├── design-creator/SKILL.md
│   ├── design-guardian/SKILL.md
│   └── ... (11 个，扁平)
│
├── content/                          ★ 可编辑内容资产（NEW）
│   ├── templates/                    UI 模板 ← 从 creation-guide.ts 提取
│   │   ├── _schema.ts               TypeScript 接口（构建验证用）
│   │   ├── login.yaml
│   │   ├── signup.yaml
│   │   └── ... (9 个)
│   ├── guides/                       创建指南 ← 从 creation-guide.ts 提取
│   │   ├── multi-screen.md
│   │   ├── responsive.md
│   │   └── ... (6 个)
│   └── prompts/                      Prompt 工作流 ← 从 prompts/index.ts 提取
│       ├── sync-tokens.yaml
│       ├── lint-page.yaml
│       └── ... (9 个)
│
├── packages/
│   ├── quality-engine/src/rules/     ★ Lint 规则（不变，代码型）
│   │   ├── layout/  (19 条)
│   │   ├── structure/  (13 条)
│   │   ├── spec/  (6 条)
│   │   ├── wcag/  (5 条)
│   │   └── naming/  (2 条)
│   │
│   ├── adapter-figma/src/handlers/
│   │   └── inline-tree.ts            ★ Opinion Engine（不变，代码型）
│   │
│   └── core-mcp/src/
│       ├── tools/
│       │   ├── creation-guide.ts     瘦身：只剩加载逻辑
│       │   ├── _templates.ts         ← compile-content 生成
│       │   └── _guides.ts            ← compile-content 生成
│       └── prompts/
│           ├── index.ts              瘦身：只剩注册逻辑
│           └── _prompts.ts           ← compile-content 生成
│
├── scripts/
│   ├── compile-schema.ts             已有（tools.yaml → TypeScript）
│   └── compile-content.ts            NEW（content/ → TypeScript）
│
└── tests/                            不变
```

---

## 构建流水线

```
content/templates/*.yaml ─┐
content/guides/*.md ──────┼─→ scripts/compile-content.ts
content/prompts/*.yaml ───┘         │
                                    ├─→ core-mcp/src/tools/_templates.ts
                                    ├─→ core-mcp/src/tools/_guides.ts
                                    └─→ core-mcp/src/prompts/_prompts.ts

npm run build = schema → content → build:server → build:plugin → build:figcraft-design
```

模式与 `schema/tools.yaml → compile-schema → _generated.ts` 完全一致：
- 源文件是 YAML/Markdown（人类可编辑）
- 构建时验证 + 编译为 TypeScript 模块
- 运行时不解析 YAML（零运行时开销）

---

## 内容资产详细设计

### UI 模板（content/templates/*.yaml）

从 `creation-guide.ts` 的 `UI_PATTERNS` 对象提取。每个 YAML 文件包含：

```yaml
# content/templates/login.yaml
structure: |
  Screen (VERTICAL, FIXED 402x874, SPACE_BETWEEN, padding 24)
    +-- Top Content (logo, heading)
    +-- Form (inputs, CTA)
    +-- Bottom Content (social login, links)

keyDecisions:
  layout: "SPACE_BETWEEN distributes top + form + bottom"
  buttonHeight: ">=48px, full-width on mobile"

pitfalls:
  - "button-structure: CTA height < 48px"
  - "input-field-structure: input missing stroke"

toneVariants:
  minimal: { cornerRadius: "8-12px", colors: "monochrome + 1 accent" }
  elegant: { cornerRadius: "12-16px", colors: "warm neutrals + gold accent" }
  bold: { cornerRadius: "16-24px", colors: "gradient hero + high-contrast CTA" }

exampleParams:
  name: "Screen / Login"
  width: 402
  height: 874
  layoutMode: VERTICAL
  children: [...]
```

**构建验证**：`_schema.ts` 导出 `UiPattern` 接口，compile-content 验证每个 YAML 文件的必填字段。

### 创建指南（content/guides/*.md）

从 `creation-guide.ts` 的模板字符串提取。纯 Markdown 文件，有语法高亮和预览支持：

- `multi-screen.md` — 多屏流程架构规则
- `batching.md` — 上下文预算策略
- `tool-behavior.md` — 工具调用序列规则
- `opinion-engine.md` — Opinion Engine 推断文档
- `responsive.md` — 响应式 Web 断点规则
- `content-states.md` — 空/错误/加载状态设计

### MCP Prompts（content/prompts/*.yaml）

从 `prompts/index.ts` 的 `server.prompt()` 调用提取：

```yaml
# content/prompts/sync-tokens.yaml
name: sync-tokens
description: "Guide: Sync DTCG design tokens to Figma variables and styles."
steps: |
  Help me sync design tokens to Figma. Follow these steps:
  1. Ask for the DTCG JSON file path
  2. Call load_toolset({ names: "tokens" })
  3. Use list_tokens to preview
  4. Use diff_tokens to check current state
  5. Use sync_tokens to push changes
  6. Report sync result
```

---

## 不变的部分及理由

### Lint 规则（留在 packages/quality-engine/）

Lint 规则是**算法代码**，不是声明式数据。每条规则实现 `check()` 函数，包含正则匹配、结构启发式、父节点上下文分析。例如 `button-structure.ts` 有 6 个检测函数。转为 YAML 需要发明比 TypeScript 更复杂的 DSL。

### Opinion Engine（留在 packages/adapter-figma/）

10 项推断是**算法验证逻辑**（冲突检测、FILL→HUG 降级、spacer 转换），深度耦合 Figma Plugin API 的运行时行为。代码必须编译进 Plugin IIFE bundle。

但其**文档**（`OPINION_ENGINE_GUIDE` 字符串）是内容，提取到 `content/guides/opinion-engine.md`。

---

## 多角色协作

| 角色 | 编辑什么 | 格式 | 验证 |
|------|---------|------|------|
| 设计师 | `content/templates/*.yaml` | YAML | `npm run content` |
| 设计师 | `skills/*/SKILL.md` | Markdown | frontmatter 检查 |
| PM | `content/prompts/*.yaml` | YAML | `npm run content` |
| PM | `content/guides/*.md` | Markdown | 存在性检查 |
| 开发者 | Lint 规则、Opinion Engine、MCP 工具 | TypeScript | typecheck + test |

非开发者贡献流程：编辑 YAML/Markdown → `npm run content` 验证 → PR review 关注内容质量，不需要 TypeScript 知识。

---

## 产品化路线

### Phase 1（本方案）：内容提取
24 个内容资产从 TypeScript 提取到 YAML/Markdown。构建流水线建立。

### Phase 2：用户自定义
```yaml
# .figcraft/config.yaml
templates:
  override: { login: ./my-templates/login-custom.yaml }
  extend: [./my-templates/dashboard-variant.yaml]
rules:
  disable: [placeholder-text]
prompts:
  extend: [./my-prompts/review-accessibility.yaml]
```

### Phase 3：共享内容注册表
```yaml
extends:
  - figcraft-templates-saas      # npm 包
  - figcraft-rules-wcag-aaa      # npm 包
```

---

## 实施步骤

| Step | 内容 | 风险 | 提取数量 |
|------|------|------|---------|
| 1 | 提取 6 个 Guides + 写 compile-content.ts | 低 | 6 |
| 2 | 提取 9 个 Prompts | 低 | 9 |
| 3 | 提取 9 个 UI Templates（exampleParams 结构复杂） | 中 | 9 |
| 4 | CI 合约测试 + 贡献者文档 | 低 | — |
