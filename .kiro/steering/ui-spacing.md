---
inclusion: auto
description: "8dp Grid 间距规则 — UI 代码中所有尺寸属性必须遵循 8dp grid 系统"
---

# 8dp Grid 间距规则

编写任何 UI 代码（HTML/CSS/Plugin UI）时，必须遵循 8dp grid 间距系统：

## 允许的数值

所有 padding、margin、gap、width、height、border-radius 等尺寸属性只能使用 **2 的倍数**：

- **2px** — 极小间距（微调、细线间距）
- **4px** — 最小间距（紧凑元素内部）
- **8px** — 基础间距
- **12px** — 中小间距（4+8）
- **16px** — 标准间距（2×8）
- **24px** — 中大间距（3×8）
- **32px** — 大间距（4×8）
- **40px** — 超大间距（5×8）
- **48px** — 特大间距（6×8）

## 禁止的数值

- 奇数值：3px, 5px, 7px, 9px, 11px, 13px, 15px 等
- 非 2 倍数的值：不存在，因为所有偶数都是 2 的倍数
- 但应优先使用 4 的倍数（4, 8, 12, 16, 24, 32...），2px 和 6px 仅用于极小场景

## 例外

- `border-width`: 允许 1px, 2px
- `font-size`: 不受此规则约束
- `line-height`: 不受此规则约束
- `letter-spacing`: 不受此规则约束
- `opacity`, `z-index`, `flex` 等非尺寸属性不受约束
- 动画 `@keyframes` 中的百分比值不受约束
