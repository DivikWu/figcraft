# FigCraft 产品介绍

> 本文是 FigCraft 的新手入口文档。读完后你会知道:**它是什么、能解决你什么问题、怎么 5 分钟跑起来**。如需更深入的操作手册见 [user-guide.md](user-guide.md),想了解设计决策与路线图见 [product-overview.md](product-overview.md) 与 [roadmap.md](roadmap.md)。

---

## 一句话定义

**FigCraft 是一个让 AI 按设计规范操作 Figma 的工具包。**

它把 Figma 的创建、同步、审查能力以 MCP 协议暴露给 AI IDE(Cursor / Claude Code / Kiro / Codex / Antigravity 等),让 AI 不再只是"生成图片"或"吐代码",而是像一个懂规范的设计工程师一样,直接在 Figma 里工作。

三行价值主张:

- **AI 懂你的设计系统** — 自动绑定 Token、复用组件、遵守布局规则,不再用硬编码颜色和魔法数字
- **从创建到审查闭环** — 一条命令画页面、一条命令检查合规、一条命令批量修复
- **不绑任何设计系统** — 支持 Figma 共享库和 DTCG JSON 两种规范源,团队已有的体系直接接入

---

## 它为谁 / 解决什么问题

FigCraft 服务三类用户,每类用户带着不同的痛点:

### 🎨 设计师 / AI 辅助设计者

> "我让 AI 在 Figma 里画一个登录页,它用的颜色字号全是它自己编的,完全不是我们团队库里的 Token。改半天还不如自己画。"

**FigCraft 做什么**:在 AI 调用 `create_frame` 创建元素的那一刻,Opinion Engine 会自动在你的共享库里查找匹配的颜色、字号、间距、组件,并优先用 Variable/Style 绑定而不是硬编码值。如果找不到,会明确告诉 AI 回退到哪个值、为什么回退。

### 🧑‍💻 AI IDE 开发者 / 前端工程师

> "我想从一个 Figma 页面生成 React 代码,但 Figma 官方 MCP 在非企业套餐下读写受限,而且每次都得重新拉 REST API,上下文不新鲜。"

**FigCraft 做什么**:Plugin API 直连,不走 REST,所有 Figma 付费套餐下都能**读 + 写**变量/样式/组件;`get_design_context` 在同一个 MCP session 内给 AI 最新的节点树 + 已解析 Token 元数据,用于 design-to-code 工作流。

### 🏗 设计系统维护者 / DS Team

> "我们的设计 Token 在代码里是 DTCG JSON,在 Figma 里是 Variables,两边漂移了我们也不知道。想加个 lint 规则要自己写脚本调 REST API。"

**FigCraft 做什么**:`sync_tokens` 把 DTCG JSON 双向同步到 Figma Variables(含 Light/Dark 模式);40 条内置 Lint 规则覆盖 Token 合规、WCAG、布局结构、组件健康度;`lint_fix_all` 一条命令批量修复能自动修的问题。

---

## 核心能力(三大板块)

FigCraft 的能力围绕**设计生命周期的三个阶段**组织:建立(设计系统) → 产出(UI) → 维护(审查修复)。每个板块对应一组 skill 和一组工具。

### 1. 设计组件库管理

**做什么**:在 Figma 里构建和维护一个专业级设计系统 —— 变量/Token、组件库、主题(Light/Dark)、多品牌、Code Connect 映射。让 Figma 的设计系统和代码里的 Token 保持同步。

**适合谁**:DS team、设计工程师、正在搭建或重构设计系统的团队。

**典型场景**:

- 从一个空 Figma 文件开始,按 Material 3 / Polaris / 自定义规范搭建变量集合、基础组件、主题
- 把代码仓里的 DTCG token JSON 一键同步成 Figma Variables,后续单向或双向同步
- 构建 Button / Input 这类多变体组件,并自动强制变体矩阵规范(防止变体爆炸)
- 给代码里的组件打上 Code Connect 映射,设计师点 Figma 组件能看到源码 snippet

**核心工具**:

