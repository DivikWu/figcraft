---
name: platform-android
description: "Android platform design rules — screen dimensions, Material Design 3, Roboto typography, navigation patterns. Use when: Android/Material + design/screen/app, or when creating Android-specific Figma designs."
---

# Platform Android — Material Design 3

Platform-specific design rules for Android apps in Figma. Covers screen dimensions, Material Design 3 conventions, Roboto typography, navigation patterns, and component specs. Extends `ui-ux-fundamentals` with Android-specific constraints.

> Extends UI/UX Fundamentals (loaded separately).
> **Scope**: Android platform conventions only.
> General design quality rules are in `ui-ux-fundamentals`.

## Skill Boundaries

- Use this skill for **Android-specific design decisions** (Material 3, navigation bar, Roboto).
- If the task is **iOS-specific**, switch to [platform-ios](../platform-ios/SKILL.md).
- If the task is **responsive web design**, switch to [responsive-design](../responsive-design/SKILL.md).
- If the task is **creating UI**, switch to [figma-create-ui](../figma-create-ui/SKILL.md) and reference this skill for Android rules.

## Design Direction

1. Always first → load skill: `ui-ux-fundamentals` (shared rules)
2. Library selected → then load skill: `design-guardian`
3. No library → then load skill: `design-creator`

## Screen Dimensions

| Device | Width | Height | Density |
|--------|-------|--------|---------|
| Standard Android (default) | 412px | 915px | xxhdpi (3×) |
| Small phone | 360px | 800px | xhdpi (2×) |
| Large phone | 412px | 915px | xxhdpi (3×) |
| Tablet 10" | 800px | 1280px | xhdpi (2×) |
| Foldable (unfolded) | 840px | 900px | xxhdpi (3×) |

Default for new Android designs: **412 × 915** (project standard, matches lint rule `mobile-dimensions`).

## System UI

```
┌──────────────────────────┐
│    Status Bar (24dp)      │
├──────────────────────────┤
│                          │
│     Safe Content Area     │  ← paddingLeft/Right: 16dp
│                          │
│                          │
├──────────────────────────┤
│  Navigation Bar (48-80dp) │  ← 3-button, gesture, or nav bar
└──────────────────────────┘
```

Rules:
- Status bar: 24dp height
- Navigation bar: 48dp (gesture navigation) or 80dp (3-button navigation)
- System bar frames MUST be full-bleed: `paddingLeft: 0, paddingRight: 0, paddingTop: 0` (matches lint rule `system-bar-fullbleed`)
- Content padding: 16dp horizontal minimum
- Edge-to-edge: content draws behind system bars with appropriate insets

## Typography — Roboto / Material Type Scale

| Role | Font | Size | Weight | Line Height | Tracking |
|------|------|------|--------|-------------|----------|
| Display Large | Roboto | 57dp | Regular | 64dp | -0.25 |
| Display Medium | Roboto | 45dp | Regular | 52dp | 0 |
| Display Small | Roboto | 36dp | Regular | 44dp | 0 |
| Headline Large | Roboto | 32dp | Regular | 40dp | 0 |
| Headline Medium | Roboto | 28dp | Regular | 36dp | 0 |
| Headline Small | Roboto | 24dp | Regular | 32dp | 0 |
| Title Large | Roboto | 22dp | Regular | 28dp | 0 |
| Title Medium | Roboto | 16dp | Medium | 24dp | 0.15 |
| Title Small | Roboto | 14dp | Medium | 20dp | 0.1 |
| Body Large | Roboto | 16dp | Regular | 24dp | 0.5 |
| Body Medium | Roboto | 14dp | Regular | 20dp | 0.25 |
| Body Small | Roboto | 12dp | Regular | 16dp | 0.4 |
| Label Large | Roboto | 14dp | Medium | 20dp | 0.1 |
| Label Medium | Roboto | 12dp | Medium | 16dp | 0.5 |
| Label Small | Roboto | 11dp | Medium | 16dp | 0.5 |

