# FigCraft — 项目定位、功能与路线

## 一、项目定位

**一句话**：AI 驱动的 Figma MCP Server，让任何 IDE 中的 AI 遵循设计规范做设计。

### 核心身份

FigCraft 不是 AI Agent — 它是 **MCP 工具提供者**。Agent Loop、上下文管理、权限、记忆由宿主 IDE（Claude Code / Cursor / Kiro / Codex / Antigravity）拥有。FigCraft 的价值在于：

1. **桥接 IDE 与 Figma** — 通过 MCP 协议 + WebSocket Relay，让 AI 能声明式地创建和修改 Figma 设计
2. **编码设计知识** — 43 条 lint 规则、9 种 UI 模板、三层设计规则、Opinion Engine 推断，确保 AI 产出的 UI 符合设计规范
3. **双模式规范** — 支持 Figma 共享库（Library 模式）和 DTCG JSON 规范文档（Spec 模式），不绑定任何特定设计系统

### 差异化

| | 直接用 Figma Plugin API | 其他 AI 设计工具 | FigCraft |
|---|---|---|---|
| 创建方式 | 命令式 JS | 不可控的生成 | 声明式 MCP + Opinion Engine 自动推断 |
| 质量保证 | 无 | 无或黑盒 | 43 条 lint 规则 + 创建后自检 |
| 设计规范 | 手动遵循 | 不支持 | 自动绑定 Library Token / DTCG 规范 |
| 多 IDE | 不适用 | 单平台 | 任何支持 MCP 的 IDE 共享同一套规则 |

---

## 二、架构

```
IDE (Claude Code / Cursor / Kiro / Codex / Antigravity)
    │ MCP (stdio)
    ▼
MCP Server (Node.js, ESM)              ← packages/core-mcp + figcraft-design
    │ WebSocket
    ▼
WS Relay (port 3055-3060)              ← packages/relay
    │ WebSocket
    ▼
Figma Plugin
    ├─ UI iframe (WebSocket 连接)       ← packages/adapter-figma/src/ui.html
    └─ code.js sandbox (Plugin API)     ← packages/adapter-figma/src/code.ts
```

**关键约束**：
- Plugin code.js 可调 Figma API，无网络
- UI iframe 有网络（WebSocket），无 Figma API
- 两者通过 postMessage 桥接
- 所有请求通过 SerialTaskQueue 串行执行（保护 Figma API）

---

## 三、功能清单

### 3.1 工具体系（~136 个工具）

| 层级 | 数量 | 说明 |
|------|------|------|
| 核心工具 | 31 | 始终启用：ping, get_mode, create_frame, lint_fix_all, verify_design 等 |
| 可选工具集 | 13 组 | 按需加载：variables, tokens, styles, prototype, lint, debug 等 |
| 端点 API | 5 个 | nodes/text/components/variables_ep/styles_ep，共 30+ 方法 |

### 3.2 UI 创建系统

**Opinion Engine**（create_frame 内置）：
- 双轴 sizing 自动推断（FILL/HUG 上下文感知）
- FILL 顺序处理（先 appendChild 再设置）
- FILL+width 冲突检测
- 父容器自动提升（children 需要 FILL 时 parent 自动获得 layoutMode）
- 跨层级 FILL→HUG 降级
- Token 自动绑定（fillVariableName → library variable）
- Font 模糊匹配（"700" → "Bold", "SemiBold" → "Semi Bold"）
- dryRun 预验证模式
- 失败清理（创建失败自动删除孤立节点）

**UI 类型模板**（9 种）：
login, signup, onboarding, dashboard, list-detail, settings, profile, card-grid, checkout

每种包含：节点层级结构、关键决策点、常见 lint 陷阱、3 种风格变体（minimal/warm/bold）

**创建指南**（8 个 topic）：
layout, multi-screen, batching, tool-behavior, opinion-engine, ui-patterns, responsive, content-states

### 3.3 质量引擎（43 条规则）

| 分类 | 数量 | 代表规则 |
|------|------|---------|
| Layout | 12 | empty-container, text-overflow, no-autolayout, mobile-dimensions |
| Structure | 13 | button-structure, input-field-structure, form-consistency, screen-shell-invalid |
| Token/Spec | 6 | hardcoded-token, spec-color, spec-typography, no-text-style |
| WCAG | 5 | wcag-contrast (4.5:1), wcag-target-size (44/48px), wcag-text-size |
| Naming | 2 | default-name, placeholder-text |
| Component | 1 | component-bindings |

**自动修复**：大部分规则支持 declarative FixDescriptor → 自动生成 fixCall
**Prevention Checklist**：每条规则的 AI 元数据（preventionHint）在创建前提醒
**Preflight Audit**：lint 结果按 designPreflight 分类汇总（colorConsistency/typographyBound/semanticNaming/touchTargets/emptyContainers）

### 3.4 设计规则体系（三层）

| 层 | 文件 | 触发条件 |
|----|------|---------|
| 通用基础 | ui-ux-fundamentals.md | 始终生效 |
| Library 守卫 | design-guardian.md | 选择了共享库 |
| 无库创造 | design-creator.md | 未选择库 |

涵盖：Typography、Spacing、Content、Content States、Iconography、Elevation、Composition、Anti-Slop、Accessibility、Dark Mode、Conflict Resolution

### 3.5 Token 同步

| DTCG $type | Figma 目标 | 推断逻辑 |
|-----------|-----------|---------|
| color | Variable (COLOR) | ALL_FILLS + STROKE_COLOR |
| dimension/number | Variable (FLOAT) | 按名称推断 scope |
| fontFamily | Variable (STRING) | FONT_FAMILY |
| typography | Text Style | 复合类型拆解 |
| shadow | Effect Style | 复合类型 |

