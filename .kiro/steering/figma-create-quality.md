---
inclusion: fileMatch
fileMatchPattern: "packages/adapter-figma/**,packages/quality-engine/**,.kiro/steering/figma-*"
description: "Figma 设计质量规则 — FigCraft lint 引擎检查的布局与结构规范"
---

# Figma 设计质量规则

以下规则由 FigCraft Quality Engine（35+ 条 lint 规则）自动检查和修复。无论设计是通过 Figma 官方 MCP 创建还是手动创建，这些规则都适用。

运行 `lint_fix_all` 可一键检查并自动修复所有可修复的问题。

## 1. 禁止空 Spacer Frame

不要用空 frame（Top Spacer、Bottom Spacer、Flex Spacer）撑开间距。应通过 auto-layout 的 `itemSpacing` 和 `padding` 控制间距。

## 2. 响应式子元素使用 STRETCH

auto-layout 容器中的输入框、按钮、分割线、内容区域应使用 `layoutAlign: STRETCH`。

## 3. HUG/STRETCH 悖论

父容器交叉轴为 HUG 时，子元素不能用 STRETCH（没有尺寸可填充）。给父容器设明确的交叉轴尺寸，或让父容器自身 STRETCH/FILL。

## 4. FILL 需要 auto-layout 父容器

不要在非 auto-layout 父容器的子元素上使用 FILL sizing。

## 5. 多子元素 Frame 必须有 auto-layout

包含 2 个以上子元素的 frame 必须启用 auto-layout（装饰性重叠除外）。

## 6. 按钮结构

按钮必须是 auto-layout frame，CENTER 对齐，显式高度（iOS ≥ 44pt / Android ≥ 48dp），有内部 padding。

## 7. 输入框结构

输入框必须是 auto-layout frame，有 stroke、cornerRadius、内部 padding 和文本子节点。

## 8. 表单子元素一致性

表单中所有交互子元素必须使用 `layoutAlign: STRETCH`。

## 9. 子元素不能溢出父容器

子元素的交叉轴尺寸必须在父容器内部空间内。

## 10. 语义化命名

每个 frame 必须有描述性名称，不能保留默认名称（如 "Frame 1"）。

## 11. 文字不能溢出或截断

所有文本节点必须在父容器内完整显示。

## 12. 移动端屏幕尺寸

iOS → 402×874（iPhone 16 Pro），Android → 412×915。

## 13. System Bar 全出血

System bar 必须贴顶，页面级 frame 的 padding 为零。

## 14. 填充元素需要 margin 时用 wrapper

带背景填充的元素需要水平 margin 时，使用透明 wrapper frame + padding。
