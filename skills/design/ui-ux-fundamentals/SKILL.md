---
name: ui-ux-fundamentals
description: "Shared UI/UX design quality rules for all FigCraft design work. Typography, spacing, content, iconography, elevation, composition, quality, accessibility. Always applies regardless of library mode."
---

# UI/UX Fundamentals

Universal design quality rules. Apply to ALL design work.

For full rules: `get_design_guidelines(category)` or `readFile` the source at `packages/core-mcp/src/prompts/ui-ux-fundamentals.md`

Key rules:
- Typography: heading/body distinction, ≤ 3 tiers
- Spacing: 8dp base, larger between groups
- Content: realistic text, no Lorem ipsum, no placeholder labels
- Icons: single style, consistent stroke weight
- Elevation: ≤ 3 shadows, no stacking
- Composition: clear focal point, prefer asymmetry, no uniform grids
- Quality: no cheap gradients/glow, vary corner radius by hierarchy
- Accessibility: 4.5:1 contrast, touch targets (iOS 44pt, Android 48dp, Web 24px)
