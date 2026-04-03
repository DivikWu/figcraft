# FigCraft — 产品概览

## 项目定位

**一句话**：AI 驱动的 Figma MCP Server，让任何 IDE 中的 AI 遵循设计规范做设计。

### 核心身份

FigCraft 不是 AI Agent — 它是 **MCP 工具提供者**。Agent Loop、上下文管理、权限、记忆由宿主 IDE（Claude Code / Cursor / Kiro / Codex / Antigravity）拥有。FigCraft 的价值在于：

1. **桥接 IDE 与 Figma** — 通过 MCP 协议 + WebSocket Relay，让 AI 能声明式地创建和修改 Figma 设计
2. **编码设计知识** — 43 条 lint 规则、9 种 UI 模板、三层设计规则、Opinion Engine 推断，确保 AI 产出的 UI 符合设计规范
3. **双模式规范** — 支持 Figma 共享库（Library 模式）和 DTCG JSON 规范文档（Spec 模式），不绑定任何特定设计系统

### 差异化

| | 直接用 Figma Plugin API | 其他 AI 设计工具 | FigCraft |
|---|---|---|---|
| 创建方式 | 命令式 JS | 不可控的生成 | 声明式 MCP + Opinion Engine 自动推断 |
| 质量保证 | 无 | 无或黑盒 | 43 条 lint 规则 + 创建后自检 |
| 设计规范 | 手动遵循 | 不支持 | 自动绑定 Library Token / DTCG 规范 |
| 多 IDE | 不适用 | 单平台 | 任何支持 MCP 的 IDE 共享同一套规则 |

---

## 核心价值观

1. **知识资产是壁垒** — 基础设施谁都能搭，通过实践迭代积累的设计规则、模板、推断规则才是真正价值
2. **工具不是 Agent** — FigCraft 提供工具，不拥有对话。记忆、压缩、权限留给 IDE
3. **声明式优于命令式** — create_frame + Opinion Engine 比 execute_js 更可靠、更可审计
4. **失败可检测** — 每条规则都有 prevention（创建前）+ detection（创建后）+ fix（自动修复）
5. **IDE 无关** — 一套规则，所有 IDE 共享。不为任何 IDE 做特殊适配

---

## 更多信息

- **架构与技术栈** → 见 [CLAUDE.md](../CLAUDE.md)
- **安装与使用** → 见 [user-guide.md](user-guide.md)
- **功能清单与工具体系** → 见 [user-guide.md](user-guide.md) 第 3-4 节
- **产品路线图** → 见 [roadmap.md](roadmap.md)
- **增长资产规划** → 见 [growth-assets.md](growth-assets.md)
