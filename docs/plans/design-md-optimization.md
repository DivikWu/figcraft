# FigCraft × DESIGN.md 优化计划（Review 后优化版）

## Context

原始计划 6 个 Phase 覆盖了 DESIGN.md 生态互通、Creator 模式一致性、颜色派生、lint 补齐、组件模板、自定义护栏。经代码级验证，核心数据通路（bridge → mode-logic → inline-tree → quality-engine）已成熟，扩展成本低。

本文档是基于代码验证的 **优化版**，修正了原计划的 5 类问题：
1. 优先级排序（Phase 1 P0 → P1，Phase 4 P1 → P0）
2. 接口设计过度语义化（改为扁平记录型）
3. 颜色函数包归属错误（adapter-figma → shared）
4. 缺失测试策略和向后兼容方案
5. 组件模板粒度未与页面模板区分

---

## 实施顺序（修正后）

```
Phase 2 (设计上下文持久化) ─→ Phase 3 (颜色自动派生)
  P0, 2-3 天, 零依赖           P1, 2-3 天, 依赖 Phase 2

Phase 4 (Elevation lint)     Phase 1 (DESIGN.md 导入/导出) ─→ Phase 6 (Guardrails)
  P0, 1-2 天, 零依赖           P1, 4-5 天                      P2, 1-2 天

                              Phase 5 (组件模板)
                                P2, 3-4 天, 独立
```

| Phase | 优先级 | 工作量 | 修正理由 |
|-------|-------|--------|---------|
| Phase 2 | **P0** | 2-3 天 | Creator 模式最大痛点 |
| Phase 4 | **P0** | 1-2 天 | 独立可交付，1-2 天填补 lint 空白 |
| Phase 3 | P1 | 2-3 天 | 依赖 Phase 2 |
| Phase 1 | P1 (原 P0) | 4-5 天 (原 3-4) | DESIGN.md 生态尚未成熟；正则 edge case 需更多测试 |
| Phase 5 | P2 | 3-4 天 (原 2-3) | 粒度区分 + dispatch 逻辑 |
| Phase 6 | P2 | 1-2 天 | 依赖 Phase 1 |
| **总计** | | **14-19 天** (原 12-16) | |

---

## Phase 2：Creator 模式设计上下文持久化（P0）

### 问题
Creator 模式下 `get_mode` 返回通用 `designPreflight`。第一屏选了 `#2665fd` 做 primary，第二屏不记得。

### 方案
Bridge 层新增 `designDecisions` 缓存，`get_mode` 返回时注入已有选择。

### 关键修正：接口设计
原计划用语义结构（`colors.primary`、`typography.headlineFont`），问题是语义推断不可靠（根节点 fill 不一定是 neutral，按钮 fill 不一定是 primary）。

**改为扁平记录型**，只记事实不做推断：
```typescript
interface DesignDecisions {
  fillsUsed: string[];      // 所有使用过的填充色 hex
  fontsUsed: string[];      // 所有使用过的字体
  radiusValues: number[];   // 所有使用过的圆角值
  spacingValues: number[];  // 所有使用过的间距值
  elevationStyle?: 'flat' | 'subtle' | 'elevated';
}
```
让 AI 在 `designPreflight` 中根据历史值自行决策语义角色。

### 修改文件
- `packages/core-mcp/src/bridge.ts` — 新增 `_designDecisions` 字段（getter/setter，遵循现有 `_selectedLibrary` 模式）
- `packages/core-mcp/src/tools/logic/mode-logic.ts:158-235` — `getModeLogic()` 注入动态 preflight
- `create_frame` 响应处理中提取设计决策（merge 策略，非 replace）

### 约束
- 仅 creator 模式生效（library 模式有 token 绑定）
- 缓存生命周期 = bridge 连接生命周期
- 不持久化到 clientStorage

### 测试策略
集成测试：连续 `create_frame` 调用后验证 `designDecisions` 累积正确、merge 不丢失

### 向后兼容
`_workflow` 新增 `establishedPalette` 字段，IDE skills 未使用该字段则自动忽略（JSON 忽略未知字段）

---

## Phase 4：Elevation 一致性 lint 规则（P0）

### 问题
38 条 lint 规则无 elevation/depth 维度覆盖。

### 方案
新增 2 条规则 + 扩展 AbstractNode。

### 关键修正
- `elevation-consistency` severity 改为 `heuristic`（非 `style`），因为混用 shadow 可能是有意设计（如卡片 + 分隔线）
- "同级" 定义明确为：**同一 auto-layout 容器的直接子节点**

### 修改文件
- `packages/quality-engine/src/types.ts` — AbstractNode 新增 `effects` 字段
- `packages/quality-engine/src/rules/layout/elevation-consistency.ts` — 新规则
- `packages/quality-engine/src/rules/layout/elevation-hierarchy.ts` — 新规则
- `packages/quality-engine/src/engine.ts` — ALL_RULES 注册
- `packages/adapter-figma/src/handlers/lint.ts` — node-simplifier 补充 effects 提取

