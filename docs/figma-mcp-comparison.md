# FigCraft 与 Figma 官方 MCP 对比

> FigCraft 和 Figma 官方 Dev Mode MCP Server 是互补关系，不是替代关系。本文档说明两者的能力边界、重叠区域和协同方式。

## 定位差异

| | Figma 官方 MCP | FigCraft |
|---|---|---|
| 核心定位 | Design-to-Code：从 Figma 读取设计上下文，辅助生成代码 | Code-to-Design + 设计质量：在 Figma 中创建 UI、lint、Token 同步 |
| 连接方式 | 远程服务器（cloud）或桌面应用（local） | 本地 Plugin + WebSocket Relay（纯本地） |
| 写入能力 | 通用 `use_figma` 工具（Plugin API 脚本） | 声明式工具体系（`create_frame` + Opinion Engine 自动推断） |
| 质量保证 | 无内置 lint | 40 条 lint 规则 + 自动修复 + 创建后自检 |
| 设计规范 | 通过 `create_design_system_rules` 生成规则文件 | 运行时双模式（Library / Spec）+ 三层设计规则 |
| 工具数量 | 15 个工具 | 116 个工具（39 核心 + 13 可选工具集 + 5 资源端点） |

---

## 能力对比矩阵

### Figma 官方独有

| 官方工具 | 能力 | FigCraft 是否有替代 |
|----------|------|---------------------|
| `get_design_context` | 返回结构化设计上下文（默认 React + Tailwind 代码片段），专为 design-to-code 优化 | 无直接替代。FigCraft 的 `nodes(method:"get")` 返回原始节点数据，不生成框架代码 |
| `get_metadata` | 稀疏 XML 表示（仅 ID、名称、类型、位置），支持任意 nodeId，大型文件 context 开销小 | 部分替代。`get_current_page(maxDepth:1)` 类似但仅限当前页面；`nodes(method:"get")` 可查任意节点但返回完整数据 |
| `get_code_connect_map` | 获取 Figma 组件与代码组件的 Code Connect 映射 | 无原生替代（通过 skill 编排官方工具，见下文） |
| `add_code_connect_map` | 添加 Code Connect 映射 | 同上 |
| `get_code_connect_suggestions` | 自动发现未映射的组件并建议映射 | 同上 |
| `send_code_connect_mappings` | 批量确认 Code Connect 映射 | 同上 |
| `get_figjam` | FigJam 图表的 XML 元数据 + 截图 | 无替代。FigCraft 插件端仅支持 Figma Design（`editorType: ["figma"]`） |
| `generate_diagram` | 从 Mermaid 语法生成 FigJam 图表 | 无替代（FigCraft 能输出 Mermaid 但不能写入 FigJam） |
| `generate_figma_design` | 捕获实时 Web UI 转为 Figma 设计图层（remote only） | 无替代。FigCraft 的 `figma-create-ui` skill 可编排此工具作为视觉参考 |
| `whoami` | 用户身份、plan、seat type（remote only） | 部分替代。`figma_auth_status` 返回认证状态但不含 plan/seat 信息 |
| `create_new_file` | 在用户 drafts 中创建新 Figma/FigJam 文件 | 无原生替代（通过 skill 编排官方工具，见下文） |

### FigCraft 独有

| FigCraft 能力 | 说明 | 官方 MCP 对应 |
|---------------|------|---------------|
| Opinion Engine | `create_frame` 内置 10 条推断规则，自动处理 FILL 排序、HUG/FILL 冲突、Token 绑定等 Figma API 陷阱 | 无。`use_figma` 是裸 Plugin API，需手动处理 |
| 质量引擎 | 38 条 lint 规则 + 自动修复（`lint_fix_all` / `verify_design`） | 无 |
| DTCG Token 同步 | `sync_tokens` / `diff_tokens` / `reverse_sync_tokens`，支持全类型映射 | 无 |
| 双模式系统 | Library 模式（绑定共享库）/ Spec 模式（DTCG JSON 验证） | 无 |
| 三层设计规则 | ui-ux-fundamentals + design-guardian + design-creator，运行时按需加载 | `create_design_system_rules` 生成静态规则文件 |
| 动态工具集 | 13 个可选工具集按需加载，控制 context 大小 | 无（所有工具始终暴露） |
| 9 种 UI 模板 | login / dashboard / checkout 等，含结构、决策点、陷阱、风格变体 | 无 |
| 原型分析 | `analyze_prototype_flow` 生成流程图 + Mermaid + Markdown 文档 | 无 |
| 组件审计 | `audit_components` 检查组件健康度 | 无 |
| 200k+ 图标集成 | Iconify 图标搜索 + 创建 | 无 |
| Pexels 图库 | 图片搜索 + 预览 + 填充 | 无 |
| 暂存工作流 | stage / commit / discard 预览式修改 | 无 |

