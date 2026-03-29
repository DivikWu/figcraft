---
inclusion: manual
description: "Redirects to figma-essential-rules.md which now contains all quality rules."
---

# Figma Design Quality Rules — Consolidated

All design quality rules have been merged into `figma-essential-rules.md` (auto-loaded), which is the single authoritative source for:

- Layout & Quality Rules #16–24 (spacer prohibition, STRETCH, auto-layout, overflow, naming, 4dp grid, shadow clipping)
- execute_js Critical Rules #1–15
- Icon rules (no emoji — use `figma.createNodeFromSvg()` with the built-in ICONS library)
- Reusable Factory Scripts (`.kiro/scripts/createScreen.js`, `createInput.js`, `createButton.js`, `createBottomLink.js`)
- Mobile dimensions and touch targets

Quality Engine lint rules (`lint_fix_all`) automatically enforce these at runtime — 35+ rules with auto-fix.

No need to load this file separately. If you're here via `#figma-create-quality`, the rules are already in your context.
