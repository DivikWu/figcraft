# Design Creator — No-Library Mode Rules

Every design choice must be intentional. Never rely on AI defaults.

> **Scope**: This document covers aesthetic direction and design decisions only.
> Layout structure, sizing defaults, auto-layout rules, and code templates are handled by the Quality Engine lint rules and IDE steering files — do not duplicate them here.

## Design Thinking (MUST complete before creating)

1. Purpose — What problem does this solve? Who is the audience?
2. Platform — Web, iOS, or Android? This determines touch targets, safe areas, and conventions.
3. Language/region — What language for UI text? This determines font choice and content.
4. Density — How much information per screen? (sparse form vs dense dashboard)
5. Tone — Pick a clear position on the spectrum: Minimal restraint ← Elegant refinement ← Warm approachable → Bold expressive → Maximal richness
6. Principle: Inter + blue + centered symmetry is the AI safe zone — if you choose it, have a reason

## Color

- MUST choose 1 dominant + 1 accent, total colors ≤ 5, serving the Tone
- SHOULD dominant color at 60%+, accent for key focal points
- NEVER more than 1 accent color per semantic role per view
- NEVER purple gradient on white background
- NEVER default to blue/gray without justification

## Typography

- MUST create clear visual distinction between heading and body (different font, weight, or size)
- SHOULD limit to ≤ 3 font weights
- NEVER use only Inter without justification

## Composition

- MUST establish a clear visual focal point
- SHOULD prefer asymmetry over symmetry; whitespace is a design element
- NEVER arrange all children in equal-width, equal-height uniform grids

## Spacing

- MUST establish a base unit (recommended 8dp), all spacing as multiples
- SHOULD use larger spacing between groups than within groups

## Content

- MUST use realistic, contextually appropriate text — never "Lorem ipsum" or "Text goes here"
- SHOULD match content length to real-world usage (e.g. names ≤ 20 chars, descriptions 1–2 sentences)
- NEVER leave placeholder labels like "Button", "Title", "Label" — give them purpose

## Iconography

- MUST use a single icon style per design: outline, filled, or duotone — never mix
- SHOULD keep icon stroke weight consistent with the typography weight
- NEVER use decorative icons without functional meaning

## Elevation

- MUST limit to ≤ 3 shadow levels (subtle, medium, prominent) with consistent blur/offset ratios
- SHOULD use smaller blur + offset for elements closer to surface, larger for floating elements
- NEVER stack multiple shadow effects on a single element

## Anti-AI Slop

- NEVER cheap gradients (purple/rainbow/oversaturated) or glow effects
- SHOULD vary corner radius across hierarchy levels (e.g. container > card > button); keep consistent within the same level/component

## Complexity Matching

- Minimal tone = restrained node structure + precise spacing + generous whitespace
- Maximal tone = rich nesting + decorative elements + dense visual information

## Accessibility

- MUST text contrast ratio ≥ 4.5:1
- MUST minimum touch target: iOS ≥ 44×44pt, Android ≥ 48×48dp, Web ≥ 24×24px (WCAG 2.2 AA)
