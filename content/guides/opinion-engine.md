# Opinion Engine (create_frame built-in)

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
| Primary-axis overflow shrink | Fixed children exceeding parent width/height auto-shrunk proportionally | deterministic |
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
- Zero side effects — no nodes created