Rules:
- SHOULD use Roboto for Android designs (check availability with `list_fonts`)
- If Roboto unavailable, use Inter as fallback
- Material 3 uses 5 categories × 3 sizes = 15 type roles

## Touch Targets

- MUST minimum 48 × 48dp for all interactive elements
- Visual element can be smaller, but touch area must be ≥ 48dp
- SHOULD 56dp height for prominent buttons (FAB, extended FAB)

## Navigation Patterns

### Top App Bar
```
Top App Bar (HORIZONTAL, height: 64dp, padding: 0 16dp)
  ├── Navigation Icon (menu or back arrow, 24dp icon in 48dp target)
  ├── Title (left-aligned, Title Large 22dp)
  └── Action Icons (24dp icons, 48dp targets, max 3)
```
- Medium top app bar: 112dp height, title below
- Large top app bar: 152dp height, large title

### Navigation Bar (Bottom)
```
Navigation Bar (HORIZONTAL, height: 80dp, SPACE_BETWEEN)
  ├── Nav Item (icon 24dp + label 12dp, VERTICAL, CENTER)
  │   └── Active: filled icon + indicator pill (64×32dp, radius 16dp)
  ├── Nav Item
  ├── Nav Item
  └── Nav Item
```
- 3–5 destinations
- Active indicator: pill shape 64 × 32dp, corner radius 16dp
- Active: filled icon + tinted indicator
- Inactive: outline icon, no indicator

### Navigation Drawer
- Width: 360dp max (or 80% of screen width)
- Header: 56dp height
- Item height: 56dp, padding 12dp 28dp, corner radius 28dp (right side)
- Active item: filled container with tint

### Navigation Rail (Tablet/Foldable)
- Width: 80dp
- Item: icon 24dp + label 12dp, 56dp vertical spacing
- Active indicator: same pill as bottom nav

## Material 3 Components

| Component | Key Specs |
|-----------|-----------|
| FAB | 56 × 56dp, corner radius 16dp |
| Small FAB | 40 × 40dp, corner radius 12dp |
| Large FAB | 96 × 96dp, corner radius 28dp |
| Extended FAB | height 56dp, corner radius 16dp, padding 0 16dp |
| Filled button | height 40dp, corner radius 20dp (full), padding 0 24dp |
| Outlined button | height 40dp, corner radius 20dp, stroke 1dp |
| Text button | height 40dp, corner radius 20dp, padding 0 12dp |
| Card (filled) | corner radius 12dp, padding 16dp |
| Card (elevated) | corner radius 12dp, elevation 1dp, padding 16dp |
| Chip | height 32dp, corner radius 8dp, padding 0 16dp |
| Switch | 52 × 32dp, thumb 24dp |
| Checkbox | 18 × 18dp in 48dp target, corner radius 2dp |
| Text field (filled) | height 56dp, corner radius 4dp top, no bottom radius |
| Text field (outlined) | height 56dp, corner radius 4dp, stroke 1dp |
| Bottom sheet | corner radius 28dp top |
| Dialog | width 280–560dp, corner radius 28dp, padding 24dp |
| Snackbar | height 48dp, corner radius 4dp, padding 0 16dp |

## Material 3 Elevation & Color

- Elevation uses tonal color overlay, not drop shadows
- Surface tint: primary color at low opacity layered on surface
- 5 elevation levels: 0dp, 1dp, 3dp, 6dp, 8dp
- SHOULD use Material 3 dynamic color scheme (primary, secondary, tertiary, error + containers)

## Android-Specific Rules

- MUST use Material Symbols for icons (outlined weight 400 default)
- MUST respect 48dp minimum touch targets (visual element can be smaller)
- SHOULD use Material 3 shape system (corner radius varies by component size)
- SHOULD use edge-to-edge layout (content behind system bars)
- NEVER use iOS-style back chevron — Android uses arrow_back (←)
- NEVER use iOS-style segmented control — Android uses tabs or chips
- NEVER place navigation at the top only — Android uses bottom navigation bar for primary destinations
- SHOULD use predictive back gesture affordance (page peek animation)
