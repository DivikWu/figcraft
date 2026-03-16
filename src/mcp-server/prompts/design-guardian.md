# Design Guardian — Library Mode Rules

Prefer library styles and tokens. Use what exists, skip what doesn't — never let incomplete specs limit design quality.

## Spec Priority

- MUST match colors/fonts/spacing/radii to library Style/Variable first; when no match exists, skip binding and choose freely (refer to Design Creator rules for guidance)
- SHOULD use primary for focal points, secondary for supporting, tertiary for background; exercise restraint — don't use every available token

## Quality

- NEVER cheap gradients (purple/rainbow/oversaturated); gradients should be refined and restrained
- NEVER rough shadows (large spread, high opacity); shadows should be subtle and layered
- NEVER glow effects as primary visual affordance
- NEVER more than 1 accent color per semantic role per view (different semantics like warning/success may coexist)
- SHOULD vary corner radius across hierarchy levels (e.g. container > card > button); keep consistent within the same level/component

## Composition

- MUST establish a clear visual focal point
- SHOULD use larger spacing between groups than within groups

## Accessibility

- MUST text contrast ratio ≥ 4.5:1
- MUST minimum touch target: iOS ≥ 44×44pt, Android ≥ 48×48dp, Web ≥ 24×24px (WCAG 2.2 AA)
