---
inclusion: manual
description: "FigCraft MCP 工具使用指南 — Figma 插件桥接工作流"
---

# FigCraft — Figma 插件桥接工具

本项目通过 MCP 服务器（figcraft）连接 AI IDE 与 Figma，提供 65+ 工具。
工具名以 `mcp_figcraft_` 为前缀，IDE 已自动加载所有工具定义，无需重复列出。

## 使用前

1. 调用 `ping` 确认 Figma 插件已连接
2. 调用 `get_mode` 获取当前模式、设计上下文和可用令牌

## 常用工作流

### 创建设计元素
1. `get_mode` → 获取设计上下文和可用令牌
2. `create_document`（批量）或 `create_frame` / `create_text` 等逐个创建
3. `patch_nodes` 调整属性

### 设计检查
1. `lint_check` → 运行规则检查
2. `lint_fix` → 自动修复可修复项
3. `compliance_report` → 生成合规报告

### 令牌同步
1. `list_tokens` → 解析 DTCG JSON 文件
2. `diff_tokens` → 对比 Figma 变量与令牌差异
3. `sync_tokens` → 同步到 Figma（幂等，可重复执行）

### 组件管理
1. `list_components` / `list_library_components` → 查看可用组件
2. `create_instance` → 创建实例（支持本地 ID 或库 key）
3. `audit_components` → 审计组件健康度

## 双模式

| 模式 | Token 来源 | 场景 |
|------|-----------|------|
| **library** | Figma 共享库 | 日常设计，使用团队库 |
| **spec** | DTCG JSON 文件 | 规范驱动验证 |

通过 `set_mode` 切换。

## 约束

- Plugin UI 是纯 HTML/CSS（`src/plugin/ui.html`），不使用前端框架
- Linter 在 Plugin 侧运行，不在 MCP Server 侧
- DTCG 解析仅在 MCP Server 侧
- 复合类型（typography/shadow）映射为 Figma Style，非 Variable
