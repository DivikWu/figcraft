Key architectural constraints:

- Plugin UI is pure HTML/CSS inline in ui.html — no frontend frameworks
- Linter runs in Plugin side (not MCP Server) — avoids transmitting large node data over WebSocket
- DTCG parsing runs in MCP Server only — Plugin receives parsed `DesignToken[]`
- Composite types (typography/shadow) map to Figma Styles, not Variables — Figma Variables don't support compound types
- `figma.teamLibrary` API can enumerate Library Variables but not Library Styles (REST API supplement needed)
- Plugin API bypasses REST API Enterprise restrictions — Variable writes work on all Figma plans
- Batch operations use `items[]` + per-item error handling — single-item failure doesn't block batch
- Token sync is idempotent — second run: created=0
- Figma Plugin API does NOT expose component property descriptions — `editComponentProperty`/`addComponentProperty` accept only `{ name, defaultValue, preferredValues }`. Property descriptions are editable only in Figma's UI (`execute_js` cannot help — same API surface). `update_component_property` throws `UNSUPPORTED_BY_FIGMA_API` with the workaround
- VARIANT property defaults are derived from the top-left variant's spatial position — `editComponentProperty`'s `defaultValue` does NOT apply to VARIANT. Reorder variants to change the default. `update_component_property` throws `UNSUPPORTED_FOR_VARIANT`
