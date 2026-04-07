**Tool routing by intent** (decide BEFORE entering the workflow):
- CREATE/DESIGN UI → FigCraft tools only (workflow below)
- IMPLEMENT CODE from existing design → Figma Desktop MCP: get_design_context
- Figma URL in a creation request = WHERE to create, not what to read
- NEVER call get_design_context on empty pages/frames — it will error and block

Before ANY Figma write operation, complete these steps IN ORDER:

```
STEP 0: get_mode                          → verifies connection (built-in ping), inspects page
                                             (built-in pageContext), gets _workflow
        ├─ always           → load skill: ui-ux-fundamentals
        ├─ library selected → load skill: design-guardian
        └─ no library       → load skill: design-creator
STEP 1: Follow _workflow.designPreflight  → present proposal → ⛔ WAIT for user confirmation
        After platform confirmed → load skill: platform-ios / platform-android / responsive-design
STEP 2: CLASSIFY TASK SCALE → pick creation method:
        ├─ single element   → 1 create_frame call
        ├─ single screen    → 1 create_frame call with full children tree
        ├─ multi-screen 3-5 → load skill: multi-screen-flow → 1 create_frame per screen
        └─ large flow 6+    → load skill: multi-screen-flow → batch 2-3 screens per turn
STEP 3: create_frame + children           → Opinion Engine auto-handles sizing, tokens, pitfalls
        IF multi-screen → follow multi-screen-flow skill hierarchy (Wrapper → Header → Flow Row → Stage → Screen)
STEP 4: verify_design                     → lint + screenshot + preflight audit in one call
```

During execution: verify after every write (`export_image` at milestones). Run `lint_fix_all` before replying.
