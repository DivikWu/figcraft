# 实施计划：Figma Skills 集成（移除 Remote 通道代理）

## 概述

按照设计文档的 13 步依赖顺序，移除 FigCraft 的 Remote 通道代理层（figma-remote 工具集、figma-mcp-client 包、inspect_with_context 组合工具），让 Figma Power 接管所有远程通道功能，并导入 Figma 官方 Skills 作为 Kiro Skills。所有代码使用 TypeScript。

## 任务

- [x] 1. 清理 schema 定义并重新生成注册表
  - [x] 1.1 修改 `schema/tools.yaml`，移除 `figma-remote` 工具集
    - 移除 `_toolset_descriptions` 中的 `figma-remote` 条目
    - 移除整个 `TOOLSET: figma-remote` 区块（16 个代理工具定义）
    - 移除 `inspect_with_context` 工具定义
    - _需求: 1.1, 1.3, 6.1, 6.2, 6.3_

  - [x] 1.2 运行 `npm run schema` 重新生成 `_registry.ts` 和 `_generated.ts`
    - 验证生成的 `_registry.ts` 不包含 `figma-remote` 工具集引用
    - 验证生成的 `_generated.ts` 不包含已移除工具的 schema
    - _需求: 6.4, 6.5_


- [x] 2. 修改 toolset-manager.ts，移除已删除模块的注册
  - [x] 2.1 修改 `packages/core-mcp/src/tools/toolset-manager.ts`
    - 移除 `import { registerFigmaRemoteTools } from './figma-remote.js'`
    - 移除 `import { registerInspectContextTools } from './inspect-context.js'`
    - 在 `registerAllTools()` 中移除 `registerFigmaRemoteTools(server)` 调用
    - 在 `registerAllTools()` 中移除 `registerInspectContextTools(server, bridge)` 调用
    - _需求: 1.4, 3.3_

  - [x]* 2.2 编写属性测试：已移除工具不存在于注册表
    - **属性 1：已移除工具不存在于注册表**
    - 遍历所有 17 个已移除工具名，验证不出现在 `schema/tools.yaml` 和 `_registry.ts` 中
    - **验证: 需求 1.1, 1.3, 6.1, 6.2, 6.5**

- [x] 3. 修改 ping.ts，移除远程通道检查
  - [x] 3.1 简化 `packages/core-mcp/src/tools/ping.ts`
    - 移除 `import { FigmaMcpClient } from '@figcraft/figma-mcp-client'`
    - 移除 `import { getToken } from '../auth.js'`（仅当 ping 不再需要时）
    - 移除 `pingRemoteClient` 变量和 `checkRemoteStatus()` 函数
    - 移除 `ping` 工具中的 `remotePromise` 并行检查
    - 移除所有响应中的 `remoteChannel` 字段
    - 更新工具描述，移除 "Also checks the official Figma MCP server" 相关文字
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 3.2 编写属性测试：Ping 响应不含远程通道信息
    - **属性 3：Ping 响应不含远程通道信息**
    - 验证 `ping.ts` 源代码中不包含 `remoteChannel` 字段赋值
    - **验证: 需求 4.1, 4.2, 4.3**

  - [ ]* 3.3 编写属性测试：Ping 成功响应包含必要字段
    - **属性 4：Ping 成功响应包含必要字段**
    - 验证 `ping.ts` 源代码中包含 `connected`、`latency`、`serverVersion`、`pluginVersion` 字段
    - **验证: 需求 4.5**

- [x] 4. 检查点 — 验证核心代码修改
  - 确保所有修改后的文件无语法错误，询问用户是否有疑问。

- [x] 5. 删除源代码文件和 figma-mcp-client 包
  - [x] 5.1 删除 `packages/core-mcp/src/tools/figma-remote.ts`
    - _需求: 3.1_

  - [x] 5.2 删除 `packages/core-mcp/src/tools/inspect-context.ts`
    - _需求: 3.2_

  - [x] 5.3 修改 `packages/core-mcp/package.json`，移除 `@figcraft/figma-mcp-client` 依赖
    - 从 `dependencies` 中移除 `"@figcraft/figma-mcp-client": "0.1.0"`
    - _需求: 2.3_

  - [x] 5.4 删除 `packages/figma-mcp-client/` 整个目录
    - 包含 `client.ts`、`transport.ts`、`index.ts`、`package.json`、`tsconfig.json`
    - _需求: 2.1_

  - [ ]* 5.5 编写属性测试：源代码无已删除模块引用
    - **属性 2：源代码无已删除模块引用**
    - 遍历 `packages/` 下所有 `.ts` 文件，验证不包含对 `@figcraft/figma-mcp-client`、`FigmaMcpClient`、`figma-remote.js`、`inspect-context.js` 的 import
    - **验证: 需求 2.5, 3.3, 4.4**

