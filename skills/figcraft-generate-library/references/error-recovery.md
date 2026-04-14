> Part of the [figcraft-generate-library skill](../SKILL.md).

# Error Recovery Reference

> **All examples use FigCraft declarative tools.** For raw Plugin API patterns, see the [figcraft-use skill](../../figcraft-use/SKILL.md).

Protocol for handling failures and incomplete runs across a 20–100+ call design system build.

---

## 1. Core Protocol: STOP → Inspect → Fix → Retry

**`use_figma` is atomic — a failed script does not execute.** If a script errors, no changes are made to the file. There are no partial nodes or half-built state from the failed call itself. Retrying after a fix is safe.

However, in multi-step workflows (20–100+ calls), **previously successful calls** will have created state that persists. If a workflow is abandoned mid-way, nodes from earlier successful calls remain in the file. The cleanup and idempotency patterns in this document handle that scenario.

The recovery sequence for a failed script:

```
1. STOP    — Do not run any more use_figma writes.
2. INSPECT — Read the error message carefully. Optionally call get_current_page(maxDepth:2) or export_image to understand the current file state.
3. FIX     — Correct the script that failed.
4. RETRY   — Re-run the corrected script.
5. PERSIST — Update the state ledger with the outcome.
```

For **abandoned multi-step workflows** (where you need to roll back nodes from previous *successful* calls), use the cleanup protocol in Section 2.

---

## 2. `sharedPluginData`-Based Cleanup: Why Name Matching is Dangerous

### Why name-prefix matching fails

A cleanup script that deletes "all nodes whose name starts with `Button`" will also delete nodes the user may have created manually with that name, or nodes from a previous approved phase. Name-based cleanup has no way to distinguish "orphan from a failed attempt" from "intentional user node."

Furthermore, variant names (`Size=Medium, Style=Primary, State=Default`) do not have consistent prefixes that are safe to target without also hitting legitimate nodes.

### How `setSharedPluginData` / `getSharedPluginData` works

`sharedPluginData` is a key-value store attached to individual nodes. It persists across sessions and is invisible to the user in the Figma UI. Data is scoped by namespace — we use `'dsb'`. Use three keys:

```javascript
node.setSharedPluginData('dsb', 'run_id', 'ds-build-2024-001'); // identifies the build run
node.setSharedPluginData('dsb', 'phase',  'phase3');             // which phase created this node
node.setSharedPluginData('dsb', 'key',    'componentset/button');// unique logical key

// Reading:
const runId = node.getSharedPluginData('dsb', 'run_id'); // returns '' if never set
const key   = node.getSharedPluginData('dsb', 'key');
```

`getSharedPluginData` returns `''` (empty string, not null) for unset keys. Always check for `!== ''`.

**Tag every created node immediately after creation** — this enables safe cleanup if the multi-step workflow is abandoned later. Tag in the same `use_figma` call as creation:

```javascript
// In use_figma: create component and tag it immediately
const comp = figma.createComponent();
comp.setSharedPluginData('dsb', 'run_id', RUN_ID);  // tag immediately
comp.setSharedPluginData('dsb', 'key', key);         // tag immediately
// ... then do the rest of the setup
```

### Complete `cleanupOrphans` script using `run_id`

This script finds all nodes tagged with a given `run_id` and optionally a `phase` filter, then removes them. First navigate to the target page, then scan and delete.

**Step 1 — Switch to the target page:**

```
set_current_page(nameOrId: "Button")
```

**Step 2 — Scan for orphaned nodes:**

```
get_current_page(maxDepth: 2)
```

Inspect the returned tree. Identify nodes tagged with the target `run_id` by checking their `sharedPluginData`.

**Step 3 — Delete orphans (leaf-first to avoid parent-before-child errors):**

```
nodes(method: "delete", nodeId: "<deepest-orphan-id>")
nodes(method: "delete", nodeId: "<next-orphan-id>")
// ... repeat for each orphan, deepest first
```

After running cleanup, call `get_current_page(maxDepth: 2)` on the target page to confirm the orphaned nodes are gone before retrying.

---

## 3. Idempotency Patterns: Check-Before-Create

Run an idempotency check at the start of every create operation. If the entity already exists (tagged with the expected `key`), skip creation and return the existing ID.

### Check-before-create for a variable collection

**Step 1 — List existing collections:**

```
variables_ep(method: "list_collections")
```

Check the returned list for a collection with the expected name or `sharedPluginData` key. If found, record its `id` and `modes` — skip creation.

**Step 2 — Create if missing:**

