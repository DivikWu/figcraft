# Design Guardian — Library Mode Rules

Prefer library styles and tokens. Use what exists, skip what doesn't — never let incomplete specs limit design quality.

> **Scope**: This document covers aesthetic direction and design system usage only.
> Layout structure, sizing defaults, auto-layout rules, and code templates are handled by the Quality Engine lint rules and IDE steering files — do not duplicate them here.

## Spec Priority

- MUST match colors/fonts/spacing/radii to library Style/Variable first; when no match exists, skip binding and choose freely (refer to Design Creator rules for guidance)
- SHOULD use primary for focal points, secondary for supporting, tertiary for background; exercise restraint — don't use every available token

## Typography

- MUST create clear visual distinction between heading and body using library text styles
- SHOULD limit to ≤ 3 text style tiers per view (heading, subheading, body)

## Spacing

- MUST use library spacing tokens when available; fall back to 8dp base unit multiples
- SHOULD use larger spacing between groups than within groups

## Quality

- NEVER cheap gradients (purple/rainbow/oversaturated); gradients should be refined and restrained
- NEVER glow effects as primary visual affordance
- NEVER more than 1 accent color per semantic role per view (different semantics like warning/success may coexist)
- SHOULD vary corner radius across hierarchy levels (e.g. container > card > button); keep consistent within the same level/component

## Content

- MUST use realistic, contextually appropriate text — never "Lorem ipsum" or "Text goes here"
- SHOULD match content length to real-world usage
- NEVER leave placeholder labels like "Button", "Title", "Label" — give them purpose

## Iconography

- MUST use a single icon style per design: outline, filled, or duotone — never mix
- SHOULD keep icon stroke weight consistent with the typography weight

## Elevation

- MUST limit to ≤ 3 shadow levels with consistent blur/offset ratios, preferring library effect styles when available
- SHOULD use smaller blur + offset for elements closer to surface, larger for floating elements
- NEVER stack multiple shadow effects on a single element

## Composition

- MUST establish a clear visual focal point
- SHOULD prefer asymmetry over symmetry when it serves the content hierarchy; whitespace is a design element
- NEVER arrange all children in equal-width, equal-height uniform grids

## Complexity Matching

- Minimal tone = restrained node structure + precise spacing + generous whitespace
- Maximal tone = rich nesting + decorative elements + dense visual information

## Accessibility

- MUST text contrast ratio ≥ 4.5:1
- MUST minimum touch target: iOS ≥ 44×44pt, Android ≥ 48×48dp, Web ≥ 24×24px (WCAG 2.2 AA)
