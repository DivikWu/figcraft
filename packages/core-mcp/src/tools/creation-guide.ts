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
Wrapper (VERTICAL, HUG/HUG, clipsContent=false, cornerRadius, fill, padding, itemSpacing)
  ├── Header (title + description)
  └── Flow Row (HORIZONTAL, HUG/HUG, clipsContent=false, itemSpacing between screens)
        └── Stage / {label} (VERTICAL, HUG/HUG, clipsContent=false)
              ├── Step Pill (badge: "01 Welcome")
              └── Screen / {label} (VERTICAL, FIXED 402×874, cornerRadius=28, clipsContent=true, padding, SPACE_BETWEEN, dropShadow)
                    ├── Top Content (VERTICAL, FILL/HUG)
                    └── Bottom Content (HORIZONTAL or VERTICAL, FILL/HUG)
\`\`\`

## Build Order

1. create_frame: Wrapper + children with full skeleton (Header + Flow Row + Stages + Screens)
2. create_frame: Fill Screen 1 (parentId=screen1Id, children=[TopContent, BottomContent])
3. create_frame: Fill remaining screens one by one
4. lint_fix_all → done

## Key Rules

- Screen uses primaryAxisAlignItems: "SPACE_BETWEEN" for top/bottom distribution (use "MIN" for sparse content)
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
      'wcag-contrast: light gray placeholder text fails 4.5:1 ratio',
    ],
    toneVariants: {
      minimal: { cornerRadius: '8-12px', colors: 'monochrome + 1 accent, white background, light gray inputs', typography: '1 font weight for body, 1 for heading' },
      elegant: { cornerRadius: '12-16px', colors: 'warm neutrals + gold/copper accent', typography: 'serif heading + sans body' },
      bold: { cornerRadius: '16-24px', colors: 'gradient or saturated hero background + high-contrast CTA', typography: 'heavy weight heading, generous spacing' },
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
      'empty-container: chart placeholder frame is empty',
      'overflow-parent: stat cards overflow screen width on mobile',
      'no-autolayout: stat cards not in auto-layout row (manual positioning breaks on resize)',
      'wcag-contrast: muted labels / trend text below 4.5:1',
      'default-name: cards named "Frame 1" instead of "Stats Card / Revenue"',
    ],
    toneVariants: {
      minimal: { cornerRadius: '8-12px', colors: 'white cards on gray-50 background, monochrome chart', typography: 'system font, compact spacing' },
      elegant: { cornerRadius: '12-16px', colors: 'subtle card shadows, accent color for trends and chart highlights', typography: 'medium weight numbers, light labels' },
      bold: { cornerRadius: '16-24px', colors: 'dark background, colored stat cards, vivid chart colors', typography: 'large stat values (32px+), strong hierarchy' },
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
      topic: z.enum(['layout', 'multi-screen', 'batching', 'tool-behavior', 'opinion-engine', 'ui-patterns'])
        .describe('Topic: layout (structural rules), multi-screen (flow architecture), batching (context budget), tool-behavior (usage patterns), opinion-engine (auto-inference docs), ui-patterns (UI type-specific templates — requires uiType)'),
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