```
variables_ep(method: "create_collection", collectionName: "Color")
```

Then tag the new collection with `run_id` and `key` via `use_figma`, and add/rename modes as needed.

### Check-before-create for a page

**Step 1 — List existing pages:**

```
get_document_info()
```

Check the returned pages list for one matching the expected name or `sharedPluginData` key. If found, record its `id` — skip creation.

**Step 2 — Create if missing (requires `pages` toolset):**

```
load_toolset(names: "pages")
// Then create the page and tag it with run_id/key via use_figma
```

### Check-before-create for a component set

**Step 1 — Scan the target page:**

```
set_current_page(nameOrId: "Button")
nodes(method: "list", types: ["COMPONENT_SET"])
```

Check the returned list for a component set with the expected `sharedPluginData` key. If found, record its `id` — skip creation.

**Step 2 — If not found, proceed with creation** using the standard component creation flow.

---

## 4. State Ledger

### JSON Schema

Maintain a state ledger in your context (not in the Figma file) across calls. This is your source of truth for node IDs, completed steps, and pending validations.

```json
{
  "runId": "ds-build-2024-001",
  "phase": "phase3",
  "step": "component-button/combine-variants",
  "completedSteps": [
    "phase0",
    "phase1/collections",
    "phase1/primitives",
    "phase1/semantics",
    "phase2/pages",
    "phase2/foundations-docs",
    "phase3/component-avatar",
    "phase3/component-icon"
  ],
  "entities": {
    "collections": {
      "primitives": "VariableCollectionId:1234:5678",
      "color":      "VariableCollectionId:1234:5679",
      "spacing":    "VariableCollectionId:1234:5680"
    },
    "variables": {
      "color/bg/primary":         "VariableId:2345:1",
      "color/bg/secondary":       "VariableId:2345:2",
      "color/bg/disabled":        "VariableId:2345:3",
      "color/text/on-primary":    "VariableId:2345:4",
      "color/text/on-secondary":  "VariableId:2345:5",
      "color/text/disabled":      "VariableId:2345:6",
      "spacing/sm":               "VariableId:2345:7",
      "spacing/md":               "VariableId:2345:8",
      "spacing/lg":               "VariableId:2345:9",
      "radius/md":                "VariableId:2345:10"
    },
    "modes": {
      "color/light": "2345:1",
      "color/dark":  "2345:2"
    },
    "pages": {
      "Cover":       "0:1",
      "Foundations": "0:2",
      "Button":      "0:3"
    },
    "components": {
      "Icon":        "3456:1",
      "Avatar":      "3456:2",
      "Button":      "3456:3"
    },
    "componentSets": {
      "Button": "4567:1"
    }
  },
  "pendingValidations": [
    "Button:metadata",
    "Button:screenshot"
  ],
  "userCheckpoints": {
    "phase0": "approved-2024-01-15",
    "phase1": "approved-2024-01-15",
    "phase2": "approved-2024-01-15",
    "component-avatar": "approved-2024-01-15"
  }
}
```

### Persisting between calls

After every successful `use_figma` call:
1. Extract all IDs from the return value
2. Add them to the appropriate `entities` section of the ledger
3. Add the completed step to `completedSteps`
4. Remove from `pendingValidations` if this call validated something
5. Update `phase` and `step` to the current position

### Rehydrating at session start

If a conversation is interrupted and resumed, read the state ledger and verify key entities still exist:

```
nodes(method: "get_batch", nodeIds: [
  "VariableCollectionId:1234:5679",
  "0:3",
  "4567:1"
])
```

Check which IDs returned valid nodes vs. null. If any entity is missing, treat the phase that created it as incomplete and re-run from that checkpoint.

---

## 5. Resume Protocol

### Step 1: Inspect the file for `run_id` tags

Use a combination of declarative tools to inventory existing state:

**Scan pages:**

```
get_document_info()
```

Record all page IDs and names.

**Scan variables:**

```
variables_ep(method: "list")
```

Filter for variables matching your `run_id` (check `sharedPluginData`).

**Scan component sets and frames per page:**

```
set_current_page(nameOrId: "<page-name>")
get_current_page(maxDepth: 2)
```

Repeat for each page. Collect nodes of type `COMPONENT_SET` and `FRAME` that are tagged with the target `run_id`.

### Step 2: Reconstruct state from inventory

Map the inventory keys back to the state ledger schema. For each entity found with a `key`, add its ID to the appropriate section. Mark the corresponding step as `completedSteps`.

