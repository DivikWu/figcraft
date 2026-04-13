# FigCraft 长期增长资产

FigCraft 的核心价值是让 AI 遵循设计规范做设计。项目有七类资产会随时间积累、复利增长，互相增强。

## 资产概览

| 资产 | 当前规模 | 复利效应 | 增长方式 |
|------|---------|---------|---------|
| **Skills** | 29 个 | AI 做得更好 | 新增/优化 skill |
| **Lint 规则** | 40 条（53% autoFix） | 质量底线自动抬高 | 新增规则 + autoFix |
| **Opinion Engine** | 10 项推断 + 13 项纠错 | 用户配置越来越少 | 新增智能默认值 |
| **UI 模板** | 9 种 × 3 tone = 27 变体 | 创建速度越来越快 | 新增模板 |
| **MCP 工具** | 116 个（39 core + 77 optional） | AI 能做的事越来越多 | 新增工具 |
| **Harness 规则** | 18 条（6 数据型 + 12 代码型） | AI 犯错概率越来越低 | 新增规则（YAML 或 TypeScript） |
| **测试套件** | 71 文件 / ~842 测试 | 迭代信心越来越强 | 跟随功能新增 |

## 增强循环

```
Skills（知识层）──引导 AI 正确使用──→ MCP 工具（能力层）
    ↑                                       │
    │                                       ▼
测试套件 ←── 保障 ←── Lint 规则（质量层）←── 检测输出
    │                       ↑
    │                       │
    ├── Opinion Engine（智能层）── 减少出错概率
    │
    └── Harness Pipeline（约束层）── 强制验证 + 错误恢复 + 跨 turn 学习
              ↑
              │
         UI 模板（结构层）── 提供正确骨架
```

每一层的增强都会放大其他层的效果。

---

## 一、Lint 规则

### 当前状态

40 条规则，5 个分类：

| 分类 | 规则数 | autoFixable | 占比 |
|------|--------|-------------|------|
| Layout & Structure（布局 + 结构） | 26 | 13 (50%) | 65% |
| Token（规范合规） | 6 | 6 (100%) | 15% |
| WCAG（无障碍） | 5 | 3 (60%) | 13% |
| Naming（命名） | 2 | 0 (0%) | 5% |
| Component（组件） | 1 | 0 (0%) | 2% |

**总体 autoFix 率：55%**（22/40）

### 增长方向

| 优先级 | 新规则方向 | 价值 |
|--------|-----------|------|
| P0 | **Naming autoFix** — default-name 和 placeholder-text 支持自动修复 | 现有 2 条规则变得完全自动化 |
| P1 | **Responsive 规则** — 检测固定宽度在小屏溢出、断点一致性 | 支撑未来 responsive-design skill |
| P1 | **Dark Mode 规则** — 检测硬编码颜色未绑定 mode-aware 变量 | 支撑 design-guardian 的 Dark Mode 段 |
| P2 | **动效规则** — 检测 prototype interaction 的一致性（如缺少 back navigation） | 支撑 prototype-analysis skill |
| P2 | **Content 规则** — 检测 Lorem ipsum、过短/过长文本、占位符内容 | 支撑 ui-ux-fundamentals 的 Content 段 |
| P3 | **品牌一致性** — 检测颜色/字体偏离品牌规范的程度 | 企业用户差异化价值 |

### 维护规范

- 新规则路径：`packages/quality-engine/src/rules/<category>/<rule-name>.ts`
- 实现 `LintRule` 接口，注册到 `engine.ts` 的 `ALL_RULES`
- `autoFixable: true` + `fixData` 支持自动修复
- 修复逻辑在 `packages/adapter-figma/src/handlers/lint.ts` 的 `lint_fix` handler

---

## 二、Opinion Engine

### 当前状态

10 项自动推断（create_frame 内置）：

