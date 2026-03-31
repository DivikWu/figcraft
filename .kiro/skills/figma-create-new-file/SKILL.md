---
name: figma-create-new-file
description: "Create a new Figma file. Uses official Figma MCP for automated creation when available (create_new_file + whoami). Without it, guides the user to create a file manually in Figma and connect via FigCraft plugin. Usage — /figma-create-new-file [editorType] [fileName] (e.g. /figma-create-new-file figjam My Whiteboard)"
disable-model-invocation: true
---

# create_new_file — Create a New Figma File

> **Requires official Figma MCP for automated file creation.** Without it, guide the user to create a file manually in Figma, then connect via FigCraft plugin. See Workflow B below.

## Skill Boundaries

- Use this skill only to create a new Figma file and establish a connection.
- If the task requires writing to the Figma canvas with Plugin API scripts, switch to [figma-use](../figma-use/SKILL.md).
- If the task is building UI screens in Figma, switch to [figma-generate-design](../figma-generate-design/SKILL.md).
- If the task is implementing product code from Figma, switch to [figma-implement-design](../figma-implement-design/SKILL.md).

## Skill Arguments

This skill accepts optional arguments: `/figma-create-new-file [editorType] [fileName]`

- **editorType**: `design` (default) or `figjam`
- **fileName**: Name for the new file (defaults to "Untitled")

Examples:
- `/figma-create-new-file` — creates a design file named "Untitled"
- `/figma-create-new-file figjam My Whiteboard` — creates a FigJam file named "My Whiteboard"
- `/figma-create-new-file design My New Design` — creates a design file named "My New Design"

Parse the arguments from the skill invocation. If editorType is not provided, default to `"design"`. If fileName is not provided, default to `"Untitled"`.

---

## Workflow A: Automated Creation (Official Figma MCP)

Use this workflow when the official Figma MCP server is available.

### Step 1: Resolve the planKey

The official Figma MCP: `create_new_file` tool requires a `planKey` parameter:

1. **User already provided a planKey** → use it directly, skip to Step 2.
2. **No planKey available** → call official Figma MCP: `whoami`. The response contains a `plans` array with `key`, `name`, `seat`, and `tier`.
   - **Single plan**: use its `key` automatically.
   - **Multiple plans**: ask the user which team/organization, then use the corresponding `key`.

### Step 2: Call create_new_file

```
official Figma MCP: create_new_file(planKey: "team:123456", fileName: "My New Design", editorType: "design")
```

### Step 3: Connect FigCraft and Start Working

The tool returns `file_key` and `file_url`. Share the `file_url` with the user, then:

1. **User must open the file** in Figma Desktop and **run the FigCraft plugin** (Plugins → FigCraft → Run)
2. **Verify connection**: `ping` → should return the new file name
3. **Start designing** with FigCraft tools:
   - `create_frame` + `children` for declarative UI creation (preferred)
   - `execute_js` for complex Plugin API operations (load [figma-use](../figma-use/SKILL.md) rules first)
   - `search_design_system` to discover and reuse design system assets

**IMPORTANT:** FigCraft tools only work after the user opens the file and runs the plugin. Do not attempt FigCraft tool calls before the user confirms the plugin is running.

---

## Workflow B: Manual File Creation with FigCraft

Use this workflow when the official Figma MCP is **not** available. FigCraft cannot create new files — it only operates on the currently open file.

### Step 1: Guide the User

Tell the user:
```
1. Open Figma Desktop (or figma.com)
2. Click "+" or File → New Design File (or New FigJam File)
3. Name the file: "[fileName]"
```

### Step 2: Connect via FigCraft Plugin

```
1. In the new file, go to Plugins → FigCraft → Run
2. Tell me when the plugin is running, and I'll verify the connection
```

### Step 3: Verify and Start Working

```
ping → should return the new file name (if fails, ask user to check plugin is running)
get_current_page(maxDepth=1) → verify empty canvas, ready for design
```

Once connected, start designing:
- `create_frame` + `children` for declarative UI creation
- `search_design_system` to discover and reuse design system assets
- `execute_js` for complex Plugin API operations (load [figma-use](../figma-use/SKILL.md) rules first)
- `lint_fix_all` for quality assurance

---

## Important Notes

- Workflow A creates the file in the user's **drafts folder** for the selected plan.
- Only `"design"` and `"figjam"` editor types are supported.
- FigCraft can only operate on files **currently open** in Figma Desktop with the plugin running.
- If the user already has a file open, skip this skill — just use `ping` to verify the connection.
