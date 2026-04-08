# 编辑 FigCraft 内容资产

FigCraft 的内容资产（UI 模板、创建指南、MCP Prompt 工作流）从代码中独立出来，使用 YAML 和 Markdown 格式，非开发者也可以编辑。

## 目录结构

```
content/
├── templates/          9 个 UI 模板（YAML）
├── guides/             6 个创建指南（Markdown）
├── prompts/            9 个 MCP Prompt 工作流（YAML）
└── harness/            Harness 规则数据（YAML）
    ├── recovery-patterns.yaml   错误恢复模式
    └── next-steps.yaml          工具后续步骤
```

各资产的必填字段和详细格式见 [asset-maintenance.md](asset-maintenance.md) 第 2-4 节。

## 编辑流程

### 1. 修改内容文件

直接编辑 `content/` 下的 YAML 或 Markdown 文件。任何文本编辑器都可以。

### 2. 验证

```bash
npm run content
```

这会解析所有文件并验证必填字段。如果有格式错误：
```
Error: login.yaml: missing required field "pitfalls"
```

### 3. 完整构建验证（可选）

```bash
npm run build   # 包含 content 编译
npm test        # 合约测试验证生成文件一致性
```

## 新增内容

### 新增 UI 模板

1. 创建 `content/templates/new-type.yaml`（参考现有模板格式）
2. 运行 `npm run content` 验证
3. 模板会自动出现在 `get_creation_guide(topic:"ui-patterns")` 的可用列表中

### 新增创建指南

1. 创建 `content/guides/new-guide.md`
2. 运行 `npm run content`
3. 在 `creation-guide.ts` 的 switch 中添加新 topic 分支，引用 `GUIDES.NEW_GUIDE`

### 新增 MCP Prompt

1. 创建 `content/prompts/new-prompt.yaml`
2. 运行 `npm run content`
3. Prompt 会自动注册到 MCP Server（无需改代码）

### 新增/修改 Harness 规则数据

Harness 规则的数据部分（错误恢复建议、后续步骤引导）由 YAML 定义，编辑后运行 `npm run content` 即可生效。

**错误恢复模式** — `content/harness/recovery-patterns.yaml`：
```yaml
- name: my-error          # 唯一标识
  tools: ["*"]             # 适用工具（"*" = 全部）
  patterns:                # 错误消息匹配正则（不区分大小写）
    - "my error pattern"
  errorType: my_error      # 错误分类标签
  suggestion: >-           # 恢复建议（AI 会看到这段文字）
    Describe what went wrong and how to fix it.
```

**后续步骤** — `content/harness/next-steps.yaml`：
```yaml
- tool: my_tool            # 工具名
  steps:                   # 工具成功后的引导步骤
    - Do step 1 next.
    - Then do step 2.
```

编辑后：
1. `npm run content` — 编译到 `packages/core-mcp/src/harness/_harness.ts`
2. 规则自动生效（无需改代码）

详细字段说明见 YAML 文件顶部注释和 [asset-maintenance.md](asset-maintenance.md) 第 7 节。

### 动态占位符

在 prompt 的 `steps` 中可以使用 `{{PREVENTION_CHECKLIST_COUNT}}` 占位符，运行时会被替换为实际的 lint 规则数量。
