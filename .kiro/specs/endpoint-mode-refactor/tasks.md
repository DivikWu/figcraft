# 实施计划：Endpoint 模式重构

## 概述

将 FigCraft MCP Server 从扁平工具模式重构为 endpoint 模式。按照设计文档的架构分层推进：先提取 Tool_Logic_Function，再扩展 Schema_Compiler，然后实现 Method_Dispatcher 和 Endpoint 注册，最后适配 Toolset_Manager 和 AGENTS.md。所有代码使用 TypeScript，测试使用 vitest + fast-check。

## 任务

- [x] 1. 提取 Tool_Logic_Functions（核心逻辑层）
  - [x] 1.1 创建 `src/mcp-server/tools/logic/node-logic.ts`，提取 `getNodeInfoLogic()`、`getCurrentPageLogic()`、`searchNodesLogic()`
    - 从 `nodes.ts` 的 `get_node_info` 回调提取完整逻辑（Figma URL 解析、`requestWithFallback()` REST fallback、`Bridge.guardResponseSize()`、node-not-found 引导）
    - 从 `get_current_page` 回调提取（response guard、workflow hint）
    - 从 `search_nodes` 回调提取（response guard）
    - 定义 `McpResponse` 类型：`{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }`
    - 修改 `nodes.ts` 中对应的 `server.tool()` 回调为调用 Logic 函数
    - _需求: 1.1, 1.2, 1.3_

  - [x] 1.2 创建 `src/mcp-server/tools/logic/mode-logic.ts`，提取 `getModeLogic()`
    - 从 `mode.ts` 的 `get_mode` 回调提取完整逻辑（内置 ping、version check、`fetchLibraryComponents()`、`_hint` 注入、fileContext 缓存）
    - 修改 `mode.ts` 中 `get_mode` 的回调为调用 `getModeLogic()`
    - _需求: 1.1, 1.2, 1.3_

  - [x] 1.3 创建 `src/mcp-server/tools/logic/write-node-logic.ts`，提取 `createDocumentLogic()`
    - 从 `write-nodes.ts` 的 `create_document` 回调提取完整逻辑（递归 type 校验、节点计数、progress notification、120s 超时、lint hint）
    - 函数签名需支持 `extra` 参数（`_meta.progressToken`、`sendNotification`）
    - 修改 `write-nodes.ts` 中 `create_document` 的回调为调用 `createDocumentLogic()`
    - _需求: 1.1, 1.2, 1.3_

  - [x] 1.4 创建 `src/mcp-server/tools/logic/export-logic.ts`，提取 `exportImageLogic()`
    - 从 `export.ts` 的 `export_image` 回调提取（`requestWithFallback()` REST fallback）
    - 修改 `export.ts` 中回调为调用 `exportImageLogic()`
    - _需求: 1.1, 1.2, 1.3_

  - [x]* 1.5 编写 Tool_Logic_Function 行为等价性单元测试
    - 创建 `tests/tool-logic.test.ts`
    - 验证提取后的 Logic 函数返回格式符合 McpResponse
    - 验证 `getNodeInfoLogic` 的 URL 解析、node-not-found 引导逻辑
    - 验证 `createDocumentLogic` 的递归 type 校验、空 nodes 拒绝
    - _需求: 1.5, 12.2_

  - [x]* 1.6 编写属性测试：Tool_Logic_Function 返回格式一致性
    - **Property 2: Tool_Logic_Function 返回格式一致性**
    - **验证: 需求 1.2, 3.5**

- [x] 2. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 3. 修复跨文件注册一致性
  - [x] 3.1 将 `get_reactions` 的 `server.tool()` 注册从 `nodes.ts` 移至 `annotations.ts`
    - 从 `nodes.ts` 中移除 `get_reactions` 的注册代码
    - 在 `annotations.ts` 中添加 `get_reactions` 的注册（保持原有逻辑不变）
    - 确保 `annotations.ts` 有必要的 import（Bridge 等）
    - _需求: 9.1, 9.2_

  - [x]* 3.2 编写注册一致性测试
    - 创建 `tests/registration-consistency.test.ts`
    - **Property 12: 注册文件与 Toolset 归属一致性**
    - **验证: 需求 9.2**

