---
inclusion: fileMatch
fileMatchPattern: "packages/adapter-figma/src/ui.html,packages/adapter-figma/src/**/*.css"
description: "8dp Grid spacing rules — all dimension properties in UI code must follow the 8dp grid system"
---

# 8dp Grid Spacing Rules

When writing Plugin UI code (HTML/CSS) or setting dimensions via Figma MCP tools, all spacing must follow the 8dp grid system.

## Allowed Values

All padding, margin, gap, width, height, border-radius, itemSpacing, and similar dimension properties should prefer multiples of 4:

- **4px** — minimum spacing (compact element internals)
- **8px** — base spacing
- **12px** — small-medium spacing
- **16px** — standard spacing
- **24px** — medium-large spacing
- **32px** — large spacing
- **40px** — extra-large spacing
- **48px** — maximum spacing

2px is only allowed for very fine adjustments.

## Exceptions

- `border-width` / `strokeWeight`: 1px is allowed
- `font-size`, `line-height`, `letter-spacing`: not constrained
- `opacity`, `z-index`, `flex`, and other non-dimension properties: not constrained
