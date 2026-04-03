# Responsive Web Layout Guide

## Breakpoints

| Breakpoint | Width | Columns | Padding |
|-----------|-------|---------|---------|
| Mobile    | 375px | 1       | 16px    |
| Tablet    | 768px | 2       | 24px    |
| Desktop   | 1280px| 3-4     | 32-64px |

## Auto Layout Strategy

- Mobile: VERTICAL stack, 1 column, FILL width children
- Tablet: mix HORIZONTAL rows (2-col) + VERTICAL sections
- Desktop: HORIZONTAL main layout with sidebar + content area

## Sizing Patterns

| Context | Horizontal | Vertical |
|---------|-----------|----------|
| Page container | FIXED (breakpoint width) | HUG |
| Content area | FILL | HUG |
| Sidebar | FIXED (240-300px) | FILL |
| Cards in grid | layoutGrow: 1 (equal width) | HUG |
| Full-width sections | FILL | HUG |

## Key Rules

- NEVER use fixed pixel widths for content children at mobile — use FILL
- SHOULD use maxWidth constraints for text readability (600-800px at desktop)
- Breakpoint frames are FIXED width; their children adapt via FILL/HUG
- Cards: use layoutGrow: 1 in HORIZONTAL rows for equal distribution
- Navigation: HORIZONTAL on desktop, bottom tab bar on mobile
