# FigCraft 资产维护手册

项目有七类增长资产。本文档说明每类资产在哪里、怎么加新的、怎么改现有的。

## 资产总览

| 资产 | 位置 | 格式 | 数量 | 构建命令 |
|------|------|------|------|---------|
| **Skills** | `skills/*/SKILL.md` | Markdown | 29 | `npm run build`（自动拷贝到 dist） |
| **UI 模板** | `content/templates/*.yaml` | YAML | 9 | `npm run content` |
| **创建指南** | `content/guides/*.md` | Markdown | 7 | `npm run content` |
| **MCP Prompts** | `content/prompts/*.yaml` | YAML | 9 | `npm run content` |
| **MCP 工具** | `schema/tools.yaml` | YAML | 116 | `npm run schema` |
| **Lint 规则** | `packages/quality-engine/src/rules/` | TypeScript | 40 | `npm run build` |
| **Harness 规则** | `packages/core-mcp/src/harness/rules/` | TypeScript | 18 | `npm run build` |

## 构建流水线

```
npm run build = schema → content → build:server → build:plugin → build:figcraft-design
```

- `npm run schema` — tools.yaml → 生成 `_generated.ts` + `_registry.ts`
- `npm run content` — content/ → 生成 `_guides.ts` + `_prompts.ts` + `_templates.ts`
- 合约测试（`npm test`）验证生成文件与源文件一致

---

## 1. Skills

**位置**: `skills/*/SKILL.md`（项目根目录，扁平结构）

**IDE 发现**: Claude Code 和 Kiro 通过 symlink（`.claude/skills` / `.kiro/skills` → `../skills`）自动发现。**只扫描直接子目录**，不递归——不能嵌套分组。

**分类**: 通过 `skills/README.md` 文档分组（设计规则 / 声明式创建 / Plugin API / 辅助）。

### 设计规则 Skill（特殊）

`ui-ux-fundamentals`、`design-creator`、`design-guardian` 三个 skill 同时是 MCP Server `get_design_guidelines()` 的 source of truth。构建时去掉 frontmatter 拷贝到 `dist/mcp-server/`。

### 新增 Skill

1. 创建 `skills/<skill-name>/SKILL.md`（含 `---` frontmatter）
2. 可选：添加 `references/` 子目录放支撑文档
3. 更新 `skills/README.md` 添加到对应分组
4. IDE 自动发现，无需改代码

### Skill 内容编写规范

- 每条规则必须是该 skill 场景特有的。如果一条规则在其他场景也适用，它应该放在更通用的 skill 里（如 `figma-create-ui` 或 `ui-ux-fundamentals`）
- Section 顺序参考现有 skill：Skill Boundaries → Design Direction → On-Demand Guide → 核心内容 → Key Rules（核心内容较重要时可提前）
- 必须包含 `## Skill Boundaries` section，说明适用范围和相邻 skill 的切换指引
- 必须包含 `## Design Direction` section（固定文案：`Design rules are delivered by _workflow.designPreflight...`）
- 如果对应 MCP guide 存在，必须包含 `## On-Demand Guide` section 指向它

### 修改 Skill

直接编辑 `skills/<name>/SKILL.md`。如果是设计规则 skill，需 `npm run build` 更新 dist/。

---

## 2. UI 模板

**位置**: `content/templates/*.yaml`

**生成**: `npm run content` → `packages/core-mcp/src/tools/_templates.ts`

**消费者**: `get_creation_guide(topic:"ui-patterns", uiType:"xxx")` MCP 工具

### 必填字段

```yaml
structure: |          # 节点层级结构
keyDecisions:         # Record<string, string>
pitfalls:             # string[]（对应 lint 规则名）
toneVariants:         # Record<string, Record<string, string>>
exampleParams:        # Record<string, unknown>（create_frame 参数骨架）
```

### 新增模板

1. 创建 `content/templates/<name>.yaml`（参考现有模板格式）
2. `npm run content` — 验证必填字段 + 生成 TypeScript
3. 模板自动出现在 `get_creation_guide(topic:"ui-patterns")` 可用列表

### 修改模板

编辑 YAML → `npm run content` → `npm test`（合约测试验证一致性）

---

## 3. 创建指南

