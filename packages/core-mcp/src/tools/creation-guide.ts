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

// ─── Tool registration ───

export function registerCreationGuide(server: McpServer): void {
  server.tool(
    'get_creation_guide',
    'Get structural creation guidance by topic. Returns layout rules, multi-screen architecture, ' +
      'batching strategy, tool behavior patterns, or Opinion Engine documentation. ' +
      'Use before creating complex UI to understand best practices.',
    {
      topic: z.enum(['layout', 'multi-screen', 'batching', 'tool-behavior', 'opinion-engine'])
        .describe('Topic: layout (structural rules from Quality Engine), multi-screen (flow architecture), batching (context budget strategy), tool-behavior (usage patterns), opinion-engine (auto-inference docs)'),
    },
    async ({ topic }) => {
      let content: string;

      switch (topic) {
        case 'layout':
          // Dynamic from Quality Engine — single source of truth
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
