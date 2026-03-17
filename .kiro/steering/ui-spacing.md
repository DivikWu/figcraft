---
inclusion: auto
---

# 8dp Grid 间距规则

编写任何 UI 代码（HTML/CSS/Plugin UI）时，必须遵循 8dp grid 间距系统：

## 允许的数值

所有 padding、margin、gap、width、height、border-radius 等尺寸属性只能使用以下值：

- **4px** — 最小间距（紧凑元素内部）
- **8px** — 基础间距
- **12px** — 中小间距（4+8）
- **16px** — 标准间距（2×8）
- **24px** — 中大间距（3×8）
- **32px** — 大间距（4×8）
- **40px** — 超大间距（5×8）
- **48px** — 特大间距（6×8）

## 禁止的数值

- 奇数值：3px, 5px, 7px, 9px, 11px, 13px, 14px, 15px 等
- 非 4 倍数的偶数：6px, 10px, 14px, 18px, 22px 等（border-width 1-2px 除外）

## 例外

- `border-width`: 允许 1px, 2px
- `font-size`: 不受此规则约束
- `line-height`: 不受此规则约束
- `letter-spacing`: 不受此规则约束
- `opacity`, `z-index`, `flex` 等非尺寸属性不受约束
- 动画 `@keyframes` 中的百分比值不受约束
