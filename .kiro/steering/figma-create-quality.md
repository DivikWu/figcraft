---
inclusion: manual
description: "Figma design quality rules — full version with detailed explanations. Use #figma-create-quality to load when needed."
---

# Figma Design Quality Rules

These rules are automatically checked and fixed by the FigCraft Quality Engine (35+ lint rules). They apply regardless of whether designs are created via Figma MCP, execute_js, or manually.

Run `lint_fix_all` to auto-check and fix all fixable violations in one call.

## 1. No Empty Spacer Frames (HIGHEST PRIORITY)

**NEVER** use empty frames (Top Spacer, Bottom Spacer, Flex Spacer, Middle Spacer, Spacer, etc.) to create spacing or push content into position. This includes:
- Any frame with "Spacer" in its name
- Empty frames with `layoutGrow = 1` used to push content to opposite ends
- Any frame with no meaningful content that exists solely for spacing/positioning

**Correct alternatives:**
- Distribute content to opposite ends → set parent `primaryAxisAlignItems: "SPACE_BETWEEN"`
- Center content → set parent `primaryAxisAlignItems: "CENTER"`
- Top/bottom whitespace → set parent `paddingTop` / `paddingBottom`
- Spacing between children → set parent `itemSpacing`
- Internal spacing within a section → set that section frame's own `padding`

**Before writing any execute_js script, verify the layout plan does NOT rely on any empty frames.**

## 2. Responsive Children Must Use STRETCH

Input fields, buttons, dividers, and content sections inside auto-layout containers MUST use `layoutAlign: STRETCH`.

## 3. HUG/STRETCH Paradox

When a parent's cross-axis is HUG, children CANNOT use STRETCH (there is no size to fill). Give the parent an explicit cross-axis size, or make the parent itself STRETCH/FILL.

## 4. FILL Requires Auto-Layout Parent

NEVER use FILL sizing on a child whose parent has no auto-layout.

## 5. Frames with 2+ Children Must Have Auto-Layout

Every frame containing 2 or more children MUST enable auto-layout (except decorative overlays where overlap is intentional).

## 6. Button Structure

Buttons MUST be auto-layout frames with CENTER alignment, explicit height (iOS ≥ 44pt / Android ≥ 48dp), and internal padding.

## 7. Input Field Structure

Input fields MUST be auto-layout frames with stroke, cornerRadius, internal padding, and a text child for placeholder.

## 8. Form Children Consistency

ALL interactive children in a form MUST use `layoutAlign: STRETCH`.

## 9. Children Must Not Overflow Parent

Every child's cross-axis dimension must fit within the parent's inner space.

## 10. Semantic Frame Naming

Every frame MUST have a descriptive name reflecting its purpose. Never leave default names like "Frame 1".

## 11. No Text Overflow or Truncation

All text nodes MUST fit completely within their parent container.

## 12. Mobile Screen Dimensions

iOS → 402×874 (iPhone 16 Pro), Android → 412×915.

## 13. System Bar Full Bleed

System bars must sit flush at the top edge with zero padding on the page-level frame.

## 14. Filled Elements with Margin Need a Wrapper

When an element has a background fill and needs horizontal margin, use a transparent wrapper frame with padding.

## 15. 8dp Grid Spacing

ALL dimension values — padding, margin, gap, itemSpacing, width, height, cornerRadius — MUST be multiples of 4:
- 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56...

**NEVER use non-multiples-of-4 values** like 14, 15, 18, 22, 25, 30, etc. for spacing or sizing properties.

Exceptions:
- `strokeWeight`: 1px or 1.5px allowed
- `fontSize`, `lineHeight`, `letterSpacing`: not constrained by this rule
- Icon sizes: standard icon sizes (e.g., 18, 22) are acceptable
