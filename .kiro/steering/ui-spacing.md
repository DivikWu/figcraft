---
inclusion: fileMatch
fileMatchPattern: "packages/adapter-figma/src/ui.html,packages/adapter-figma/src/**/*.css"
description: "8dp Grid 间距规则 — UI 代码中所有尺寸属性必须遵循 8dp grid 系统"
---

# 8dp Grid 间距规则

编写 Plugin UI 代码（HTML/CSS）或通过 Figma MCP 工具设置尺寸时，必须遵循 8dp grid 间距系统。

## 允许的数值

所有 padding、margin、gap、width、height、border-radius、itemSpacing 等尺寸属性优先使用 4 的倍数：

- **4px** — 最小间距（紧凑元素内部）
- **8px** — 基础间距
- **12px** — 中小间距
- **16px** — 标准间距
- **24px** — 中大间距
- **32px** — 大间距
- **40px** — 超大间距
- **48px** — 特大间距

2px 仅用于极小微调场景。

## 例外

- `border-width` / `strokeWeight`: 允许 1px
- `font-size`、`line-height`、`letter-spacing`: 不受约束
- `opacity`、`z-index`、`flex` 等非尺寸属性不受约束
