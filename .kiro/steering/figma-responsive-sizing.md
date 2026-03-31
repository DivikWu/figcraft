---
inclusion: auto
description: "Responsive sizing guide — FILL/HUG/FIXED rules, anti-patterns, and component sizing"
---

# Responsive Sizing Guide

## Top-Down Sizing: Outside In

Build layouts from the outside in:

1. Set the container first — every container needs an explicit width: `width` + `layoutSizingHorizontal: "FIXED"` for shells, or `layoutSizingHorizontal: "FILL"` inside an auto-layout parent.
2. Children fill the container — use `layoutSizingHorizontal: "FILL"` so they stretch. Use `layoutSizingVertical: "HUG"` so height follows content.
3. Only leaves use HUG on both axes — buttons, badges, icons, pills.

## FIXED / FILL / HUG

| Sizing | When to use | Examples |
|--------|------------|---------|
| FIXED | Explicit bounded widths | Screen shell (402×874), sidebar, modal, specimen frame |
| FILL | Children that adapt to parent | Cards, rows, panels, nav stacks, text that wraps. Use `minWidth`/`maxWidth` for responsive constraints. |
| HUG | Content-sized leaves only | Icons, badges, pills, button labels, chips |

## HUG/HUG Anti-Pattern

HUG on both axes is the most common cause of broken layouts. Problems:

1. Text never wraps — container grows to fit the longest line. Body text becomes a single very long line.
2. Layouts don't adapt — HUG containers ignore parent width. Cards won't stretch to fill columns.
3. FILL children collapse — child with FILL inside HUG parent has no space to fill. Result: 0-width collapse.
4. Cascading failures — one HUG/HUG at the top forces every child to resolve its own width.

HUG/HUG is only correct for:
- Buttons, pills, badges, chips — intrinsically-sized leaf elements
- Icon containers with fixed-size children
- Inline tags and status indicators

For everything else, set at least one axis to FIXED or FILL.

## Sizing by Node Role

| Node role | Horizontal | Vertical | Notes |
|-----------|-----------|----------|-------|
| Screen shell (mobile) | FIXED (402/412) | FIXED (874/915) | Always explicit dimensions |
| Section container | FILL | HUG | Stretches to parent, height follows content |
| Card / panel | FILL | HUG | Add `minWidth`/`maxWidth` for responsive bounds |
| Input / Button frame | FILL | HUG | Stretches to form width |
| Text in auto-layout | FILL | HUG | Wraps at parent width |
| Icon / badge | FIXED | FIXED | Explicit size (24×24, 48×48) |
| Multi-screen wrapper | HUG | HUG | Children are FIXED screens |
| Sidebar | FIXED | FILL | Fixed width, stretches vertically |

## Wrapping Layouts (layoutWrap)

`layoutWrap: "WRAP"` enables children to flow into new rows. Only works with HORIZONTAL auto-layout.

When to use: card grids, tag/chip collections, any layout where items reflow.

```json
{
  "layoutMode": "HORIZONTAL",
  "layoutWrap": "WRAP",
  "itemSpacing": 16,
  "counterAxisSpacing": 16
}
```

Children use FIXED width to control column count. `counterAxisSpacing` sets the gap between wrapped rows.

Vertical grid alternative (VERTICAL layouts cannot wrap):
```
outer (HORIZONTAL, itemSpacing: 20, FILL width)
  col-1 (VERTICAL, FILL width, HUG height, itemSpacing: 20)
  col-2 (VERTICAL, FILL width, HUG height, itemSpacing: 20)
  col-3 (VERTICAL, FILL width, HUG height, itemSpacing: 20)
```

## Component Sizing

Component roots use FILL when placed in a parent — they adapt to context. Use FIXED only for the specimen (component definition preview width).

Example sidebar item instance:
- Instance: FILL in parent nav stack
- Icon child: FIXED 18×18
- Label child: FILL
- Badge child: HUG

## Text Sizing

- Body text inside containers: FILL width + HUG height + `textAutoResize: "HEIGHT"` (wraps at parent width)
- Single-line labels: FILL horizontal (truncates if needed)
- Standalone headings: HUG is fine
- Smart default: text in VERTICAL parent auto-gets FILL width + HEIGHT resize

## Checklist

Before finalizing a layout:
1. No container with text has HUG on the horizontal axis (unless button/badge)
2. Children use FILL on the axis that absorbs available space — not blindly on both axes
3. Top-level containers have explicit width (FIXED) or stretch to parent (FILL)
4. Run `lint_fix_all` to catch overflow-parent, unbounded-hug, and fixed-in-autolayout issues
