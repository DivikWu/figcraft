# Design Creator — No-Library Mode Rules

Every design choice must be intentional. Never rely on AI defaults.

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

## Layout

- MUST use `layoutAlign: STRETCH` for children that should fill the parent's cross-axis width (input fields, buttons, dividers, content sections)
- MUST wrap filled elements (colored buttons, cards with background) in a transparent frame when they need horizontal margin — never put padding on the filled element itself
- MUST set page-level frame `paddingLeft/Right/Top: 0` and `primaryAxisAlignItems: MIN` when the screen has a full-bleed system bar (iOS/Android status bar); the system bar manages its own internal padding
- MUST use standard mobile frame sizes: iOS 402×874, Android 412×915 — do NOT use legacy sizes unless explicitly requested
- NEVER use empty Spacer frames for spacing — group related elements into semantic auto-layout frames with `itemSpacing`

## Responsive Design (Top-Down Sizing)

Build layouts from the outside in — container first, then children:

1. **Screen frame**: Set explicit width/height (e.g. 402×874 for iOS). This is the only FIXED-size node.
2. **Section frames** (Header, Form, Actions): Use `layoutAlign: STRETCH` (fill parent width) + `layoutSizingVertical: HUG` (shrink to content height). Each section manages its own `padding` and `itemSpacing`.
3. **Interactive children** (inputs, buttons, dividers): Always `layoutAlign: STRETCH` inside their section. Never hardcode width on children that should be responsive.
4. **Text nodes**: Leave as HUG by default. Only set `layoutAlign: STRETCH` for long text that should wrap.
5. **Only leaf nodes use HUG** — if a frame has children, it should either be FIXED (screen) or FILL/STRETCH (section). HUG on a parent frame with FILL children creates a 0-width collapse.

### Sizing Rules Per Axis

For every frame, decide sizing on EACH axis independently:

| Axis Role | Recommended Sizing | When to Use |
|-----------|-------------------|-------------|
| Cross-axis (child in AL parent) | FILL / STRETCH | Default for all non-text children |
| Primary-axis (child in AL parent) | HUG | Content-sized (buttons, cards) |
| Primary-axis (child in AL parent) | FIXED | Explicit height (inputs: 48px, buttons: 48px) |
| Screen root | FIXED / FIXED | Always explicit dimensions |
| Section in screen | STRETCH + HUG | Fill width, shrink to content height |

### FILL Requires Auto-Layout Parent

`layoutSizingHorizontal: FILL` and `layoutSizingVertical: FILL` ONLY work inside auto-layout containers. If the parent has no auto-layout, FILL is meaningless and will be downgraded to HUG by the inference engine. Always ensure the parent has `autoLayout: true` before using FILL on children.

### Anti-Patterns
- ❌ Parent HUG + Child FILL → child collapses to 0 width (parent has no width to fill)
- ❌ Parent HUG + Child STRETCH → same paradox, child has nothing to stretch into
- ❌ FILL on child of non-auto-layout parent → FILL is ignored, child gets 0 size
- ❌ Hardcoded width on button inside VERTICAL auto-layout → button won't match input widths
- ❌ Mixed STRETCH and fixed-width siblings in same form → visual misalignment
- ❌ Frame with 2+ children but no auto-layout → children overlap at (0,0)
- ❌ Child wider than parent inner space → visual clipping
- ✅ Parent STRETCH + Child STRETCH → child fills parent, parent fills grandparent
- ✅ Parent FIXED (screen) → Section STRETCH + HUG → Input STRETCH + FIXED(48px)
- ✅ Every frame with children has auto-layout enabled

## Buttons & Interactive Elements

- MUST give buttons explicit height (≥ 44pt iOS, ≥ 48dp Android) and use auto-layout with padding — never rely on text alone to size a button
- MUST set button text `layoutAlign: STRETCH` or center text within the button frame using `primaryAxisAlignItems: CENTER` and `counterAxisAlignItems: CENTER`
- MUST ensure button frame width uses `layoutAlign: STRETCH` inside its parent so it fills available width (for full-width buttons) or set an explicit width
- NEVER place decorative shapes (circles, rectangles) that overlap or obscure button text — if a button needs an icon, place it as a sibling inside the button's auto-layout frame
- NEVER let text overflow its container — if text might be long, set `layoutSizingHorizontal: FILL` on the text node or use `textAutoResize: WIDTH_AND_HEIGHT`

## Input Fields

- MUST create input fields as auto-layout frames with: border (stroke), corner radius, internal padding, and a text child for placeholder
- MUST set input frame `layoutAlign: STRETCH` so it fills the parent width
- SHOULD use consistent height across all input fields in the same form (recommended: 44–52pt)
- SHOULD use a lighter/muted color for placeholder text (opacity 0.4–0.6 or a gray like #999)

## Social Login / Icon Buttons

- MUST create social login buttons as auto-layout frames (HORIZONTAL direction) with icon + text as children, proper `itemSpacing`, and centered alignment
- MUST ensure the button frame is wide enough to contain all children — use `layoutSizingHorizontal: FILL` or explicit width ≥ parent width
- NEVER truncate button labels — if space is tight, abbreviate the text rather than clipping it

## Semantic Grouping

- MUST group related elements into named auto-layout frames: e.g. "Header", "Form Fields", "Actions", "Social Login", "Footer Link"
- MUST each group manages its own `itemSpacing` and `padding` — the parent screen frame only spaces between groups
- SHOULD name every frame descriptively — never leave default names like "Frame 1", "Frame 2"

## Accessibility

- MUST text contrast ratio ≥ 4.5:1
- MUST minimum touch target: iOS ≥ 44×44pt, Android ≥ 48×48dp, Web ≥ 24×24px (WCAG 2.2 AA)
