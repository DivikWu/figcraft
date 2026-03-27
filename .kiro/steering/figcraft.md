---
inclusion: auto
description: "FigCraft MCP 工具使用指南 — Figma 插件桥接工作流"
---

# FigCraft — Figma 插件桥接工具

本项目通过 MCP 服务器（figcraft）连接 AI IDE 与 Figma，提供 92 个工具（21 核心 + 71 按需加载）。
工具名以 `mcp_figcraft_` 为前缀，IDE 已自动加载所有工具定义，无需重复列出。

## 关键限制：use_figma 不可用

**`use_figma` 工具在 Kiro 中不可用。** 不要尝试通过 Figma Power 或任何其他方式调用它。

- Figma 官方 MCP 的 `use_figma` 在 Kiro 中会失败
- 所有 Plugin API 脚本通过 FigCraft 的 `execute_js`（即 `mcp_figcraft_execute_js`）执行
- `figma-use`、`figma-generate-design`、`figma-generate-library` 等 skill 已适配为 `execute_js` 版本，可以正常加载使用
- 简单操作也可用结构化工具：`create_frame`、`create_text`、`nodes(method: "update")` 等
- 截图通过 FigCraft 的 `export_image` 或 Figma 官方 MCP 的 `get_screenshot` 获取

## 使用前

1. 调用 `ping` 确认 Figma 插件已连接
2. 调用 `get_mode` 获取当前模式、设计上下文和可用令牌

## 常用工作流

### 创建设计元素（figcraft 为主创建通道）
1. `create_frame` / `create_text` → 创建 UI 元素（创建时传入完整属性）
2. `nodes(method: "update")` → 批量调整属性（fillsVisible、strokes 等）
3. `lint_fix_all` → 一键扫描 + 自动修复
4. `audit_node` → 深度质量审计（可选）

### 设计检查
1. `lint_fix_all` → 一键扫描 + 自动修复
2. `audit_node` → 深度质量审计单个节点

### 截图与设计上下文（使用 figma 官方 MCP）
figma 官方 MCP 用于：截图（get_screenshot）、设计上下文（get_design_context）、Code Connect。
figcraft 负责所有画布操作（创建、编辑、lint、audit、token 同步）。

### 令牌同步
1. `list_tokens` → 解析 DTCG JSON 文件
2. `diff_tokens` → 对比 Figma 变量与令牌差异
3. `sync_tokens` → 同步到 Figma（幂等，可重复执行）

### 组件管理
1. `components(method: "list")` / `components(method: "list_library")` → 查看可用组件
2. `components(method: "list_properties")` → 查看组件属性和变体选项

## 双模式

| 模式 | Token 来源 | 场景 |
|------|-----------|------|
| **library** | Figma 共享库 | 日常设计，使用团队库 |
| **spec** | DTCG JSON 文件 | 规范驱动验证 |

通过 `set_mode` 切换。

## 约束

- Plugin UI 是纯 HTML/CSS（`packages/adapter-figma/src/ui.html`），不使用前端框架
- Linter 在 Plugin 侧运行，不在 MCP Server 侧
- DTCG 解析仅在 MCP Server 侧
- 复合类型（typography/shadow）映射为 Figma Style，非 Variable
