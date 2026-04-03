Resource-oriented endpoints with method dispatch:

| Endpoint | Methods |
|----------|---------|
| `nodes` | `get`, `get_batch`, `list`, `update`, `delete`, `clone`, `reparent` |
| `text` | `set_content`, `set_range` |
| `components` | `list`, `list_library`, `get`, `list_properties` |
| `variables_ep` | `list`, `get`, `list_collections`, `get_bindings`, `set_binding`, `create`, `update`, `delete`, `create_collection`, `delete_collection`, `batch_create`, `export` (requires `load_toolset("variables")`) |
| `styles_ep` | `list`, `get`, `create_paint`, `update_paint`, `update_text`, `update_effect`, `delete`, `sync` (requires `load_toolset("styles")`) |

Call syntax: `nodes({ method: "get", nodeId: "1:23" })`
