# Tool Behavior Rules

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
9. After the FIRST create_frame failure, review ALL remaining planned payloads for the same pattern before retrying
