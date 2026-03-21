# 需求文档：Endpoint 模式重构

## 简介

将 FigCraft MCP Server 的工具架构从当前的扁平工具模式（117 个独立工具）重构为 endpoint 模式（资源导向的 API，方法分发）。目标是减少 LLM 认知负担、鼓励完整节点声明、提供更清晰的资源→操作心智模型。重构分三阶段进行：Phase 1（facade 层共存）→ Phase 2（废弃旧工具）→ Phase 3（移除旧工具）。

## 术语表

- **MCP_Server**: FigCraft 的 MCP 协议服务端，通过 stdio 与 IDE 通信，通过 WebSocket 与 Figma 插件通信
- **Endpoint_Tool**: 资源导向的聚合工具，通过 `method` 参数分发到不同的操作处理器（如 `frames(method: "get", ...)`）
- **Flat_Tool**: 当前架构中的独立工具（如 `create_frame`、`patch_nodes`、`delete_nodes`），每个工具对应一个操作
- **Standalone_Tool**: 不适合归入 endpoint 的独立工具，在重构后保持原样（如 `ping`、`create_document`、`export_image`）
- **Method_Dispatcher**: endpoint 内部的方法路由逻辑，根据 `method` 参数将请求分发到对应的底层处理器
- **Tool_Logic_Function**: 从现有 custom tool 的 `server.tool()` 回调中提取出的独立可复用函数，包含 URL 解析、REST fallback、response guard 等业务逻辑
- **Schema_Compiler**: `scripts/compile-schema.ts`，从 `schema/tools.yaml` 生成工具注册代码和注册表
- **Toolset_Manager**: `src/mcp-server/tools/toolset-manager.ts`，管理工具的动态启用/禁用
- **Bridge**: MCP Server 与 Figma 插件之间的 WebSocket 通信桥接层
- **Access_Control**: 三级访问控制系统（read/create/edit），通过 `FIGCRAFT_ACCESS` 环境变量配置
- **Facade_Layer**: Phase 1 中 endpoint 工具作为现有处理器的薄封装层，不修改底层逻辑
- **Method_Access_Map**: endpoint 内部维护的 method→access_level 映射表，用于 method 级别的权限检查

## 需求

### 需求 1：核心逻辑提取（前置条件）

**用户故事：** 作为 FigCraft 开发者，我希望将 custom tool 的业务逻辑从 `server.tool()` 回调中提取为独立函数，以便 endpoint 和 flat tool 都能复用同一份逻辑。

#### 验收标准

1. THE 重构 SHALL 将以下 custom tool 的核心逻辑提取为独立的 Tool_Logic_Function：`get_node_info`（含 Figma URL 解析、REST fallback、response guard、node-not-found 引导）、`get_current_page`（含 response guard、workflow hint）、`search_nodes`（含 response guard）、`create_document`（含递归 type 校验、节点计数、progress notification、120s 超时、lint hint）、`get_mode`（含内置 ping、version check、library components 获取、_hint 注入）、`export_image`（含 REST fallback）
2. EACH Tool_Logic_Function SHALL 接受 bridge 实例和参数对象作为输入，返回 MCP 标准响应格式（`{ content: [...] }`），不依赖 `server.tool()` 的注册上下文
3. AFTER 提取完成，THE 原有 flat tool 的 `server.tool()` 回调 SHALL 改为调用对应的 Tool_Logic_Function，确保行为完全不变
4. THE 提取 SHALL 不修改任何 Figma 插件侧的 handler（`src/plugin/handlers/`），仅影响 MCP Server 侧的工具注册层
5. ALL 现有 232 个测试 SHALL 在提取后继续通过，无需修改

### 需求 2：Endpoint 工具定义与 Schema 格式扩展

**用户故事：** 作为 FigCraft 开发者，我希望在 `schema/tools.yaml` 中定义 endpoint 工具，以便 Schema_Compiler 能自动生成对应的注册代码和注册表。