- [x] 4. 扩展 Schema_Compiler 支持 `handler: endpoint`
  - [x] 4.1 扩展 `scripts/compile-schema.ts` 的类型定义和解析逻辑
    - 新增 `EndpointMethodDef` 和 `EndpointToolDef` 接口
    - 解析 `handler: endpoint` 类型的工具定义
    - 对缺少 `methods` 或 `description` 的 endpoint 定义输出错误并 `process.exit(1)`
    - _需求: 2.1, 2.6_

  - [x] 4.2 实现 Schema_Compiler 的 Endpoint Zod schema 合并生成
    - 为每个 endpoint 生成 `method` 枚举参数（required）
    - 合并各 method 参数为并集，全部标记 optional
    - 同名参数类型冲突时使用 `z.union()` 合并
    - 将生成的 Zod schema 和注册代码写入 `_generated.ts`
    - _需求: 2.2, 2.3_

  - [x] 4.3 生成 `GENERATED_ENDPOINT_METHOD_ACCESS` 映射表和相关注册表
    - 在 `_registry.ts` 中生成 `GENERATED_ENDPOINT_METHOD_ACCESS`（endpoint → method → `{ write, access? }`）
    - 生成 `GENERATED_ENDPOINT_TOOLS` 集合
    - 生成 `GENERATED_ENDPOINT_REPLACES` 映射（endpoint → 被替代的 flat tool 列表）
    - Endpoint 工具注册到对应 toolset 或 core 集合，但不加入 `GENERATED_WRITE_TOOLS`
    - _需求: 2.4, 2.5, 5.5, 5.6_

  - [x] 4.4 添加 Schema_Compiler 注册文件一致性检查（warning）
    - 编译时检查 `handler: custom` 工具的 toolset 归属与注册文件名约定是否一致
    - 输出 warning 如果检测到不一致
    - _需求: 9.3_

  - [x]* 4.5 编写 Schema_Compiler endpoint 编译正确性测试
    - 创建 `tests/schema-compiler-endpoint.test.ts`
    - 测试正常 endpoint 定义的编译输出（Zod schema 结构、registry 集合）
    - 测试缺少 `methods`/`description` 时的错误退出
    - 测试同名参数类型冲突的 `z.union()` 合并
    - _需求: 12.4_

  - [x]* 4.6 编写属性测试：Schema_Compiler 参数合并与映射完整性
    - **Property 3: Schema_Compiler Endpoint 参数合并正确性**
    - **验证: 需求 2.2, 2.3**
    - **Property 4: Endpoint 注册表正确性**
    - **验证: 需求 2.4, 5.5**
    - **Property 5: ENDPOINT_METHOD_ACCESS 映射完整性**
    - **验证: 需求 2.5, 5.6**
    - **Property 6: Schema_Compiler 对无效 Endpoint 定义的拒绝**
    - **验证: 需求 2.6**

