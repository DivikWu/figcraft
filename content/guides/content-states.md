# Content State Patterns

Every data-driven view MUST consider these states:

## Empty State
```
Container (VERTICAL, FILL/HUG, counterAxisAlignItems: CENTER, padding 40-60)
  ├── Illustration (120-160px, subtle fill or SVG placeholder)
  ├── Heading ("No items yet" / "Get started") — 20px, semibold
  ├── Body ("Add your first item to see it here") — 14-16px, muted
  └── CTA Button ("Add Item") — primary style
```
- Center the empty state vertically and horizontally in its container
- Use encouraging, action-oriented language (not error language)
- The CTA should directly trigger the creation action

## Loading State (Skeleton)
```
Same structure as loaded state, but:
  ├── Text nodes → gray rectangles (cornerRadius 4, fill gray-200, height matching line-height)
  ├── Images → gray rectangles (same dimensions, fill gray-100)
  ├── Avatar → gray circle (same size)
  └── All skeleton elements: no stroke, uniform gray palette
```
- Match the loaded layout exactly — skeleton IS the layout with gray placeholders
- NEVER use a centered spinner for content that has a known layout
- Spinner only for indeterminate operations (file upload, search)

## Error State
```
Container (VERTICAL, FILL/HUG, counterAxisAlignItems: CENTER, padding 40-60)
  ├── Error icon (48-64px, warning/error color)
  ├── Heading ("Something went wrong") — 20px, semibold
  ├── Body ("We couldn't load your data. Please try again.") — 14-16px, muted
  └── Retry Button ("Try Again") — secondary or outline style
```
- Use neutral, non-blaming language
- Always provide a retry action
- Don't use red for the entire error state — red for icon/accent only
