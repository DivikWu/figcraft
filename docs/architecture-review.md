# FigCraft 架构审查：增长资产最终方案

审查日期：2026-04-03

## 设计目标

1. **开发者维护效率** — 快速找到、快速修改、不出错
2. **多角色协作** — 设计师/PM 可编辑模板和规则，无需 TypeScript 知识
3. **产品化输出** — 未来用户可自定义模板/规则/提示词

## 核心结论：混合架构

**不能统一集中**（一个 `assets/` 放所有）——六类资产的消费者和运行环境完全不同：

| 消费者 | 运行环境 | 约束 |
|--------|---------|------|
| IDE（Claude Code/Kiro） | IDE 进程 | 只扫描 `skills/*/SKILL.md` 直接子目录 |
| Figma Plugin 沙箱 | 无网络、无文件系统 | 资产必须编译进 IIFE bundle |
| MCP Server | Node.js stdio | 资产必须在 npm 发布包内 |

**也不能全部就地嵌入**——UI 模板(1,021行)、Prompts(349行)、Guides 的数据嵌入 TypeScript，非开发者无法编辑。

**正确做法：按性质分两类处理**：

| 类型 | 资产 | 管理方式 |
|------|------|---------|
| **内容型**（声明式数据） | UI 模板(9)、Guides(6)、Prompts(9) | 提取到 `content/`（YAML/Markdown），构建时编译为 TypeScript |
| **代码型**（算法逻辑） | Lint 规则(38)、Opinion Engine(10) | 留在 packages/（TypeScript） |
| **已优化** | Skills(11)、MCP Schema(97) | 不变 |

---

## 不变的部分及理由

### Lint 规则（留在 packages/quality-engine/）

Lint 规则是**算法代码**，不是声明式数据。每条规则实现 `check()` 函数，包含正则匹配、结构启发式、父节点上下文分析。转为 YAML 需要发明比 TypeScript 更复杂的 DSL。

### Opinion Engine（留在 packages/adapter-figma/）

10 项推断是**算法验证逻辑**（冲突检测、FILL→HUG 降级、spacer 转换），深度耦合 Figma Plugin API 的运行时行为。但其**文档**是内容，已提取到 `content/guides/opinion-engine.md`。

---

## 多角色协作

| 角色 | 编辑什么 | 格式 | 验证 |
|------|---------|------|------|
| 设计师 | `content/templates/*.yaml`、`skills/*/SKILL.md` | YAML / Markdown | `npm run content` |
| PM | `content/prompts/*.yaml`、`content/guides/*.md` | YAML / Markdown | `npm run content` |
| 开发者 | Lint 规则、Opinion Engine、MCP 工具 | TypeScript | typecheck + test |

非开发者贡献流程：编辑 YAML/Markdown → `npm run content` 验证 → PR review。详见 [contributing-content.md](contributing-content.md)。

---

## 产品化路线

| Phase | 内容 | 状态 |
|-------|------|------|
| **1. 内容提取** | 24 个内容资产从 TypeScript 提取到 YAML/Markdown | ✅ 已完成 |
| **2. 用户自定义** | `.figcraft/config.yaml` 覆盖/扩展模板、规则、提示词 | 规划中 |
| **3. 共享注册表** | npm 包形式的社区内容包（如 `figcraft-rules-wcag-aaa`） | 远期 |

---

> **实操参考**：目录结构、构建流水线、各资产格式详见 [asset-maintenance.md](asset-maintenance.md)。