- [x] 5. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 6. 在 `schema/tools.yaml` 中添加 Endpoint 工具定义
  - [x] 6.1 添加 `nodes` endpoint 定义（核心）
    - `handler: endpoint`，`toolset: core`
    - methods: `get`（maps_to: get_node_info, write: false）、`list`（maps_to: search_nodes, write: false）、`update`（maps_to: patch_nodes, write: true, access: edit）、`delete`（maps_to: delete_nodes, write: true, access: edit）、`clone`（maps_to: clone_node, write: true, access: create）、`insert_child`（maps_to: insert_child, write: true, access: edit）
    - 运行 `npm run schema` 验证编译通过
    - _需求: 4.1_

  - [x] 6.2 添加 `text` endpoint 定义（核心）
    - methods: `create`（maps_to: create_text, write: true, access: create）、`set_content`（maps_to: set_text_content, write: true, access: edit）
    - 运行 `npm run schema` 验证编译通过
    - _需求: 4.2_

  - [x] 6.3 添加 `shapes` endpoint 定义（核心）
    - methods: `create_frame`、`create_rectangle`、`create_ellipse`、`create_vector`（全部 write: true, access: create）
    - 运行 `npm run schema` 验证编译通过
    - _需求: 4.3_

  - [x] 6.4 添加 `components` endpoint 定义（核心 + toolset 扩展）
    - 核心 methods: `list`、`list_library`、`get`、`create_instance`、`list_properties`
    - toolset 扩展 methods（components-advanced）: `create`、`update`、`delete`、`swap`、`detach`、`audit`
    - 运行 `npm run schema` 验证编译通过
    - _需求: 4.4_

  - [x] 6.5 添加 `variables` endpoint 定义（toolset）
    - `toolset: variables`，12 个 methods
    - methods: `list`、`get`、`list_collections`、`get_bindings`、`set_binding`、`create`、`update`、`delete`、`create_collection`、`delete_collection`、`batch_create`、`export`
    - 运行 `npm run schema` 验证编译通过
    - _需求: 4.5_

  - [x] 6.6 添加 `styles` endpoint 定义（toolset）
    - `toolset: styles`，8 个 methods
    - methods: `list`、`get`、`create_paint`、`update_paint`、`update_text`、`update_effect`、`delete`、`sync`
    - 运行 `npm run schema` 验证编译通过
    - _需求: 4.6_

- [x] 7. 实现 Method_Dispatcher 和 Endpoint 注册
  - [x] 7.1 实现 `createMethodDispatcher()` 核心分发逻辑
    - 在 `src/mcp-server/tools/endpoints.ts` 中实现
    - 解析 `method` 参数，验证有效性
    - 查询 `GENERATED_ENDPOINT_METHOD_ACCESS` 进行 method 级别权限检查
    - 权限被拒绝时返回包含当前访问级别、被阻止 method 名、可用 method 列表的错误响应
    - 路由到对应的 Tool_Logic_Function 或 `bridge.request()`
    - _需求: 3.1, 3.2, 3.4, 5.1, 5.2, 5.3, 5.4_

  - [x] 7.2 创建 `bridgeRequestLogic()` 通用包装函数
    - 用于简单的 bridge handler method（无特殊逻辑）
    - 调用 `bridge.request()` 并包装为 McpResponse 格式
    - _需求: 3.5_

  - [x] 7.3 实现 `registerEndpointTools()` 注册所有 endpoint
    - 注册 `nodes` endpoint：`get` → `getNodeInfoLogic()`、`list` → `searchNodesLogic()`、`update`/`delete`/`clone`/`insert_child` → `bridgeRequestLogic()`
    - 注册 `text` endpoint：`create`/`set_content` → `bridgeRequestLogic()`
    - 注册 `shapes` endpoint：`create_frame`/`create_rectangle`/`create_ellipse`/`create_vector` → `bridgeRequestLogic()`
    - 注册 `components` endpoint：`list`/`list_library`/`get`/`create_instance`/`list_properties` → 对应逻辑
    - 注册 `variables` endpoint：12 个 method → 对应逻辑
    - 注册 `styles` endpoint：8 个 method → 对应逻辑
    - 使用 Schema_Compiler 生成的 Zod schema
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x]* 7.4 编写 Method_Dispatcher 路由和拒绝测试
    - 创建 `tests/method-dispatcher.test.ts`
    - 测试有效 method 的路由正确性
    - 测试无效 method 返回包含有效 method 列表的错误
    - 测试参数转换正确性
    - _需求: 12.1_

  - [x]* 7.5 编写属性测试：Method_Dispatcher 路由与拒绝
    - **Property 7: Method_Dispatcher 路由正确性**
    - **验证: 需求 3.1**
    - **Property 8: Method_Dispatcher 对无效 Method 的拒绝**
    - **验证: 需求 3.2**

  - [x]* 7.6 编写属性测试：Method 级别访问控制
    - 创建 `tests/endpoint-access-control.test.ts`
    - **Property 9: Method 级别访问控制**
    - 生成随机 (endpoint, method, accessLevel) 三元组，验证允许/拒绝行为
    - **验证: 需求 3.4, 5.1, 5.2, 5.3, 5.4**

