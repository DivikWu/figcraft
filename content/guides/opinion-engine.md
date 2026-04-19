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

## Declaring Interactive Intent

`create_frame` accepts `interactiveKind` + `interactiveState` to declare what kind of interactive element the node is. Declarations are stored as plugin data (`figcraft_interactive_kind` / `figcraft_interactive_state`) and consumed by the variant-aware lint pipeline.

**When to declare**

Declare whenever the node is an interactive element — button, link, toggle, icon button, etc. Declared metadata lands with confidence 1 and short-circuits the classifier, preventing name-regex misfires such as TEXT `"Sign in to continue shopping"` being judged as a broken button.

**Supported kinds**

`button-solid` | `button-outline` | `button-ghost` | `button-text` | `button-icon` | `button-fab` | `link-inline` | `link-standalone` | `toggle` | `switch` | `checkbox` | `radio` | `segmented` | `chip-interactive` | `tab`

**Auto-inference fallback**

When `role: 'button'` is declared without `interactiveKind`, the variant is inferred from structure at creation time:

| Signal | Inferred kind |
|---|---|
| `fill` / `fillVariableName` / `fillStyleName` present | `button-solid` |
| `strokeColor` / `strokeVariableName` only (no fill) | `button-outline` |
| circular + size 48–72 | `button-fab` |
| square ≤ 48 + icon child, no text | `button-icon` |
| none of the above | `button-ghost` |

`role: 'link'` without `interactiveKind` defaults to `link-standalone`.

**How lint uses it**

Each kind has its own structural contract — they are NOT audited against solid-button rules:

- `button-solid` / `button-outline` — auto-layout + padding ≥ 16 + height ≥ 44 (mobile) / 36 (desktop)
- `button-ghost` — reactions or state variants + padding ≥ 8; transparent fill is fine
- `button-text` — plain TEXT is allowed; checks line-box height, not padding
- `button-icon` — 44×44 + descriptive name / a11y annotation
- `link-standalone` — color binding + readable line box; never demands a frame

**Example**

```json
{
  "name": "Sign in",
  "role": "button",
  "interactiveKind": "button-solid",
  "interactiveState": "default",
  "fill": "#E60028",
  "layoutMode": "HORIZONTAL",
  "paddingLeft": 24, "paddingRight": 24, "height": 48,
  "children": [{ "type": "text", "characters": "Sign in" }]
}
```

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
