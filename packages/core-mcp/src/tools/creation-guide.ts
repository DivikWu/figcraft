/**
 * Creation guide — structural knowledge for UI creation across all IDEs.
 *
 * Centralizes layout rules, multi-screen architecture, batching strategy,
 * tool behavior patterns, and Opinion Engine documentation that were
 * previously scattered across IDE-specific files (CLAUDE.md, AGENTS.md,
 * .kiro/steering/).
 *
 * This is the single MCP-accessible source for these rules, ensuring
 * Cursor, Antigravity, Codex, and any other IDE gets the same guidance
 * as Claude Code and Kiro.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getPreventionChecklist } from '@figcraft/quality-engine';

// ─── Topic content constants ───

const MULTI_SCREEN_GUIDE = `# Multi-Screen Flow Architecture

Multi-screen flows (login, onboarding, checkout, etc.) MUST use create_frame + children.

## Hierarchy (do not skip levels)

\`\`\`
Wrapper (VERTICAL, HUG/HUG, counterAxisAlignItems=MIN, clipsContent=false, cornerRadius=20-40, fill=lightGray, padding, itemSpacing)
  ├── Header (title + description)
  └── Flow Row (HORIZONTAL, HUG/HUG, clipsContent=false, itemSpacing between screens)
        └── Stage / {label} (VERTICAL, HUG/HUG, clipsContent=false) — one per screen
              ├── Step Pill (badge: "01 Welcome")
              └── Screen / {label} (VERTICAL, FIXED 402×874, cornerRadius=28, clipsContent=true, padding, SPACE_BETWEEN, shadow:{y:4, blur:16})
                    ├── Top Content (VERTICAL, FILL/HUG)
                    └── Bottom Content (HORIZONTAL or VERTICAL, FILL/HUG)
\`\`\`

## Build Order

1. create_frame: Wrapper + children with full skeleton (Header + Flow Row + Stages + Screens) → check _children in response to confirm structure
2. ⚠️ MUST export_image(scale:0.3) to verify all screens are laid out horizontally in Flow Row — do NOT proceed to fill screens until this is confirmed
3. create_frame: Fill Screen 1 (parentId=screen1Id, children=[TopContent, BottomContent]) → export_image to verify layout
4. create_frame: Fill remaining screens one by one → export_image as needed
5. lint_fix_all → done

The Opinion Engine automatically handles: sizing inference, FILL ordering, conflict detection, cross-level validation, and failure cleanup. No need to manually handle these Figma API details.

## Key Rules

- Screen uses primaryAxisAlignItems: "SPACE_BETWEEN" for top/bottom distribution (use "MIN" for sparse content screens)
- Shadow elements: ALL ancestor containers must have clipsContent: false
- Screen dimensions: iOS 402×874, Android 412×915
- Use dryRun: true when uncertain about parameters`;

const BATCHING_GUIDE = `# Context Budget & Batching Strategy

Large design tasks accumulate context with each tool call. Proactively manage context to prevent stalling.

## Granularity Rules

| Task scale | Strategy | Example |
|------------|----------|---------|
| Single element | 1 create_frame call | One call with children builds the card |
| Single screen | 1 create_frame with full children tree | Entire screen in one call |
| Multi-screen (3-5) | create_frame with items[] batch | One call creates all screens (max 20) |
| Large flow (6+) | Batch 2-3 screens per turn | "I'll create screens 1-3 now, then 4-6 next" |
| Multiple labels | create_text with items[] batch | One call creates up to 50 text nodes |
| Complex params | dryRun:true first | Preview inferences, then create with correctedPayload |

## Batch Mode Tradeoff (items[] vs individual calls)

| | items[] batch | Individual calls |
|---|---|---|
| Context cost | 1 request + 1 response | N requests + N responses |
| Visual verification | export_image after batch | export_image per screen |
| Error isolation | Per-item (one failure doesn't block) | Natural isolation |
| Best for | Skeleton/wrapper creation | Screens with complex children |

**Recommendation**: items[] for skeleton (empty screens), then fill each screen individually via parentId.

## Verification Strategy

- **Embedded check** (zero cost): inspect _children from create_frame response
- **Visual check**: export_image(scale:0.5) at key milestones (after each screen, after skeleton)`;

const TOOL_BEHAVIOR_GUIDE = `# Tool Behavior Rules

## Mandatory Sequence
1. Always call ping first to verify connection
2. Complete workflow in one turn until ⛔ HARD STOP checkpoints
3. Prefer batch tools: lint_fix_all over lint_check + lint_fix separately

## Parallelization
4. Parallelize independent calls (e.g., multiple nodes(method:"get") in one message)
5. Sequential for dependent calls (create parent before children)

## Update Patterns
6. nodes(method:"update") uses 5-phase ordered execution: simple props → fills/strokes → layout sizing → resize → text. Safe to send layoutMode + width in same patch.
7. nodes(method:"update") supports width/height directly (calls resize internally), text properties, and layoutPositioning.

## Validation
8. dryRun:true for complex or ambiguous parameters — preview Opinion Engine inferences before committing
9. After the FIRST create_frame failure, review ALL remaining planned payloads for the same pattern before retrying`;

const RESPONSIVE_GUIDE = `# Responsive Web Layout Guide

## Breakpoints

| Breakpoint | Width | Columns | Padding |
|-----------|-------|---------|---------|
| Mobile    | 375px | 1       | 16px    |
| Tablet    | 768px | 2       | 24px    |
| Desktop   | 1280px| 3-4     | 32-64px |

## Auto Layout Strategy

- Mobile: VERTICAL stack, 1 column, FILL width children
- Tablet: mix HORIZONTAL rows (2-col) + VERTICAL sections
- Desktop: HORIZONTAL main layout with sidebar + content area

## Sizing Patterns

| Context | Horizontal | Vertical |
|---------|-----------|----------|
| Page container | FIXED (breakpoint width) | HUG |
| Content area | FILL | HUG |
| Sidebar | FIXED (240-300px) | FILL |
| Cards in grid | layoutGrow: 1 (equal width) | HUG |
| Full-width sections | FILL | HUG |

## Key Rules

- NEVER use fixed pixel widths for content children at mobile — use FILL
- SHOULD use maxWidth constraints for text readability (600-800px at desktop)
- Breakpoint frames are FIXED width; their children adapt via FILL/HUG
- Cards: use layoutGrow: 1 in HORIZONTAL rows for equal distribution
- Navigation: HORIZONTAL on desktop, bottom tab bar on mobile`;

const CONTENT_STATES_GUIDE = `# Content State Patterns

Every data-driven view MUST consider these states:

## Empty State
\`\`\`
Container (VERTICAL, FILL/HUG, counterAxisAlignItems: CENTER, padding 40-60)
  ├── Illustration (120-160px, subtle fill or SVG placeholder)
  ├── Heading ("No items yet" / "Get started") — 20px, semibold
  ├── Body ("Add your first item to see it here") — 14-16px, muted
  └── CTA Button ("Add Item") — primary style
\`\`\`
- Center the empty state vertically and horizontally in its container
- Use encouraging, action-oriented language (not error language)
- The CTA should directly trigger the creation action

## Loading State (Skeleton)
\`\`\`
Same structure as loaded state, but:
  ├── Text nodes → gray rectangles (cornerRadius 4, fill gray-200, height matching line-height)
  ├── Images → gray rectangles (same dimensions, fill gray-100)
  ├── Avatar → gray circle (same size)
  └── All skeleton elements: no stroke, uniform gray palette
\`\`\`
- Match the loaded layout exactly — skeleton IS the layout with gray placeholders
- NEVER use a centered spinner for content that has a known layout
- Spinner only for indeterminate operations (file upload, search)

## Error State
\`\`\`
Container (VERTICAL, FILL/HUG, counterAxisAlignItems: CENTER, padding 40-60)
  ├── Error icon (48-64px, warning/error color)
  ├── Heading ("Something went wrong") — 20px, semibold
  ├── Body ("We couldn't load your data. Please try again.") — 14-16px, muted
  └── Retry Button ("Try Again") — secondary or outline style
\`\`\`
- Use neutral, non-blaming language
- Always provide a retry action
- Don't use red for the entire error state — red for icon/accent only`;


const OPINION_ENGINE_GUIDE = `# Opinion Engine (create_frame built-in)

create_frame includes an Opinion Engine that automatically handles common Figma API pitfalls. You do NOT need to handle these manually.

## Automatic Inferences

| What | How | Confidence |
|------|-----|------------|
| layoutMode | Inferred from padding/spacing/alignment params | deterministic |
| layoutSizing | Context-aware: FILL cross-axis, HUG primary-axis; mobile → FIXED | deterministic |
| FILL → HUG downgrade | Parent HUG + child FILL would collapse → auto-downgrade | deterministic |
| Parent promotion | Children need FILL → parent auto-gets layoutMode | deterministic/ambiguous |
| Text resize | Empty text → HEIGHT; overflow → HEIGHT; lineHeight fix | deterministic |
| Empty frame → rectangle | Empty fixed-size frame downgraded to avoid HUG errors | deterministic |
| Font normalization | "700" → "Bold", "SemiBold" → "Semi Bold" | deterministic |
| Direction | WRAP → HORIZONTAL; name matches row/toolbar → HORIZONTAL | deterministic |

## Token Auto-Binding (library mode)

- fillVariableName → searches library COLOR variables
- textStyleName → matches library text styles
- Spacing/padding → matches library FLOAT variables by scope
- Falls back to hardcoded values if no match

## Response Fields

- _hints: what inferences were applied [confidence, field, value, reason]
- _warnings: non-fatal issues (style not found, padding > frame)
- _inferences: full inference array
- _libraryBindings: bound variables/styles
- _lintSummary: quick lint after creation
- _previewHint: suggests export_image for verification
- _correctedPayload: corrected params when ambiguous (use for retry)

## dryRun Mode

create_frame(dryRun:true) validates without creating:
- Returns inferences, conflicts, ambiguities
- Provides correctedPayload for safe retry
- Zero side effects — no nodes created`;

// ─── UI Type Templates ───

interface UiPattern {
  /** Typical node hierarchy for this UI type. */
  structure: string;
  /** Key layout/sizing decisions specific to this UI type. */
  keyDecisions: Record<string, string>;
  /** High-frequency lint violations for this UI type. */
  pitfalls: string[];
  /** How the design changes across different tones. */
  toneVariants: Record<string, Record<string, string>>;
  /** Ready-to-use create_frame params skeleton (minimal tone). */
  exampleParams: Record<string, unknown>;
}