- `variables_ep` / `styles_ep` —— 变量和样式的 CRUD,支持批量、多模式、collection 管理
- `create_component` / `create_component_set` —— 内置变体数量守卫(默认 30 上限)
- `sync_tokens` —— DTCG JSON ↔ Figma 双向同步,幂等
- `preflight_library_publish` —— 发布前体检,找出未绑定节点、孤儿变量、命名违规
- `get_code_connect_metadata` —— 为 Code Connect 提供 in-session 元数据(配合 `figma connect create` CLI)

**相关 skill**:[`figcraft-generate-library`](../skills/figcraft-generate-library/SKILL.md)、`design-system-audit`、`token-sync`、`multi-brand`、[`figcraft-code-connect`](../skills/figcraft-code-connect/SKILL.md)

---

### 2. UI 创建

**做什么**:AI 用声明式工具在 Figma 里创建 Frame、文本、SVG、组件实例、图标、图片。Opinion Engine 自动推断布局方向、尺寸策略、Token 绑定、FILL 排序、冲突检测 —— 你描述"要什么",它搞定"怎么做"。

**适合谁**:设计师(让 AI 辅助画图)、PM/产品经理(快速生成原型)、AI IDE 开发者(自动化 UI 生成流水线)。

**典型场景**:

- "创建一个电商商品详情页,复用我们库里的 Button/Tag/Price 组件" —— AI 先搜设计系统,找到组件,按布局规则组装
- "画一个 3 屏的 onboarding 流程,响应式桌面/移动端" —— 多屏幕流 skill 会自动建立 stage 容器、step pills、屏幕顺序
- "按 iOS HIG 做一个设置页" —— 平台 skill 自动套用 Safe Area、SF Pro 字体、iOS 导航模式
- "这个 Figma 页面太丑,用 minimalism 风格重做一版" —— 风格 + 规则系统驱动重新布局

**Opinion Engine 做什么**(举几个最常见的自动推断):

- **尺寸策略**:看到 `width: "fill"` 自动设 STRETCH,看到 `auto` 推断 HUG,两者冲突时优先显式值
- **FILL 排序**:多个 FILL 按 image → gradient → solid 语义排序,避免视觉遮挡
- **Token 自动绑定**:传入 `fill: "#0066FF"` 时自动在库里查找匹配的 Color Variable 并绑定,找不到才 fallback 到硬编码
- **冲突检测**:发现 `direction: HORIZONTAL` 但所有子节点 `height: fill` 会提前警告
- **失败回滚**:创建中途报错会自动清理已创建的孤儿节点

**核心工具**:

- `create_frame` —— 支持 `children` 嵌套树,一次调用构建完整页面层级
- `create_text` / `create_svg` / `icon_create` —— 原子元素
- `search_design_system` —— 按名字/颜色/用途搜组件和变量
- `get_design_context` —— 读现有节点的完整结构用于参考
- `verify_design` / Harness Pipeline —— 创建后自动验证,质量债务跨 turn 追踪

**相关 skill**:[`figcraft-generate-design`](../skills/figcraft-generate-design/SKILL.md)(有库)、`figma-create-ui`(无库)、`multi-screen-flow`、`responsive-design`、`platform-ios` / `platform-android`、`ui-ux-fundamentals`、`design-creator` / `design-guardian`

---

### 3. 设计审查与修复

**做什么**:扫描 Figma 页面/组件/整个文件,按 40 条内置 Lint 规则找出违规点,输出结构化报告,并对能自动修的问题一键修复。

**适合谁**:设计师(发版前体检)、DS 维护者(监控设计系统漂移)、设计评审 reviewer(提效)。

**典型场景**:

- "检查当前页面哪些元素没绑定 Token,自动修能修的" —— Token 合规扫描 + 自动绑定
- "扫描所有按钮的 WCAG 对比度,列出不合规的" —— 可访问性审查
- "我们的设计系统发布前体检一下" —— `preflight_library_publish` 跑完整套规则
- "这个组件有健康问题吗?变体够不够?命名规范吗?" —— 组件级 audit

