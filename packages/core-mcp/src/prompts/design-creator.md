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
- MUST use #6B7280 (gray-500) or darker for secondary text on white — #9CA3AF (gray-400) fails WCAG 4.5:1
- MUST use #9CA3AF or darker for placeholder/hint text only (large text exception at 3:1)
- NEVER purple gradient on white background
- NEVER default to blue/gray without justification

## Typography (Creator Addendum)

- SHOULD limit to ≤ 3 font weights
- NEVER use only Inter without justification

## Iconography (Creator Addendum — no-library mode)

- NEVER use decorative icons without functional meaning
- MUST use icon_search + icon_create for all interactive indicators (chevrons, share, notifications, social logos)
- NEVER use text characters as icon placeholders (">" for chevron, "..." for more, "←" for back)
- SHOULD use a single icon set consistently (e.g., all Lucide outline)
- NOTE: In library mode, prefer library icon components via search_design_system first; icon_search is the fallback
