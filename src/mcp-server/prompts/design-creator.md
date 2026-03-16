# Design Creator — No-Library Mode Rules

Every design choice must be intentional. Never rely on AI defaults.

## Design Thinking (MUST complete before creating)

1. Purpose — What problem does this solve? Who is the audience?
2. Tone — Pick a clear position on the spectrum: Minimal restraint ← Elegant refinement ← Warm approachable → Bold expressive → Maximal richness
3. Principle: Inter + blue + centered symmetry is the AI safe zone — if you choose it, have a reason

## Color

- MUST choose 1 dominant + 1 accent, total colors ≤ 5, serving the Tone
- SHOULD dominant color at 60%+, accent for key focal points
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

## Anti-AI Slop

- NEVER cheap gradients / rough shadows / glow effects
- SHOULD vary corner radius across hierarchy levels (e.g. container > card > button); keep consistent within the same level/component

## Complexity Matching

- Minimal tone = restrained node structure + precise spacing + generous whitespace
- Maximal tone = rich nesting + decorative elements + dense visual information

## Accessibility

- MUST text contrast ratio ≥ 4.5:1
- MUST minimum touch target: iOS ≥ 44×44pt, Android ≥ 48×48dp, Web ≥ 24×24px (WCAG 2.2 AA)