- [x] 6. 删除和更新测试文件
  - [x] 6.1 删除 `tests/figma-mcp-transport.test.ts`
    - _需求: 8.1_

  - [x] 6.2 删除 `tests/figma-mcp-client.test.ts`
    - _需求: 8.1_

  - [x] 6.3 删除 `tests/inspect-context.test.ts`
    - _需求: 8.1_

  - [x] 6.4 删除 `tests/figma-remote-toolset.test.ts`
    - _需求: 8.1_

  - [ ]* 6.5 编写属性测试：测试文件无已删除模块引用
    - **属性 6：测试文件无已删除模块引用**
    - 遍历 `tests/` 下保留的 `.test.ts` 文件，验证不包含对 `figma-mcp-client`、`figma-remote`、`inspect-context` 模块的 import 或 mock
    - **验证: 需求 8.2**

- [x] 7. 检查点 — 验证删除操作
  - 确保所有测试通过，询问用户是否有疑问。

- [x] 8. 更新文档
  - [x] 8.1 更新 `AGENTS.md`
    - 架构描述从 "two independent channels" 改为 "single channel (Plugin Channel)"
    - 移除架构图中的 Remote Channel 部分
    - 移除 Dynamic Toolsets 表格中的 `figma-remote` 行
    - 移除 Workflows 中的 4 个 Remote Channel 工作流（Code Generation、Inspect + Quality、Design System Search、Write to Canvas）
    - 移除 Dual Channel Tool Routing 表格和说明
    - 添加说明：代码生成、设计系统搜索、Code Connect 等功能现由 Figma Power 提供
    - 更新 `ping` 描述为仅检查 Plugin 通道
    - _需求: 7.1, 7.2, 7.3, 7.4, 7.7_

  - [x] 8.2 更新 `CLAUDE.md`
    - 从目录结构中移除 `figma-mcp-client/src/` 条目
    - 更新架构描述，移除双通道相关内容
    - 移除对 Remote 通道的引用
    - _需求: 10.1, 10.2, 10.3_

  - [x] 8.3 更新 `.kiro/steering/figma-create-quality.md`
    - 移除第 15 条"双通道工作流"整个章节及其场景指引
    - _需求: 7.5_

  - [x] 8.4 更新 `.kiro/steering/figcraft.md`
    - 移除所有对 Remote 通道和双通道的引用（如有）
    - _需求: 7.6_

- [x] 9. 创建 Kiro Skills 引导文件
  - [x] 9.1 创建 `.kiro/skills/figma-use/SKILL.md`
    - 编写 Plugin API 使用指南，基于 Figma 官方 Skills 内容，适配 Kiro 平台格式
    - _需求: 9.1, 9.2, 9.3_

  - [x] 9.2 创建 `.kiro/skills/figma-create-new-file/SKILL.md`
    - 编写新建文件指南
    - _需求: 9.1, 9.2, 9.3_

  - [x] 9.3 创建 `.kiro/skills/figma-generate-library/SKILL.md`
    - 编写生成组件库指南
    - _需求: 9.1, 9.2, 9.3_

  - [x] 9.4 创建 `.kiro/skills/figma-generate-design/SKILL.md`
    - 编写生成设计指南
    - _需求: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 9.5 编写属性测试：Skill 文件格式合规
    - **属性 7：Skill 文件格式合规**
    - 遍历 `.kiro/skills/` 下所有子目录，验证每个目录包含 `SKILL.md` 文件且内容为有效 Markdown
    - **验证: 需求 9.2**

- [x] 10. 检查点 — 验证文档和 Skills
  - 确保所有文档更新一致，Skills 文件格式正确，询问用户是否有疑问。

- [x] 11. 构建验证
  - [x] 11.1 运行 `npm install` 验证依赖解析
    - 确认不产生与 figma-mcp-client 相关的错误
    - _需求: 2.4_

  - [x] 11.2 运行 `npm run build` 验证完整构建
    - _需求: 5.5_

  - [x] 11.3 运行 `npm run typecheck` 验证类型检查
    - _需求: 5.6_

  - [x]* 11.4 编写属性测试：Plugin 通道工具集完整保留
    - **属性 5：Plugin 通道工具集完整保留**
    - 遍历所有预期保留的工具集名称（variables、tokens、styles、components-advanced、library、shapes-vectors、annotations、prototype、lint、auth、pages、staging），验证存在于 `schema/tools.yaml` 的 `_toolset_descriptions` 中
    - **验证: 需求 5.1**

- [x] 12. 测试验证
  - [x] 12.1 运行 `npm run test` 验证所有保留测试通过
    - _需求: 5.7, 8.3_

- [x] 13. 最终检查点 — 全部验证通过
  - 确保所有测试通过，构建成功，类型检查无错误，询问用户是否有疑问。

## 备注

- 标记 `*` 的任务为可选，可跳过以加速 MVP
- 每个任务引用了具体的需求编号以确保可追溯性
- 检查点确保增量验证，及时发现问题
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
- 依赖顺序严格遵循设计文档的 13 步流程，避免中间状态的编译错误
