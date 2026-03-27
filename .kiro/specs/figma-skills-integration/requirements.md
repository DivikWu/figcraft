# 需求文档

## 简介

FigCraft 当前通过两条独立通道与 Figma 交互：Plugin 通道（WebSocket 中继 → Figma 插件沙箱）和 Remote 通道（HTTPS → mcp.figma.com/mcp）。Figma 官方现已提供 "Skills" 机制和 Kiro Power（figma-power），可直接连接 Figma 官方 MCP 服务器并提供高质量的 AI 引导文件。

FigCraft 的 `figma-remote` 工具集（17 个代理工具）与 Figma Power 提供的功能完全重复。本次重构将移除 FigCraft 的 Remote 通道代理，让 Figma Power 处理所有远程通道功能（代码生成、use_figma、设计系统搜索、Code Connect），FigCraft 专注于 Plugin 通道独有能力（lint、audit、token sync、节点操作、变量、样式、staging、prototype、annotations）。

同时，将缺失的 Figma Skills（figma-use、figma-create-new-file、figma-generate-library、figma-generate-design）作为 Kiro Skills 导入，以补充 Power 的引导能力。

## 术语表

- **FigCraft**: AI 驱动的 Figma 插件，通过 MCP 桥接 AI IDE 与 Figma
- **Plugin_通道**: 通过 WebSocket 中继连接 Figma 插件沙箱的通信通道，提供 lint、audit、token sync、节点操作等能力
- **Remote_通道**: 通过 HTTPS 连接 Figma 官方 MCP 服务器的通信通道，提供代码生成、设计系统搜索、Code Connect、画布写入等能力
- **Figma_Power**: Kiro 平台提供的 Figma 集成能力包（figma-power），包含官方 MCP 服务器连接和引导文件
- **Figma_Skills**: Figma 官方提供的 Markdown 指令包（SKILL.md + references/），教导 AI 代理正确使用 Figma MCP 工具
- **figma-mcp-client**: FigCraft 自定义的 Streamable HTTP 客户端包（`packages/figma-mcp-client/`），用于连接 Figma 官方 MCP 服务器
- **figma-remote_工具集**: FigCraft 中注册的 17 个代理工具，将请求转发到 Figma 官方 MCP 服务器
- **inspect_with_context**: 组合工具，并行调用 Remote 通道和 Plugin 通道获取设计上下文与质量报告
- **rest-fallback**: 使用 Figma REST API 的降级模块，在插件离线时提供只读操作
- **toolset-manager**: FigCraft 的动态工具集管理器，负责注册和加载/卸载工具集
- **schema_编译器**: 从 `schema/tools.yaml` 生成工具注册表的构建脚本
- **Quality_Engine**: FigCraft 的设计质量引擎，包含 35+ 条 lint 规则

## 需求

### 需求 1：移除 figma-remote 工具集

**用户故事：** 作为 FigCraft 维护者，我希望移除 figma-remote 代理工具集，以消除与 Figma Power 的功能重复，减少维护负担。

#### 验收标准

1. WHEN FigCraft 构建完成后，THE FigCraft SHALL 不包含任何 figma-remote 工具集中的工具（figma_get_design_context、figma_get_screenshot、figma_get_metadata、figma_get_variable_defs、figma_search_design_system、figma_get_code_connect_map、figma_add_code_connect_map、figma_get_code_connect_suggestions、figma_send_code_connect_mappings、figma_create_design_system_rules、figma_use_figma、figma_generate_design、figma_generate_diagram、figma_whoami、figma_create_new_file、figma_remote_status、inspect_with_context）
2. WHEN `load_toolset({ names: "figma-remote" })` 被调用时，THE toolset-manager SHALL 返回错误信息，说明该工具集已移除并建议使用 Figma Power
3. THE FigCraft SHALL 从 `schema/tools.yaml` 中移除所有 `toolset: figma-remote` 的工具定义和 `inspect_with_context` 的定义
4. THE FigCraft SHALL 从 `packages/core-mcp/src/tools/toolset-manager.ts` 中移除 `registerFigmaRemoteTools` 和 `registerInspectContextTools` 的调用

