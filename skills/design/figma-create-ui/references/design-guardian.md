# Design Guardian — Library Mode Rules

Prefer library styles and tokens. Use what exists, skip what doesn't — never let incomplete specs limit design quality.

> Extends UI/UX Fundamentals (loaded separately).
> **Scope**: Library-specific design direction only.
> Layout structure, sizing defaults, auto-layout rules are handled by Quality Engine lint.

## Spec Priority

- MUST match colors/fonts/spacing/radii to library Style/Variable first; when no match exists, skip binding and choose freely
- SHOULD use primary for focal points, secondary for supporting, tertiary for background; exercise restraint — don't use every available token

## Typography (Library Addendum)

- MUST use library text styles for heading/body distinction

## Spacing (Library Addendum)

- MUST use library spacing tokens when available; fall back to 8dp base unit multiples

## Elevation (Library Addendum)

- SHOULD prefer library effect styles when available
