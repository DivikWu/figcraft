---
name: platform-ios
description: "iOS platform design rules — screen dimensions, safe areas, SF Pro typography, navigation patterns, HIG conventions. Use when: iOS/iPhone/iPad + design/screen/app, or when creating iOS-specific Figma designs."
---

# Platform iOS — Apple Human Interface Guidelines

Platform-specific design rules for iOS apps in Figma. Covers screen dimensions, safe areas, system UI, typography, navigation patterns, and HIG conventions. Extends `ui-ux-fundamentals` with iOS-specific constraints.

> Extends UI/UX Fundamentals (loaded separately).
> **Scope**: iOS platform conventions only.
> General design quality rules are in `ui-ux-fundamentals`.

## Skill Boundaries

- Use this skill for **iOS-specific design decisions** (safe areas, HIG, SF Pro, tab bars).
- If the task is **Android-specific**, switch to [platform-android](../platform-android/SKILL.md).
- If the task is **responsive web design**, switch to [responsive-design](../responsive-design/SKILL.md).
- If the task is **creating UI**, switch to [figma-create-ui](../figma-create-ui/SKILL.md) and reference this skill for iOS rules.

## Design Direction

1. Always first → load skill: `ui-ux-fundamentals` (shared rules)
2. Library selected → then load skill: `design-guardian`
3. No library → then load skill: `design-creator`

## Screen Dimensions

| Device | Width | Height | Scale |
|--------|-------|--------|-------|
| iPhone 16 Pro (standard) | 402px | 874px | 3× |
| iPhone 16 Pro Max | 440px | 956px | 3× |
| iPhone SE | 375px | 667px | 2× |
| iPad (10th gen) | 820px | 1180px | 2× |
| iPad Pro 11" | 834px | 1194px | 2× |
| iPad Pro 13" | 1024px | 1366px | 2× |

Default for new iPhone designs: **402 × 874** (project standard, matches lint rule `mobile-dimensions`).

## Safe Areas

```
┌──────────────────────────┐
│     Status Bar (54px)     │  ← Dynamic Island area
├──────────────────────────┤
│                          │
│     Safe Content Area     │  ← paddingLeft/Right: 16px
│                          │
│                          │
├──────────────────────────┤
│   Home Indicator (34px)   │  ← Bottom safe area
└──────────────────────────┘
```

Rules:
- MUST keep interactive content within safe areas
- Status bar area: 54px top (Dynamic Island devices), 44px (notch devices), 20px (legacy)
- Home indicator: 34px bottom on Face ID devices
- System bar frames MUST be full-bleed: `paddingLeft: 0, paddingRight: 0, paddingTop: 0` (matches lint rule `system-bar-fullbleed`)
- Content padding: 16px horizontal minimum

## Typography — SF Pro

| Role | Font | Size | Weight | Line Height |
|------|------|------|--------|-------------|
| Large Title | SF Pro Display | 34px | Bold | 41px |
| Title 1 | SF Pro Display | 28px | Bold | 34px |
| Title 2 | SF Pro Display | 22px | Bold | 28px |
| Title 3 | SF Pro Text | 20px | Semibold | 25px |
| Headline | SF Pro Text | 17px | Semibold | 22px |
| Body | SF Pro Text | 17px | Regular | 22px |
| Callout | SF Pro Text | 16px | Regular | 21px |
| Subheadline | SF Pro Text | 15px | Regular | 20px |
| Footnote | SF Pro Text | 13px | Regular | 18px |
| Caption 1 | SF Pro Text | 12px | Regular | 16px |
| Caption 2 | SF Pro Text | 11px | Regular | 13px |

Rules:
- SHOULD use SF Pro for iOS designs (check availability with `list_fonts`)
- If SF Pro unavailable, use Inter as fallback (similar metrics)
- MUST maintain the size/weight hierarchy — don't mix Display and Text roles

## Touch Targets

- MUST minimum 44 × 44pt for all interactive elements
- SHOULD 48 × 48pt for primary actions
- Tab bar items: 49pt height (standard), icons 25 × 25pt within

## Navigation Patterns

### Navigation Bar (Top)
```
Nav Bar (HORIZONTAL, height: 44px, padding: 0 16px)
  ├── Back Button (chevron.left icon + "Back" label)
  ├── Title (center, 17px Semibold)
  └── Trailing Action (icon or text button)
```
- Large title mode: title starts at 34px below nav bar, collapses on scroll

### Tab Bar (Bottom)
```
Tab Bar (HORIZONTAL, height: 49px + 34px home indicator, SPACE_BETWEEN)
  ├── Tab Item (icon 25×25 + label 10px, VERTICAL, CENTER)
  ├── Tab Item (selected: tint color)
  ├── Tab Item
  └── Tab Item
```
- Maximum 5 tabs
- Selected state: filled icon + tint color
- Unselected: outline icon + gray

### Sheets & Modals
- Sheet: corner radius 10px top, drag indicator 36 × 5px centered
- Full-screen modal: no corner radius, close button top-left or top-right
- Alert: 270px wide, corner radius 14px, centered

## Common iOS Components

| Component | Key Specs |
|-----------|-----------|
| List row | height ≥ 44px, padding 16px, separator inset 16px left |
| Toggle | 51 × 31px, corner radius full |
| Segmented control | height 32px, corner radius 8px |
| Search bar | height 36px, corner radius 10px, padding 0 16px |
| Action sheet | full width, corner radius 14px, 8px gap between sections |

## iOS-Specific Rules

- MUST use SF Symbols style for icons (outline weight matching text weight)
- MUST respect Dynamic Island / notch area — never place content behind it
- SHOULD use system blur (vibrancy) for overlays, not solid opacity
- SHOULD use spring animations conceptually (ease curves, not linear)
- NEVER use hamburger menu — iOS uses tab bars and navigation stacks
- NEVER place primary actions in top-left (reserved for back navigation)
- SHOULD use swipe gestures for list actions (swipe-to-delete, swipe-to-archive)
