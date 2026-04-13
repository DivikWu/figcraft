Resource-oriented endpoints with method dispatch:

| Endpoint | Methods |
|----------|---------|
| `nodes` | `get`, `get_batch`, `list`, `update`, `delete`, `clone`, `reparent` |
| `text` | `set_content`, `set_range` |
| `components` | `list`, `list_library`, `get`, `list_properties` |
| `variables_ep` | `list`, `get`, `list_collections`, `get_bindings`, `export` (always available); `set_binding`, `create`, `update`, `batch_update`, `delete`, `create_collection`, `delete_collection`, `batch_create`, `set_code_syntax`, `batch_bind`, `set_values_multi_mode`, `extend_collection`, `get_overrides`, `remove_override` (write methods — `load_toolset("variables")` to enable write tools) |
| `styles_ep` | `list`, `get` (always available); `create_paint`, `update_paint`, `update_text`, `update_effect`, `delete`, `sync` (write methods — `load_toolset("styles")` to enable write tools) |

Call syntax: `nodes({ method: "get", nodeId: "1:23" })`, `variables_ep({ method: "list_collections" })`, `styles_ep({ method: "list" })`
