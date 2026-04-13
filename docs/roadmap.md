# FigCraft 产品路线图

## 已完成（v0.1.x — 当前）

- [x] 三组件中继架构（MCP Server + Relay + Plugin）
- [x] 双模式操作（Library / Spec / Local）
- [x] 116 个 MCP 工具（39 核心 + 13 工具集），5 个资源端点（42 个方法）
- [x] Opinion Engine Level 2（语义级推断 — role→defaults, SPACE_BETWEEN FILL, auto-role, `_applied` 透明度）
- [x] 声明驱动 lint 架构（role-aware 识别，5 条启发式规则统一接入）
- [x] 组件文本语义命名（title/description/detail/caption 自动分配）
- [x] 质量引擎（40 条 lint 规则 + 自动修复）
- [x] DTCG Token 同步（幂等、全类型映射）
- [x] 9 种 UI 类型模板 + 12 个创建指南 topic
- [x] 三层设计规则（fundamentals + guardian + creator）
- [x] 响应优化（紧凑 JSON + 渐进详情 + 结构化截断 + workflow diff）
- [x] 质量反馈闭环（lint_stats + _preflightAudit + 48 场景基准）
- [x] 多 IDE 支持（Claude Code / Cursor / Kiro / Antigravity / Codex）
- [x] readOnlyHint 注解 + 复合工具 (verify_design / get_batch)
- [x] Harness Pipeline — 6 阶段中间件（pre-guard → pre-transform → execute → post-enrich → error-recovery → session-update），18 条规则
- [x] P0 组件库优化（preflight_library_publish、self-correcting errors、batch bind、variant guardrail、get_design_context、get_code_connect_metadata）
- [x] GRID 布局支持（gridRowCount / gridColumnCount / gridRowGap / gridColumnGap）
- [x] 跨页安全守卫（阻止跨页 delete/clone/reparent/stage）
- [x] textOverrides — 创建 Instance 时一次性设置文本内容
- [x] batch_update — 变量批量修改（含 codeSyntax）
- [x] availableColorVariables — designContext 返回可用颜色变量
- [x] Local mode 对齐 — 本地组件发现 + 三分支 creationSteps
- [x] DesignSession 提取 + workflow builder 纯函数化
- [x] 29 个 Skills（+ux-writing）

## 短期（v0.2.x — 知识资产迭代）

通过实际 UI 创建转动价值飞轮：

- [ ] 从实际创建中提取新 lint 规则（如 missing-empty-state, web-responsive-missing）
- [ ] 基于 lint_stats 数据调整规则 severity 和 prevention checklist 优先级
- [ ] 补充 UI 模板的 keyDecisions（从实际违规中发现遗漏）
- [ ] 扩展基准测试场景（tablet、web、暗色模式变体）
- [ ] Opinion Engine 覆盖面扩展（新 role 值、新布局推断规则、新 auto-role 信号，按实际创建错误驱动）

## 中期（v0.3.x — 深度集成）

- [ ] 组件智能：从 Library 组件自动推断创建策略（Instance 优先于 Frame）
- [ ] 多屏联动：跨屏一致性检查（颜色、字体、间距）
- [ ] 原型自动化：基于屏幕流自动生成 Prototype 交互
- [ ] 设计系统健康度：Library Token 覆盖率 + 使用率报告
- [ ] Figma REST API 补充：离线模式下的 fallback（部分已实现）

## 长期（v1.0 — 设计质量平台）

- [ ] 设计评审工作流：AI 对设计稿进行结构化评审（已有 review-design prompt）
- [ ] 团队规范管理：DTCG Token 文件版本管理 + diff + merge
- [ ] 设计度量：长期质量趋势追踪（跨文件、跨项目）
- [ ] 插件市场发布：Figma Community Plugin
- [ ] 规则市场：社区贡献的 lint 规则包