#### 验收标准

1. THE `schema/tools.yaml` SHALL 支持 `handler: endpoint` 类型的工具定义，包含 `methods` 字段，每个 method 包含：名称、描述、`maps_to`（原始 flat tool 名称引用）、参数 schema、`write` 标记和 `access` 级别
2. THE Schema_Compiler SHALL 为每个 endpoint 工具生成包含 `method` 参数（枚举类型）的 Zod schema，`method` 的可选值对应该 endpoint 支持的所有操作
3. THE Schema_Compiler SHALL 从 endpoint 的 `methods` 定义中自动合并生成统一参数 Zod schema：`method` 为 required 枚举参数，其余参数取各 method 参数的并集并标记为 optional；WHEN 不同 method 的同名参数类型不同时，SHALL 使用 `z.union()` 合并
4. THE Schema_Compiler SHALL 在 `_registry.ts` 中将 endpoint 工具注册到对应的 toolset 或 core 集合中
5. THE Schema_Compiler SHALL 为 endpoint 工具生成 `GENERATED_ENDPOINT_METHOD_ACCESS` 映射表（endpoint 名 → method 名 → access 级别），供 Method_Dispatcher 做 method 级别权限检查
6. WHEN `schema/tools.yaml` 中的 endpoint 定义缺少必要字段（`methods`、`description`）时，THE Schema_Compiler SHALL 输出明确的错误信息并终止编译

### 需求 3：Endpoint 方法分发机制

**用户故事：** 作为 FigCraft 开发者，我希望 endpoint 工具能根据 `method` 参数将请求路由到正确的底层处理器，以便复用现有的 Figma 插件 handler。

#### 验收标准

1. WHEN Endpoint_Tool 收到请求时，THE Method_Dispatcher SHALL 根据 `method` 参数值调用对应的 Tool_Logic_Function（而非直接调用 `bridge.request()`），以保留 URL 解析、REST fallback、response guard 等业务逻辑
2. IF `method` 参数值不在该 endpoint 支持的方法列表中，THEN THE Method_Dispatcher SHALL 返回包含有效方法列表的错误响应
3. THE Method_Dispatcher SHALL 将 endpoint 请求参数转换为 Tool_Logic_Function 期望的参数格式，无需修改 Figma 插件侧的 handler
4. WHEN endpoint 的某个 method 被 Access_Control 阻止时，THE Method_Dispatcher SHALL 查询 `GENERATED_ENDPOINT_METHOD_ACCESS` 映射表，在 method 级别进行权限检查，返回包含当前访问级别和被阻止原因的错误响应
5. FOR 简单的 bridge handler method（无特殊逻辑），THE Method_Dispatcher SHALL 直接调用 `bridge.request()` 并包装为标准响应格式

### 需求 4：核心 Endpoint 工具设计

**用户故事：** 作为 LLM agent，我希望通过少量资源导向的 endpoint 工具完成 Figma 操作，以便减少工具选择的认知负担。

#### 验收标准

