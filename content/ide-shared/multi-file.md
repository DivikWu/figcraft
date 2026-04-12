Multi-file parallel workflows — multiple agents operating different Figma files simultaneously:

```
Agent A → MCP Server (FIGCRAFT_CHANNEL=file-a) → Relay → Figma File A
Agent B → MCP Server (FIGCRAFT_CHANNEL=file-b) → Relay → Figma File B
```

Setup: each MCP Server instance uses a different `FIGCRAFT_CHANNEL` env var. The shared Relay (port 3055) routes messages by channel. Each Figma file's plugin auto-generates a unique channel ID shown in the plugin UI.

| Method | How |
|--------|-----|
| Env var | `FIGCRAFT_CHANNEL=my-channel` in MCP server config |
| Runtime | `join_channel(channel: "my-channel")` tool call |
| Auto | Plugin generates random channel on load, use `get_channel` to read it |

Limitation: multiple agents on the **same file** is NOT supported — Figma Plugin API is single-threaded and `figma.currentPage` is global state.