Example mapping:
```
key: 'collection/color'        → entities.collections.color
key: 'variable/color/bg/primary' → entities.variables['color/bg/primary']
key: 'page/button'             → entities.pages.Button
key: 'componentset/button'     → entities.componentSets.Button
```

### Step 3: Identify the resume point

The resume point is the first step in the workflow that is NOT in `completedSteps`. If the inventory shows the Button component set exists but the pending validations list shows `'Button:screenshot'`, the resume point is the screenshot validation call, not re-creation.

Use the checkpoint table from the workflow to determine which phase to continue from:

```
Phase 0 complete: all planned pages listed in entities.pages
Phase 1 complete: all planned variables listed in entities.variables with correct scopes
Phase 2 complete: all structural pages + foundations doc frames present
Phase 3 complete (per component): componentSet exists + no pending validations + user checkpoint recorded
```

---

## 6. Failure Taxonomy

### Recoverable Errors

These can be fixed and retried without affecting already-created entities:

| Category | Examples | Recovery |
|---|---|---|
| Layout errors | Variants stacked at (0,0), wrong padding values | Re-run the positioning step only |
| Naming issues | Typo in variant name, wrong casing | Find nodes by `dsb_key` via `nodes(method: "get")`, update `name` via `nodes(method: "update")` |
| Missing property wiring | `componentPropertyReferences` not set | Find component set by ID, re-run the property wiring step |
| Variable binding omission | A fill was hardcoded instead of bound | Find nodes by `dsb_key`, re-bind using `variables_ep(method: "set_binding")` |
| Wrong variable bound | Bound to wrong variable ID | Re-bind with correct variable ID via `variables_ep(method: "set_binding")` |
| Text not visible | Font not loaded before text write | Use `create_text` or `create_frame(children:[{type:"text",...}])` — the Opinion Engine handles font loading automatically |
| Script timeout | Script exceeded time limit before completing | Script is atomic — nothing was created. Reduce scope (fewer nodes per call) and retry |

### Structural Corruption (Requires Rollback or Restart)

These errors leave the file in a state where continuing forward is unreliable:

| Category | Examples | Recovery |
|---|---|---|
| Component cycle | A component instance was accidentally nested inside itself | Full cleanup of the affected component, restart that component from Call 1 |
| combineAsVariants with non-components | Mixed node types passed to combineAsVariants, causing unexpected merges | Remove the malformed component set via `nodes(method: "delete")`, re-run from variant creation |
| Variable collection ID drift | Collection was deleted and re-created, old IDs in state ledger are stale | Re-run Phase 1 completely; update all IDs in state ledger |
| Page deletion | A page was deleted after component sets were created on it | Treat as Phase 2 incomplete; re-create the page + re-run affected component creations |
| Mode limit exceeded | `addMode` threw because the plan is Starter or Professional | Redesign variable collection architecture to fit mode limits, restart Phase 1 |

**Recovery from structural corruption**: run `cleanupOrphans` for the entire run ID, then restart from the affected phase. Do NOT attempt to patch corrupted structure in-place.

---

## 7. Common Error Table

| Error message | Likely cause | Fix |
|---|---|---|
| `"Cannot create component from node"` | Tried to call `createComponentFromNode` on a node inside a component | Use `create_component(...)` to create a fresh component instead |
| `"in addMode: Limited to N modes only"` | Plan mode limit hit (Starter=1, Professional=4) | Redesign to use fewer modes or upgrade plan |
| `"setCurrentPageAsync: page does not exist"` | Page was deleted or wrong ID | Re-create the page using the idempotency pattern; use `set_current_page(nameOrId)` with the correct name |
| `"Cannot read properties of null"` | Node ID returned null — node was deleted | Run the resume protocol (Section 5) to find what exists, update state ledger |
| `"Expected nodes to be component nodes"` | Passed a non-ComponentNode to `combineAsVariants` | Filter by type first: use `nodes(method: "list", types: ["COMPONENT"])` to verify |
| `"in createVariable: Cannot create variable"` | Collection was deleted or ID is wrong | Verify collection exists with `variables_ep(method: "list_collections")` |
| `"font not loaded"` | Called a text property setter without loading font first | Use `create_text` or `create_frame(children:[{type:"text",...}])` — the Opinion Engine preloads fonts automatically. For raw `use_figma`, use `list_fonts(family)` to verify availability |
| `"Cannot set properties of a read-only array"` | Tried to mutate fills/strokes in-place | Clone first: `const fills = JSON.parse(JSON.stringify(node.fills))` |
| `"Expected RGBA color"` | Color value out of 0–1 range | Divide RGB 0–255 values by 255: `{ r: 65/255, g: 85/255, b: 143/255 }` |
| `"Cannot add children to a non-parent node"` | Tried to append a child to a leaf node (text, rect) | Ensure the parent is a FrameNode, ComponentNode, or GroupNode |
| `"in combineAsVariants: nodes must be in the same parent"` | Components are on different pages | Move all components to the same page before combining; use `nodes(method: "reparent")` |
| `"Script exceeded time limit"` | Loop creating too many nodes in one call | Split the work: create N/2 variants per call |
| Component set deletes itself | Tried to create a component set with no children | `combineAsVariants` requires at least 1 node — always pass 1+ |
| `addComponentProperty` returns unexpected name | This is normal — `BOOLEAN`/`TEXT`/`INSTANCE_SWAP` get `#id:id` suffix | Save the returned key immediately and use that, not the input name |