### 3.6 响应优化（面向 Harness）

- **紧凑 JSON**：数据密集型工具无缩进输出（-25~30% token）
- **渐进式详情**：summary/standard/full 三级节点详情
- **结构化截断**：超大响应返回有效 JSON（非 json.slice）
- **_workflow diff-aware**：重复 get_mode 返回缓存标记（-80% token）
- **readOnlyHint**：所有工具标注只读/写入，允许 Harness 并行调用
- **复合工具**：verify_design（lint+export 合一）、nodes get_batch（批量读取）

### 3.7 质量反馈闭环

- **Lint 违规统计**：session 级频率追踪（lint_stats 工具）
- **频率排序**：getPreventionChecklist(sortBy:"frequency") 高频违规优先
- **Preflight Audit**：lint_fix_all / verify_design 返回 _preflightAudit
- **基准测试**：48 个标准场景，规则变更后回归检测

---

## 四、双模式操作

| 模式 | Token 来源 | Lint 方式 | 场景 |
|------|-----------|----------|------|
| **Library** | Figma 共享库 Variables/Styles | 检查节点是否绑定了 Library Token | 设计师日常设计 |
| **Spec** | DTCG JSON 文件 | 检查节点值是否匹配 DTCG Token 值 | 从规范文档同步验证 |

切换：`set_mode(mode, library?)` → `get_mode` 获取新的 _workflow

---

## 五、工作流（AI 创建 UI 的标准流程）

```
1. ping                          → 验证连通性
2. get_mode                      → 获取模式 + designContext + _workflow
3. get_creation_guide(ui-patterns, uiType) → 获取 UI 类型模板
4. [AI 呈现设计方案]              → ⛔ 等待用户确认
5. create_frame + children        → 声明式创建（Opinion Engine 自动推断）
6. verify_design                  → lint + export + _preflightAudit 一次性验证
7. [根据违规修复]                 → nodes(method:"update") 或手动调整
```

---

## 六、技术栈

| 层 | 技术 |
|----|------|
| 语言 | TypeScript (strict, ESM) |
| MCP SDK | @modelcontextprotocol/sdk + stdio transport |
| WebSocket | ws (port 3055-3060, auto-switch) |
| Plugin | Figma Plugin API (code.js sandbox + ui.html iframe) |
| 构建 | tsup (Plugin IIFE + Server ESM) |
| Schema | Zod (MCP 工具参数校验) |
| 规则引擎 | 自研 quality-engine（AbstractNode 解耦 Figma API） |
| 测试 | vitest (654 tests, 37 files) |
| 包管理 | npm workspaces |
| 发布 | npx figcraft-design (v0.1.1) |

---

## 七、产品路线

### 已完成（v0.1.x — 当前）

- [x] 三组件中继架构（MCP Server + Relay + Plugin）
- [x] 双模式操作（Library / Spec）
- [x] 136 个 MCP 工具（31 核心 + 13 工具集）
- [x] Opinion Engine（10 条推断规则）
- [x] 质量引擎（43 条 lint 规则 + 自动修复）
- [x] DTCG Token 同步（幂等、全类型映射）
- [x] 9 种 UI 类型模板 + 8 个创建指南 topic
- [x] 三层设计规则（fundamentals + guardian + creator）
- [x] 响应优化（紧凑 JSON + 渐进详情 + 结构化截断 + workflow diff）
- [x] 质量反馈闭环（lint_stats + _preflightAudit + 48 场景基准）
- [x] 多 IDE 支持（Claude Code / Cursor / Kiro / Antigravity / Codex）
- [x] readOnlyHint 注解 + 复合工具 (verify_design / get_batch)

### 短期（v0.2.x — 知识资产迭代）

通过实际 UI 创建转动价值飞轮：

- [ ] 从实际创建中提取新 lint 规则（如 missing-empty-state, web-responsive-missing）
- [ ] 基于 lint_stats 数据调整规则 severity 和 prevention checklist 优先级
- [ ] 补充 UI 模板的 keyDecisions（从实际违规中发现遗漏）
- [ ] 扩展基准测试场景（tablet、web、暗色模式变体）
- [ ] Opinion Engine 新增推断（从重复的创建模式中提炼）

### 中期（v0.3.x — 深度集成）

- [ ] 组件智能：从 Library 组件自动推断创建策略（Instance 优先于 Frame）
- [ ] 多屏联动：跨屏一致性检查（颜色、字体、间距）
- [ ] 原型自动化：基于屏幕流自动生成 Prototype 交互
- [ ] 设计系统健康度：Library Token 覆盖率 + 使用率报告
- [ ] Figma REST API 补充：离线模式下的 fallback（部分已实现）

### 长期（v1.0 — 设计质量平台）

- [ ] 设计评审工作流：AI 对设计稿进行结构化评审（已有 review-design prompt）
- [ ] 团队规范管理：DTCG Token 文件版本管理 + diff + merge
- [ ] 设计度量：长期质量趋势追踪（跨文件、跨项目）
- [ ] 插件市场发布：Figma Community Plugin
- [ ] 规则市场：社区贡献的 lint 规则包

---

## 八、核心价值观

1. **知识资产是壁垒** — 基础设施谁都能搭，通过实践迭代积累的设计规则、模板、推断规则才是真正价值
2. **工具不是 Agent** — FigCraft 提供工具，不拥有对话。记忆、压缩、权限留给 IDE
3. **声明式优于命令式** — create_frame + Opinion Engine 比 execute_js 更可靠、更可审计
4. **失败可检测** — 每条规则都有 prevention（创建前）+ detection（创建后）+ fix（自动修复）
5. **IDE 无关** — 一套规则，所有 IDE 共享。不为任何 IDE 做特殊适配
