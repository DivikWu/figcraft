---
name: iconography
description: "Icon rules: ordering in auto-layout (children array order = visual order), tool chain (icon_search -> icon_create with index), sizing, spacing, style consistency. Use when: icon/icons + create/place/add/order/position/wrong/layout, or when icons appear in wrong position."
---

# Iconography

## CRITICAL: Ordering

In auto-layout, `children` array order = visual render order.

- `icon_create(parentId, index: 0)` — icon appears FIRST (left/top)
- `icon_create(parentId)` without index — icon appears LAST (right/bottom)

Common pattern — icon BEFORE text:
```
icon_create({ icon: "lucide:search", parentId: "<frame-id>", index: 0, size: 20 })
```

## Quick Reference

| Pattern | icon index |
|---------|-----------|
| Search bar | `index: 0` (before input) |
| Nav item | `index: 0` (before label), chevron: omit (after) |
| Button leading icon | `index: 0` |
| Settings row | `index: 0` (before label) |

## Deep Guidance

Call `get_creation_guide(topic: "iconography")` for:
- Full ordering patterns table (10 UI scenarios)
- Tool chain details (library vs no-library mode)
- Sizing and spacing reference per context
- Color binding and style consistency rules
- All common pitfalls and prevention
