---
inclusion: fileMatch
fileMatchPattern: "packages/adapter-figma/**,packages/core-mcp/src/tools/**,.kiro/steering/figma-*,.kiro/skills/figma-*"
description: "使用 FigCraft execute_js 构建设计系统库的工作流指南"
---

# 使用 execute_js 构建设计系统库

本指南将官方 `figma-generate-library` skill 的工作流适配到 FigCraft 的 `execute_js`。
核心原则：这不是一次性任务，需要 20-100+ 次 `execute_js` 调用，分阶段进行，每阶段需要用户确认。

使用 `execute_js` 前必须先阅读 #[[file:.kiro/steering/execute-js-guide.md]]。

## 强制工作流

### Phase 0: 发现（不写入任何内容）

1. 分析代码库 → 提取 tokens、组件、命名约定
2. 检查 Figma 文件 → 页面、变量、组件、样式、现有约定
3. 搜索已订阅的库 → 用 `list_library_components`、`list_library_variables` 查找可复用资产
4. 锁定 v1 范围 → 与用户确认 token 集 + 组件列表
5. 映射 code → Figma → 解决冲突（代码和 Figma 不一致时问用户）

⛔ 用户检查点：展示完整计划，等待明确批准

### Phase 1: 基础（tokens 必须在组件之前）

1. 创建变量集合和模式
2. 创建原始变量（原始值，1 个模式）
3. 创建语义变量（别名到原始变量，支持多模式）
4. 为所有变量设置 scopes（永远不要留 ALL_SCOPES）
5. 为所有变量设置 code syntax（WEB 必须用 `var()` 包裹）
6. 创建效果样式和文本样式

⛔ 用户检查点：展示变量摘要，等待批准

### Phase 2: 文件结构

1. 创建页面骨架：Cover → Getting Started → Foundations → --- → Components → ---
2. 创建基础文档页面（色板、字体样本、间距条）

⛔ 用户检查点：展示页面列表 + 截图

### Phase 3: 组件（逐个构建，按依赖顺序）

对每个组件：
1. 创建专用页面
2. 构建基础组件（auto-layout + 完整变量绑定）
3. 创建所有变体组合（combineAsVariants + 网格布局）
4. 添加组件属性（TEXT、BOOLEAN、INSTANCE_SWAP）
5. 验证：`get_current_page`（结构）+ `get_screenshot`（视觉）

⛔ 每个组件的用户检查点

### Phase 4: 集成 + QA

1. Code Connect 映射
2. 无障碍审计
3. 命名审计
4. 未解析绑定审计
5. 最终截图审查

## 关键规则

- 变量必须在组件之前——组件绑定到变量
- 检查后再创建——先用只读 `execute_js` 发现现有约定
- 每个组件一个页面
- 视觉属性绑定到变量——fills、strokes、padding、radius、gap
- 变量 scopes 必须明确设置：
  - 背景：`["FRAME_FILL", "SHAPE_FILL"]`
  - 文本：`["TEXT_FILL"]`
  - 边框：`["STROKE_COLOR"]`
  - 间距：`["GAP"]`
  - 圆角：`["CORNER_RADIUS"]`
  - 原始变量：`[]`（隐藏）
- Code syntax WEB 必须用 `var()` 包裹：`var(--color-bg-primary)`
- 语义变量别名到原始变量：`{ type: 'VARIABLE_ALIAS', id: primitiveVar.id }`
- combineAsVariants 后必须手动布局——变体默认堆叠在 (0,0)
- 永远不要并行 `execute_js` 调用——必须严格顺序执行
- 永远不要猜测节点 ID——从之前调用的返回值中读取

## Token 架构

| 复杂度 | 模式 |
|--------|------|
| < 50 tokens | 单集合，2 模式（Light/Dark）|
| 50-200 tokens | 标准：Primitives(1模式) + Color semantic(Light/Dark) + Spacing(1模式) |
| 200+ tokens | 高级：多语义集合，4-8 模式 |

## 变量命名约定

```
color/bg/primary     color/text/secondary    color/border/default
spacing/xs  spacing/sm  spacing/md  spacing/lg  spacing/xl
radius/none  radius/sm  radius/md  radius/lg  radius/full
```
