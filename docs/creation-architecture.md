# FigCraft 创建架构：语义级 Opinion Engine

文档版本：2026-04-07

## 架构概览

FigCraft 的 UI 创建采用**声明式 + 语义级 Opinion Engine** 架构。AI 通过 `create_frame` 声明节点参数，Opinion Engine 在创建过程中自动推断缺失属性、补全语义角色、验证参数冲突。

```
AI 调用 create_frame(role:"screen", padding:24, fill:"#FFF", children:[...])
  │
  ├── ① 显式 role → pluginData 写入
  ├── ② ROLE_DEFAULTS → 补全 layoutMode:"VERTICAL", clipsContent:true
  ├── ③ inferLayoutMode → 检测到已有 layoutMode，跳过
  ├── ④ resize → 设置尺寸
  ├── ⑤ 属性设置 → fill/stroke/layout/effects
  ├── ⑥ responsive constraints → minWidth/minHeight
  ├── ⑦ auto-role → 多信号收敛（如果 AI 没传 role）
  │
  └── 响应: { id, _applied: ["role 'screen' default: layoutMode=VERTICAL", ...] }
```

## 四层决策模型

AI 创建设计时经过四层决策，每层有不同的责任归属：

| 层 | 决策 | 负责方 | 出错时 |
|---|------|--------|--------|
| ① 创意决策 | 色彩/风格/氛围 | AI | AI 核心能力，极少出错 |
| ② 结构决策 | 哪些元素、什么层级 | AI | LLM 擅长，中低错误率 |
| ③ 属性决策 | 每个元素怎么配 | **系统 + AI** | 系统通过 role→defaults 和推断规则兜底 |
| ④ API 执行 | Figma API 时序/限制 | **系统** | Opinion Engine 完全封装 |

**Level 2 的核心价值**：将第③层从"AI 独自负责"变为"系统兜底 + AI 可覆盖"。

## 语义角色系统（role）

### 概念

每个 `create_frame` 调用可以传 `role` 参数声明节点的语义角色。role 被写入 Figma pluginData，供 lint 规则和 Opinion Engine 使用。

### 三层作用

**1. Lint 确定性识别**

lint 规则优先读 role，不再依赖名字正则猜测：

```typescript
// looksLikeButton — 所有启发式函数统一模式
if (node.role === 'button') return true;           // role 确认
if (node.role && node.role !== 'button') return false;  // role 排除
// 以下为 fallback 启发式（仅在无 role 时触发）
```

已覆盖的规则：button-structure, input-field-structure, nested-interactive-shell, root-misclassified-interactive, cta-width-inconsistent。

**2. 默认属性补全（ROLE_DEFAULTS）**

```typescript
const ROLE_DEFAULTS: Record<string, Record<string, unknown>> = {
  screen: { layoutMode: 'VERTICAL', clipsContent: true },
  button: { layoutMode: 'HORIZONTAL', primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER' },
  input:  { layoutMode: 'HORIZONTAL', counterAxisAlignItems: 'CENTER' },
  header: { layoutMode: 'HORIZONTAL', counterAxisAlignItems: 'CENTER' },
};
```

只填充 `p[key] == null` 的属性——AI 显式传的任何值不会被覆盖。

**3. Auto-role 推断**

当 AI 没传 role 时，系统从结构信号自动推断：

```typescript
// 多信号收敛：4 个条件全部满足才触发
if (p.role == null && p.parentId == null && p.width != null && p.height != null && isScreenSize(frame)) {
  frame.setPluginData(PLUGIN_DATA_KEYS.ROLE, 'screen');
}
```

## 布局关系推断

Opinion Engine 不仅推断单节点属性，还基于父子布局关系推断 sizing：

| 规则 | 条件 | 推断 | 类型 |
|------|------|------|------|
| 交叉轴默认 FILL | 子节点在 auto-layout 父级中，无显式 sizing | 交叉轴 FILL | 属性级 |
| 主轴默认 HUG | 同上 | 主轴 HUG | 属性级 |
| 父级 HUG → 子节点降级 | 父级在交叉轴 HUG，子节点 FILL | FILL → HUG | 属性级 |
| **SPACE_BETWEEN + 单子节点** | 父级 SPACE_BETWEEN，仅 1 个子节点 | 主轴 FILL | **语义级** |
| **Screen 尺寸 → auto-role** | 根级 + 显式尺寸 + isScreenSize | role:"screen" | **语义级** |