- [x] 8. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 9. 适配 Toolset_Manager 支持 `FIGCRAFT_API_MODE`
  - [x] 9.1 在 `toolset-manager.ts` 中实现 `FIGCRAFT_API_MODE` 解析
    - 新增 `resolveApiMode()` 函数，支持 `flat`（默认）、`endpoint`、`both` 三种模式
    - 无效值输出 warning 并回退到 `flat`
    - 导入 `GENERATED_ENDPOINT_TOOLS`、`GENERATED_ENDPOINT_REPLACES` 从 `_registry.ts`
    - _需求: 6.3_

  - [x] 9.2 修改 `disableNonCoreTools()` 支持 API 模式切换
    - `flat` 模式：禁用所有 endpoint 工具（当前行为 + 新增 endpoint 禁用）
    - `endpoint` 模式：禁用被 endpoint 替代的 flat tool，启用 endpoint + standalone
    - `both` 模式：两套 API 均启用
    - _需求: 6.4, 6.5_

  - [x] 9.3 修改 `enableToolset()`/`disableToolset()` 支持模式感知
    - `load_toolset` 根据当前 API 模式启用 flat tools 或 endpoint tool
    - `unload_toolset` 同理
    - _需求: 7.1, 7.2_

  - [x] 9.4 修改 `list_toolsets` 输出增强
    - endpoint 模式下显示 API 模式、endpoint 工具名及 method 数量
    - 显示 standalone 工具列表
    - _需求: 7.3, 7.4_

  - [x] 9.5 在 `registerAllTools()` 中集成 endpoint 注册
    - 调用 `registerEndpointTools(server, bridge)` 注册所有 endpoint 工具
    - 确保 endpoint 工具的 handle 被 `captureToolHandles()` 捕获
    - _需求: 6.1, 7.1_

  - [x]* 9.6 编写 API 模式工具启用/禁用测试
    - 创建 `tests/api-mode.test.ts`
    - 测试三种模式下工具的启用/禁用状态
    - 测试 `load_toolset` 在不同模式下的行为
    - _需求: 12.5_

  - [x]* 9.7 编写属性测试：API 模式与 load_toolset 模式感知
    - **Property 10: API 模式工具启用/禁用正确性**
    - **验证: 需求 6.4, 6.5**
    - **Property 11: load_toolset 模式感知**
    - **验证: 需求 7.2**

- [x] 10. 扩展现有访问控制测试
  - [x] 10.1 在 `tests/access-control.test.ts` 中新增 endpoint 模式测试用例
    - 保留原有 flat tool 测试用例不变
    - 新增 endpoint method 级别权限测试：read 级别仅允许 read method、create 级别允许 read+create method、edit 级别允许所有 method
    - 测试权限拒绝时的错误响应格式（包含 accessLevel、blockedMethod、allowedMethods）
    - _需求: 12.3, 12.6_