### 需求 2：删除 figma-mcp-client 包

**用户故事：** 作为 FigCraft 维护者，我希望删除不再需要的 figma-mcp-client 包，以减少代码库体积和依赖复杂度。

#### 验收标准

1. WHEN 重构完成后，THE FigCraft 代码库 SHALL 不包含 `packages/figma-mcp-client/` 目录
2. THE `package.json`（根目录）SHALL 不包含对 `figma-mcp-client` 工作区的引用
3. THE `packages/core-mcp/package.json` SHALL 不包含对 `@figcraft/figma-mcp-client` 的依赖声明
4. WHEN 执行 `npm install` 后，THE 依赖解析 SHALL 成功完成，不产生与 figma-mcp-client 相关的错误
5. THE FigCraft 代码库中 SHALL 不存在任何对 `@figcraft/figma-mcp-client` 或 `FigmaMcpClient` 的 import 语句

### 需求 3：删除源代码文件

**用户故事：** 作为 FigCraft 维护者，我希望删除与 Remote 通道相关的源代码文件，以保持代码库整洁。

#### 验收标准

1. WHEN 重构完成后，THE FigCraft 代码库 SHALL 不包含 `packages/core-mcp/src/tools/figma-remote.ts` 文件
2. WHEN 重构完成后，THE FigCraft 代码库 SHALL 不包含 `packages/core-mcp/src/tools/inspect-context.ts` 文件
3. THE `packages/core-mcp/src/tools/` 目录中 SHALL 不存在任何导入或引用已删除文件的代码

### 需求 4：修改 ping 工具移除远程通道检查

**用户故事：** 作为 FigCraft 用户，我希望 ping 工具仅检查 Plugin 通道连接状态，因为 Remote 通道已由 Figma Power 接管。

#### 验收标准

1. WHEN `ping` 工具被调用时，THE FigCraft SHALL 仅检查 Plugin 通道（WebSocket 中继 → Figma 插件）的连接状态
2. WHEN `ping` 工具被调用时，THE FigCraft SHALL 不尝试连接 Figma 官方 MCP 服务器
3. WHEN `ping` 工具返回结果时，THE 响应 SHALL 不包含 `remoteChannel` 字段
4. THE `ping.ts` 文件 SHALL 不导入 `FigmaMcpClient` 或 `@figcraft/figma-mcp-client`
5. WHEN Plugin 通道连接成功时，THE `ping` 工具 SHALL 返回包含 `connected: true`、延迟时间和版本信息的响应
6. WHEN Plugin 通道连接失败时，THE `ping` 工具 SHALL 返回包含 `connected: false` 和错误信息的响应

### 需求 5：保留 Plugin 通道功能完整性

**用户故事：** 作为 FigCraft 用户，我希望所有 Plugin 通道工具在重构后继续正常工作，不受 Remote 通道移除的影响。

#### 验收标准

1. THE FigCraft SHALL 保留所有 Plugin 通道工具集的完整功能，包括：core（nodes、text、components、lint_fix_all、audit_node、export_image 等）、variables、tokens、styles、components-advanced、library、shapes-vectors、annotations、prototype、lint、auth、pages、staging
2. WHEN 任何 Plugin 通道工具被调用时，THE FigCraft SHALL 通过 WebSocket 中继正常与 Figma 插件通信
3. THE `rest-fallback.ts` 模块 SHALL 保持完整功能，继续使用 Figma REST API 提供降级服务
4. THE `auth.ts` 模块的 `getToken()` 函数 SHALL 保持完整功能，继续为 rest-fallback 提供认证令牌
5. WHEN 执行 `npm run build` 后，THE 构建 SHALL 成功完成，无编译错误
6. WHEN 执行 `npm run typecheck` 后，THE 类型检查 SHALL 通过，无类型错误
7. WHEN 执行 `npm run test` 后，THE 所有保留的测试 SHALL 通过

### 需求 6：更新 schema/tools.yaml

**用户故事：** 作为 FigCraft 维护者，我希望工具 schema 定义与实际代码保持一致，移除已删除工具的定义。