### 重叠区域

| 能力 | 官方 MCP | FigCraft | 差异 |
|------|----------|----------|------|
| 截图 | `get_screenshot` | `export_image` | 功能等价，FigCraft 支持 PNG/SVG/PDF/JPG + scale 参数 |
| 设计系统搜索 | `search_design_system` | `search_design_system`（同名） | FigCraft 版本通过 Plugin API 实现，支持离线；官方版本通过 REST API |
| 变量查询 | `get_variable_defs` | `variables_ep(method:"list"/"get"/"get_bindings")` | FigCraft 更细粒度，核心工具始终可用，`list` 含 codeSyntax/scopes，`batch_update` 支持批量修改含 codeSyntax |
| 写入 Figma | `use_figma`（通用 Plugin API 脚本） | `create_frame` / `create_text` / `nodes(method:"update")` 等声明式工具 | FigCraft 声明式 + Opinion Engine 更安全；官方更灵活但需手动处理陷阱 |
| 创建新文件 | `create_new_file`（原生） | 通过 skill 编排官方工具 | 实际调用的是同一个工具 |

---

## Skill 层协同架构

FigCraft 通过 skill 编排层主动集成官方 MCP 的能力，而非重复实现。以下 skill 在执行时会调用 Figma 官方 MCP 工具：

| FigCraft Skill | 调用的官方 MCP 工具 | 用途 |
|----------------|---------------------|------|
| `figma-implement-design` | `get_design_context` + `get_screenshot` + `get_metadata` | 从 Figma 设计生成代码 |
| `figma-code-connect-components` | `get_code_connect_suggestions` + `send_code_connect_mappings` | 建立组件-代码映射 |
| `figma-create-new-file` | `create_new_file` + `whoami` | 创建新 Figma/FigJam 文件 |
| `figma-create-design-system-rules` | `create_design_system_rules` | 生成项目级设计系统规则 |
| `figma-create-ui` | `create_frame` + `search_design_system` + `export_image` | 声明式构建 Figma 屏幕（含库组件组装） |

这意味着：
- FigCraft 在架构上预设了与官方 MCP 共存
- 官方 MCP 的 design-to-code 能力通过 skill 编排无缝融入 FigCraft 工作流
- 用户无需手动协调两个 MCP Server，skill 自动选择合适的工具

---

## 推荐配置

### 推荐方案：FigCraft + Figma 桌面版 MCP

日常使用推荐同时配置 FigCraft 和 Figma 官方桌面版 MCP Server。桌面版无需 OAuth 认证，只要 Figma 桌面应用开着就能用。

**Kiro** — `.kiro/settings/mcp.json`：

```jsonc
{
  "mcpServers": {
    // Figma 官方桌面版 — design-to-code、Code Connect、截图
    // 前提：Figma 桌面应用中 Shift+D 进入 Dev Mode → 启用 MCP Server
    "figma-desktop": {
      "url": "http://127.0.0.1:3845/mcp",
      "type": "http",
      "disabled": false,
      "autoApprove": [
        "get_design_context",
        "get_metadata",
        "get_screenshot",
        "get_variable_defs",
        "get_code_connect_map",
        "add_code_connect_map",
        "get_code_connect_suggestions",
        "send_code_connect_mappings",
        "create_design_system_rules",
        "search_design_system",
        "get_figjam",
        "generate_diagram",
        "use_figma"
      ]
    },
    // FigCraft — 设计创建、lint、Token 同步、审计
    "figcraft": {
      "command": "node",
      "args": ["dist/mcp-server/index.js"],
      "cwd": "/your/absolute/path/to/figcraft",
      "disabled": false
    }
  }
}
```

**Claude Code** — `.mcp.json`：