---

## 8. Per-Phase Recovery Guidance

### Phase 1 fails (variable creation)

Since `use_figma` is atomic, a failed call creates nothing. The most common scenario is that some calls in Phase 1 succeeded (creating some variables) while a later call failed.

Recovery steps:
1. Run `variables_ep(method: "list")` to find all variables tagged with your `run_id`
2. Compare against the plan to identify which variables were successfully created and which are still missing
3. If a successfully created variable has wrong values, delete it via `variables_ep(method: "delete")` and recreate
4. Fix the failed script and retry — it's safe since the failed call created nothing
5. Do NOT proceed to Phase 2 until ALL planned variables exist with correct scopes and code syntax

**The most common Phase 1 failure:** script timeout when creating many variables. Fix: batch variable creation — create at most 20–30 variables per call.

### Phase 2 fails mid-execution (page/file structure)

Symptoms: some pages exist, others are missing; foundations doc frames are incomplete.

Recovery steps:
1. Run `get_document_info()` to identify which pages were successfully created (check for `key` tags)
2. Mark remaining pages as pending and create them in subsequent calls
3. If a foundations doc frame is malformed, run `cleanupOrphans` for `dsb_phase: 'phase2'` on that page, then recreate

Phase 2 failures rarely require Phase 1 rollback unless the page structure itself is corrupted (which is unusual).

### Phase 3 fails (component creation)

This is the most common failure mode in long builds. Since `use_figma` is atomic, a failed call creates nothing — but previous successful calls in the component creation sequence will have created state. Handle by which call in the sequence failed:

```
If failure in Call 1 (page creation):
  → Nothing was created. Fix the script and retry.

If failure in Call 2 (doc frame):
  → Call 1's page exists. Fix Call 2 and retry — idempotency check handles it.

If failure in Call 3 (base component):
  → Calls 1-2 succeeded. Fix Call 3 and retry.

If failure in Call 4 (variant creation):
  → Call 3's base component exists. Fix Call 4 and retry.
  → If you need to restart from Call 3, clean up Call 3's nodes first
    using cleanupOrphans scoped to the component page.

If failure in Call 5 (combineAsVariants + layout):
  → Variant ComponentNodes from Call 4 exist but aren't combined yet.
  → Fix Call 5 and retry.
  → If the component set was already created by a prior attempt of Call 5
    that succeeded, remove it first via nodes(method: "delete"), then re-run.

If failure in Call 6 (component properties):
  → The component set already exists and is structurally sound.
  → Fix Call 6 and retry — addComponentProperty is safe to retry if
    you first check componentPropertyDefinitions for existing properties.
  → Idempotency check: if 'Label' property already exists, skip addComponentProperty.
```

**Idempotency for component properties (Call 6 retry):**

```javascript
// In use_figma: check existing properties before adding
const existingDefs = cs.componentPropertyDefinitions;
const labelKey = existingDefs['Label']
  ? Object.keys(existingDefs).find(k => k.startsWith('Label'))
  : cs.addComponentProperty('Label', 'TEXT', 'Button');
```

### Phase 4 fails mid-execution (QA / Code Connect)

Phase 4 is non-destructive. Failures here do not corrupt Phase 3 work. Common failures:

- **Accessibility audit finds contrast failures:** do not attempt auto-fix. Report the specific variable IDs and token names that fail, then ask the user which value to update.
- **Naming audit finds duplicates:** list all duplicates with their `key` values, ask user which to keep, then remove the duplicates via `nodes(method: "delete")`.
- **Code Connect mapping fails:** treat as incomplete, not broken. Continue and leave as pending.