#### 验收标准

1. THE `schema/tools.yaml` SHALL 不包含 `toolset: figma-remote` 的工具定义
2. THE `schema/tools.yaml` SHALL 不包含 `inspect_with_context` 的工具定义
3. THE `schema/tools.yaml` 的 toolset 描述部分 SHALL 不包含 `figma-remote` 工具集的描述
4. WHEN 执行 `npm run schema` 后，THE schema_编译器 SHALL 成功生成更新后的注册表文件，不包含已移除工具的注册代码
5. WHEN 执行 `npm run schema` 后，THE 生成的 `_registry.ts` SHALL 不包含 figma-remote 工具集的引用

### 需求 7：更新文档

**用户故事：** 作为 FigCraft 用户或贡献者，我希望文档准确反映重构后的单通道架构，避免过时信息造成混淆。

#### 验收标准

1. THE `AGENTS.md` SHALL 将架构描述从"双通道"更新为"单通道"（仅 Plugin 通道）
2. THE `AGENTS.md` SHALL 移除所有 Remote 通道相关的工作流描述（Code Generation、Inspect + Quality、Design System Search、Write to Canvas）
3. THE `AGENTS.md` SHALL 移除 Dual Channel Tool Routing 表格和相关说明
4. THE `AGENTS.md` SHALL 从 Dynamic Toolsets 表格中移除 `figma-remote` 工具集条目
5. THE `.kiro/steering/figma-create-quality.md` SHALL 移除"双通道工作流"章节（第 15 条）及其场景指引
6. THE `.kiro/steering/figcraft.md` SHALL 移除所有对 Remote 通道和双通道的引用
7. THE `AGENTS.md` SHALL 添加说明，指出代码生成、设计系统搜索、Code Connect 等功能现由 Figma Power 提供

### 需求 8：更新测试

**用户故事：** 作为 FigCraft 维护者，我希望测试套件与代码变更保持一致，移除已删除模块的测试并确保剩余测试通过。

#### 验收标准

1. WHEN 重构完成后，THE FigCraft 代码库 SHALL 移除或更新以下测试文件：`tests/figma-mcp-transport.test.ts`、`tests/figma-mcp-client.test.ts`、`tests/inspect-context.test.ts`
2. WHEN 执行 `npm run test` 后，THE 测试套件 SHALL 不包含对已删除模块（figma-mcp-client、figma-remote、inspect-context）的引用
3. WHEN 执行 `npm run test` 后，THE 所有剩余测试 SHALL 通过

### 需求 9：导入 Figma Skills 作为 Kiro Skills

**用户故事：** 作为 Kiro 用户，我希望在 FigCraft 项目中拥有 Figma 官方 Skills 的引导文件，以便 AI 代理能正确使用 Figma MCP 工具。

#### 验收标准

1. THE FigCraft 代码库 SHALL 在 `.kiro/skills/` 目录下包含以下 Figma Skills 引导文件：figma-use（Plugin API 使用指南）、figma-create-new-file（新建文件指南）、figma-generate-library（生成组件库指南）、figma-generate-design（生成设计指南）
2. THE 每个 Skill 文件 SHALL 遵循 Kiro Skills 的标准格式（SKILL.md + 可选的 references/ 目录）
3. THE Skills 内容 SHALL 基于 Figma 官方提供的 Skills 内容，适配 Kiro 平台格式
4. THE Skills SHALL 补充而非替代 Figma Power 已提供的引导文件（implement-design.md、code-connect-components.md、create-design-system-rules.md）

### 需求 10：更新 CLAUDE.md

**用户故事：** 作为使用 Claude Code 的开发者，我希望 CLAUDE.md 中的项目结构描述准确反映重构后的状态。

#### 验收标准

1. THE `CLAUDE.md` SHALL 从项目结构描述中移除 `figma-mcp-client/src/` 的条目
2. THE `CLAUDE.md` SHALL 更新架构描述，反映单通道架构
3. IF `CLAUDE.md` 中包含对 Remote 通道或双通道的引用，THEN THE `CLAUDE.md` SHALL 移除或更新这些引用