```jsonc
{
  "mcpServers": {
    "figma-desktop": {
      "url": "http://127.0.0.1:3845/mcp",
      "type": "http"
    },
    "figcraft": {
      "command": "node",
      "args": ["dist/mcp-server/index.js"],
      "cwd": "/your/absolute/path/to/figcraft"
    }
  }
}
```

**Cursor** — `.cursor/mcp.json`：

```jsonc
{
  "mcpServers": {
    "figma-desktop": {
      "url": "http://127.0.0.1:3845/mcp"
    },
    "figcraft": {
      "command": "node",
      "args": ["dist/mcp-server/index.js"],
      "cwd": "/your/absolute/path/to/figcraft"
    }
  }
}
```

**VS Code** — `.vscode/mcp.json`：

```jsonc
{
  "servers": {
    "figma-desktop": {
      "type": "http",
      "url": "http://127.0.0.1:3845/mcp"
    },
    "figcraft": {
      "command": "node",
      "args": ["dist/mcp-server/index.js"],
      "cwd": "/your/absolute/path/to/figcraft"
    }
  }
}
```

> 将 `cwd` 替换为你本地 clone 的绝对路径。npm 包发布后可用 `"command": "npx", "args": ["figcraft-design"]` 替代。

### 启用 Figma 桌面版 MCP Server

配置 `figma-desktop` 后，需要在 Figma 桌面应用中启用 MCP Server：

1. 打开 Figma 桌面应用（确保已更新到最新版本）
2. 打开一个设计文件
3. `Shift+D` 切换到 Dev Mode
4. 在右侧 Inspect 面板中点击 "Enable desktop MCP server"
5. 底部确认提示 server 运行在 `http://127.0.0.1:3845/mcp`

启用后 IDE 自动连接，无需认证。

### Kiro Power-Figma 说明

Kiro 内置的 `power-figma` 连接的是 Figma 官方远程版 MCP（`https://mcp.figma.com/mcp`），需要 OAuth 认证，每次重启 IDE 会弹出认证提示。

如果你已经配置了 `figma-desktop`（桌面版），建议在用户级配置 `~/.kiro/settings/mcp.json` 中禁用 `power-figma` 以避免重复认证提示：

```jsonc
{
  "powers": {
    "mcpServers": {
      "power-figma-power-figma": {
        "url": "https://mcp.figma.com/mcp",
        "type": "http",
        "disabled": true  // 已有 figma-desktop，禁用远程版避免认证提示
      }
    }
  }
}
```

需要远程版独有功能（`generate_figma_design`、`whoami`、`create_new_file`）时，改回 `disabled: false` 并完成一次 OAuth 认证即可。

### 桌面版 vs 远程版对比

| | 桌面版（推荐日常使用） | 远程版 |
|---|---|---|
| 地址 | `http://127.0.0.1:3845/mcp` | `https://mcp.figma.com/mcp` |
| 认证 | 无需认证 | OAuth（会话级，重启 IDE 需重新认证） |
| 前提 | Figma 桌面应用 + Dev Mode 启用 MCP | 无需桌面应用 |
| 上下文方式 | 选择图层或粘贴链接 | 仅粘贴链接 |
| 独有工具 | 无 | `generate_figma_design`、`whoami`、`create_new_file` |
| Kiro 支持 | ✅ | ✅（通过 power-figma） |

### 按场景选择

| 场景 | 推荐使用 |
|------|----------|
| 在 Figma 中创建 UI | FigCraft（声明式 + Opinion Engine + lint） |
| 从 Figma 设计生成代码 | 官方 MCP（`get_design_context`）或 FigCraft skill `figma-implement-design`（自动编排官方工具） |
| Token 同步（DTCG ↔ Figma） | FigCraft（`sync_tokens` / `diff_tokens`） |
| 设计质量检查 | FigCraft（`lint_fix_all` / `verify_design`） |
| Code Connect 映射 | 官方 MCP 或 FigCraft skill `figma-code-connect-components`（自动编排官方工具） |
| FigJam 图表 | 官方 MCP（`get_figjam` / `generate_diagram`） |
| 捕获实时 Web UI 到 Figma | 官方 MCP remote（`generate_figma_design`） |
| 组件库管理 | FigCraft（`components-advanced` 工具集） |
| 原型交互分析 | FigCraft（`prototype` 工具集） |
| 变量 / 样式 CRUD | FigCraft（`variables_ep` / `styles_ep` 端点） |