const UI_PATTERNS: Record<string, UiPattern> = {
  login: {
    structure:
      'Screen (VERTICAL, FIXED 402×874, SPACE_BETWEEN, padding 24)\n' +
      '  ├── Top Content (VERTICAL, FILL/HUG, itemSpacing 24)\n' +
      '  │     ├── Logo / Brand mark (48-64px)\n' +
      '  │     ├── Heading ("Welcome back")\n' +
      '  │     └── Subheading (optional, muted color)\n' +
      '  ├── Form (VERTICAL, FILL/HUG, itemSpacing 12-16)\n' +
      '  │     ├── Email input (HORIZONTAL, FILL/HUG, stroke, cornerRadius 8-12, padding 16, height ≥48)\n' +
      '  │     ├── Password input (same structure)\n' +
      '  │     ├── Forgot password link (right-aligned text, small)\n' +
      '  │     └── Primary CTA (HORIZONTAL, FILL/FIXED height ≥48, centered text, cornerRadius 8-12, fill accent)\n' +
      '  └── Bottom Content (VERTICAL, FILL/HUG, itemSpacing 16)\n' +
      '        ├── Divider with "or" label\n' +
      '        ├── Social login row (HORIZONTAL, gap 12-16)\n' +
      '        └── Sign up link ("Don\'t have an account? Sign up")',
    keyDecisions: {
      layout: 'SPACE_BETWEEN distributes top brand + form + bottom links; form group centered vertically',
      buttonHeight: '≥48px, full-width on mobile, centered text',
      inputSpacing: '12-16px between fields, 24px between form sections',
      padding: 'horizontal 24px, top 60-80px (below status bar), bottom 34px (home indicator)',
      inputStructure: 'HORIZONTAL auto-layout frame with stroke, no standalone text — always wrapped in frame',
    },
    pitfalls: [
      'button-structure: CTA height < 48px or missing auto-layout',
      'input-field-structure: input missing stroke or cornerRadius',
      'text-overflow: long email addresses overflow input frame',
      'screen-bottom-overflow: form + social login + links overflow viewport',
      'wcag-contrast: light gray placeholder text fails 4.5:1 ratio — use #6B7280 minimum for secondary text',
      'sizing-collapse: input/button children default to HUG width — explicitly set layoutSizingHorizontal:"FILL" on all inputs, buttons, and divider rows',
      'icon-placeholder: NEVER use ">" text for chevron or "..." for more — call icon_search + icon_create for lucide:chevron-right, lucide:ellipsis, etc.',
      'social-login-icons: Social buttons MUST include brand icons (lucide:apple, iconoir:google) — text-only buttons look unfinished',
      'logo-as-rectangle: Logo placeholder must be type:"frame" with centered icon inside, NOT type:"rectangle" (which cannot have children)',
      'clipsContent-text: Pure text wrapper frames should use clipsContent:false to prevent text clipping when frame height is tight',
    ],
    toneVariants: {
      minimal: { cornerRadius: '8-12px', colors: 'monochrome + 1 accent, white background, light gray inputs', typography: '1 font weight for body, 1 for heading' },
      elegant: { cornerRadius: '12-16px', colors: 'warm neutrals + gold/copper accent', typography: 'serif heading + sans body' },
      bold: { cornerRadius: '16-24px', colors: 'gradient or saturated hero background + high-contrast CTA', typography: 'heavy weight heading, generous spacing' },
    },
    exampleParams: {
      name: 'Screen / Login',
      width: 402, height: 874,
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      padding: 24, paddingTop: 60, paddingBottom: 34,
      cornerRadius: 28, fill: '#FFFFFF', clipsContent: true,
      children: [
        {
          type: 'frame', name: 'Top Content',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          itemSpacing: 24,
          children: [
            { type: 'frame', name: 'Logo', width: 48, height: 48, cornerRadius: 12, fill: '#F3F4F6' },
          ],
        },
        {
          type: 'frame', name: 'Form',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          itemSpacing: 16,
          children: [
            { type: 'frame', name: 'Input / Email', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 48, padding: 16, cornerRadius: 12, strokeColor: '#D1D5DB', strokeWeight: 1 },
            { type: 'frame', name: 'Input / Password', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 48, padding: 16, cornerRadius: 12, strokeColor: '#D1D5DB', strokeWeight: 1 },
            { type: 'frame', name: 'Button / Primary', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 48, cornerRadius: 12, fill: '#111827', primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER' },
          ],
        },
        {
          type: 'frame', name: 'Bottom Content',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          itemSpacing: 16,
          children: [
            { type: 'frame', name: 'Divider Row', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', counterAxisAlignItems: 'CENTER', itemSpacing: 12 },
            { type: 'frame', name: 'Social Login Row', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', itemSpacing: 12 },
          ],
        },
      ],
    },
  },
  signup: {
    structure:
      'Screen (VERTICAL, FIXED 402×874, SPACE_BETWEEN, padding 24)\n' +
      '  ├── Top Content (VERTICAL, FILL/HUG, itemSpacing 24)\n' +
      '  │     ├── Heading ("Create account")\n' +
      '  │     └── Subheading ("Join 10,000+ users")\n' +
      '  ├── Form (VERTICAL, FILL/HUG, itemSpacing 12-16)\n' +
      '  │     ├── Name input (full width or split first/last as HORIZONTAL row)\n' +
      '  │     ├── Email input\n' +
      '  │     ├── Password input (with strength indicator below)\n' +
      '  │     ├── Terms checkbox row (HORIZONTAL, gap 8, "I agree to Terms")\n' +
      '  │     └── Primary CTA ("Create account")\n' +
      '  └── Bottom Content (VERTICAL, FILL/HUG)\n' +
      '        ├── Social signup options (HORIZONTAL or VERTICAL stack)\n' +
      '        └── Login link ("Already have an account? Log in")',
    keyDecisions: {
      layout: 'SPACE_BETWEEN or MIN depending on field count; 3-4 fields use SPACE_BETWEEN, 5+ use MIN with scroll',
      formDensity: 'Keep above fold: if >4 fields, consider multi-step (see onboarding pattern)',
      passwordStrength: 'Small bar or dots below password input, color-coded (red→yellow→green)',
      terms: 'Checkbox + inline text link, not a separate screen',
    },
    pitfalls: [
      'form-consistency: name fields (first/last) different heights in the same row',
      'screen-bottom-overflow: many fields push CTA below viewport',
      'wcag-target-size: terms checkbox < 44px touch target',
      'input-field-structure: password strength indicator not inside input frame',
      'text-overflow: terms text wraps awkwardly on small screens',
    ],
    toneVariants: {
      minimal: { cornerRadius: '8-12px', colors: 'clean white, subtle input borders', typography: 'single font family, 2 weights' },
      warm: { cornerRadius: '12-16px', colors: 'soft pastels, rounded friendly aesthetic', typography: 'rounded or geometric sans-serif' },
      bold: { cornerRadius: '16-24px', colors: 'vibrant accent on CTA, dark or colored background', typography: 'strong contrast between heading and body' },
    },
    exampleParams: {
      name: 'Screen / Signup',
      width: 402, height: 874,
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      padding: 24, paddingTop: 60, paddingBottom: 34,
      cornerRadius: 28, fill: '#FFFFFF', clipsContent: true,
      children: [
        {
          type: 'frame', name: 'Top Content',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          itemSpacing: 8,
        },
        {
          type: 'frame', name: 'Form',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          itemSpacing: 16,
          children: [
            { type: 'frame', name: 'Input / Name', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 48, padding: 16, cornerRadius: 12, strokeColor: '#D1D5DB', strokeWeight: 1 },
            { type: 'frame', name: 'Input / Email', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 48, padding: 16, cornerRadius: 12, strokeColor: '#D1D5DB', strokeWeight: 1 },
            { type: 'frame', name: 'Input / Password', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 48, padding: 16, cornerRadius: 12, strokeColor: '#D1D5DB', strokeWeight: 1 },
            { type: 'frame', name: 'Terms Row', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', itemSpacing: 8, counterAxisAlignItems: 'CENTER' },
            { type: 'frame', name: 'Button / Primary', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 48, cornerRadius: 12, fill: '#111827', primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER' },
          ],
        },
        {
          type: 'frame', name: 'Bottom Content',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          itemSpacing: 16,
          children: [
            { type: 'frame', name: 'Social Signup Row', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', itemSpacing: 12 },
          ],
        },
      ],
    },
  },
  onboarding: {
    structure:
      'Use Multi-Screen Flow Architecture (see get_creation_guide topic:"multi-screen").\n\n' +
      'Per Screen (VERTICAL, FIXED 402×874, padding 24, SPACE_BETWEEN):\n' +
      '  ├── Top Content (VERTICAL, FILL/HUG, itemSpacing 16-24)\n' +
      '  │     ├── Illustration / Hero image (FILL/FIXED height 200-300)\n' +
      '  │     ├── Heading (24-28px, max 2 lines)\n' +
      '  │     └── Body text (14-16px, max 3 lines, muted)\n' +
      '  └── Bottom Content (VERTICAL, FILL/HUG, itemSpacing 12)\n' +
      '        ├── Progress indicator (dots or bar)\n' +
      '        ├── Primary CTA ("Next" / "Continue" / "Get Started")\n' +
      '        └── Skip link (optional, "Skip" text button)',
    keyDecisions: {
      screenCount: '3-5 screens is ideal; more loses attention',
      illustration: 'Placeholder rectangle with fill and description text inside — DO NOT leave blank',
      progressIndicator: 'Dots (HORIZONTAL row, 8px circles, 8px gap) or thin bar (FILL width, 4px height)',
      lastScreen: 'Final CTA is "Get Started" (not "Next"), no skip link, may add feature summary',
      transitions: 'Each screen is independent — no carousel/swipe in Figma, just side-by-side stages',
    },
    pitfalls: [
      'empty-container: illustration placeholder left empty (add a colored rectangle + description)',
      'cta-width-inconsistent: "Next" vs "Get Started" buttons different widths across screens',
      'text-overflow: heading > 2 lines on some screens',
      'mobile-dimensions: screen not exactly 402×874 (iOS) or 412×915 (Android)',
      'default-name: screens named "Frame 1", "Frame 2" instead of "Onboarding Step 1"',
    ],
    toneVariants: {
      minimal: { cornerRadius: '8-12px', colors: 'white background, one accent for CTA and progress dots', typography: 'lightweight, generous line height' },
      warm: { cornerRadius: '16-20px', colors: 'soft gradient backgrounds, friendly illustration style', typography: 'rounded sans-serif, warm tones' },
      bold: { cornerRadius: '20-28px', colors: 'full-bleed colored backgrounds per screen, white text', typography: 'large heading (28-32px), strong hierarchy' },
    },
    exampleParams: {
      name: 'Screen / Onboarding',
      width: 402, height: 874,
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      padding: 24, paddingTop: 60, paddingBottom: 34,
      cornerRadius: 28, fill: '#FFFFFF', clipsContent: true,
      children: [
        {
          type: 'frame', name: 'Top Content',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          itemSpacing: 24,
          children: [
            { type: 'frame', name: 'Illustration', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 240, cornerRadius: 16, fill: '#F3F4F6' },
          ],
        },
        {
          type: 'frame', name: 'Bottom Content',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          itemSpacing: 12,
          children: [
            {
              type: 'frame', name: 'Progress Dots',
              layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
              itemSpacing: 8,
              children: [
                { type: 'ellipse', name: 'Dot Active', width: 8, height: 8, fill: '#111827' },
                { type: 'ellipse', name: 'Dot', width: 8, height: 8, fill: '#D1D5DB' },
                { type: 'ellipse', name: 'Dot', width: 8, height: 8, fill: '#D1D5DB' },
              ],
            },
            { type: 'frame', name: 'Button / Primary', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 48, cornerRadius: 12, fill: '#111827', primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER' },
          ],
        },
      ],
    },
  },
  dashboard: {
    structure:
      'Screen (VERTICAL, FIXED 402×874 mobile / 1280×800 web, padding 16-24)\n' +
      '  ├── Header (HORIZONTAL, FILL/HUG, itemSpacing 12)\n' +
      '  │     ├── Title ("Dashboard")\n' +
      '  │     ├── Spacer (layoutGrow 1) or counterAxisAlignItems: MIN\n' +
      '  │     └── Actions (avatar, notification bell, settings icon)\n' +
      '  ├── Stats Row (HORIZONTAL, FILL/HUG, itemSpacing 12-16)\n' +
      '  │     └── Stat Card × 3-4 (VERTICAL, equal width via layoutGrow, padding 16, cornerRadius 12, fill surface)\n' +
      '  │           ├── Label (12-14px, muted)\n' +
      '  │           ├── Value (24-32px, bold)\n' +
      '  │           └── Trend (12px, green/red + arrow)\n' +
      '  ├── Chart Area (VERTICAL, FILL/HUG, padding 16, cornerRadius 12, fill surface)\n' +
      '  │     ├── Chart title + period selector\n' +
      '  │     └── Chart placeholder (FILL/FIXED height 200-240, fill gray-100)\n' +
      '  └── List / Table (VERTICAL, FILL/HUG)\n' +
      '        ├── Section header ("Recent activity")\n' +
      '        └── Row × N (HORIZONTAL, FILL/HUG, padding 12-16, itemSpacing 12)',
    keyDecisions: {
      density: 'Mobile: stack vertically, 1 column. Web: 2-3 column grid via HORIZONTAL rows',
      statCards: 'Use layoutGrow: 1 on each card for equal width distribution in HORIZONTAL row',
      chartPlaceholder: 'Colored rectangle with "Chart" text inside — never empty frame',
      scrollBehavior: 'primaryAxisAlignItems: "MIN" (not SPACE_BETWEEN) — dashboard scrolls, doesn\'t stretch',
      cardStyle: 'Consistent cornerRadius, fill surface/white, optional subtle shadow or stroke',
    },
    pitfalls: [
      'stats-row-cramped: stat cards too close together (itemSpacing < 12px)',
      'empty-container: chart placeholder frame is empty — use type:"frame" with centered bar-chart icon (lucide:chart-bar-increasing)',
      'overflow-parent: stat cards overflow screen width on mobile',
      'no-autolayout: stat cards not in auto-layout row (manual positioning breaks on resize)',
      'wcag-contrast: muted labels / trend text below 4.5:1',
      'default-name: cards named "Frame 1" instead of "Stats Card / Revenue"',
      'stat-value-wrap: stat values ("$12,480") wrap to 2 lines in narrow cards — use fontSize ≤20px or ensure card content width > text width',
      'avatar-placeholder: header avatar must be type:"frame" with circle-user icon, NOT type:"rectangle" (cannot add icon later)',
      'notification-icon: use lucide:bell icon instead of text badge only — combine icon + red dot badge for notification indicator',
    ],
    toneVariants: {
      minimal: { cornerRadius: '8-12px', colors: 'white cards on gray-50 background, monochrome chart', typography: 'system font, compact spacing' },
      elegant: { cornerRadius: '12-16px', colors: 'subtle card shadows, accent color for trends and chart highlights', typography: 'medium weight numbers, light labels' },
      bold: { cornerRadius: '16-24px', colors: 'dark background, colored stat cards, vivid chart colors', typography: 'large stat values (32px+), strong hierarchy' },
    },
    exampleParams: {
      name: 'Screen / Dashboard',
      width: 402, height: 874,
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'MIN',
      padding: 16,
      cornerRadius: 28, fill: '#F9FAFB', clipsContent: true,
      itemSpacing: 16,
      children: [
        {
          type: 'frame', name: 'Header',
          layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          counterAxisAlignItems: 'CENTER', itemSpacing: 12,
        },
        {
          type: 'frame', name: 'Stats Row',
          layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          itemSpacing: 12,
          children: [
            { type: 'frame', name: 'Stat Card / Revenue', layoutMode: 'VERTICAL', layoutSizingVertical: 'HUG', layoutGrow: 1, padding: 16, cornerRadius: 12, fill: '#FFFFFF', itemSpacing: 4 },
            { type: 'frame', name: 'Stat Card / Users', layoutMode: 'VERTICAL', layoutSizingVertical: 'HUG', layoutGrow: 1, padding: 16, cornerRadius: 12, fill: '#FFFFFF', itemSpacing: 4 },
            { type: 'frame', name: 'Stat Card / Orders', layoutMode: 'VERTICAL', layoutSizingVertical: 'HUG', layoutGrow: 1, padding: 16, cornerRadius: 12, fill: '#FFFFFF', itemSpacing: 4 },
          ],
        },
        {
          type: 'frame', name: 'Chart Area',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          padding: 16, cornerRadius: 12, fill: '#FFFFFF', itemSpacing: 12,
          children: [
            { type: 'frame', name: 'Chart Placeholder', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 200, cornerRadius: 8, fill: '#F3F4F6' },
          ],
        },
        {
          type: 'frame', name: 'Recent Activity',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          itemSpacing: 0,
        },
      ],
    },
  },
  'list-detail': {
    structure:
      'Screen (VERTICAL, FIXED 402×874, padding 0)\n' +
      '  ├── Header (HORIZONTAL, FILL/HUG, padding 16-24, itemSpacing 12)\n' +
      '  │     ├── Back arrow icon (24×24)\n' +
      '  │     ├── Title ("Products")\n' +
      '  │     └── Filter/Search icon (right-aligned)\n' +
      '  ├── Search Bar (HORIZONTAL, FILL/HUG, margin-h 16, padding 12, cornerRadius 8, fill gray-100)\n' +
      '  │     ├── Search icon (16×16, muted)\n' +
      '  │     └── Placeholder text ("Search...")\n' +
      '  └── List (VERTICAL, FILL/FILL, padding-h 16, itemSpacing 0)\n' +
      '        └── List Item × N (HORIZONTAL, FILL/HUG, padding 12-16, itemSpacing 12)\n' +
      '              ├── Thumbnail (48-64px square, cornerRadius 8, fill gray-100)\n' +
      '              ├── Content (VERTICAL, FILL/HUG, itemSpacing 4)\n' +
      '              │     ├── Title (16px, semibold)\n' +
      '              │     └── Subtitle (14px, muted)\n' +
      '              └── Trailing (price, chevron, or badge)',
    keyDecisions: {
      listScrolling: 'primaryAxisAlignItems: "MIN" (scrollable list, not SPACE_BETWEEN)',
      itemSeparators: 'Use itemSpacing: 0 + bottom stroke on each item, OR itemSpacing: 8 with card-style items',
      thumbnailAspect: 'Square (1:1) for products/avatars, 16:9 for articles/media',
      emptyState: 'When list is empty: centered illustration + heading + CTA button',
      pullToRefresh: 'Not applicable in Figma — design the static loaded state',
    },
    pitfalls: [
      'overflow-parent: list items overflow screen when too many',
      'wcag-target-size: list item < 48px total height',
      'empty-container: thumbnail placeholder left empty',
      'text-overflow: long titles overflow content column',
      'no-autolayout: list items manually positioned instead of auto-layout',
    ],
    toneVariants: {
      minimal: { cornerRadius: '8px', colors: 'white background, gray-100 thumbnails, subtle dividers', typography: 'clean sans-serif, regular/medium weights' },
      warm: { cornerRadius: '12px', colors: 'warm surface tones, soft card backgrounds', typography: 'friendly geometric font' },
      bold: { cornerRadius: '16px', colors: 'dark cards or colored backgrounds, vivid accent for badges', typography: 'strong weight for titles, condensed for metadata' },
    },
    exampleParams: {
      name: 'Screen / List',
      width: 402, height: 874,
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'MIN',
      cornerRadius: 28, fill: '#FFFFFF', clipsContent: true,
      itemSpacing: 0,
      children: [
        {
          type: 'frame', name: 'Header',
          layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          padding: 16, counterAxisAlignItems: 'CENTER', itemSpacing: 12,
        },
        {
          type: 'frame', name: 'Search Bar',
          layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          padding: 12, marginLeft: 16, marginRight: 16,
          cornerRadius: 8, fill: '#F3F4F6', counterAxisAlignItems: 'CENTER', itemSpacing: 8,
        },
        {
          type: 'frame', name: 'List',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FILL',
          paddingLeft: 16, paddingRight: 16, itemSpacing: 0,
          children: [
            {
              type: 'frame', name: 'List Item',
              layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
              padding: 12, itemSpacing: 12, counterAxisAlignItems: 'CENTER',
              children: [
                { type: 'frame', name: 'Thumbnail', width: 48, height: 48, cornerRadius: 8, fill: '#F3F4F6' },
                { type: 'frame', name: 'Content', layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', itemSpacing: 4, layoutGrow: 1 },
              ],
            },
          ],
        },
      ],
    },
  },
  settings: {
    structure:
      'Screen (VERTICAL, FIXED 402×874, padding 0)\n' +
      '  ├── Header (HORIZONTAL, FILL/HUG, padding 16-24)\n' +
      '  │     └── Title ("Settings")\n' +
      '  └── Sections (VERTICAL, FILL/FILL, padding-h 0, itemSpacing 24)\n' +
      '        └── Section × N (VERTICAL, FILL/HUG, itemSpacing 0)\n' +
      '              ├── Section Header (padding-h 16, 12px uppercase, muted, letterSpacing 1)\n' +
      '              └── Row × N (HORIZONTAL, FILL/HUG, padding 16, itemSpacing 12, min-height 48)\n' +
      '                    ├── Icon (24×24, optional)\n' +
      '                    ├── Label (FILL/HUG, layoutGrow 1, 16px)\n' +
      '                    └── Trailing (toggle switch / chevron / value text)',
    keyDecisions: {
      sectionGrouping: 'Group related rows under section headers (Account, Preferences, About)',
      rowTrailing: 'Toggle for on/off settings, chevron (>) for drill-down, value text for display-only',
      destructiveRow: 'Red text for "Log out" / "Delete account" — always at bottom',
      padding: 'Rows full-width (padding-h 16), sections separated by 24px gap or gray divider',
      scrollBehavior: 'primaryAxisAlignItems: "MIN" — settings scroll vertically',
    },
    pitfalls: [
      'wcag-target-size: toggle switch or row < 48px height — MUST set layoutSizingVertical:"FIXED" + height:48 on every row',
      'form-consistency: rows have inconsistent heights or padding',
      'default-name: rows named "Frame 1" instead of "Settings Row / Notifications"',
      'text-overflow: label text too long for single line',
      'nav-overcrowded: too many rows without section grouping',
      'chevron-as-text: NEVER use ">" text for drill-down indicator — use icon_create with lucide:chevron-right (size 18)',
      'toggle-clipped: toggle switch (44×26) gets clipped if parent row has clipsContent:true and insufficient height — ensure row height ≥48px',
      'card-group-radius: grouped settings card (white bg on gray screen) should have cornerRadius 12px and paddingTop/Bottom 4px for visual separation',
    ],
    toneVariants: {
      minimal: { cornerRadius: '0px (full-width rows)', colors: 'white background, gray section headers, system blue toggles', typography: 'system font, 16px body' },
      elegant: { cornerRadius: '12px (card sections)', colors: 'grouped card backgrounds, subtle shadows', typography: 'medium weight labels, light descriptions' },
      bold: { cornerRadius: '16px (card sections)', colors: 'dark background, accent-colored icons', typography: 'larger labels (17-18px), strong weight' },
    },
    exampleParams: {
      name: 'Screen / Settings',
      width: 402, height: 874,
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'MIN',
      cornerRadius: 28, fill: '#F9FAFB', clipsContent: true,
      itemSpacing: 0,
      children: [
        {
          type: 'frame', name: 'Header',
          layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          padding: 16, counterAxisAlignItems: 'CENTER',
        },
        {
          type: 'frame', name: 'Sections',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FILL',
          itemSpacing: 24, paddingTop: 16,
          children: [
            {
              type: 'frame', name: 'Section / Account',
              layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
              itemSpacing: 0, cornerRadius: 12, fill: '#FFFFFF', paddingTop: 4, paddingBottom: 4,
              children: [
                { type: 'frame', name: 'Row / Profile', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 48, padding: 16, itemSpacing: 12, counterAxisAlignItems: 'CENTER' },
                { type: 'frame', name: 'Row / Notifications', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 48, padding: 16, itemSpacing: 12, counterAxisAlignItems: 'CENTER' },
                { type: 'frame', name: 'Row / Privacy', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 48, padding: 16, itemSpacing: 12, counterAxisAlignItems: 'CENTER' },
              ],
            },
          ],
        },
      ],
    },
  },
  profile: {
    structure:
      'Screen (VERTICAL, FIXED 402×874, padding 0)\n' +
      '  ├── Hero Area (VERTICAL, FILL/HUG, padding 24, counterAxisAlignItems CENTER)\n' +
      '  │     ├── Avatar (80-120px circle, cornerRadius 9999, fill gray-200 placeholder)\n' +
      '  │     ├── Name (20-24px, semibold, margin-top 16)\n' +
      '  │     ├── Handle/bio (14px, muted, max 2 lines)\n' +
      '  │     └── Action Row (HORIZONTAL, HUG/HUG, itemSpacing 12, margin-top 16)\n' +
      '  │           ├── Primary CTA ("Edit Profile" / "Follow")\n' +
      '  │           └── Secondary action (message icon / share)\n' +
      '  ├── Stats Row (HORIZONTAL, FILL/HUG, padding 16, itemSpacing 0)\n' +
      '  │     └── Stat × 3 (VERTICAL, layoutGrow 1, counterAxisAlignItems CENTER)\n' +
      '  │           ├── Value (18-20px, bold)\n' +
      '  │           └── Label (12px, muted)\n' +
      '  └── Content Area (VERTICAL, FILL/FILL, padding 0)\n' +
      '        ├── Tab bar (HORIZONTAL, FILL/HUG, itemSpacing 0) or section headers\n' +
      '        └── Content list (VERTICAL, FILL/FILL)',
    keyDecisions: {
      avatarSize: '80px compact, 120px prominent — always circle (cornerRadius 9999)',
      statsLayout: 'layoutGrow: 1 on each stat for equal distribution, centered text',
      heroBg: 'Optional cover image behind avatar (200-240px height, clipsContent true)',
      contentTabs: 'Posts / Media / Likes — underline active tab with accent color',
      scrollBehavior: 'MIN — profile content scrolls, hero can be sticky or scroll away',
    },
    pitfalls: [
      'stats-row-cramped: stat values too close together',
      'empty-container: avatar placeholder empty — use type:"frame" (circle, gray fill) with lucide:circle-user-round icon centered inside, NOT type:"rectangle"',
      'text-overflow: bio text > 2 lines overflows',
      'wcag-contrast: muted handle/bio text below 4.5:1 — use #6B7280 minimum',
      'button-structure: action buttons missing auto-layout or < 48px height',
      'share-button-icon: share/more button should use lucide:ellipsis or lucide:share icon, NOT "..." text',
      'action-row-stroke: wrapper frame around buttons may inherit default strokeWeight:1 — set strokes:[] to clear',
    ],
    toneVariants: {
      minimal: { cornerRadius: 'circle avatar, 8px buttons', colors: 'white background, gray avatar placeholder, minimal accent', typography: 'clean hierarchy, 3 size tiers' },
      warm: { cornerRadius: 'circle avatar, 16px cards', colors: 'warm gradient header/cover, soft card backgrounds', typography: 'rounded font, generous spacing' },
      bold: { cornerRadius: 'circle avatar, 20px cards', colors: 'dark header with cover image, bright accent CTA', typography: 'large name (24px), strong stat values' },
    },
    exampleParams: {
      name: 'Screen / Profile',
      width: 402, height: 874,
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'MIN',
      cornerRadius: 28, fill: '#FFFFFF', clipsContent: true,
      itemSpacing: 0,
      children: [
        {
          type: 'frame', name: 'Hero Area',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          padding: 24, counterAxisAlignItems: 'CENTER', itemSpacing: 16,
          children: [
            { type: 'frame', name: 'Avatar', width: 80, height: 80, cornerRadius: 9999, fill: '#F3F4F6' },
            {
              type: 'frame', name: 'Action Row',
              layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
              itemSpacing: 12,
              children: [
                { type: 'frame', name: 'Button / Edit Profile', layoutMode: 'HORIZONTAL', layoutSizingVertical: 'FIXED', height: 48, padding: 16, cornerRadius: 12, fill: '#111827', primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER' },
              ],
            },
          ],
        },
        {
          type: 'frame', name: 'Stats Row',
          layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          padding: 16, itemSpacing: 0,
          children: [
            { type: 'frame', name: 'Stat / Posts', layoutMode: 'VERTICAL', layoutSizingVertical: 'HUG', layoutGrow: 1, counterAxisAlignItems: 'CENTER', itemSpacing: 2 },
            { type: 'frame', name: 'Stat / Followers', layoutMode: 'VERTICAL', layoutSizingVertical: 'HUG', layoutGrow: 1, counterAxisAlignItems: 'CENTER', itemSpacing: 2 },
            { type: 'frame', name: 'Stat / Following', layoutMode: 'VERTICAL', layoutSizingVertical: 'HUG', layoutGrow: 1, counterAxisAlignItems: 'CENTER', itemSpacing: 2 },
          ],
        },
        {
          type: 'frame', name: 'Content Area',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FILL',
          itemSpacing: 0,
          children: [
            { type: 'frame', name: 'Tab Bar', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', itemSpacing: 0 },
          ],
        },
      ],
    },
  },
  'card-grid': {
    structure:
      'Screen (VERTICAL, FIXED 402×874 mobile / 1280×800 web, padding 16-24)\n' +
      '  ├── Header (HORIZONTAL, FILL/HUG, itemSpacing 12)\n' +
      '  │     ├── Title ("Explore")\n' +
      '  │     └── Filter chips (HORIZONTAL, HUG/HUG, itemSpacing 8)\n' +
      '  └── Grid (VERTICAL, FILL/FILL, itemSpacing 16)\n' +
      '        └── Row × N (HORIZONTAL, FILL/HUG, itemSpacing 12-16)\n' +
      '              └── Card × 2-3 (VERTICAL, layoutGrow 1, cornerRadius 12-16, clipsContent true)\n' +
      '                    ├── Image (FILL/FIXED height 140-180, fill gray-100)\n' +
      '                    └── Content (VERTICAL, FILL/HUG, padding 12-16, itemSpacing 4-8)\n' +
      '                          ├── Title (16px, semibold, max 2 lines)\n' +
      '                          ├── Subtitle (14px, muted)\n' +
      '                          └── Footer (HORIZONTAL, FILL/HUG) — price, rating, action',
    keyDecisions: {
      columns: 'Mobile: 2 columns (layoutGrow: 1 each). Web: 3-4 columns',
      cardImage: 'Image placeholder with fill color + description — NEVER empty frame',
      cardAspectRatio: '4:3 for products, 16:9 for content/media, 1:1 for square thumbnails',
      equalHeight: 'Cards in same row should have equal height via matching image + content height',
      interactionHint: 'Optional: subtle shadow or scale on card for tap affordance',
    },
    pitfalls: [
      'overflow-parent: cards overflow screen width (need layoutGrow, not fixed width)',
      'empty-container: image placeholder frames empty',
      'text-overflow: titles overflow card width at 2 columns',
      'no-autolayout: cards manually positioned instead of auto-layout grid rows',
      'default-name: cards named "Frame 1" instead of "Card / Product Name"',
      'cta-width-inconsistent: footer action buttons different sizes across cards',
    ],
    toneVariants: {
      minimal: { cornerRadius: '12px', colors: 'white cards, no shadow, subtle gray-100 images', typography: 'clean sans, 2 weights' },
      warm: { cornerRadius: '16px', colors: 'warm card shadows, soft rounded aesthetic', typography: 'friendly font, generous line height' },
      bold: { cornerRadius: '20px', colors: 'dark cards or vivid image overlays, strong CTA colors', typography: 'compact bold titles, high contrast' },
    },
    exampleParams: {
      name: 'Screen / Card Grid',
      width: 402, height: 874,
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'MIN',
      padding: 16,
      cornerRadius: 28, fill: '#FFFFFF', clipsContent: true,
      itemSpacing: 16,
      children: [
        {
          type: 'frame', name: 'Header',
          layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          counterAxisAlignItems: 'CENTER', itemSpacing: 12,
          children: [
            {
              type: 'frame', name: 'Filter Chips',
              layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
              itemSpacing: 8,
            },
          ],
        },
        {
          type: 'frame', name: 'Grid',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FILL',
          itemSpacing: 16,
          children: [
            {
              type: 'frame', name: 'Row 1',
              layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
              itemSpacing: 12,
              children: [
                {
                  type: 'frame', name: 'Card', layoutMode: 'VERTICAL', layoutSizingVertical: 'HUG', layoutGrow: 1, cornerRadius: 12, clipsContent: true, fill: '#FFFFFF',
                  children: [
                    { type: 'frame', name: 'Image', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 160, fill: '#F3F4F6' },
                    { type: 'frame', name: 'Content', layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', padding: 12, itemSpacing: 4 },
                  ],
                },
                {
                  type: 'frame', name: 'Card', layoutMode: 'VERTICAL', layoutSizingVertical: 'HUG', layoutGrow: 1, cornerRadius: 12, clipsContent: true, fill: '#FFFFFF',
                  children: [
                    { type: 'frame', name: 'Image', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 160, fill: '#F3F4F6' },
                    { type: 'frame', name: 'Content', layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', padding: 12, itemSpacing: 4 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  checkout: {
    structure:
      'Use Multi-Screen Flow Architecture (see get_creation_guide topic:"multi-screen").\n\n' +
      'Typical 3-4 screens:\n\n' +
      'Screen 1 — Cart Review (VERTICAL, FIXED 402×874, SPACE_BETWEEN, padding 24)\n' +
      '  ├── Cart Items (VERTICAL, FILL/HUG, itemSpacing 16)\n' +
      '  │     └── Item × N (HORIZONTAL, FILL/HUG, padding 12, itemSpacing 12)\n' +
      '  │           ├── Thumbnail (64×64, cornerRadius 8)\n' +
      '  │           ├── Details (VERTICAL, FILL/HUG) — name, variant, qty\n' +
      '  │           └── Price (right-aligned, bold)\n' +
      '  └── Summary + CTA (VERTICAL, FILL/HUG, itemSpacing 12)\n' +
      '        ├── Subtotal / Shipping / Total rows\n' +
      '        └── "Proceed to Payment" CTA\n\n' +
      'Screen 2 — Shipping (form with address fields)\n' +
      'Screen 3 — Payment (card fields + billing)\n' +
      'Screen 4 — Confirmation (success icon + order summary)',
    keyDecisions: {
      progressBar: 'Step indicator at top: Cart → Shipping → Payment → Done (HORIZONTAL dots or numbered steps)',
      priceSummary: 'Right-aligned prices, bold total, clear subtotal/tax/shipping breakdown',
      formFields: 'Reuse input structure from login/signup patterns — consistent height, stroke, cornerRadius',
      confirmationScreen: 'Large check icon (64px) + "Order Confirmed" heading + order number + "Continue Shopping" CTA',
      security: 'Lock icon near payment fields, "Secure checkout" label — builds trust',
    },
    pitfalls: [
      'screen-bottom-overflow: cart with many items pushes CTA below viewport',
      'form-consistency: shipping/payment inputs inconsistent with other forms',
      'button-structure: CTA not full-width or < 48px height',
      'text-overflow: long product names overflow item row',
      'cta-width-inconsistent: different CTA widths across checkout screens',
      'mobile-dimensions: screens not matching 402×874',
    ],
    toneVariants: {
      minimal: { cornerRadius: '8-12px', colors: 'white, clean lines, green for success/confirmation', typography: 'system font, emphasis on prices' },
      elegant: { cornerRadius: '12-16px', colors: 'warm neutrals, gold accent for premium feel', typography: 'serif for headings, clean numbers for prices' },
      bold: { cornerRadius: '16-24px', colors: 'branded color CTA, dark summary sections', typography: 'large price emphasis, strong CTA text' },
    },
    exampleParams: {
      name: 'Screen / Checkout',
      width: 402, height: 874,
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      padding: 24, paddingTop: 60, paddingBottom: 34,
      cornerRadius: 28, fill: '#FFFFFF', clipsContent: true,
      children: [
        {
          type: 'frame', name: 'Cart Items',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          itemSpacing: 16,
          children: [
            {
              type: 'frame', name: 'Cart Item',
              layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
              padding: 12, itemSpacing: 12, counterAxisAlignItems: 'CENTER',
              children: [
                { type: 'frame', name: 'Thumbnail', width: 64, height: 64, cornerRadius: 8, fill: '#F3F4F6' },
                { type: 'frame', name: 'Details', layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', itemSpacing: 4, layoutGrow: 1 },
              ],
            },
          ],
        },
        {
          type: 'frame', name: 'Summary',
          layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
          itemSpacing: 12,
          children: [
            { type: 'frame', name: 'Row / Subtotal', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', primaryAxisAlignItems: 'SPACE_BETWEEN' },
            { type: 'frame', name: 'Row / Total', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', primaryAxisAlignItems: 'SPACE_BETWEEN' },
            { type: 'frame', name: 'Button / Checkout', layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', height: 48, cornerRadius: 12, fill: '#111827', primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER' },
          ],
        },
      ],
    },
  },
};

function formatUiPattern(uiType: string, pattern: UiPattern): string {
  const lines: string[] = [
    `# UI Pattern: ${uiType}`,
    '',
    '## Structure',
    '```',
    pattern.structure,
    '```',
    '',
    '## Key Decisions',
  ];
  for (const [key, value] of Object.entries(pattern.keyDecisions)) {
    lines.push(`- **${key}**: ${value}`);
  }
  lines.push('', '## Common Pitfalls (prevent these)');
  for (const pitfall of pattern.pitfalls) {
    lines.push(`- ${pitfall}`);
  }
  lines.push('', '## Tone Variants');
  for (const [tone, props] of Object.entries(pattern.toneVariants)) {
    lines.push(`### ${tone.charAt(0).toUpperCase() + tone.slice(1)}`);
    for (const [prop, value] of Object.entries(props)) {
      lines.push(`- ${prop}: ${value}`);
    }
  }
  lines.push('', '## Example Parameters (minimal tone)', '');
  lines.push('Ready-to-use `create_frame` params skeleton. Customize text, colors, and icons after creation.');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(pattern.exampleParams, null, 2));
  lines.push('```');
  return lines.join('\n');
}

// ─── Tool registration ───

const VALID_UI_TYPES = Object.keys(UI_PATTERNS);

export function registerCreationGuide(server: McpServer): void {
  server.tool(
    'get_creation_guide',
    'Get structural creation guidance by topic. Returns layout rules, multi-screen architecture, ' +
      'batching strategy, tool behavior patterns, Opinion Engine documentation, or UI type-specific ' +
      'templates with structure, key decisions, pitfalls, and tone variants. ' +
      'Use before creating complex UI to understand best practices.',
    {
      topic: z.enum(['layout', 'multi-screen', 'batching', 'tool-behavior', 'opinion-engine', 'ui-patterns', 'responsive', 'content-states'])
        .describe('Topic: layout (structural rules), multi-screen (flow architecture), batching (context budget), tool-behavior (usage patterns), opinion-engine (auto-inference docs), ui-patterns (UI type templates — requires uiType), responsive (web breakpoints + auto-layout), content-states (empty/loading/error patterns)'),
      uiType: z.string().optional()
        .describe(`UI type for ui-patterns topic. Available: ${VALID_UI_TYPES.join(', ')}. Omit to list all available types.`),
    },
    async ({ topic, uiType }) => {
      let content: string;

      switch (topic) {
        case 'layout':
          content = '# Layout & Structure Rules\n\n' +
            getPreventionChecklist({ phases: ['layout', 'structure'], minSeverity: 'style' })
              .map((hint, i) => `${i + 1}. ${hint}`)
              .join('\n');
          break;
        case 'multi-screen':
          content = MULTI_SCREEN_GUIDE;
          break;
        case 'batching':
          content = BATCHING_GUIDE;
          break;
        case 'tool-behavior':
          content = TOOL_BEHAVIOR_GUIDE;
          break;
        case 'opinion-engine':
          content = OPINION_ENGINE_GUIDE;
          break;
        case 'responsive':
          content = RESPONSIVE_GUIDE;
          break;
        case 'content-states':
          content = CONTENT_STATES_GUIDE;
          break;
        case 'ui-patterns': {
          if (!uiType) {
            content = '# Available UI Patterns\n\n' +
              VALID_UI_TYPES.map(t => `- **${t}**: ${UI_PATTERNS[t].keyDecisions.layout?.slice(0, 80) ?? ''}`).join('\n') +
              '\n\nUse get_creation_guide(topic: "ui-patterns", uiType: "<type>") for the full template.';
            break;
          }
          const pattern = UI_PATTERNS[uiType];
          if (!pattern) {
            content = `Unknown UI type "${uiType}". Available: ${VALID_UI_TYPES.join(', ')}`;
            break;
          }
          content = formatUiPattern(uiType, pattern);
          break;
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: content,
        }],
      };
    },
  );
}
