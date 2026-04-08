# FigCraft Harness Pipeline 架构

文档版本：2026-04-09

## 什么是 Harness Engineering

Harness Engineering 是一种**用系统架构约束 AI 行为，而非依赖 AI 阅读文档**的工程范式。

核心理念：不信任 AI 会读文档，但信任 AI 会用工具返回值。

| | Prompt Engineering | Harness Engineering |
|---|---|---|
| 约束方式 | 在 prompt/文档中写规则 | 在工具执行路径中编码规则 |
| 可靠性 | 取决于 AI 是否遵循 | 系统强制，AI 无法绕过 |
| 跨 IDE 一致性 | 需要每个 IDE 配置文件同步 | 规则在 MCP Server 代码中，所有 IDE 自动继承 |
| 可观测性 | AI 是否读了无法确认 | 规则执行结果在响应中可见（`_applied`, `_qualityScore`） |

**适用场景**：MCP Server 服务多个 IDE（Claude Code、Cursor、Kiro 等），规则需要跨 IDE 一致且不依赖 IDE 特有的 prompt 机制。

## 为什么 FigCraft 需要 Harness

### 5 屏验证的发现

在 5 屏 UI 创建验证中，观察到 AI 引导的可靠性呈明显分层：

| 层级 | 引导方式 | AI 遵循率 | 示例 |
|------|---------|----------|------|
| Layer 0 | **代码强制**（pre-execution guard） | 100% | design preflight: 未调用 `get_mode` → 直接 block |
| Layer 1 | **参数自动补全**（Opinion Engine） | 100% | 缺 `layoutMode` → 系统自动推断 VERTICAL |
| Layer 2 | **响应内警告**（`_typedHints`） | 高 | `_qualityWarning` 出现在响应中，AI 通常会处理 |
| Layer 3 | **Workflow checklist**（`_workflow`） | 中 | STEP 4 说"verify_design"，AI 可能跳过 |
| Layer 4 | **模板**（ui-patterns） | 低 | icon 规则、placeholder 警告被 AI 忽略 |
| Layer 5 | **设计规则文档** | 偶尔 | `design-creator.md` 中的色彩规则 |
| Layer 6 | **IDE 文档**（CLAUDE.md） | 仅开发者 | 终端用户 AI 从不读这些 |

**结论**：Layer 4-6 的引导在实测中被 AI 系统性忽略。只有 Layer 0-2（代码强制 + 响应警告）能可靠地约束 AI 行为。

**Harness Engineering 就是把尽可能多的规则从 Layer 4-6 推到 Layer 0-2。**

## 架构概览

### Pipeline 执行流

```
MCP SDK (Zod validation)
  │
  ▼
bridge.request(method, params)
  │
  ├─ Phase 1: PRE-GUARD          ← Layer 0 — 拦截无效调用（100% 强制）
  ├─ Phase 2: PRE-TRANSFORM      ← Layer 1 — 修正参数（AI 无感知）
  │
  ├─ Phase 3: EXECUTE             ← WebSocket → Plugin → 响应
  │
  ├─ Phase 4: POST-ENRICH        ← Layer 2 — 注入质量分/警告/提示
  ├─ Phase 5: ERROR-RECOVERY     ← Layer 4 — 错误分类 + 恢复建议
  └─ Phase 6: SESSION-UPDATE     ← Layer 5 — 记录结果，跨 turn 学习
```

### bridge.request() 集成

Pipeline 包装了 `bridge.request()` 的 WebSocket 通信层。当 pipeline 存在时：

```typescript
async request(method, params, timeoutMs, toolName, isWrite) {
  const ctx = createHarnessContext(toolName, method, params, session, isWrite);
  return this.pipeline.run(ctx, () => this.sendRequest(method, ctx.params, timeoutMs));
}
```

Pipeline 为 `null` 时（初始化前），退化为直接调用 `sendRequest()`——零开销。

## 规则分层

### 18 条规则完整列表

