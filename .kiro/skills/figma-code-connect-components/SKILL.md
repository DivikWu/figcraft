---
name: figma-code-connect-components
description: "Connects Figma design components to code components. Phase 1 (discovery & matching) works with FigCraft alone via search_design_system and components endpoint. Phase 2 (Code Connect mapping creation) requires official Figma MCP (Organization+ plans only). Use when user says 'code connect', 'connect this component to code', 'map this component', 'link component to code', 'create code connect mapping'. For canvas writes via `execute_js`, use `figma-use`."
disable-model-invocation: false
---

# Code Connect Components

> **Phase 1 (discovery) works with FigCraft alone.** FigCraft discovers components via `search_design_system` and `components` endpoint, inspects properties, and matches against your codebase. **Phase 2 (Code Connect mapping) requires official Figma MCP** — the mapping creation is a REST API operation only available on Organization and Enterprise plans.

## Skill Boundaries

- Use this skill for component discovery + Code Connect mapping workflows.
- If the task requires writing to the Figma canvas with Plugin API scripts, switch to [figma-use](../figma-use/SKILL.md).
- If the task is building or updating a full-page screen in Figma, switch to [figma-generate-design](../figma-generate-design/SKILL.md).
- If the task is implementing product code from Figma, switch to [figma-implement-design](../figma-implement-design/SKILL.md).

## Prerequisites

- FigCraft plugin must be running in Figma (verify with `ping`)
- For Phase 2 (Code Connect mapping): official Figma MCP server must be connected, Organization or Enterprise plan required
- User must provide a Figma URL with node ID, **or** select a node in the open Figma file
- **IMPORTANT:** Code Connect only works with published components or component sets
- Access to the project codebase for component scanning

## Required Workflow

**Follow these steps in order. Do not skip steps.**

---

### Phase 1: Component Discovery & Matching (FigCraft)

This phase works entirely with FigCraft tools and does not require the official Figma MCP.

#### Step 1: Discover Components

**Option A: FigCraft discovery (always available)**

Use FigCraft to discover and inspect components in the currently open file:

1. **Pre-flight**:
   ```
   ping → verify plugin connection (if fails, ask user to open Figma and run FigCraft plugin)
   get_current_page(maxDepth=1) → check existing content
   get_mode → check library/design system status
   ```

2. **Search for components** using multiple approaches:
   ```
   search_design_system("button")     → find button components across all libraries
   search_design_system("card")       → find card components
   search_design_system("input")      → find form components
   [... repeat for relevant component types]
   ```
   If a query returns empty results, try broader terms or skip that category.

3. **List components on current page**:
   ```
   components(method: "list") → enumerate all local components
   ```

4. **List library components** (if fileKey is known):
   ```
   components(method: "list_library", fileKey: "...") → list all published library components
   ```

5. **Inspect component properties** for each discovered component:
   ```
   components(method: "list_properties", nodeId: "1:23") → get variant options, text/boolean/instance-swap properties
   ```

This gives you: component names, node IDs, variant properties, default values, and structural information — the same data needed for code matching.

**Option B: Official Figma MCP enhanced discovery (when available)**

If the official Figma MCP is also configured, you can additionally call official Figma MCP: `get_code_connect_suggestions` which automatically:

- Identifies published components in the selection
- Checks existing Code Connect mappings and filters out already-connected components
- Returns thumbnail images for visual inspection

When a Figma URL is provided, parse it to extract `fileKey` and `nodeId`:
- URL format: `https://figma.com/design/:fileKey/:fileName?node-id=1-2`
- **IMPORTANT:** Convert node ID format: URL uses hyphens (`1-2`), tools expect colons (`1:2`)

```
official Figma MCP: get_code_connect_suggestions(fileKey: ":fileKey", nodeId: "1:2")
```

Handle the response:
- "No published components found" → components may need to be published to a team library first
- "All components already connected" → nothing to do
- Otherwise → list of unmapped components with properties and thumbnails

#### Step 2: Scan Codebase for Matching Components

For each discovered component, search the codebase for a matching code component.

**What to look for:**

- Component names that match or are similar to the Figma component name
- Component structure that aligns with the Figma hierarchy
- Props that correspond to Figma properties (variants, text, styles)
- Files in typical component directories (`src/components/`, `components/`, `ui/`, etc.)

**Search strategy:**

1. Search for component files with matching names
2. Read candidate files to check structure and props
3. Compare the code component's props with the Figma component properties from Step 1
4. Detect the programming language (TypeScript, JavaScript) and framework (React, Vue, etc.)
5. Identify the best match based on structural similarity, weighing:
   - Prop names and their correspondence to Figma properties
   - Default values that match Figma defaults
   - CSS classes or style objects
   - Descriptive comments that clarify intent
6. If multiple candidates are equally good, pick the one with the closest prop-interface match and document your reasoning

**Example search patterns:**

- If Figma component is "PrimaryButton", search for `Button.tsx`, `PrimaryButton.tsx`, `Button.jsx`
- Check common component paths: `src/components/`, `app/components/`, `lib/ui/`
- Look for variant props like `variant`, `size`, `color` that match Figma variants

#### Step 3: Present Matches to User

Present your findings and let the user choose which mappings to create:

```
The following components match the design:
- [ComponentName](path/to/component): DesignComponentName (nodeId: 1:23)
  Props match: variant (primary/secondary), size (sm/md/lg)
- [AnotherComponent](path/to/another): AnotherDesign (nodeId: 1:45)
  Props match: color, disabled

Would you like to connect these components? You can accept all, select specific ones, or skip.
```

**If no exact match is found:**
- Show the 2 closest candidates
- Explain the differences
- Ask the user to confirm which component to use or provide the correct path

**If the user declines all mappings**, inform them and stop.

---

### Phase 2: Create Code Connect Mappings (Requires Official Figma MCP)

> **This phase requires the official Figma MCP server** and an Organization or Enterprise plan. If the official MCP is not available, see the "Without Official Figma MCP" section below.

#### Step 4: Create Mappings

Once the user confirms their selections, call official Figma MCP: `send_code_connect_mappings` with only the accepted mappings:

```
official Figma MCP: send_code_connect_mappings(
  fileKey: ":fileKey",
  nodeId: "1:2",
  mappings: [
    { nodeId: "1:2", componentName: "Button", source: "src/components/Button.tsx", label: "React" },
    { nodeId: "1:5", componentName: "Card", source: "src/components/Card.tsx", label: "React" }
  ]
)
```

**Key parameters for each mapping:**

- `nodeId`: The Figma node ID (colon format: `1:2`)
- `componentName`: Name of the component to connect
- `source`: Path to the code component file (relative to project root)
- `label`: Framework/language label. Valid values:
  - Web: 'React', 'Web Components', 'Vue', 'Svelte', 'Storybook', 'Javascript'
  - iOS: 'Swift UIKit', 'Objective-C UIKit', 'SwiftUI'
  - Android: 'Compose', 'Java', 'Kotlin', 'Android XML Layout'
  - Cross-platform: 'Flutter'
  - Docs: 'Markdown'

**Provide a summary after processing:**

```
Code Connect Summary:
- Successfully connected: 3
  - Button (1:2) → src/components/Button.tsx
  - Card (1:5) → src/components/Card.tsx
  - Input (1:8) → src/components/Input.tsx
- Could not connect: 1
  - CustomWidget (1:10) - No matching component found in codebase
```

---

### Without Official Figma MCP

If the official Figma MCP is not available, you can still complete **Phase 1** (component discovery and matching). The component-to-code mapping won't be registered in Figma's Code Connect system, but you can:

1. **Document the mappings** in a local file (e.g., `code-connect-mappings.json` or a markdown table):
   ```json
   {
     "mappings": [
       { "figmaComponent": "Button", "nodeId": "1:2", "codeComponent": "src/components/Button.tsx", "framework": "React" },
       { "figmaComponent": "Card", "nodeId": "1:5", "codeComponent": "src/components/Card.tsx", "framework": "React" }
     ]
   }
   ```

2. **Use the mappings as a reference** for manual Code Connect setup in Figma (when the user upgrades to Organization plan)

3. **Include the mappings in design system documentation** — useful for team onboarding even without the Code Connect UI in Figma

4. **Use them for FigCraft workflows** — when building screens with `figma-generate-design`, the AI can reference these mappings to know which code component corresponds to each Figma component

---

## Examples

### Example 1: FigCraft-Only Discovery

User says: "What components in this file match my codebase?"

1. `ping` → `get_current_page(maxDepth=1)` → verify connection
2. `search_design_system("button")`, `search_design_system("card")`, `search_design_system("input")` → discover components
3. `components(method: "list_properties", nodeId: "1:23")` → inspect Button properties
4. Search codebase → find `src/components/Button.tsx` with matching props
5. Present matches → save to `code-connect-mappings.json`

### Example 2: Full Code Connect with Official MCP

User says: "Connect this Figma button to my code: https://figma.com/design/kL9xQn2VwM8pYrTb4ZcHjF/DesignSystem?node-id=42-15"

1. Parse URL: fileKey=`kL9xQn2VwM8pYrTb4ZcHjF`, nodeId=`42-15` → `42:15`
2. `components(method: "list_properties", nodeId: "42:15")` → inspect properties
3. Optionally: official Figma MCP: `get_code_connect_suggestions(fileKey, nodeId)`
4. Search codebase → match `src/components/Button.tsx` → user confirms
5. Official Figma MCP: `send_code_connect_mappings(fileKey, nodeId, mappings)`

### Example 3: Multiple Components with Partial Match

1. `components(method: "list")` → discover all local components
2. `components(method: "list_properties", nodeId: "10:51")` for each → inspect properties
3. Search codebase: match ProductCard and Badge, no match for CustomWidget
4. Present matches → user selects → save or send mappings

## Best Practices

- **Proactive discovery** — actively search the codebase for matching components using name, props, and structure similarity
- **Look beyond names** — check that props align, hierarchy matches, and the component serves the same purpose
- **Handle ambiguity** — if multiple candidates match, present options and let the user decide

## Common Issues

| Issue | Solution |
|-------|----------|
| "No published components found" | User must publish the component to a team library first |
| Code Connect requires Organization+ plan | Complete Phase 1, save mappings locally for future use |
| No matching component in codebase | Ask user if it exists under a different name, or if it needs to be created |
| "Component already mapped" | Already connected — user may need to remove existing mapping in Figma to update |
