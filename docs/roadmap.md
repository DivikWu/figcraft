# FigCraft 产品路线图

## 已完成（v0.1.x — 当前）

- [x] 三组件中继架构（MCP Server + Relay + Plugin）
- [x] 双模式操作（Library / Spec）
- [x] 136 个 MCP 工具（31 核心 + 13 工具集）
- [x] Opinion Engine（10 条推断规则）
- [x] 质量引擎（38 条 lint 规则 + 自动修复）
- [x] DTCG Token 同步（幂等、全类型映射）
- [x] 9 种 UI 类型模板 + 8 个创建指南 topic
- [x] 三层设计规则（fundamentals + guardian + creator）
- [x] 响应优化（紧凑 JSON + 渐进详情 + 结构化截断 + workflow diff）
- [x] 质量反馈闭环（lint_stats + _preflightAudit + 48 场景基准）
- [x] 多 IDE 支持（Claude Code / Cursor / Kiro / Antigravity / Codex）
- [x] readOnlyHint 注解 + 复合工具 (verify_design / get_batch)

## 短期（v0.2.x — 知识资产迭代）

通过实际 UI 创建转动价值飞轮：

- [ ] 从实际创建中提取新 lint 规则（如 missing-empty-state, web-responsive-missing）
- [ ] 基于 lint_stats 数据调整规则 severity 和 prevention checklist 优先级
- [ ] 补充 UI 模板的 keyDecisions（从实际违规中发现遗漏）
- [ ] 扩展基准测试场景（tablet、web、暗色模式变体）
- [ ] Opinion Engine 新增推断（从重复的创建模式中提炼）

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