---

## FigJam 支持说明

- FigCraft 插件端仅支持 Figma Design（`editorType: ["figma"]`），不支持 FigJam 编辑
- 但通过 `figma-create-new-file` skill 可以创建 FigJam 文件（调用官方 MCP 的 `create_new_file`）
- FigJam 的读取（`get_figjam`）和图表生成（`generate_diagram`）需要官方 MCP

---

## 认证与依赖说明

### FigCraft 自身认证

FigCraft 通过本地 Plugin + WebSocket Relay 连接 Figma，**不需要 OAuth**。只要 Figma 桌面应用中打开了 FigCraft 插件，`ping` 通了就能使用全部 116 个原生工具。

可选的 Figma API Token（用于 REST API 补充查询）有三种配置方式（优先级从高到低）：
1. 环境变量 `FIGMA_API_TOKEN`
2. 插件面板输入框（持久化存储在 Figma clientStorage）
3. OAuth 登录（`figma_login` 工具，需 `FIGMA_CLIENT_ID` + `FIGMA_CLIENT_SECRET`）

### Figma 官方 MCP 的两种部署模式

Figma 官方 MCP Server 有两种模式，认证方式不同：

| | 远程版（Remote） | 桌面版（Desktop） |
|---|---|---|
| 连接方式 | Figma 云端服务 | 本地 Figma 桌面应用（`http://127.0.0.1:3845/mcp`） |
| 认证方式 | OAuth（会话级 token，重启 IDE 需重新认证） | 无需认证（Figma 桌面应用开着即可） |
| 前提条件 | 无需 Figma 桌面应用 | 必须打开 Figma 桌面应用并在 Dev Mode 中启用 MCP Server |
| 上下文方式 | 基于链接（粘贴 Figma URL） | 基于选择（在 Figma 中选中图层）或链接 |
| 独有工具 | `generate_figma_design`、`whoami`、`create_new_file` | 无独有工具 |

#### Kiro 中的 `power-figma`

Kiro 内置的 `power-figma` 是 Figma 官方 MCP 的集成。根据 [Figma 官方兼容性表](https://help.figma.com/hc/en-us/articles/35281385065751)，Kiro 目前仅支持桌面版 MCP Server。

如果 `power-figma` 显示 "Unauthenticated"，通常是因为：
- Figma 桌面应用未打开
- 未切换到 Dev Mode（快捷键 `Shift+D`）
- 未在 Dev Mode 的 Inspect 面板中启用 MCP Server

启用步骤：打开 Figma 桌面应用 → 打开设计文件 → `Shift+D` 进入 Dev Mode → 在 Inspect 面板中点击 "Enable desktop MCP server"。

### 不配置官方 MCP 的影响

如果不配置或未启用官方 Figma MCP Server：

| 状态 | 影响 |
|------|------|
| FigCraft 原生工具（116 个） | ✅ 完全不受影响 |
| `figma-create-ui` skill | ✅ 不受影响（纯 FigCraft 工具） |
| `figma-generate-library` skill | ✅ 不受影响（纯 FigCraft 工具） |
| `figma-implement-design` skill | ❌ 无法工作（依赖 `get_design_context` + `get_screenshot`） |
| `figma-code-connect-components` skill | ❌ 无法工作（依赖 Code Connect 工具） |
| `figma-create-new-file` skill | ❌ 无法工作（依赖 `create_new_file` + `whoami`） |
| `figma-create-design-system-rules` skill | ❌ 无法工作（依赖 `create_design_system_rules`） |
| `figma-create-ui` skill | ✅ 完全独立运行（声明式创建 + 库组件组装） |

简而言之：**FigCraft 的设计创建、lint、Token 同步、审计等核心能力完全独立运行**。只有 design-to-code、Code Connect、创建新文件等需要官方 MCP 的 skill 会受影响。

---

## 总结

两者的关系是 **互补协同**，不是竞争替代：

- **官方 MCP 擅长读取**：结构化设计上下文、Code Connect、FigJam、实时 UI 捕获
- **FigCraft 擅长写入和质量**：声明式创建、lint、Token 同步、审计、Opinion Engine
- **Skill 层是桥梁**：FigCraft 的 5 个 skill 主动编排官方 MCP 工具，用户无需手动协调