| # | 推断 | 效果 |
|---|------|------|
| 1 | layoutMode 自动推断 | 有 padding/spacing/children 时自动设为 VERTICAL |
| 2 | layoutSizing 自动推断 | 交叉轴 FILL，主轴 HUG |
| 3 | FILL 排序 | 内部先 appendChild 再设 FILL（避免 Figma API 报错） |
| 4 | Parent 提升 | 子节点声明 FILL/HUG 但父无 layoutMode 时自动提升为 VERTICAL |
| 5 | FILL→HUG 降级 | 父 HUG 交叉轴时子 FILL 降级为 HUG（防 0 坍塌） |
| 6 | FILL+width 冲突检测 | 拒绝矛盾参数 |
| 7 | Token 自动绑定 | fillVariableName/strokeVariableName 自动匹配库变量 |
| 8 | 字体预加载 | 所有文本字体收集并行加载 |
| 9 | Per-child 错误清理 | 子节点创建失败自动删除孤儿 |
| 10 | 自动聚焦 | 视口滚动到创建的节点 |

13 项参数纠错（错误参数名 → 正确参数名）：
- `color` → `fill`，`backgroundColor` → `fill`，`gap` → `itemSpacing`，`borderRadius` → `cornerRadius` 等

### 增长方向

| 优先级 | 新推断 | 价值 |
|--------|-------|------|
| P1 | **方向推断增强** — 基于子节点数量和类型推断 H/V | 减少 layoutMode 显式声明 |
| P1 | **间距节奏推断** — 基于层级自动选择间距倍数（8/16/24/32） | 支撑 4px 网格系统 |
| P2 | **自动对比度修正** — fill 颜色与文本颜色对比度不足时自动调整 | 支撑 WCAG 规则 |
| P2 | **响应式宽度推断** — 基于 uiType 和 platform 自动设置合理尺寸 | 减少尺寸硬编码 |
| P3 | **图标尺寸推断** — 基于相邻文本 fontSize 自动匹配图标大小 | 视觉一致性 |

### 维护规范

- 推断逻辑在 `packages/adapter-figma/src/handlers/inline-tree.ts`
- 新推断需支持 `dryRun:true` 预览
- 纠错映射在同文件的 `PARAM_CORRECTIONS` 对象

---

## 三、UI 模板

### 当前状态

9 种 uiType，每种提供 3 个 tone 变体（共 27 变体）：

| uiType | 结构 | tone 变体 |
|--------|------|-----------|
| **login** | logo → form → social login | minimal / elegant / bold |
| **signup** | heading → form → social + login link | minimal / warm / bold |
| **onboarding** | step indicators → content → progress | minimal / guided / dynamic |
| **dashboard** | header + sidebar + content grid | minimal / data-heavy / visual |
| **list-detail** | list (thumbnail+meta) → detail | minimal / functional / elegant |
| **settings** | sidebar nav + property panels | minimal / grouped / advanced |
| **profile** | hero/banner + user info + actions | minimal / visual / social |
| **card-grid** | repeating cards + flexible sizing | minimal / spacious / compact |
| **checkout** | cart → shipping → payment → confirm | minimal / secure / progressive |

每种模板提供：`structure`（骨架）、`keyDecisions`（关键决策）、`pitfalls`（高频违规）、`exampleParams`（可直接用的 create_frame 参数）。

### 增长方向

| 优先级 | 新模板 | 场景 |
|--------|-------|------|
| P0 | **chat** | 聊天/消息界面（气泡、输入框、时间戳） |
| P0 | **data-table** | 数据表格（排序、筛选、分页） |
| P1 | **search-results** | 搜索结果（筛选面板、结果列表、空状态） |
| P1 | **media-player** | 音视频播放器（进度条、控制栏） |
| P1 | **map-view** | 地图界面（标注、侧边面板、搜索） |
| P2 | **calendar** | 日历/排程视图 |
| P2 | **email-inbox** | 邮件列表 + 阅读面板 |
| P2 | **kanban** | 看板视图（拖拽列） |

### 维护规范

- 模板定义在 `packages/core-mcp/src/tools/logic/mode-logic.ts` 的 `UI_PATTERNS` 对象
- 每个模板必须包含 `exampleParams`（可直接传给 create_frame 的完整参数）
- 新增模板后需验证：`get_creation_guide(topic:"ui-patterns", uiType:"new-type")` 返回正确

---

## 四、MCP 工具

### 当前状态

116 个工具，13 个 toolset + core：

