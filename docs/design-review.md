# 设计审查 (Design Review)

> **一句话**：在 Figma 里持续检查你的设计——不是"交付前的例行公事"，而是像 code review 一样的日常反馈。

FigCraft 把 40 条可执行规则塞进 Figma plugin，让你（或 AI）随时跑一轮审查：token 绑定合规、WCAG 可访问性、布局结构、命名质量、组件健康度——一次扫描，能修的自动修，剩下的给你带 fixCall 的可读报告。

本文是**给设计师和日常使用者看的系统指南**。如果你是 AI agent / contributor，请看 [CLAUDE.md](../CLAUDE.md) 或 `skills/design-*/SKILL.md`。

---

## 目录

- [TL;DR：5 步走查](#tldr5-步走查)
- [两个核心工具](#两个核心工具)
- [Scope 模型：扫描什么](#scope-模型扫描什么)
- [Rule Source 模型：按什么标准](#rule-source-模型按什么标准)
- [Rule Set 模型：跑哪些规则](#rule-set-模型跑哪些规则)
- [常见场景](#常见场景)
- [已知边界与决策](#已知边界与决策)
- [FAQ](#faq)
- [延伸阅读](#延伸阅读)

---

## TL;DR：5 步走查

1. 打开 Figma，加载 FigCraft plugin（首次使用见 [user-guide.md](user-guide.md) §2.2）
2. Plugin 面板里选择 **library**（或 DTCG spec 文件）作为规则源
3. 在 Figma 里**选中要审查的屏幕**（或什么都不选，默认用当前页）
4. 让 AI 跑 `lint_check` —— 看违规列表
5. `lint_fix_all` 批量自动修复可修项

剩下的看你需要：深审单个组件就 `audit_node`，发布组件库就 `preflight_library_publish`，给 AI 带设计全貌就 `verify_design`。

---

## 两个核心工具

设计审查的入口其实只有**两个主工具**。它们**并行存在、按需调用**——区别不是时间先后，是**审查对象**不同：

| 工具 | 审查对象 | 典型场景 |
|---|---|---|
| `lint_check` | **本地设计**（屏幕、frame、text、instance、WIP 组件）| 设计过程中持续检查 |
| `preflight_library_publish` | **库内部**（所有 master + variables + styles）| 发布组件库前的健康检查 |

其他都是辅助（完整清单见 [tool-quick-reference.md](tool-quick-reference.md)）：

| 辅助工具 | 作用 |
|---|---|
| `lint_fix_all` | 一步完成：lint_check + 自动修复所有可修项（等价于"跑审查并立即清理"）|
| `lint_fix` | 给定一份 violations 数组直接修（通常从 `lint_check` 结果里拿）|
| `verify_design` | lint + 页面截图，适合给 AI 带设计全貌 |
| `audit_node` | 对单节点做深度审计（合并 lint + 设计规范检查 + 评分）|
| `compliance_report` | 综合报告（lint + 组件审计 + token 覆盖率），给库作者看整体健康度 |

### 为什么要分成两个工具

两个工具对应两种**审查责任**——
- 你**使用**别人（或自己发布过）的库时，跑 `lint_check` 审你当前的设计是否用对了
- 你**作为库作者**发布库时，跑 `preflight_library_publish` 审你的库本身是否健康

这是**责任分离**：消费者不为库的内部问题买单，作者必须显式做发布前检查。细节见 [已知边界与决策 §5](#5-库里的组件和本地设计的关系)。

---

## Scope 模型：扫描什么

### 扫描范围来源（永远只有两种，不跨页）

`lint_check` 的 scope 只会是以下之一：

| 触发条件 | Scope |
|---|---|
| 有 selection（Figma 里选中 或 MCP 参数 `nodeIds`）| 只扫选中的节点 |
| 无 selection | 当前页顶层节点（`figma.currentPage.children`）|

**不跨页**是 Figma plugin 的天然边界——要审别页，切过去；或者显式选中那个节点。

### 默认 scope（无 selection）还会额外过滤

当前页里的 COMPONENT / COMPONENT_SET 节点按 `remote` 属性过滤：

| 节点 | 行为 |
|---|---|
| 非组件节点（frame / text / instance / group / section ...）| 保留 |
| COMPONENT / COMPONENT_SET 且 `remote === true`（远程库组件）| **跳过**（不归本文件审）|
| COMPONENT / COMPONENT_SET 且 `remote === false`（本地组件）| 保留（任意 publishStatus）|

### 显式选择永远优先

你显式选了啥就扫啥——**包括选中远程库组件也照扫**。工具尊重你的意图，不二次判断。

### 为什么这么设计

- **跨页跳过** = Figma Plugin API 不暴露"所有页节点"的高效枚举；而且把"一键扫全文件"做成默认行为会让大文件下运行几十秒
- **默认过滤远程组件** = 远程库的内部问题是库作者的责任，消费端显示只会产生噪音且无从修复
- **不按 publishStatus 精细过滤** = 本地组件都是你自己的东西，扫一下没坏处；引入 `publishStatus=CURRENT` 过滤会要 async API 调用且边际收益不大

---

## Rule Source 模型：按什么标准

"违规"不是凭空判断的。规则需要一个**权威源**来对齐"什么是对的"。权威源由 mode 和 `selectedLibrary` 共同决定：

| 模式 + 选择 | 权威源 | 典型违规 |
|---|---|---|
| `library` + 远程库 | 远程库的 Variables + Styles | 本地颜色 `#0055ff` 未绑定到 `color/brand/primary` |
| `library` + 本地 | 本地 Variables + Styles | 同上，但标准是你自己的本地变量/样式 |
| `spec` + 加载了 DTCG | DTCG tokens | 本地圆角 6px 不匹配 `radius.md = 8px` |
| 三者皆无 | **无源** | 只跑 WCAG / 布局 / 命名 / 组件类规则（token 类自动跳过）|

**什么时候用哪个模式**：
- 团队用 Figma 共享库管理规范 → `library` 模式 + 选该库
- 团队用 DTCG JSON 文件管理 token → `spec` 模式 + 加载该文件
- 单独设计不绑任何规范 → 不选，只用 WCAG/布局/命名检查

切换模式：plugin 面板里点"设置"，或通过 `set_mode(mode: 'library' | 'spec')`。

---

## Rule Set 模型：跑哪些规则

40 条规则分 5 个类别（完整清单见 [docs/generated/lint-rules.md](generated/lint-rules.md)）：

| 类别 | 条数 | 可自动修复 | 举例 |
|---|---|---|---|
| **token**（规范合规）| 5 | 5 | `hardcoded-token`、`spec-color`、`spec-typography`、`spec-border-radius`、`no-text-style` |
| **wcag**（可访问性）| 5 | 2 | `wcag-contrast`、`wcag-target-size`、`wcag-text-size`、`wcag-line-height`、`wcag-non-text-contrast` |
| **layout**（布局）| 27 | 20 | `no-autolayout`、`overflow-parent`、`unbounded-hug`、`button-solid-structure`、`input-field-structure` ... |
| **naming**（命名）| 2 | 0 | `default-name`（如 "Frame 1"）、`placeholder-text`（如 "Lorem ipsum"）|
| **component**（组件）| 1 | 0 | `component-bindings`（定义了属性但未连接到子图层）|

### 按 token 源自动过滤

没有任何规则源（`selectedLibrary` 为空 + 无 DTCG）时，lint 会**自动隐藏 token 类规则**——那些规则缺少权威源无法判断合规/不合规，显示出来会是错误信号。

剩余的 `wcag` / `layout` / `naming` / `component` 规则**照常跑**——它们不依赖 token 源。

**实际效果**：你未选 library 运行 `lint_check`，结果里不会出现 `hardcoded-token` 这类，不是 bug，是**按设计**。

### 按类别/规则/忽略自定义

三个工具参数让你定制规则集：

```ts
lint_check(categories: ['wcag'])               // 只跑 WCAG 类
lint_check(rules: ['wcag-contrast'])           // 只跑指定规则
lint_check(skipRules: ['max-nesting-depth'])   // 跑全部但排除某条
```

还可以在**单个节点**上设 `lintIgnore`（通过 `set_lint_ignore` 工具或在 Figma 里给节点加 plugin data）：

| lintIgnore 值 | 效果 |
|---|---|
| `'*'` | 该节点跳过所有规则 |
| `'rule-a,rule-b'` | 跳过指定规则 |
| `'button-*'` | 通配符匹配（跳过所有 `button-` 开头的规则）|

---

## 常见场景

| 你想做什么 | 用什么 | 配置 |
|---|---|---|
| 设计中快速审当前屏幕 | 选中屏幕 → `lint_check` | 选 library |
| 批量修复可自动修项 | `lint_fix_all` | 选 library，`dryRun: true` 先预览 |
| 发布组件库前最终检查 | `preflight_library_publish` | 建议跑完再 publish |
| 单个组件深度审查 | `audit_node(nodeId)` | 任何模式 |
| 审完要给 AI 看全貌 | `verify_design(nodeId)` | 自动附截图 |
| 审可访问性 | `lint_check(categories: ['wcag'])` | 任何模式 |
| 只看 token 合规 | `lint_check(categories: ['token'])` | 需 selected library 或 DTCG |
| 审查排除某条规则 | `lint_check(skipRules: ['rule-name'])` | 任何模式 |
| 某节点永久豁免 | 在节点上设 `lintIgnore: 'rule-name'` | 任何模式 |

---

## 已知边界与决策

### 1. INSTANCE 的 cornerRadius / padding / gap 为什么不报"硬编码"

**设计决策（责任分离）**：这些可继承属性的 token 绑定是**组件作者**的责任，应该在 master 上审查，不在消费 instance 上。`lint_check` 关注"**本地设计如何使用库**"，不是"库是否正确"。

**次要约束（API 限制）**：Figma Plugin API 不暴露 instance 的继承绑定状态——即使想查也查不准，可能导致大量误报。但这是次要原因，主要是责任分离。

**如果你就是想查**：选中 master COMPONENT 跑 lint_check，或者跑 `preflight_library_publish`（它直接扫 master）。

### 2. 标注（annotation）在 Design Mode 看不见

**这不是 plugin bug，是 Figma 产品限制**。

Figma 的 annotation 显示受客户端 **View > Annotations** 开关控制：
- Dev Mode：菜单里有这个开关，默认开
- Design Mode：菜单里**没有**这个开关（见 [Figma Forum](https://forum.figma.com/suggest-a-feature-11/toggle-visibility-of-devmode-annotations-on-the-design-side-27266) 的 feature request）

**解决**：
- 按键盘 `Shift+Y` 切换 annotation 可见性（任何 mode 下都行）
- 或进一次 Dev Mode 打开后再切回 Design Mode（开关状态会持久化到 session）

Plugin 写入的 annotation 数据正确保存到节点，只是渲染层被 Figma 客户端关了。

### 3. 跨页 master 如何审查

默认 scope 只扫当前页。master 在其他页的三种方案：

- **切过去再审**：切到 master 所在页 → 不选任何东西跑 `lint_check`
- **显式选中**：如果 master 有引用在当前页（或通过 `nodeIds` 传 ID），扫它
- **用 preflight**：`preflight_library_publish` 扫全文件的所有 master，不看当前页

### 4. 无 library / 无 DTCG 时报告"很少"

**按设计**：token 类规则直接不跑（见 [Rule Set 模型](#按-token-源自动过滤)）。报告里只有 WCAG / 布局 / 命名 / 组件类。

**不是 bug**，是明确的信号："你没告诉我规范，所以我不能告诉你是否合规"。

**恢复 token 规则**：选一个 library 或加载 DTCG spec 即可。

### 5. 库里的组件和本地设计的关系

FigCraft 的设计审查体系建立在**消费者/作者**分工上：

```
  设计师（消费者）                 库作者
       │                              │
       ▼                              ▼
  用 lint_check 审               用 preflight_library_publish 审
  "我的设计怎么用库"                  "我的库内部健康吗"
       │                              │
       ▼                              ▼
  本地 Frame、Screen、Instance    所有 master + Variables + Styles
```

两者不重叠：
- 消费者**不为库的内部问题负责**（INSTANCE 跳过可继承属性检查就是这个道理）
- 作者**不为消费者如何使用库负责**（preflight 不扫页面实例）

这份分工让两个工具职责清晰、互不干扰。

### 6. "自动修复后又报同样违规"是什么情况

**已经修复的 bug**（见 [commit 3bd8067](https://github.com/DivikWu/figcraft/commit/3bd8067)）。历史原因是 lint 读节点只用 `standard` detail，导致 `boundVariables` 字段缺失——修复后 lint 还以为你没绑定。

**当前版本不会再复现**。如果你仍遇到类似现象，说明 plugin 没更新到最新构建：
1. Plugins → Development → FigCraft → Run again
2. 或重新 `npm run build:plugin` 后重载 plugin

---

## FAQ

### Q：选了 library 为什么审查还是 0 违规？

可能情况：
- Library 变量还没在当前文件 "import"：去 Figma 左侧 Libraries 面板启用那个库
- 规则 scope 过滤掉所有节点：当前页可能只有远程组件，默认 scope 下它们被跳过 → 显式选中你要审的屏幕
- 设计本来就合规！用 `lint_fix_all(dryRun: true)` 看规则是否真的被跑过（`summary.total` 会显示扫描的节点数）

### Q：我想对全文件做一次大扫描

`lint_check` 不支持跨页（Plugin API 限制）。方案：
- 逐页切换跑 `lint_check`（费力但准确）
- 跑 `preflight_library_publish` —— 扫全文件的 master，但不扫页面 instances
- 用 `compliance_report` —— 综合报告，给库作者看整体健康度

### Q：某条规则误报怎么跳过？

三种粒度：
- **单次运行跳过**：`lint_check(skipRules: ['rule-name'])`
- **整个规则类跳过**：`lint_check(categories: [...不含该类])`
- **某节点永久豁免**：在节点设 `lintIgnore: 'rule-name'`（支持逗号分隔 + `*` 通配符）

### Q：可以自定义规则吗？

需要代码 PR——在 `packages/quality-engine/src/rules/` 加一个规则文件，注册到 `ALL_RULES`。详细步骤见 [CLAUDE.md](../CLAUDE.md) "Adding New Lint Rules"。

### Q：审查结果怎么持久化/导出？

目前没内建导出。但每条违规都有 `nodeId` + 人类可读的 `suggestion` + AI 可执行的 `fixCall`——AI 能把报告转成任何格式（Markdown 清单 / JSON 报告 / Jira ticket 等）。

### Q：lint 会改我的设计吗？

- `lint_check` **绝不改**——只读
- `lint_fix` / `lint_fix_all`（非 dryRun） **会改**——自动修复可修项
- `lint_fix_all(dryRun: true)` **绝不改**——只预览能修什么

`audit_node` / `verify_design` / `compliance_report` / `preflight_library_publish` 都是只读。

### Q：审查的性能如何？

- 典型登录页（~30 节点）：约 50-100ms
- 中等复杂页（~200 节点）：约 200-500ms
- 超大页（>500 节点）：`maxViolations` 参数可提前终止（默认 500）

所有 lint 在 Plugin 侧同步跑，无 WebSocket 传输开销。

---

## 延伸阅读

- [docs/generated/lint-rules.md](generated/lint-rules.md) —— 40 条规则的完整清单（自动生成）
- [docs/user-guide.md](user-guide.md) —— 整体使用指南（安装、模式、工具、工作流）
- [docs/tool-quick-reference.md](tool-quick-reference.md) —— 所有 MCP 工具速查表
- [docs/figma-mcp-comparison.md](figma-mcp-comparison.md) —— 与 Figma 官方 MCP 的职责分工
- [CLAUDE.md](../CLAUDE.md) —— 架构与 contributor 信息（添加规则、Handler 注册、schema 维护等）

---

*本文档反映的架构决策源自：[2eeaf7a](https://github.com/DivikWu/figcraft/commit/2eeaf7a)（移除 profile）· [3bd8067](https://github.com/DivikWu/figcraft/commit/3bd8067)（full detail 修复）· [db179f0](https://github.com/DivikWu/figcraft/commit/db179f0)（scope 过滤远程组件）· [c040de9](https://github.com/DivikWu/figcraft/commit/c040de9)（rule set 按 token 源过滤）· [0046c00](https://github.com/DivikWu/figcraft/commit/0046c00)（INSTANCE skip rationale）。*
