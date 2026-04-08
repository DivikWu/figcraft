# Tool Behavior Rules

## Mandatory Sequence
1. Always call get_mode first (built-in ping + page inspection)
2. Complete workflow in one turn until ⛔ HARD STOP checkpoints
3. Prefer batch tools: lint_fix_all over lint_check + lint_fix separately

## Parallelization
4. Parallelize independent calls (e.g., multiple nodes(method:"get") in one message)
5. Sequential for dependent calls (create parent before children)

## Update Patterns
6. nodes(method:"update") uses 5-phase ordered execution: simple props → fills/strokes → layout sizing → resize → text. Safe to send layoutMode + width in same patch.
7. nodes(method:"update") supports width/height directly (calls resize internally), text properties, and layoutPositioning.

## Semantic Role
8. Use `role:"screen"` for screen containers, `role:"button"` for buttons, `role:"input"` for inputs, `role:"header"` for headers. Role is stored as plugin data — lint rules use it for deterministic identification instead of name-regex guessing.
9. Role triggers automatic property defaults: `role:"screen"` → VERTICAL + clipsContent:true; `role:"button"` → HORIZONTAL + CENTER/CENTER; `role:"input"` → HORIZONTAL + CENTER. Explicit params always override role defaults.
10. If role is omitted for a root-level frame with screen dimensions (402×874 etc.), the system auto-infers `role:"screen"` for lint. But always prefer explicit declaration.

## Library Component Instances
11. In library mode, use `type:"instance"` in create_frame children instead of building frame+text manually.
12. Workflow: `search_design_system(query)` → check `isSet` field → if `isSet:true` use `componentSetKey` + `variantProperties`, if `isSet:false` use `componentKey`.
13. Check `containingFrame` in search results to verify component category (e.g., "Forms" vs "Avatars").

## Validation
14. dryRun:true for complex or ambiguous parameters — preview Opinion Engine inferences before committing
15. After the FIRST create_frame failure, review ALL remaining planned payloads for the same pattern before retrying
16. Check the `_applied` field in create_frame responses — it lists all deterministic inferences the Opinion Engine made (e.g., role defaults, sizing inference). Use this to understand what the system auto-filled.
