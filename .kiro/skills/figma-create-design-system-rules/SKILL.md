---
name: figma-create-design-system-rules
description: "Generates custom design system rules for the user's codebase. Works standalone with FigCraft (search_design_system, get_design_guidelines, audit_node). Enhanced with official Figma MCP when available. Use when user says 'create design system rules', 'generate rules for my project', 'set up design rules', 'customize design system guidelines', or wants to establish project-specific conventions for Figma-to-code workflows."
disable-model-invocation: false
---

# Create Design System Rules

> **Works standalone with FigCraft.** This skill discovers your design system and generates project-specific rules using FigCraft's built-in tools (`search_design_system`, `get_design_guidelines`, `audit_node`). If the official Figma MCP is also configured, Step 1 can optionally use official Figma MCP: `create_design_system_rules` for an enhanced template.

## Skill Boundaries

- Use this skill for generating project-specific design system rules and conventions.
- If the task requires writing to the Figma canvas with Plugin API scripts, switch to [figma-use](../figma-use/SKILL.md).
- If the task is building UI screens in Figma, switch to [figma-generate-design](../figma-generate-design/SKILL.md).
- If the task is implementing product code from Figma, switch to [figma-implement-design](../figma-implement-design/SKILL.md).
- If the task is connecting Figma components to code, switch to [figma-code-connect-components](../figma-code-connect-components/SKILL.md).

## Overview

This skill generates custom design system rules tailored to your project. These rules guide AI coding agents to produce consistent, high-quality code when implementing Figma designs, ensuring team conventions and architectural decisions are followed automatically.

### Supported Rule Files

| Agent | Rule File |
|-------|-----------|
| Kiro | `.kiro/steering/design-system-rules.md` |
| Claude Code | `CLAUDE.md` |
| Codex CLI | `AGENTS.md` |
| Cursor | `.cursor/rules/figma-design-system.mdc` |

## Prerequisites

- FigCraft plugin must be running in Figma (verify with `ping`)
- Access to the project codebase for analysis
- *Optional*: Official Figma MCP server for enhanced template generation

## Required Workflow

**Follow these steps in order. Do not skip steps.**

### Step 1: Discover the Design System

#### Path A: FigCraft Standalone (Default)

Use FigCraft's built-in tools to discover the design system:

1. **Pre-flight**:
   ```
   ping → verify plugin connection (if fails, ask user to open Figma and run FigCraft plugin)
   get_current_page(maxDepth=1) → check existing content
   get_mode → check current mode (library/spec), selected library, design context
   ```

2. **Discover design system assets** — run multiple `search_design_system` queries to enumerate components, variables, and styles:
   ```
   search_design_system("button")    → discover button components and variants
   search_design_system("color")     → discover color variables/tokens
   search_design_system("spacing")   → discover spacing tokens
   search_design_system("text")      → discover text styles and typography tokens
   search_design_system("card")      → discover card/container components
   search_design_system("input")     → discover form components
   ```
   If a query returns empty, try broader terms or skip that category.

3. **Get design quality guidelines**:
   ```
   get_design_guidelines(category: "all") → retrieve quality rules for the current mode
   ```

4. **Audit existing designs** (if the file has content):
   ```
   audit_node(scope: "page") → understand current design quality level, common violations, token usage
   ```

This gives you: available components, color/spacing/typography tokens, design quality standards, and current compliance level.

#### Path B: Official Figma MCP Enhanced (Optional)

If the official Figma MCP is also configured, you can additionally call:

```
official Figma MCP: create_design_system_rules(clientLanguages: "typescript,javascript", clientFrameworks: "react")
```

This returns a foundational template to merge with FigCraft discovery results from Path A. **Always run Path A first** — it provides design system details that the official tool's template lacks.

### Step 2: Analyze the Codebase

Before finalizing rules, analyze the project to understand existing patterns:

**Component Organization:**

- Where are UI components located? (e.g., `src/components/`, `app/ui/`, `lib/components/`)
- Is there a dedicated design system directory?
- How are components organized? (by feature, by type, flat structure)

**Styling Approach:**

- What CSS framework or approach is used? (Tailwind, CSS Modules, styled-components, etc.)
- Where are design tokens defined? (CSS variables, theme files, config files)
- Are there existing color, typography, or spacing tokens?

**Component Patterns:**

- What naming conventions are used? (PascalCase, kebab-case, prefixes)
- How are component props typically structured?
- Are there common composition patterns?

**Architecture Decisions:**

- How is state management handled?
- What routing system is used?
- Are there specific import patterns or path aliases?

### Step 3: Generate Project-Specific Rules

Based on discovery (Step 1) and codebase analysis (Step 2), create rules covering: **FigCraft workflow** (always available) and optionally **Figma MCP workflow** (when official MCP is configured).

The generated rules should include these sections (customize `[PLACEHOLDERS]` for the project):

#### General Rules

```markdown
- IMPORTANT: Always use components from `[YOUR_PATH]` when possible
- Place new UI components in `[COMPONENT_DIRECTORY]`
- Follow `[NAMING_CONVENTION]` for component names
- Use `[CSS_FRAMEWORK/APPROACH]` for styling
- IMPORTANT: Never hardcode colors — always use tokens from `[TOKEN_FILE]`
- Spacing values must use the `[SPACING_SYSTEM]` scale
```

#### FigCraft Integration Rules (Default)