1. THE MCP_Server SHALL 提供 `nodes` endpoint（核心），支持 method: `get`、`list`、`update`、`delete`、`clone`、`insert_child`，分别映射到 `get_node_info`、`search_nodes`、`patch_nodes`、`delete_nodes`、`clone_node`、`insert_child` 的 Tool_Logic_Function。注意：节点创建统一走 `create_document` standalone tool，`nodes` endpoint 不包含 `create` method，避免与 `create_document` 产生选择困惑
2. THE MCP_Server SHALL 提供 `text` endpoint（核心），支持 method: `create`、`set_content`，分别映射到 `create_text`、`set_text_content` 的处理器。通用操作（get/update/delete）通过 `nodes` endpoint 完成
3. THE MCP_Server SHALL 提供 `shapes` endpoint（核心），支持 method: `create_frame`、`create_rectangle`、`create_ellipse`、`create_vector`，映射到对应的创建处理器。通用操作（get/update/delete）通过 `nodes` endpoint 完成
4. THE MCP_Server SHALL 提供 `components` endpoint（核心 + toolset 扩展），核心 method: `list`、`list_library`、`get`、`create_instance`、`list_properties`；toolset 扩展 method（需 `load_toolset("components-advanced")`）: `create`、`update`、`delete`、`swap`、`detach`、`audit`，映射到对应的组件操作处理器
5. THE MCP_Server SHALL 提供 `variables` endpoint（toolset），需 `load_toolset("variables")` 启用，支持 method: `list`、`get`、`list_collections`、`get_bindings`、`set_binding`、`create`、`update`、`delete`、`create_collection`、`delete_collection`、`batch_create`、`export`，映射到对应的变量操作处理器
6. THE MCP_Server SHALL 提供 `styles` endpoint（toolset），需 `load_toolset("styles")` 启用，支持 method: `list`、`get`、`create_paint`、`update_paint`、`update_text`、`update_effect`、`delete`、`sync`，映射到对应的样式操作处理器
7. THE MCP_Server SHALL 保留以下工具为 Standalone_Tool，不纳入 endpoint 聚合：`ping`、`get_mode`、`set_mode`、`create_document`、`join_channel`、`get_channel`、`export_image`、`lint_fix_all`、`set_current_page`、`save_version_history`、`set_selection`、`get_selection`、`get_current_page`、`get_document_info`、`list_fonts`、`set_image_fill`
8. THE 以下 toolset SHALL 在 endpoint 模式下保持为独立 flat tool（不聚合为 endpoint），因其操作语义不适合资源导向模型：`tokens`（11 tools，面向文件同步流程）、`library`（7 tools，面向跨文件导入流程）、`annotations`（6 tools）、`lint`（4 tools）、`auth`（3 tools）、`pages`（3 tools）、`shapes-vectors` 中的 `create_line`/`create_star`/`create_polygon`/`create_section`/`flatten_node`/`boolean_operation`（保留在 shapes-vectors toolset 中按需加载）
9. WHEN endpoint 模式启用时，THE MCP_Server SHALL 将核心工具数量从 33 个减少到 4 个 endpoint（nodes/text/shapes/components）加上约 16 个 standalone 工具（总计约 20 个核心工具）


### 需求 5：访问控制 — Method 级别权限

**用户故事：** 作为 FigCraft 运维人员，我希望三级访问控制在 endpoint 模式下以 method 粒度生效，以便安全策略不受架构变更影响。

#### 验收标准

1. THE Method_Dispatcher SHALL 在路由到 Tool_Logic_Function 之前，查询 `GENERATED_ENDPOINT_METHOD_ACCESS` 映射表检查当前 method 的 access 级别
2. WHEN Access_Control 级别为 `read` 时，THE Method_Dispatcher SHALL 仅允许 `write: false` 的 method（如 `get`、`list`、`list_properties`），拒绝所有 `write: true` 的 method
3. WHEN Access_Control 级别为 `create` 时，THE Method_Dispatcher SHALL 允许 `access: create` 的 method（如 `create`、`create_instance`），拒绝 `access: edit` 的 method（如 `update`、`delete`、`swap`）
4. IF 用户通过 endpoint 调用被 Access_Control 阻止的 method，THEN THE Method_Dispatcher SHALL 返回错误响应，包含：当前访问级别、被阻止的 method 名、该 endpoint 中当前级别下可用的 method 列表
5. THE endpoint 工具本身 SHALL NOT 被整体标记为 write tool 加入 `GENERATED_WRITE_TOOLS`（因为 endpoint 同时包含 read 和 write method）；访问控制完全在 Method_Dispatcher 内部以 method 粒度执行
6. THE `_registry.ts` SHALL 生成 `GENERATED_ENDPOINT_METHOD_ACCESS` 常量（类型 `Record<string, Record<string, { write: boolean; access?: 'create' | 'edit' }>>`），供 Method_Dispatcher 和 Toolset_Manager 使用

