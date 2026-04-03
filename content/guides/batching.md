# Context Budget & Batching Strategy

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
- **Visual check**: export_image(scale:0.5) at key milestones (after each screen, after skeleton)