| Layer | Phase | 规则名 | 适用工具 | 类型 | 作用 |
|-------|-------|--------|---------|------|------|
| 0 | pre-guard | design-preflight | create_frame, create_text, create_svg | 代码 | 未调用 `get_mode` → block |
| 1 | pre-transform | resolve-icons | create_frame | 代码 | icon children → SVG |
| 2 | post-enrich | content-warnings | create_frame | 代码 | 检测占位符文本 → `_warnings` |
| 2 | post-enrich | resolve-icons-warnings | create_frame | 代码 | icon 解析失败 → `_warnings` |
| 2 | post-enrich | auto-verify | create_frame | 代码 | 自动 lint → `_qualityScore` |
| 2 | post-enrich | next-steps | sync_tokens, set_mode | 数据 | 注入 `_nextSteps` |
| 2 | post-enrich | verification-debt-remind | * (除 lint) | 代码 | 注入 `_verificationDebt` |
| 2 | post-enrich | response-size-guard | * | 代码 | >50KB 自动截断 |
| 4 | error-recovery | recovery-connection-lost | * | 数据 | 断连 → 恢复建议 |
| 4 | error-recovery | recovery-token-not-found | create_*, variables_ep | 数据 | token 缺失 → 搜索建议 |
| 4 | error-recovery | recovery-node-deleted | * | 数据 | 节点不存在 → 重新列表 |
| 4 | error-recovery | recovery-file-not-found | sync_tokens | 数据 | 文件不存在 → 检查路径 |
| 4 | error-recovery | recovery-parse-error | sync_tokens | 数据 | JSON 格式错误 → 格式要求 |
| 4 | error-recovery | recovery-response-too-large | * | 数据 | 响应过大 → 缩小范围 |
| 5 | session-update | design-decisions | create_frame | 代码 | 提取颜色/字体/间距 → session |
| 5 | session-update | record-creation-debt | create_frame | 代码 | 记录未验证的创建 |
| 5 | session-update | record-verification | verify_design, lint_fix_all | 代码 | 清除验证债务 |
| 5 | session-update | error-journal | * | 代码 | 记录错误到 journal（1 小时 TTL） |

### 代码型 vs 数据型

| 类型 | 位置 | 编辑者 | 构建 | 特点 |
|------|------|--------|------|------|
| 代码型 | `harness/rules/*.ts` | 开发者 | `npm run build` | 有复杂逻辑（async 调用、session 操作、递归遍历） |
| 数据型 | `content/harness/*.yaml` | UX 设计师/开发者 | `npm run content` | 纯数据（正则模式 + 建议文案） |

分离触发条件：当规则的维护者不是开发者时，将数据部分提取到 YAML。FigCraft 的 UX 设计师维护 recovery 建议和 next-steps 引导，因此这些数据从 TypeScript 提取到了 YAML。

## 核心机制

### Verification Harness：解决"AI 误以为创建好了"

**问题**：`create_frame` 返回 `{id, name, width, height}` → AI 解读为"没问题" → 跳过验证 → 直接告诉用户"完成了"。

**方案**：两个递进的 harness 规则：

**1. Auto-verify（Layer 2）**：`create_frame` 成功后，系统自动运行 `lint_check` 并注入质量分。

```
Before: { "id": "1:234", "name": "Login Screen" }
After:  { "id": "1:234", "name": "Login Screen",
          "_qualityScore": 72,
          "_qualityWarning": "⚠️ 4 quality issues (1 error). Call verify_design() to fix." }
```

条件化执行（避免性能问题）：仅根级节点、跳过 dryRun、items[] 整体一次、5s 超时保护。

**2. Verification Debt Tracker（Layer 2+5）**：追踪未验证的创建，在所有后续响应中持续提醒。

```
Turn 1: create_frame → { _verificationDebt: {unverifiedCount: 1} }
Turn 2: nodes(list)  → { ..., _verificationDebt: {unverifiedCount: 1} }  ← 持续提醒
Turn 3: verify_design → debt 清零
```

### Error Recovery：解决"AI 盲目重试"

**问题**：工具失败后 AI 用相同参数重试，或者用错误的方式修复。

**方案**：数据驱动的错误分类 + 恢复建议。

```yaml
# content/harness/recovery-patterns.yaml
- name: token-not-found
  patterns: ["variable.*not found", "token.*not found"]
  suggestion: >-
    Call search_design_system(query:"<token name>") to find available tokens.
```

编译为 TypeScript → 运行时匹配错误消息 → 在 error response 中注入 `_recovery`。

Recovery 还包含 `_recentErrors`（来自 error journal），帮助 AI 看到同类历史错误。

### Cross-turn Memory：解决"AI 重复犯错"

**问题**：AI 在同一 session 中反复犯同样的错（用不存在的 token、传错误的格式）。

**方案**：`DesignSession.errorJournal` 记录最近 10 条错误（1 小时 TTL）。在 `get_mode` 返回的 `_workflow._recentErrors` 中注入，AI 在每次设计循环开始时看到历史错误。

## 设计原则

