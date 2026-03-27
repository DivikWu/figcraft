---
inclusion: fileMatch
fileMatchPattern: "packages/adapter-figma/src/handlers/write-nodes*,packages/core-mcp/src/tools/write-nodes*"
description: "write-nodes implementation notes — correct timing and approach for auto layout property assignment"
---

# write-nodes Implementation Notes

When editing `write-nodes` related code, keep these implementation details in mind:

## layoutAlign / layoutGrow Must Be Set After appendChild

The Figma API requires a node to be added to an auto layout parent container before `layoutAlign` and `layoutGrow` can be set. In `createNodeFromSpec`, these properties are applied uniformly via `applyLayoutChildProps` after `appendChild`.

When adding new node types, you must call `applyLayoutChildProps(node, spec.props)` after appendChild.

## minWidth / minHeight Protect Against Auto Layout Shrinking

When creating frames or setting explicit width/height, also set `minWidth`/`minHeight` to the same value to prevent auto layout HUG mode from shrinking the container below the intended size.

## Auto Layout Properties Supported by nodes(method: "update")

The `nodes(method: "update")` handler (internal `patch_nodes`) needs to support these auto layout related properties:
- `layoutAlign`, `layoutGrow` — child element alignment
- `minWidth`, `minHeight` — minimum size constraints
- `primaryAxisAlignItems`, `counterAxisAlignItems` — primary/cross axis alignment
- `itemSpacing`, `paddingLeft/Right/Top/Bottom` — spacing and padding

When adding new properties, make sure to update the documentation in `propsDesc` within the `nodes(method: "update")` handler.