### 测试策略
遵循现有 `tests/` 下 `describe('ruleName')` 模式

---

## Phase 3：颜色自动派生（P1，依赖 Phase 2）

### 问题
Creator 模式下用户只提供 primary，其他语义色需手动指定。

### 方案
`inline-tree.ts` 新增推断规则，根据已有色板自动派生 surface/on-surface/border。

### 关键修正：函数包归属
原计划将 `deriveSurfaceVariant`/`deriveOnSurface`/`deriveBorder` 放 `adapter-figma/utils/color.ts`。

但 Phase 2 的 `designDecisions` 在 MCP Server 侧（bridge.ts）也需要颜色计算。**`shared/src/color.ts` 当前只有 `hexToRgbTuple`**，需要将 `relativeLuminance`、`contrastRatio` 和新派生函数统一到 shared 包。

```
packages/shared/src/color.ts    ← 新增 relativeLuminance, contrastRatio, derive* 函数
packages/adapter-figma/src/utils/color.ts  ← 改为 re-export from shared
```

### 关键修正：亮度算法
`deriveOnSurface` 用 WCAG 对比度 4.5:1 阈值（复用 `contrastRatio`），不用简单的 `亮度 > 0.5`。

### 修改文件
- `packages/shared/src/color.ts` — 新增派生函数 + 迁移 luminance/contrast
- `packages/adapter-figma/src/utils/color.ts` — 改为 re-export
- `packages/adapter-figma/src/handlers/inline-tree.ts` — 新增 Step 7 推断规则

### 约束
- 仅 creator 模式生效
- 支持 `dryRun:true` 预览
- 不覆盖用户显式指定的颜色

### 测试策略
单元测试：color derive 函数 + inline-tree snapshot 测试

---

## Phase 1：DESIGN.md 导入/导出（P1）

### 问题
FigCraft 无法与 DESIGN.md 生态互通。

### 方案
新增 `export_design_md` / `import_design_md` 两个 MCP tools，归入 tokens toolset。

### 关键修正

1. **颜色语义推断降级策略**：优先匹配常见命名（`colors/primary`、`brand/primary`），无法推断归入 "Other"
2. **解析容错**：返回 `{ parsed: N, skipped: M, warnings: [...] }` 而非报错
3. **export 支持自定义描述**：新增 `overview?: string` 参数
4. **Components section 依赖**：`components(method:"list")` 在 `components-advanced` toolset（非 core），export 时需先 `load_toolset("components-advanced")`，或 Components section 标记为 optional

### 修改文件
- `packages/core-mcp/src/tools/design-md.ts` — 新文件，export + import 逻辑
- `schema/tools.yaml` — 新增 2 个工具定义
- 运行 `npm run schema` 重新生成 registry

### 测试策略
往返测试：export → import → export 结果一致

---

## Phase 5：组件级 UI 模板（P2）

### 问题
现有 9 个模板全是页面级（screen-level），缺少组件原子级。

### 关键修正

1. **命名区分粒度**：`page-dashboard.yaml` vs `component-button.yaml`，`get_creation_guide` dispatch 按前缀区分
2. **分批交付**：优先 button + input（最高频），其余后续
3. **exampleParams 参数化**：用模板变量（`$variant`、`$size`）替代枚举所有组合
4. **与 components-advanced 关系**：模板默认生成 Frame（不依赖 toolset），可选升级为 Component Set

### 修改文件
- `content/templates/component-*.yaml` — 新模板文件
- 运行 `npm run content` 编译

---

## Phase 6：自定义 Guardrails（P2，依赖 Phase 1）

### 关键修正
- 工具归入 **core toolset**（非新 toolset）
- 支持 `append_guardrails` 操作（追加而非全量替换）
- guardrails 仅注入 AI workflow prompt，**不影响 lint 引擎**（避免与 `spec-border-radius` 等规则重叠）

### 修改文件
- `packages/adapter-figma/src/handlers/storage.ts` — 新增 `figcraft:guardrails:` 前缀的 CRUD handlers
- `packages/core-mcp/src/tools/` — 新增 `set_guardrails` / `get_guardrails`
- `packages/core-mcp/src/tools/logic/mode-logic.ts` — 注入 `customGuardrails`
- `schema/tools.yaml` — 新增 2 个工具定义

---

## 不做的事

- 不引入 markdown 解析库（正则 + heading 分割足够）
- 不支持 DESIGN.md 实时双向同步（FigCraft 做单次导入/导出）
- 不在 Plugin UI 中新增编辑器（保持纯 HTML/CSS 约束）
- 不修改 library 模式的 token 绑定逻辑
- **不新增 skills**（26 个保持不变，变化集中在 MCP tools 和底层引擎）

## 验证

每个 Phase 交付后：
1. `npm run typecheck` 通过
2. `npm run test` 通过（新增测试覆盖）
3. E2E：Figma Plugin 连接 → 工具调用 → 结果验证
4. 更新 `docs/user-guide.md` 和 `CLAUDE.md`
