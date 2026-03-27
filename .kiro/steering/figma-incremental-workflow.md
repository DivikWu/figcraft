---
inclusion: fileMatch
fileMatchPattern: "packages/adapter-figma/**,packages/core-mcp/src/tools/**,.kiro/steering/figma-*,.kiro/skills/figma-*"
description: "Figma 渐进式创建工作流 — 使用 FigCraft 工具创建 UI 时的强制规则"
---

# Figma 渐进式创建工作流

在使用 FigCraft 的 `execute_js`、`create_frame`、`create_text` 等工具创建 UI 元素时，必须遵循以下渐进式工作流：

## 核心原则

1. **每次 execute_js 只做一个小任务** — 创建一个 section、一个组件、或完成一个独立的修改。绝不在单个脚本中塞入整个 screen 的创建逻辑。
2. **创建后立即验证** — 每个 section 创建后，使用 `export_image` 截图验证结果，检查是否有裁切、重叠、文字溢出等问题。
3. **确认无误再继续** — 只有当前步骤验证通过后，才进入下一步。发现问题就针对性修复，不要重建整个 screen。
4. **始终返回节点 ID** — 每次调用都返回创建/修改的节点 ID，后续步骤需要这些 ID 作为输入。

## 推荐步骤顺序

对于创建完整页面/screen 的任务：

```
Step 1: 检查文件 — 发现已有页面、组件、变量、命名规范
Step 2: 创建 page wrapper frame，返回 ID
Step 3: 逐个创建 section（每个 section 一次 execute_js 调用）
  - 创建 section → 验证截图 → 确认无误 → 下一个
Step 4: 最终验证 — 对完整页面截图检查
```

## 创建完成后必须运行 lint

当本次对话中使用了 `create_frame`、`create_text` 或 `execute_js`（含创建操作）创建了 UI 元素后，在所有创建操作完成、回复用户之前，必须运行 `lint_fix_all` 进行质量检查并自动修复。规则：

- 如果后续还有更多创建操作，等全部完成后统一运行一次 `lint_fix_all` 即可
- 如果本次对话没有创建操作，或已经运行过 `lint_fix_all`，则无需重复运行
- `lint_fix_all` 的 `nodeIds` 参数应传入创建的顶层节点 ID，避免扫描整个页面

## 反模式（禁止）

- ❌ 在一个 execute_js 中创建整个 screen（包含 Status Bar + Header + Form + Buttons + Footer 等多个 section）
- ❌ 跳过截图验证直接进入下一步
- ❌ 出错后重建整个 screen 而不是针对性修复
- ❌ 创建了 UI 元素后不运行 lint_fix_all 就结束对话
