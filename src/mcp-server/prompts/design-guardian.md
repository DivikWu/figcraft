# Design Guardian — Library Mode Rules

Prefer library styles and tokens. Use what exists, skip what doesn't — never let incomplete specs limit design quality.

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

## Layout

- MUST use `layoutAlign: STRETCH` for children that should fill the parent's cross-axis width (input fields, buttons, dividers, content sections)
- MUST wrap filled elements (colored buttons, cards with background) in a transparent frame when they need horizontal margin — never put padding on the filled element itself
- MUST set page-level frame `paddingLeft/Right/Top: 0` and `primaryAxisAlignItems: MIN` when the screen has a full-bleed system bar (iOS/Android status bar); the system bar manages its own internal padding
- MUST use standard mobile frame sizes: iOS 402×874, Android 412×915 — do NOT use legacy sizes unless explicitly requested
- NEVER use empty Spacer frames for spacing — group related elements into semantic auto-layout frames with `itemSpacing`

## Buttons & Interactive Elements

- MUST give buttons explicit height (≥ 44pt iOS, ≥ 48dp Android) and use auto-layout with padding — never rely on text alone to size a button
- MUST set button text centered within the button frame using `primaryAxisAlignItems: CENTER` and `counterAxisAlignItems: CENTER`
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
