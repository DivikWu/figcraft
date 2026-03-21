---
inclusion: fileMatch
fileMatchPattern: "src/plugin/handlers/write-nodes*,src/mcp-server/tools/write-nodes*"
description: "write-nodes 代码实现注意事项 — auto layout 属性设置的正确时机和方式"
---

# write-nodes 实现注意事项

编辑 `write-nodes` 相关代码时，注意以下实现细节：

## layoutAlign / layoutGrow 必须在 appendChild 之后设置

Figma API 要求节点先被添加到 auto layout 父容器中，才能设置 `layoutAlign` 和 `layoutGrow`。在 `createNodeFromSpec` 中，这些属性通过 `applyLayoutChildProps` 在 `appendChild` 之后统一应用。

如果新增节点类型，必须在 appendChild 之后调用 `applyLayoutChildProps(node, spec.props)`。

## minWidth / minHeight 保护 auto layout 收缩

当 `create_frame` 或 `createNodeFromSpec` 显式指定了 width/height 时，同时设置 `minWidth`/`minHeight` 为相同值，防止 auto layout HUG 模式将容器收缩到小于预期尺寸。

## patch_nodes 支持的布局属性

`patch_nodes` handler 中需要支持的 auto layout 相关属性：
- `layoutAlign`, `layoutGrow` — 子元素对齐
- `minWidth`, `minHeight` — 最小尺寸约束
- `primaryAxisAlignItems`, `counterAxisAlignItems` — 主轴/交叉轴对齐
- `itemSpacing`, `paddingLeft/Right/Top/Bottom` — 间距和内边距

新增属性时，确保在 `patch_nodes` 和 `create_document` 的 `propsDesc` 中同步更新文档。
