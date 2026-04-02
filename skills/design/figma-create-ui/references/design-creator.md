# Design Creator — No-Library Mode Rules

Every design choice must be intentional. Never rely on AI defaults.

> Extends UI/UX Fundamentals (loaded separately).
> **Scope**: No-library design decisions only.
> Layout structure, sizing defaults, auto-layout rules are handled by Quality Engine lint.

## Design Thinking (MUST complete before creating)

1. Purpose — What problem does this solve? Who is the audience?
2. Platform — Web, iOS, or Android? This determines touch targets, safe areas, and conventions.
3. Language/region — What language for UI text? This determines font choice and content.
4. Density — How much information per screen? (sparse form vs dense dashboard)
5. Tone — Pick a clear position on the spectrum: Minimal ← Elegant ← Warm → Bold → Maximal
6. Principle: Inter + blue + centered symmetry is the AI safe zone — if you choose it, have a reason

## Color

- MUST choose 1 dominant + 1 accent, total colors ≤ 5, serving the Tone
- SHOULD dominant color at 60%+, accent for key focal points
- NEVER purple gradient on white background
- NEVER default to blue/gray without justification

## Typography (Creator Addendum)

- SHOULD limit to ≤ 3 font weights
- NEVER use only Inter without justification

## Iconography (Creator Addendum)

- NEVER use decorative icons without functional meaning
