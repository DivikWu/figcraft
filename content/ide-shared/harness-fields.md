Harness Pipeline auto-enriches bridge responses. Check these fields after every tool call:

| Field | When present | What to do |
|-------|-------------|------------|
| `_qualityScore` | After root-level `create_frame` | If < 80 or errors exist → call `verify_design()` |
| `_qualityWarning` | When `_qualityScore` has violations | Read the warning, follow its fix suggestion |
| `_verificationDebt` | After any tool, if unverified creations exist | Persists until `verify_design()` or `lint_fix_all` clears it. Call `verify_design()` before replying to user |
| `_recovery` | On error (appended to error message) | Follow the `suggestion` to fix and retry. Includes `errorType` for classification |
| `_warnings` | After `create_frame` with placeholder text | Replace placeholder content with real text |
| `_nextSteps` | After `sync_tokens`, `set_mode` | Follow the listed steps in order |

Error recovery patterns (from `content/harness/recovery-patterns.yaml`):
- **connection_lost** → check Figma plugin is running, try `ping`
- **token_not_found** → call `search_design_system(query:"...")` to find available tokens
- **node_deleted** → call `nodes(method:"list")` to get current IDs
- **file_not_found** → check file path (use absolute path)
- **parse_error** → file must be valid DTCG JSON
- **response_too_large** → narrow scope with `nodeId`, `maxDepth`, or `detail:"summary"`
