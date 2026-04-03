# 编辑 FigCraft 内容资产

FigCraft 的内容资产（UI 模板、创建指南、MCP Prompt 工作流）从代码中独立出来，使用 YAML 和 Markdown 格式，非开发者也可以编辑。

## 目录结构

```
content/
├── templates/          9 个 UI 模板（YAML）
│   ├── login.yaml
│   ├── signup.yaml
│   └── ...
├── guides/             6 个创建指南（Markdown）
│   ├── multi-screen.md
│   ├── responsive.md
│   └── ...
└── prompts/            9 个 MCP Prompt 工作流（YAML）
    ├── sync-tokens.yaml
    ├── lint-page.yaml
    └── ...
```

## 编辑流程

### 1. 修改内容文件

直接编辑 `content/` 下的 YAML 或 Markdown 文件。任何文本编辑器都可以。

### 2. 验证

```bash
npm run content
```

这会：
- 解析所有 YAML/Markdown 文件
- 验证必填字段（缺失会报错并指明文件名）
- 生成 TypeScript 模块（`_guides.ts`、`_prompts.ts`、`_templates.ts`）

如果有格式错误，会看到类似：
```
Error: login.yaml: missing required field "pitfalls"
```

### 3. 完整构建验证（可选）

```bash
npm run build   # 包含 content 编译
npm test        # 合约测试验证生成文件一致性
```

## UI 模板格式（content/templates/*.yaml）

每个模板必须包含 5 个字段：

```yaml
# 节点层级结构描述
structure: |
  Screen (VERTICAL, FIXED 402×874, ...)
    ├── Header
    └── Content

# 关键布局决策（key → 说明）
keyDecisions:
  layout: "说明布局策略"
  buttonHeight: "说明按钮高度"

# 高频 lint 违规（对应 quality-engine 规则名）
pitfalls:
  - "rule-name: 违规描述"

# 不同风格的变体参数
toneVariants:
  minimal:
    cornerRadius: "8-12px"
    colors: "monochrome + 1 accent"
  elegant:
    cornerRadius: "12-16px"
    colors: "warm neutrals"

# 可直接传给 create_frame 的参数骨架
exampleParams:
  name: "Screen / Login"
  width: 402
  height: 874
  children:
    - type: frame
      name: "Header"
```

## 创建指南格式（content/guides/*.md）

纯 Markdown 文件。使用标准 Markdown 语法（标题、列表、代码块、表格）。

文件名 → 生成的常量名映射：
- `multi-screen.md` → `GUIDES.MULTI_SCREEN`
- `content-states.md` → `GUIDES.CONTENT_STATES`

## MCP Prompt 格式（content/prompts/*.yaml）

每个 prompt 必须包含 3 个字段：

```yaml
name: prompt-name          # MCP prompt 注册名
description: "一句话描述"    # MCP prompt 描述
steps: |                    # 工作流步骤（纯文本）
  Help me do X. Follow these steps:
  1. First step
  2. Second step
```

### 动态占位符

在 `steps` 中可以使用 `{{PREVENTION_CHECKLIST_COUNT}}` 占位符，运行时会被替换为实际的 lint 规则数量。

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
