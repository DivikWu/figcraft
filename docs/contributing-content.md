# 编辑 FigCraft 内容资产

FigCraft 的内容资产（UI 模板、创建指南、MCP Prompt 工作流）从代码中独立出来，使用 YAML 和 Markdown 格式，非开发者也可以编辑。

## 目录结构

```
content/
├── templates/          9 个 UI 模板（YAML）
├── guides/             6 个创建指南（Markdown）
└── prompts/            9 个 MCP Prompt 工作流（YAML）
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

### 动态占位符

在 prompt 的 `steps` 中可以使用 `{{PREVENTION_CHECKLIST_COUNT}}` 占位符，运行时会被替换为实际的 lint 规则数量。