**40 条规则覆盖 5 个类别**(完整清单见 [generated/lint-rules.md](generated/lint-rules.md)):

| 类别 | 规则数 | 可自动修复 | 示例 |
|------|-------|:---------:|------|
| Token 合规 | 5 | 5 | 颜色/字体/圆角未绑定、硬编码 token、缺失文字样式 |
| WCAG 无障碍 | 5 | 3 | 对比度、点击区域、字号、行高、非文本对比度 |
| 布局结构 | 27 | 20 | 按钮/输入框结构、文本溢出、HUG/STRETCH 矛盾、screen shell 校验、nav/social 行拥挤、elevation 一致性/层级等 |
| 命名与内容 | 2 | 0 | 默认命名检查、占位文本检查 |
| 组件 | 1 | 0 | 组件属性绑定检查 |

**核心工具**:

- `verify_design` —— 单节点 / 整页 / 整文件审查,输出结构化违规报告
- `audit_node` —— 单节点深度体检(含健康评分)
- `lint_fix_all` —— 批量自动修复所有 `autoFixable: true` 的违规
- `get_design_guidelines` —— 读取规则详细说明(按类别)

**相关 skill**:[`design-review`](../skills/design-review/SKILL.md)、`design-lint`、`design-system-audit`、`component-docs`、`prototype-analysis`、`fixing-accessibility`

---

## 双模式:Library vs Spec

FigCraft 不绑定任何特定设计系统。通过 `set_mode` 工具在两种规范源之间切换:

| 模式 | Token 来源 | 检查方式 | 使用场景 |
|------|-----------|---------|---------|
| **Library** | Figma 共享库的 Variables/Styles | 检查节点是否绑定到库的 Variable/Style | 日常设计,已有团队共享库 |
| **Spec** | DTCG JSON 文件 | 检查节点值是否匹配 DTCG Token 值 | 规范驱动验证,从设计规范文档同步 |

无论哪种模式,Opinion Engine / Lint 规则 / 创建工具都一致工作 —— 只是 Token 的**权威来源**不同。

---

## 与官方 Figma MCP 的关系

Figma 官方也提供 MCP Server(Desktop 版和 Remote 版),两者**不是替代关系**,各有各的强项。FigCraft 在**本地插件架构**下做得更深,官方 MCP 在**云端可达性**和**FigJam 等生态功能**上更全。

**简化对比**(完整对比见 [figma-mcp-comparison.md](figma-mcp-comparison.md)):

| 能力 | FigCraft | 官方 Figma MCP |
|------|----------|---------------|
| **创建/写入**(变量、样式、组件) | ✅ Plugin API 完整,全套餐可用 | ⚠️ REST 限制,非 Enterprise 套餐写入受限 |
| **Opinion Engine**(尺寸推断、FILL 排序、Token 自动绑定、冲突检测) | ✅ FigCraft 独有 | ❌ |
| **零 Figma 套餐门槛** | ✅ Plugin API 所有套餐可用 | ⚠️ Dev Mode MCP 需要 Organization+ |
| **零 OAuth / API Token 配置** | ✅ 装插件即可 | ⚠️ 需要启用 Dev Mode 或 OAuth |
| **In-session 新鲜度**(写入后立刻读到) | ✅ 同一 MCP session | ❌ 写完需要重新 REST 拉取 |
| **FigJam / Code Connect publish / Dev Mode UI 关联** | ❌ 不支持 | ✅ 支持 |
| **远程 / 云端 Agent 无需本地 Figma 客户端** | ❌ 需要本地 Figma(桌面或 Web) | ✅ Remote MCP 支持云端 OAuth |

**一句话定位**:

> FigCraft 是**本地插件优先**的 Figma 工具包 —— 在创作、Opinion Engine、零配置、零套餐门槛上更强;但**不是**云端魔法方案,与官方 Desktop MCP 共享"需要本地 Figma 客户端"的限制。需要 FigJam 或纯云端 Agent 场景,官方 Remote MCP 是正确选择。