### 需求 6：Phase 1 — Facade 共存

**用户故事：** 作为 FigCraft 开发者，我希望 endpoint 工具与现有 flat 工具共存，以便渐进式迁移而不破坏现有功能。

#### 验收标准

1. WHILE 系统处于 Phase 1 阶段，THE MCP_Server SHALL 同时注册 endpoint 工具和对应的 flat 工具，两套 API 均可正常使用
2. THE Facade_Layer SHALL 通过调用 Tool_Logic_Function 实现方法路由，endpoint 和 flat tool 共享同一份业务逻辑，确保行为完全一致
3. THE Toolset_Manager SHALL 支持通过 `FIGCRAFT_API_MODE` 环境变量选择：`endpoint`（仅启用 endpoint + standalone）、`flat`（仅启用 flat tool，当前默认行为）、`both`（两者共存，Phase 1 默认值）
4. WHEN `FIGCRAFT_API_MODE=endpoint` 时，THE Toolset_Manager SHALL 在启动时禁用所有被 endpoint 替代的 flat tool，仅保留 endpoint 工具和 standalone 工具
5. WHEN `FIGCRAFT_API_MODE=flat` 时，THE Toolset_Manager SHALL 在启动时禁用所有 endpoint 工具，保持当前行为不变（向后兼容）

### 需求 7：Toolset_Manager 适配

**用户故事：** 作为 FigCraft 开发者，我希望 Toolset_Manager 能正确管理 endpoint 工具的启用/禁用，以便动态 toolset 机制在新架构下正常工作。

#### 验收标准

1. THE Toolset_Manager SHALL 支持将 endpoint 工具注册为 core 工具或 toolset 工具，与现有的 flat 工具管理机制一致
2. WHEN `load_toolset` 加载一个 toolset 时（如 `load_toolset("variables")`），THE Toolset_Manager SHALL 根据当前 `FIGCRAFT_API_MODE` 启用对应的 endpoint 工具或 flat 工具
3. THE Toolset_Manager SHALL 在 `list_toolsets` 输出中正确反映当前 API 模式、endpoint 工具的状态（已加载/未加载）、以及每个 endpoint 包含的 method 数量
4. THE `list_toolsets` 输出 SHALL 在 endpoint 模式下显示 endpoint 工具名及其 method 列表，而非逐个列出被替代的 flat tool 名

### 需求 8：AGENTS.md 与 Prompt 更新

**用户故事：** 作为 LLM agent，我希望 AGENTS.md 和 prompt 模板反映 endpoint 模式的工具用法，以便正确使用新的 API 接口。

#### 验收标准

1. THE AGENTS.md SHALL 更新工具行为规则，使用 endpoint 调用语法（如 `nodes(method: "get", nodeId: "1:23")` 替代 `get_node_info(nodeId: "1:23")`）
2. THE AGENTS.md SHALL 更新 Dynamic Toolsets 表格，反映 endpoint 模式下每个 toolset 包含的 endpoint 工具及其 method 数量
3. THE AGENTS.md SHALL 更新所有 Workflow 部分（Create UI Elements、Inspect Design、Token Sync 等），使用 endpoint 调用替代 flat 工具调用
4. THE AGENTS.md SHALL 明确说明：节点创建统一使用 `create_document`（批量）或 `shapes(method: "create_frame")`/`text(method: "create")`（单个），不存在 `nodes(method: "create")`
5. THE `src/mcp-server/prompts/index.ts` 中的 prompt 模板 SHALL 更新为使用 endpoint 工具语法，WHILE Phase 1 期间 SHALL 同时保留 flat tool 名称作为注释说明以便过渡

### 需求 9：跨文件注册一致性

**用户故事：** 作为 FigCraft 开发者，我希望工具的注册位置与 schema 定义一致，以便避免 endpoint 重构时的遗漏。