| 类型 | Toolset | 工具数 | 加载方式 |
|------|---------|--------|---------|
| 核心 | core | 39 | 始终加载 |
| 可选 | components-advanced | 16 | load_toolset |
| 可选 | tokens | 11 | load_toolset |
| 可选 | shapes-vectors | 8 | load_toolset |
| 可选 | library-import | 7 | load_toolset |
| 可选 | variables | 6 | load_toolset |
| 可选 | prototype | 6 | load_toolset |
| 可选 | lint | 6 | load_toolset |
| 可选 | staging | 4 | load_toolset |
| 可选 | annotations | 4 | load_toolset |
| 可选 | auth | 3 | load_toolset |
| 可选 | pages | 3 | load_toolset |
| 可选 | styles | 2 | load_toolset |
| 可选 | debug | 1 | load_toolset |

### 增长方向

| 优先级 | 新工具/Toolset | 价值 |
|--------|---------------|------|
| P1 | **accessibility toolset** — 颜色对比度检测、焦点顺序分析 | 支撑 WCAG lint 规则的深度检查 |
| P1 | **responsive toolset** — 断点管理、多尺寸预览导出 | 支撑响应式设计 skill |
| P2 | **versioning toolset** — 设计版本对比、变更追踪 | 支撑设计审查工作流 |
| P2 | **batch toolset** — 跨页面/跨文件批量操作 | 大规模设计系统维护 |

### 维护规范

- 工具定义 single source of truth：`schema/tools.yaml`
- `npm run schema` 重新生成 registry
- 三种 handler 类型：bridge（自动生成）、endpoint（dispatch）、custom（手写）

---

## 五、测试套件

### 当前状态

71 个测试文件，~842 个测试：

| 包 | 覆盖范围 |
|----|---------|
| quality-engine | lint 规则正确性、autoFix 行为 |
| core-mcp | 工具注册、endpoint dispatch、schema 合约、harness pipeline、design session、workflow builder |
| adapter-figma | Plugin handler 逻辑、颜色转换、布局计算、组件分组 |
| contracts | monorepo 结构、公共接口、向后兼容、skill 同步 |
| 其他 | relay、benchmark、version |

### 增长策略

- **跟随功能**：每个新 lint 规则、Opinion Engine 推断、MCP 工具都需对应测试
- **合约测试**：确保 skill 结构、工具 schema、公共接口不被意外破坏
- **性能基准**：screen-benchmarks.test.ts 防止质量检查性能退化

---

## 六、MCP Prompts

### 当前状态

9 个注册 prompt（引导式工作流）：

| Prompt | 工作流 |
|--------|-------|
| sync-tokens | ask → preview → diff → sync |
| lint-page | check → summarize → fix |
| compare-spec | load → diff → categorize → recommend |
| auto-fix | check → filter fixable → confirm → fix → verify |
| generate-element | think → gather → propose → confirm → create → check |
| prototype-flow | scan → summarize → diagram → issues → improve |
| document-components | audit → detail → document → flag → suggest |
| review-design | inspect → apply rules → report → fix |
| text-replacement | scan → chunk → replace → verify → QA |

### 与 Skills 的关系

Prompts 是 MCP Server 内置的工作流模板，Skills 是 IDE 侧的知识加载。两者互补：
- **Prompt** → MCP 运行时返回给 AI 的步骤指引
- **Skill** → IDE 启动时加载的上下文知识

Phase 1 路线：将 prompt 的工作流知识包装为 skill，让 IDE 原生支持触发（见 [skills-strategy.md](skills-strategy.md)）。

---

## 投入优先级总览

| 排序 | 资产 | 理由 |
|------|------|------|
| 1 | **Lint 规则** | 最高 ROI——一次编写永久生效，autoFix 闭环 |
| 2 | **Skills** | Phase 1（prompt → skill）成本最低，覆盖率从 9% 提升到 ~15% |
| 3 | **UI 模板** | 用户感知最强，直接提升创建质量和速度 |
| 4 | **Opinion Engine** | 技术难度较高，但每项推断减少大量手动配置 |
| 5 | **MCP 工具** | 扩展能力边界，但需要 skill 配套才能发挥价值 |
| 6 | **测试套件** | 跟随以上 5 项同步增长，不独立排期 |