**推荐组合**:大多数用户单用 FigCraft 就够;需要 FigJam / Code Connect publish / Dev Mode UI 关联时,叠加官方 Figma MCP,两个 server 并行运行、互补。

---

## 快速上手(3 步)

> 前置:Node.js >= 20、Figma 桌面版(或 Figma Web 登录)、任一支持 MCP 的 AI IDE

### 1. 安装 FigCraft Figma 插件

```bash
git clone https://github.com/DivikWu/figcraft.git
cd figcraft
npm install
npm run build
```

在 Figma 桌面版:**Plugins → Development → Import plugin from manifest**,选择仓库根目录的 `manifest.json`。

### 2. 在 IDE 中添加 MCP Server

以 Claude Code 为例,在项目根目录创建 `.mcp.json`:

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "node",
      "args": ["dist/mcp-server/index.js"],
      "cwd": "/your/absolute/path/to/figcraft"
    }
  }
}
```

> Cursor 用 `.cursor/mcp.json`、Kiro 用 `.kiro/settings/mcp.json`、Codex 用 `~/.codex/config.toml` —— 配置内容相同,路径不同。完整列表见 [README.zh-CN.md](../README.zh-CN.md#2-在-ide-中添加-mcp-server)。

### 3. 连接并验证

- 在 Figma 里打开 FigCraft 插件,UI 会显示频道 ID 和连接状态
- 在 AI IDE 里让 AI 调用 `ping` 工具,返回文档名和页面信息即成功

**跑通后试试第一个任务**:

> "在当前 Figma 页面创建一个登录页,用我们共享库里的 Button 和 Input 组件,然后检查整页合规性并自动修复"

AI 会按序:`set_mode` → `search_design_system` 找组件 → `create_frame` 组装页面 → Harness 自动验证 → `lint_fix_all` 修复违规。

---

## 下一步读什么

- **完整操作手册** → [user-guide.md](user-guide.md) — 工具体系详解、环境变量、故障排查
- **设计审查深度指南** → [design-review.md](design-review.md) — 设计师视角的审查流程与规则注释
- **与官方 Figma MCP 详细对比** → [figma-mcp-comparison.md](figma-mcp-comparison.md) — 能力矩阵、重叠区、协同策略
- **架构与技术栈** → [../CLAUDE.md](../CLAUDE.md) — 三组件中继架构、MCP 工具系统、Plugin 处理器注册
- **产品定位与价值观** → [product-overview.md](product-overview.md) — 核心身份、差异化、设计哲学
- **路线图** → [roadmap.md](roadmap.md) — 近期迭代计划

## FAQ

**Q: 我是纯设计师,不写代码,能用吗?**
A: 可以。你只需要会用 AI IDE(如 Claude Code 桌面版),安装一次 MCP 配置后,用自然语言告诉 AI 做什么即可。不需要理解 MCP / WebSocket / Plugin API 这些底层概念。

**Q: 我们团队没有 Figma 共享库,能用 FigCraft 吗?**
A: 可以。Spec 模式支持 DTCG JSON 作为 Token 源;也可以完全无库用 `figma-create-ui` skill 直接创建(但会失去 Token 自动绑定能力)。

**Q: FigCraft 会修改我的 Figma 文件吗?**
A: 只在你明确要求时。所有创建/修改都经过 AI IDE 的权限确认,且 FigCraft 提供 `FIGCRAFT_ACCESS=read` 环境变量把工具集限制为只读。

**Q: 能跟 Cursor/Claude Code 之外的 IDE 一起用吗?**
A: 任何支持 MCP stdio 传输的 IDE 都可以,已验证的包括 Cursor、Claude Code、Kiro、Antigravity、Codex CLI。

**Q: 数据会发送到任何第三方吗?**
A: 不会。FigCraft 是本地架构 —— Plugin、WebSocket Relay、MCP Server 全部跑在你的机器上,与 Figma 的通信也只通过 Plugin API 在本地进程内完成。

---

*FigCraft 是开源项目,MIT 许可。Issues 和 PR 欢迎 → [github.com/DivikWu/figcraft](https://github.com/DivikWu/figcraft)*
