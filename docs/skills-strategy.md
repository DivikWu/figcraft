# FigCraft Skills 长期战略

Skills 是 FigCraft 的核心资产——MCP 工具之上的**知识层**。工具是"手"（能做什么），Skills 是"脑"（怎么做好）。

## 当前资产

### 11 个 Skills

| 分类 | Skill | 覆盖能力 |
|------|-------|---------|
| 设计规则 | ui-ux-fundamentals | 通用设计质量（排版/间距/内容/无障碍） |
| 设计规则 | design-creator | 无库模式设计决策 |
| 设计规则 | design-guardian | 有库模式 Token 优先级 |
| 声明式创建 | figma-create-ui | create_frame + Opinion Engine 全流程 |
| Plugin API | figma-use | execute_js 基础规则 |
| Plugin API | figma-generate-design | 用 JS 逐段建屏 |
| Plugin API | figma-generate-library | 用 JS 建设计系统 |
| 辅助 | figma-implement-design | Figma → Code |
| 辅助 | figma-code-connect-components | 组件-代码映射 |
| 辅助 | figma-create-design-system-rules | 生成 IDE 规则 |
| 辅助 | figma-create-new-file | 创建空白文件 |

### 未覆盖的能力

| 能力 | 现有资源 | 缺失 |
|------|---------|------|
| 原型流程分析 | prototype-flow prompt + 6 个工具 | 无 skill |
| 组件文档生成 | document-components prompt + 16 个工具 | 无 skill |
| 设计审查 | review-design prompt | 无 skill |
| 批量文本替换 | text-replacement prompt | 无 skill |
| DTCG 规范对比 | compare-spec prompt | 无 skill |
| 高级标注 | annotations 4 个工具 | 无 prompt 无 skill |
| 高级变量管理 | variables 7 个工具 | 无 skill |

## 维护规范

### 目录约束

- **必须扁平**：`skills/<skill-name>/SKILL.md`，Claude Code / Kiro 只扫描直接子目录（不递归）
- **分类通过 README.md** 文档分组，不用目录层级
- **设计规则 skill** 是 MCP Server 的 source of truth，构建时拷贝到 dist/（去 frontmatter）

### SKILL.md 结构规范

```markdown
---
name: skill-name
description: "一句话描述，含触发关键词"
---

# 标题

[简述用途和适用场景]

## Design Direction（如涉及 UI 创建）
1. Always first → load skill: `ui-ux-fundamentals`
2. Library selected → load skill: `design-guardian`
3. No library → load skill: `design-creator`

## Workflow
[步骤化流程]

## Skill Boundaries
[明确边界：什么该用这个 skill，什么该转到其他 skill]
```

### 更新流程

1. 修改 `skills/<name>/SKILL.md`（source of truth）
2. 如果是设计规则 skill → `npm run build` 自动拷贝到 dist/
3. 如果涉及跨 skill 引用 → 检查所有引用方的 SKILL.md
4. `npm test` 确保合约测试通过

## 拓展路线

### Phase 1：将现有 Prompt 提升为 Skill（低成本高收益）

9 个 MCP prompt 已有完整工作流定义，包装为 SKILL.md 即可：

| 优先级 | Prompt → Skill | 价值 |
|--------|---------------|------|
| P0 | review-design → **design-review** | 创建后自动审查，形成"创建→审查"闭环 |
| P0 | lint-page → **design-lint** | lint + 自动修复全流程 |
| P1 | document-components → **component-docs** | 组件文档自动化 |
| P1 | prototype-flow → **prototype-analysis** | 原型分析 + 流程图生成 |
| P2 | text-replacement → **text-replace** | 批量文本/本地化 |
| P2 | compare-spec → **spec-compare** | DTCG 与 Library 对比 |
| P2 | sync-tokens → **token-sync** | Token 同步全流程 |

### Phase 2：新能力 Skill（中期）

| Skill | 能力 | 依赖 |
|-------|------|------|
| **responsive-design** | 响应式设计（Web 断点、多尺寸适配） | get_creation_guide(topic:"responsive") 已有 |
| **content-states** | 空状态/错误状态/加载状态设计 | get_creation_guide(topic:"content-states") 已有 |
| **platform-ios** | iOS 平台特定规则（安全区、手势、HIG） | 需新建 |
| **platform-android** | Android 平台规则（Material、48dp） | 需新建 |
| **design-handoff** | 设计交付（标注、间距、颜色规范导出） | annotations 工具已有 |

### Phase 3：高级编排 Skill（长期）

| Skill | 能力 | 复杂度 |
|-------|------|--------|
| **design-system-audit** | 设计系统健康度检查（覆盖率、一致性、过时组件） | 高 |
| **migration-assistant** | 设计系统版本迁移（Token 映射、组件替换） | 高 |
| **multi-brand** | 多品牌 Token 切换 + 验证 | 高 |

## Skill 编排模式

### 组合模式（已验证）

```
figma-create-ui
  └── loads: ui-ux-fundamentals + design-guardian/design-creator

figma-generate-design
  └── loads: figma-use + ui-ux-fundamentals + design-guardian/design-creator
```

### 链式模式（Phase 1 目标）

```
创建 → 审查 → 修复 闭环：
  figma-create-ui → design-review → design-lint
```

### 场景模式（Phase 2 目标）

```
"为 iOS 创建登录页"：
  figma-create-ui + platform-ios + ui-ux-fundamentals + design-guardian
```

## 质量衡量

| 指标 | 当前 | Phase 1 后 | 目标 |
|------|------|-----------|------|
| Skill 覆盖率 | 11 skills (~9%) | 18 skills | 每个用户工作流都有 skill |
| 创建质量 | — | lint 违规率对比 | 有 skill < 无 skill |
| Token 绑定率 | — | 自动绑定成功率 | >90% |
| 审查通过率 | — | 首次创建通过率 | >70% |