创建指南有两种来源：

### Skill-sourced 指南（4 个）

**Source of truth**: `skills/*/SKILL.md`（与设计规则 skill 模式一致）

| Skill | MCP topic | Fallback 文件 |
|-------|-----------|-------------|
| `multi-screen-flow` | `multi-screen` | `multi-screen.md` |
| `responsive-design` | `responsive` | `responsive.md` |
| `content-states` | `content-states` | `content-states.md` |
| `iconography` | `iconography` | `iconography.md` |

运行时 `creation-guide.ts` 直接从 `skills/` 读取（stripFrontmatter + stripSkillSections）。打包环境下 `tsup.config.ts` 的 `onSuccess` 生成 fallback `.md` 到 `dist/mcp-server/`。

**修改**：编辑 `skills/<name>/SKILL.md` → `npm run build`（更新 dist fallback）→ `npm test`

### Compiled 指南（3 个）

**位置**: `content/guides/*.md`（batching、tool-behavior、opinion-engine）

**生成**: `npm run content` → `packages/core-mcp/src/tools/_guides.ts`

**消费者**: `get_creation_guide(topic:"batching")` 等 MCP 工具

文件名 → 常量名：`batching.md` → `GUIDES.BATCHING`

**修改**：编辑 Markdown → `npm run content` → `npm test`

### 新增指南

如果新指南有对应 skill：添加到 `tsup.config.ts` 的 `CREATION_GUIDE_SKILLS` 和 `creation-guide.ts` 的 `loadSkillGuide` 调用。

如果是纯 MCP 指南（无 skill）：创建 `content/guides/<name>.md` → `npm run content` → 在 `creation-guide.ts` 的 switch 中引用 `GUIDES.NEW_NAME`。

---

## 4. MCP Prompts

**位置**: `content/prompts/*.yaml`

**生成**: `npm run content` → `packages/core-mcp/src/prompts/_prompts.ts`

**消费者**: MCP Server 启动时自动注册所有 prompt

### 必填字段

```yaml
name: prompt-name       # MCP prompt 注册名
description: "描述"      # MCP prompt 描述
steps: |                 # 工作流步骤文本
```

### 动态占位符

`{{PREVENTION_CHECKLIST_COUNT}}` → 运行时替换为 lint 规则数量

### 新增 Prompt

1. 创建 `content/prompts/<name>.yaml`
2. `npm run content`
3. Prompt **自动注册**到 MCP Server，无需改代码

### 修改 Prompt

编辑 YAML → `npm run content` → `npm test`

---

## 5. MCP 工具

**位置**: `schema/tools.yaml`（6,377 行，单一文件）

**生成**: `npm run schema` → `packages/core-mcp/src/tools/_generated.ts` + `_registry.ts`

**三种 handler 类型**:

| 类型 | 定义方式 | 代码 |
|------|---------|------|
| `bridge` | YAML 定义即可 | 自动生成 |
| `endpoint` | YAML 定义 methods map | dispatch 在 `endpoints.ts` |
| `custom` | YAML + 手写 TypeScript | 在 `packages/core-mcp/src/tools/` |

### 新增工具

1. 在 `schema/tools.yaml` 添加工具定义
2. `npm run schema` 重新生成 registry
3. 如果是 `bridge` 类型，到此完成
4. 如果是 `custom` 类型，在 `packages/core-mcp/src/tools/` 手写实现

---

## 6. Lint 规则

**位置**: `packages/quality-engine/src/rules/<category>/<rule-name>.ts`

**分类目录**: `layout/`(14)、`structure/`(13)、`spec/`(6)、`wcag/`(5, 含 1 helper)、`naming/`(2)

**autoFix 率**: 55%（22/40）

### 新增规则

1. 在 `packages/quality-engine/src/rules/<category>/` 创建文件，实现 `LintRule` 接口
2. 在 `packages/quality-engine/src/engine.ts` 的 `ALL_RULES` 数组中 import + 注册
3. `check()` 接收 `AbstractNode`，返回 `LintViolation[]`
4. 可选：设置 `autoFixable: true` + 返回 `FixDescriptor`
5. 可选：在 `packages/adapter-figma/src/utils/fix-applicator.ts` 添加修复逻辑（如果是新的 FixDescriptor 类型）
6. 添加测试到 `tests/quality-engine/`