#### 验收标准

1. THE 重构 SHALL 修复 `get_reactions` 的注册位置异常：该工具在 `nodes.ts` 中注册但在 `schema/tools.yaml` 中属于 `annotations` toolset，SHALL 将其移至 `annotations.ts` 中注册
2. THE 重构 SHALL 验证所有 custom handler 的注册文件与 `schema/tools.yaml` 中的 toolset 归属一致，不存在跨文件注册的情况
3. THE Schema_Compiler SHALL 在编译时检查：每个 `handler: custom` 的工具是否在对应 toolset 的 register 函数文件中注册，输出 warning 如果检测到不一致

### 需求 10：Phase 2 — 废弃旧工具

**用户故事：** 作为 FigCraft 开发者，我希望在 Phase 2 中将 flat 工具标记为正式废弃，以便引导用户和 agent 迁移到 endpoint 模式。

#### 验收标准

1. THE Schema_Compiler SHALL 支持在 `schema/tools.yaml` 中为工具添加 `deprecated: true` 和 `replaced_by` 字段（格式：`endpoint_name.method_name`）
2. WHILE 系统处于 Phase 2 阶段，THE MCP_Server SHALL 在被废弃 flat 工具的 description 中添加 `[DEPRECATED]` 前缀和迁移指引
3. WHEN 被废弃的 flat 工具被调用时，THE MCP_Server SHALL 在响应中附加 deprecation 警告信息，包含推荐使用的 endpoint 调用方式
4. THE Toolset_Manager SHALL 在 `list_toolsets` 输出中标注哪些工具已被 endpoint 替代

### 需求 11：Phase 3 — 移除旧工具

**用户故事：** 作为 FigCraft 开发者，我希望在 Phase 3 中完全移除被 endpoint 替代的 flat 工具，以便简化代码库。

#### 验收标准

1. WHEN 系统进入 Phase 3 阶段，THE MCP_Server SHALL 仅通过 endpoint 工具和 standalone 工具提供完整功能，不丢失任何操作能力
2. THE Schema_Compiler SHALL 支持从 `schema/tools.yaml` 中移除已废弃的 flat 工具定义，且不影响 endpoint 工具的正常运行
3. IF 外部系统仍尝试调用已移除的 flat 工具名称，THEN THE MCP_Server SHALL 返回包含迁移指引的错误响应，指向对应的 endpoint 工具和 method

### 需求 12：测试与验证

**用户故事：** 作为 FigCraft 开发者，我希望有充分的测试覆盖 endpoint 模式的正确性，以便确保重构不引入回归问题。

#### 验收标准

1. THE 测试套件 SHALL 包含每个 endpoint 工具的每个 method 的单元测试，验证参数转换和路由正确性
2. THE 测试套件 SHALL 验证 endpoint 调用与对应 flat 工具调用产生相同的 Bridge 请求参数和响应格式（通过调用同一个 Tool_Logic_Function 保证）
3. THE 测试套件 SHALL 覆盖 Access_Control 在 endpoint 模式下的 method 级别权限控制：read 级别仅允许 read method、create 级别允许 read+create method、edit 级别允许所有 method
4. THE 测试套件 SHALL 验证 Schema_Compiler 对 endpoint 类型工具定义的编译输出正确性（Zod schema、registry 集合、`GENERATED_ENDPOINT_METHOD_ACCESS` 映射表）
5. THE 测试套件 SHALL 验证 `FIGCRAFT_API_MODE` 三种模式（endpoint/flat/both）下工具的启用/禁用行为正确
6. THE 现有 `tests/access-control.test.ts` SHALL 扩展而非重写：新增 endpoint 模式的访问控制测试用例，保留原有 flat tool 的测试用例以确保向后兼容
7. ALL 现有测试 SHALL 在 `FIGCRAFT_API_MODE=flat`（默认向后兼容模式）下继续通过，无需修改
