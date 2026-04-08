Core tools are always enabled. Load additional toolsets as needed via `load_toolset`:

| Toolset | When to load |
|---------|-------------|
| `variables` | Managing Figma variables, collections, modes |
| `tokens` | Syncing DTCG design tokens |
| `styles` | Managing paint/text/effect styles |
| `components-advanced` | Building component libraries, managing variants |
| `library-import` | Importing library variables, styles, and components into local file (design system authoring, NOT for UI creation in library mode) |
| `shapes-vectors` | Stars, polygons, sections, boolean ops, flatten |
| `annotations` | Adding, reading, and clearing annotations on nodes |
| `prototype` | Prototype interactions, flow analysis, batch-connect screens |
| `lint` | Fine-grained lint (beyond lint_fix_all) |
| `auth` | Figma OAuth setup |
| `pages` | Creating/renaming pages |
| `staging` | Staged workflow — preview changes before finalizing |
| `debug` | execute_js (raw Plugin API) |

Use `list_toolsets` to see current status. Load multiple: `load_toolset({ names: "tokens,variables" })`.