### 修改规则

编辑规则 TypeScript → `npm test` → `npm run build`

---

## 速查：我要做 X 应该改哪里？

| 我要… | 改哪里 | 命令 |
|-------|-------|------|
| 加一种新 UI 模板 | `content/templates/<name>.yaml` | `npm run content` |
| 修改登录页模板 | `content/templates/login.yaml` | `npm run content` |
| 加一个创建指南 | `content/guides/<name>.md` + creation-guide.ts switch | `npm run content` |
| 加一个 MCP Prompt | `content/prompts/<name>.yaml` | `npm run content`（自动注册） |
| 加一个 MCP 工具 | `schema/tools.yaml` | `npm run schema` |
| 加一条 Lint 规则 | `quality-engine/src/rules/` + engine.ts | `npm test` |
| 加一个 Skill | `skills/<name>/SKILL.md` | 无需构建（IDE 自动发现） |
| 改设计规则 | `skills/ui-ux-fundamentals/SKILL.md` 等 | `npm run build` |
| 加一项 Opinion Engine 推断 | `adapter-figma/src/handlers/inline-tree.ts` | `npm test` |

---

## 7. Harness 规则

**注册**: `packages/core-mcp/src/harness/index.ts`（集中注册所有规则）

**索引**: `schema/tools.yaml` 每个工具的 `# harness:` 注释

**Pipeline 引擎**: `packages/core-mcp/src/harness/pipeline.ts`

**消费者**: `bridge.request()` — 所有经过 bridge 的工具调用自动经过 pipeline

### 规则类型

| 类型 | 位置 | 编辑者 | 构建 |
|------|------|--------|------|
| 代码型（复杂逻辑） | `packages/core-mcp/src/harness/rules/*.ts` | 开发者 | `npm run build` |
| 数据型（recovery + next-steps） | `content/harness/*.yaml` | UX 设计师/开发者 | `npm run content` |

### 规则分层

| Layer | Phase | 作用 | 规则数 | 类型 |
|-------|-------|------|--------|------|
| 0 | pre-guard | 拦截无效调用 | 1 (design-preflight) | 代码型 |
| 1 | pre-transform | 修正参数 | 1 (resolve-icons) | 代码型 |
| 2 | post-enrich | 响应增强 | 6 (content-warnings, auto-verify, verification-debt-remind, response-size-guard, next-steps, resolve-icons-warnings) | 代码型 + 数据型 |
| 4 | error-recovery | 错误恢复建议 | 6 (connection-lost, token-not-found, node-deleted, file-not-found, parse-error, response-too-large) | 数据型 |
| 5 | session-update | 跨 turn 学习 | 4 (design-decisions, record-creation-debt, record-verification, error-journal) | 代码型 |

### 新增代码型规则

1. 在 `packages/core-mcp/src/harness/rules/` 创建文件，实现 `HarnessRule` 接口
2. 在 `packages/core-mcp/src/harness/index.ts` 注册
3. 在 `schema/tools.yaml` 对应工具添加 `# harness:` 注释
4. 添加测试到 `tests/core-mcp/harness/`

### 新增/修改数据型规则

数据型规则由 YAML 定义、编译到 `_harness.ts`、运行时由 `data-recovery.ts`（recovery）和 `next-steps.ts`（后续步骤）消费。

1. 编辑 `content/harness/recovery-patterns.yaml`（error recovery）或 `content/harness/next-steps.yaml`（后续步骤引导）
2. `npm run content` — 编译到 `packages/core-mcp/src/harness/_harness.ts`
3. 在 `schema/tools.yaml` 对应工具更新 `# harness:` 注释

### 修改代码型规则

直接编辑 `harness/rules/<name>.ts`。如果改变了适用工具范围，同步更新 `schema/tools.yaml` 中的 `# harness:` 注释。

---

## 相关文档

- [架构审查](architecture-review.md) — 架构决策和理想结构
- [增长资产](growth-assets.md) — 七类资产的扩展路线
- [Skills 战略](skills-strategy.md) — Skills 拓展路线图
- [编辑内容资产](contributing-content.md) — 设计师/PM 编辑指南