- [x] 11. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 12. 实现 Phase 2/3 废弃与移除机制
  - [x] 12.1 扩展 Schema_Compiler 支持 `deprecated` 和 `replaced_by` 字段
    - 解析 `deprecated: true` 和 `replaced_by` 字段
    - 在 description 前添加 `[DEPRECATED]` 前缀和迁移指引
    - 生成 `GENERATED_DEPRECATED_TOOLS` 映射表
    - _需求: 10.1, 10.2_

  - [x] 12.2 实现运行时 deprecation 警告注入
    - 被废弃工具调用时在响应中附加 `_deprecation` 字段
    - 包含 `warning` 和 `replacement` 信息
    - _需求: 10.3_

  - [x] 12.3 实现 Phase 3 已移除工具的迁移指引
    - 生成 `GENERATED_REMOVED_TOOLS` 映射表
    - 对已移除工具名返回包含 endpoint 工具名和 method 名的迁移指引错误
    - _需求: 11.2, 11.3_

  - [x] 12.4 在 `list_toolsets` 中标注已废弃工具
    - 显示哪些工具已被 endpoint 替代
    - _需求: 10.4_

  - [x]* 12.5 编写废弃与移除机制测试
    - 创建 `tests/deprecation.test.ts`
    - 测试 deprecated 工具的 description 前缀
    - 测试调用 deprecated 工具时的 `_deprecation` 响应字段
    - 测试已移除工具的迁移指引错误响应
    - _需求: 12.1_

  - [x]* 12.6 编写属性测试：废弃标记与迁移指引
    - **Property 13: 废弃工具标记与警告**
    - **验证: 需求 10.1, 10.2, 10.3**
    - **Property 14: 已移除工具的迁移指引**
    - **验证: 需求 11.3**

- [x] 13. 更新 AGENTS.md 和 Prompt 模板
  - [x] 13.1 更新 `AGENTS.md` 工具行为规则和 Workflow
    - 使用 endpoint 调用语法替代 flat 工具调用（如 `nodes(method: "get", nodeId: "1:23")`）
    - 更新 Dynamic Toolsets 表格，反映 endpoint 模式下的 toolset 信息
    - 更新所有 Workflow 部分（Create UI Elements、Inspect Design、Token Sync 等）
    - 明确说明 `nodes` endpoint 不包含 `create` method
    - _需求: 8.1, 8.2, 8.3, 8.4_

  - [x] 13.2 更新 `src/mcp-server/prompts/index.ts` 中的 prompt 模板
    - 使用 endpoint 工具语法
    - Phase 1 期间保留 flat tool 名称作为注释说明
    - _需求: 8.5_

- [x] 14. 编写 Endpoint 与 Flat Tool 行为等价性属性测试
  - [x]* 14.1 编写属性测试：Endpoint 与 Flat Tool 行为等价
    - 在 `tests/tool-logic.test.ts` 中补充
    - **Property 1: Endpoint 与 Flat Tool 行为等价**
    - 生成随机有效参数，分别通过 endpoint 和 flat tool 路径调用同一 Tool_Logic_Function，断言结果相同
    - **验证: 需求 1.1, 1.3, 6.2, 12.2**

- [x] 15. 回归验证与最终检查点
  - [x] 15.1 验证 `FIGCRAFT_API_MODE=flat` 下所有现有测试通过
    - 运行 `npm run test`，确保 232+ 个现有测试无回归
    - _需求: 1.5, 12.7_

  - [x] 15.2 验证 `FIGCRAFT_API_MODE=endpoint` 和 `FIGCRAFT_API_MODE=both` 下新测试通过
    - 运行全部测试套件
    - _需求: 12.5_

  - [x] 15.3 运行 `npm run typecheck` 确保类型检查通过
    - 确保所有新增和修改的文件无类型错误
    - _需求: 1.5_

- [x] 16. 最终检查点 — 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP
- 每个任务引用了具体的需求编号以确保可追溯性
- 检查点确保增量验证，避免问题累积
- 属性测试使用 fast-check 库，每个属性至少 100 次迭代
- 单元测试验证具体示例和边界情况，属性测试验证通用正确性
- Phase 1 默认 `FIGCRAFT_API_MODE=flat`，确保向后兼容
- Figma 插件侧（`src/plugin/handlers/`）不做任何修改
