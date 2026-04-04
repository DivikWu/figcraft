Before ANY Figma write operation, complete these steps IN ORDER:

```
STEP 0: ping                              → verify plugin connection
STEP 1: get_current_page(maxDepth=1)      → inspect existing content, find placement
STEP 2: get_mode                          → check library/token status, get _workflow
        ├─ library selected → load skill: design-guardian
        └─ no library       → load skill: design-creator
STEP 3: Follow _workflow.designPreflight  → present proposal → ⛔ WAIT for user confirmation
STEP 4: CLASSIFY TASK SCALE → pick creation method:
        ├─ single element   → 1 create_frame call
        ├─ single screen    → 1 create_frame call with full children tree
        ├─ multi-screen 3-5 → 1 create_frame per screen
        └─ large flow 6+    → batch 2-3 screens per conversation turn
STEP 5: create_frame + children           → Opinion Engine auto-handles sizing, tokens, pitfalls
        IF multi-screen → build wrapper with nested screen children, clipsContent: false
STEP 6: verify_design                     → lint + screenshot + preflight audit in one call
```

During execution: verify after every write (`export_image` at milestones). Run `lint_fix_all` before replying.