| # | 原则 | 实践 |
|---|------|------|
| 1 | **能代码强制的不写文档** | 新规则第一问："能在 harness 里实现吗？" |
| 2 | **约束放在最近的执行点** | Pre-execution guard > response hint > workflow doc > IDE prompt |
| 3 | **推断必须透明** | `_applied`、`_qualityScore`、`_recovery` 让 AI 看到系统做了什么 |
| 4 | **AI 显式声明永远优先** | 系统只填空、不覆盖 AI 显式传的值 |
| 5 | **默认 warning，高频确定性才升级规则** | 同一遗漏 2+ 次 + 答案唯一 + 不覆盖显式值 → 升级 |
| 6 | **单一事实源，多端消费** | 规则在 MCP Server 代码中，5+ IDE 自动继承 |

## 资产架构

```
content/harness/                        ← 数据型规则（UX 设计师可编辑）
├── recovery-patterns.yaml              6 个错误→恢复映射
└── next-steps.yaml                     2 个工具→后续步骤

    │ npm run content
    ▼

packages/core-mcp/src/harness/
├── _harness.ts                         ← 编译产物（正则 + 建议文案）
├── types.ts                            ← 接口定义
├── pipeline.ts                         ← Pipeline 执行器
├── index.ts                            ← 规则注册
└── rules/
    ├── data-recovery.ts                ← 从 _harness.ts 生成 recovery 规则
    ├── next-steps.ts                   ← 从 _harness.ts 读取后续步骤
    ├── auto-verify.ts                  ← 自动 lint + 质量分
    ├── verification-debt.ts            ← 债务追踪 + 提醒
    ├── design-preflight.ts             ← get_mode 前置检查
    ├── resolve-icons.ts                ← icon → SVG 转换
    ├── content-warnings.ts             ← 占位符检测
    ├── design-decisions.ts             ← 设计决策提取
    ├── response-size.ts                ← 响应截断
    └── error-journal.ts                ← 错误日志
```

## 与 Opinion Engine 的关系

Opinion Engine 和 Harness Pipeline 解决不同层面的问题：

| | Opinion Engine | Harness Pipeline |
|---|---|---|
| 解决的问题 | AI 传参不对（属性遗漏、冲突） | AI 流程不对（跳步、不验证、盲目重试） |
| 运行位置 | Plugin 侧（Figma sandbox） | MCP Server 侧（Node.js） |
| 约束层面 | 四层决策模型的第③④层（属性 + API） | 四层决策模型之外的流程控制 |
| 输入 | `create_frame` 参数 | 所有 `bridge.request()` 调用 |
| 输出 | `_applied`（推断透明度） | `_qualityScore`、`_verificationDebt`、`_recovery` |

```
四层决策模型：

① 创意决策（色彩/风格）    ← AI 负责
② 结构决策（元素/层级）    ← AI 负责
③ 属性决策（怎么配）       ← Opinion Engine 兜底（Plugin 侧）
④ API 执行（时序/限制）    ← Opinion Engine 封装（Plugin 侧）

流程控制（横切关注点）      ← Harness Pipeline（MCP Server 侧）
  ├─ 创建前：验证 get_mode 已调用
  ├─ 创建时：icon 解析、参数预处理
  ├─ 创建后：质量分、债务追踪、设计决策提取
  ├─ 出错时：错误分类 + 恢复建议
  └─ 跨 turn：错误日志 + 历史错误注入
```

## 关键文件索引

| 能力 | 文件 |
|------|------|
| Pipeline 类型定义 | `packages/core-mcp/src/harness/types.ts` |
| Pipeline 执行器 | `packages/core-mcp/src/harness/pipeline.ts` |
| 规则注册 | `packages/core-mcp/src/harness/index.ts` |
| Bridge 集成 | `packages/core-mcp/src/bridge.ts` (`request()` + `sendRequest()`) |
| Session 状态 | `packages/core-mcp/src/design-session.ts` |
| Recovery YAML | `content/harness/recovery-patterns.yaml` |
| Next-steps YAML | `content/harness/next-steps.yaml` |
| 编译脚本 | `scripts/compile-content.ts` (`compileHarness()`) |
| Schema 编译 | `scripts/compile-schema.ts` (生成 `isWrite`/`toolName` 参数) |
| 测试 | `tests/core-mcp/harness/` (pipeline, verification, recovery, journal) |
| 维护手册 | `docs/asset-maintenance.md` Section 7 |
| IDE 字段参考 | `content/ide-shared/harness-fields.md` |