语义级推断基于布局组合的**意图**而非单个属性，是 Level 2 的标志性能力。

## 推断透明度

所有确定性推断通过 `_applied` 字段返回给 AI：

```json
{
  "id": "1:234",
  "_applied": [
    "Screen: layoutMode=\"VERTICAL\" (role \"screen\" default)",
    "Screen: clipsContent=true (role \"screen\" default)",
    "Screen > Content: layoutSizingVertical=\"FILL\" (single child under SPACE_BETWEEN parent)"
  ],
  "_inferenceCount": 5
}
```

AI 能看到系统补全了什么，出错时能定位，下次能主动传正确参数。

## 组件文本语义命名

`create_component_from_node`（exposeText:true）自动给文本节点分配语义属性名：

| 优先级 | 条件 | 命名策略 |
|--------|------|---------|
| 1 | 设计师显式命名了 layer（不等于内容） | 保留设计师命名 |
| 2 | ≤4 个文本节点 | 按位置分配 title/description/detail/caption |
| 3 | >4 个文本节点 | 内容 slug 化（支持中英文） |

文本节点按垂直→水平位置排序，确保 title 是最上面的文本。

## 演进路线图

```
Level 1（属性级推断）→ Level 2（语义级推断）→ Level 3（意图式创建）
      已完成                  已完成                暂不做
```

### Level 3 暂不做的原因

- 第②层（结构决策）不是当前痛点——AI 的结构决策能力足够
- 预定义元素类型（email_input、primary_button）与通用产品定位矛盾
- 投入产出比低——需要新 API 设计 + 模板系统 + 意图解析层

### Level 3 的触发条件

- Level 2 稳定，第③层错误基本消除
- 用户反馈显示第②层（结构错误）成为主要痛点
- 9 个 ui-patterns 模板积累到可执行程度
- 市场出现类似竞品形成竞争压力

## 扩展操作手册

### 新 role 扩展

当 AI 反复为某类节点忘传同一组属性时：

1. **`write-nodes-create.ts`** — ROLE_DEFAULTS 加一行
2. **`schema/tools.yaml`** + **`create-frame.ts`** — role 描述加新值
3. **`content/guides/tool-behavior.md`** — Semantic Role 节加说明
4. `npm run schema && npm run content && npm run build`

### 新推断规则

当某种父子布局组合导致 AI 必须记违反直觉的参数时：

1. **`inline-tree.ts`** validateParams — 处理 inline children 路径
2. **`write-nodes-create.ts`** inferChildSizing — 处理 parentId 路径
3. `npm run build:plugin`

AI 不需要被告知——系统自动生效，`_applied` 被动学习。

### 新 auto-role 信号

当某类节点 AI 经常忘传 role 但有明显结构特征时：

1. **`write-nodes-create.ts`** setupFrame 末尾 — 加多信号收敛条件（至少 3 个独立信号）
2. `npm run build:plugin`

### 判断标准

| 加 | 不加 |
|---|---|
| 同一遗漏出现 2+ 次 | 只出现 1 次的偶发遗漏 |
| 规则是确定性的 | 规则是概率性的 |
| 只补全缺失值 | 会覆盖显式声明 |
| 加一行代码解决 | 需要新机制或架构变更 |

## 竞品对比（Vibma）

| 维度 | FigCraft | Vibma |
|------|----------|-------|
| 推断深度 | 更深（语义级 + 更多边界情况） | 属性级 |
| 推断透明度 | `_applied` 字段 | hints confirm/warn |
| 语义识别 | pluginData role 系统 | 无 |
| 参数负担 | role→defaults 减少 ~60% | 全部手传 |
| 文本语义 | title/description/detail/caption | 相同策略 |
| Staging | dryRun + two-path authoring | auto-stage |

## 关键文件索引

| 能力 | 文件 |
|------|------|
| ROLE_DEFAULTS + role 写入 + auto-role | `packages/adapter-figma/src/handlers/write-nodes-create.ts` |
| SPACE_BETWEEN 推断（inline children） | `packages/adapter-figma/src/handlers/inline-tree.ts` |
| Lint role-aware | `packages/quality-engine/src/rules/structure/*.ts` |
| 文本语义命名 | `packages/adapter-figma/src/handlers/write-nodes-instance.ts` |
| role Zod 定义 | `packages/core-mcp/src/tools/create-frame.ts` |
| role schema 定义 | `schema/tools.yaml` (create_frame params) |
| AI 指导 | `content/guides/tool-behavior.md`, `skills/*/SKILL.md` |