```markdown
## FigCraft Integration Rules

### Pre-Flight (every Figma task)
1. `ping` → verify plugin connection
2. `get_current_page(maxDepth=1)` → inspect existing content
3. `get_mode` → check design system and token status

### Design System Discovery
- Use `search_design_system` before creating primitives — prefer instances over custom frames
- Bind colors/spacing/radius to variables via `boundVariables`, never hardcode hex values

### UI Creation
- Use `create_frame` with `children` for declarative UI creation (preferred)
- Use `execute_js` only when declarative tools can't express the logic (load [figma-use](../figma-use/SKILL.md) rules first)
- Validate with `export_image` after each major section

### Quality Assurance
- IMPORTANT: Run `lint_fix_all` before considering any Figma task complete
- Address all `error` and `unsafe` severity violations before delivery

### Implementation from Figma
- Use `nodes(method: "get", nodeId)` + `export_image` for design inspection
- Map Figma fills → `[YOUR_COLOR_SYSTEM]`, text styles → `[YOUR_TYPOGRAPHY_SYSTEM]`, spacing → `[YOUR_SPACING_SYSTEM]`
- Reuse existing components from `[COMPONENT_PATH]` instead of duplicating
```

#### Figma MCP Enhanced Rules (Optional)

Include this section only when the official Figma MCP is also configured:

```markdown
## Figma MCP Integration Rules (Enhanced)

### Implementation from Figma (Enhanced)
1. official Figma MCP: `get_design_context` → structured design data for target node(s)
2. If too large, `get_metadata` first, then re-fetch specific nodes
3. `get_screenshot` for visual reference; download assets from MCP's assets endpoint
4. Translate output to project conventions; validate against screenshot for 1:1 parity

### Asset Handling
- IMPORTANT: If Figma MCP returns a localhost source for an image/SVG, use it directly
- IMPORTANT: DO NOT import new icon packages — use assets from the Figma payload
- Store downloaded assets in `[ASSET_DIRECTORY]`

### Design Quality (FigCraft)
- After implementation, run FigCraft `lint_fix_all` + `audit_node` for quality assurance
```

#### Project-Specific Conventions

```markdown
## Project-Specific Conventions
- [Unique architectural patterns, import conventions, testing requirements, accessibility standards]
```

### Step 4: Save Rules to the Appropriate Rule File

Detect which AI coding agent the user is working with and save the generated rules to the corresponding file:

| Agent | Rule File | Notes |
|-------|-----------|-------|
| Kiro | `.kiro/steering/design-system-rules.md` | Markdown with `---` frontmatter (`inclusion: auto`, `description`). |
| Claude Code | `CLAUDE.md` in project root | Markdown format. Can also use `.claude/rules/figma-design-system.md` for modular organization. |
| Codex CLI | `AGENTS.md` in project root | Markdown format. Append as a new section if file already exists. 32 KiB combined size limit. |
| Cursor | `.cursor/rules/figma-design-system.mdc` | Markdown with YAML frontmatter (`description`, `globs`, `alwaysApply`). |

If unsure which agent the user is working with, check for existing rule files in the project or ask the user.

For Kiro, wrap the rules with frontmatter:

```markdown
---
inclusion: auto
description: "Design system rules for Figma-to-code workflows"
---

[Generated rules here]
```

For Cursor, wrap the rules with YAML frontmatter:

```markdown
---
description: Rules for implementing Figma designs. Covers component organization, styling conventions, design tokens, asset handling, and the required Figma workflow.
globs: "src/components/**"
alwaysApply: false
---

[Generated rules here]
```

Customize the `globs` pattern to match the directories where Figma-derived code will live in the project (e.g., `"src/**/*.tsx"` or `["src/components/**", "src/pages/**"]`).

After saving, the rules will be automatically loaded by the agent and applied to all Figma implementation tasks.

### Step 5: Validate and Iterate

After creating rules:

1. Test with a simple Figma component implementation
2. Verify the agent follows the rules correctly
3. Refine any rules that aren't working as expected
4. Share with team members for feedback
5. Update rules as the project evolves

## Examples

### Example 1: FigCraft Standalone (React + Tailwind)

User says: "Create design system rules for my React project"

1. Pre-flight: `ping` → `get_current_page(maxDepth=1)` → `get_mode`
2. Discovery: `search_design_system("button")`, `search_design_system("color")`, `search_design_system("input")` → `get_design_guidelines(category: "all")`
3. Analyze codebase (component dirs, styling approach, tokens)
4. Generate rules with FigCraft Integration Rules section → save to rule file
5. Test with a simple component implementation

### Example 2: With Official Figma MCP (Vue + Custom CSS)

User says: "Set up Figma rules for my Vue app"

1. Run FigCraft discovery (Path A) + official Figma MCP: `create_design_system_rules` (Path B)
2. Generate rules with both FigCraft and Figma MCP Enhanced sections → save to rule file
3. Validate with a card component

## Best Practices

- **Start simple, iterate** — capture the most important conventions first, add rules as inconsistencies appear
- **Be specific** — "Use Button from `src/components/ui/Button.tsx` with variant prop" not "Use the design system"
- **Make rules actionable** — tell the agent what to do, not just what to avoid
- **Prefix critical rules with "IMPORTANT:"** to ensure agent prioritization
- **Document the why** for non-obvious rules

## Common Issues

| Issue | Solution |
|-------|----------|
| Agent doesn't follow rules | Make rules more specific; verify correct config file; add "IMPORTANT:" prefix |
| Rules conflict | Review for contradictions; consolidate related rules |
| Too many rules increase latency | Focus on the 20% that solve 80% of issues; combine related rules |
| Rules become outdated | Schedule periodic reviews; version control rule files |
