---
name: ui-ux-fundamentals
description: "Universal design quality rules: typography, spacing, content, iconography, elevation, composition, accessibility. Always applies regardless of library mode."
---

# UI/UX Fundamentals — Shared Design Rules

Universal design quality rules. Apply regardless of library mode.

> **Scope**: Aesthetic direction only.
> Layout structure, sizing, auto-layout rules are handled by Quality Engine lint.

## Typography

- MUST create clear visual distinction between heading and body
- SHOULD limit to ≤ 3 typographic tiers per view (heading, subheading, body)

## Spacing

- MUST use 8dp base unit (or library spacing tokens when available), all spacing as multiples
- SHOULD use larger spacing between groups than within groups

## Content

- MUST use realistic, contextually appropriate text — never "Lorem ipsum" or "Text goes here"
- SHOULD match content length to real-world usage
- NEVER leave placeholder labels like "Button", "Title", "Label" — give them purpose

## Iconography

- MUST use a single icon style per design: outline, filled, or duotone — never mix
- SHOULD keep icon stroke weight consistent with the typography weight

## Elevation

- MUST limit to ≤ 3 shadow levels with consistent blur/offset ratios
- SHOULD use smaller blur + offset for elements closer to surface, larger for floating elements
- NEVER stack multiple shadow effects on a single element

## Composition

- MUST establish a clear visual focal point
- SHOULD prefer asymmetry over symmetry when it serves the content hierarchy; whitespace is a design element
- NEVER arrange all children in equal-width, equal-height uniform grids

## Quality / Anti-Slop

- NEVER cheap gradients (purple/rainbow/oversaturated) or glow effects as primary visual affordance
- NEVER more than 1 accent color per semantic role per view
- SHOULD vary corner radius across hierarchy levels (e.g. container > card > button); keep consistent within the same level/component

## Complexity Matching

- Minimal tone = restrained node structure + precise spacing + generous whitespace
- Maximal tone = rich nesting + decorative elements + dense visual information

## Content States

- MUST design for **empty state**: centered illustration/icon + heading + call-to-action (e.g. "No items yet — Add your first")
- MUST design for **error state**: error icon + message + retry action (e.g. "Something went wrong — Try again")
- SHOULD design for **loading state**: skeleton screens (gray placeholder rectangles matching layout) preferred over spinners
- NEVER leave a list/grid container with zero children and no empty state guidance
- SHOULD show content count or status in section headers when data is loaded (e.g. "3 items", "Updated 2m ago")

## Accessibility

- MUST text contrast ratio ≥ 4.5:1
- MUST minimum touch target: iOS ≥ 44×44pt, Android ≥ 48×48dp, Web ≥ 24×24px (WCAG 2.2 AA)
