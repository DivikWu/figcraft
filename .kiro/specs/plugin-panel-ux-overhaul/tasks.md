# 实施计划：Plugin Panel UX 改版

## 概述

对 `src/plugin/ui.html` 进行系统性 UX/UI 改版，涵盖信息架构重构、视觉层级修正、WCAG AA 合规、8dp 间距修正、交互反馈、错误处理、响应式布局、无障碍标记和代码质量改善。所有变更集中在单一文件中，需同时支持浅色/深色主题和 EN/中文两种语言。

## Tasks

- [x] 1. CSS Token 与间距修正
  - [x] 1.1 修正浅色主题颜色 Token 以满足 WCAG AA 对比度
    - 将 `--text-secondary` 从 `#888888` 改为 `#595959`（7.05:1 vs #ffffff）
    - 将 `--text-tertiary` 从 `#aaaaaa` 改为 `#767676`（4.54:1 vs #ffffff）
    - _需求: 3.1, 3.2_

  - [x] 1.2 修正深色主题颜色 Token 以满足 WCAG AA 对比度
    - 将 `--text-secondary` 从 `#999999` 改为 `#a3a3a3`（5.09:1 vs #2c2c2c）
    - 将 `--text-tertiary` 从 `#777777` 改为 `#8b8b8b`（4.52:1 vs #2c2c2c）
    - 同时修正 `@media (prefers-color-scheme: dark)` 和 `:root[data-theme="dark"]` 两处
    - _需求: 3.3, 3.5_

  - [x] 1.3 修正 Lint Score Circle warn 状态文本对比度
    - `.lint-score-circle.warn` 的 `color` 从 `var(--text-primary)` 改为 `#1a1a00`（≈12.5:1 vs #ffcd29）
    - _需求: 3.4_

  - [x] 1.4 修正所有不符合 8dp Grid 的间距值
    - `.setting-desc` 的 `margin-top: -2px` → `margin-top: 0`
    - `.log-entry` 的 `padding: 1px 0` → `padding: 2px 0`，`margin-bottom: 1px` → `margin-bottom: 2px`
    - `.library-popup` 的 `gap: 1px` → `gap: 2px`
    - `.library-popup-add-row .input` 的 `height: 28px` → `height: 32px`
    - `.library-popup-add-btn` 的 `height: 28px; width: 28px` → `height: 32px; width: 32px`
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 1.5 修正 Mode Indicator 为低视觉权重样式
    - `color` 从 `var(--accent)` 改为 `var(--text-secondary)`
    - `background` 从 `var(--accent-bg)` 改为 `var(--surface)`
    - `font-weight` 从 `600` 改为 `500`
    - _需求: 2.4_

  - [x] 1.6 修正 Connect Button 样式为中性边框风格
    - `.status-btn.disconnected`：移除实心蓝色填充，改为透明背景 + 边框 + 红色状态圆点
    - `.status-btn.disconnected .status-dot`：从 `display: none` 改为显示红色圆点
    - `.status-btn.connected`：保持中性边框 + 绿色圆点（已基本正确，微调即可）
    - `.status-btn.connecting`：保持中性边框 + 黄色脉冲圆点
    - _需求: 2.1, 2.2, 2.3_

  - [ ]* 1.7 编写 CSS Token 对比度的属性测试
    - **Property 1: 所有 text token 与对应背景色的对比度 ≥ 4.5:1**
    - **验证: 需求 3.1, 3.2, 3.3, 3.4, 3.5**

- [x] 2. 检查点 — 确认 CSS 修正完成
  - 确保所有样式修改正确，请用户确认视觉效果。如有问题请提出。

- [x] 3. 信息架构重构 — HTML 结构调整
  - [x] 3.1 将 Library Picker 从 Spec Setup 标签移至 Header 区域
    - 在 `.channel-bar` 下方新增 Library Picker 容器（含 `library-trigger`、`library-popup-overlay`、`library-popup`）
    - 从原 `data-tab-content="spec"` 面板中移除 Library Picker 相关 HTML
    - 为 Library Picker 容器添加 `id="library-bar"`，Spec 模式下通过 JS 隐藏
    - _需求: 1.1, 1.2, 1.5_

  - [x] 3.2 合并标签页：4 个标签 → 3 个标签
    - Tab Bar 仅保留 Activity、Lint、Settings 三个按钮
    - 移除 `data-tab="spec"` 和 `data-tab="guide"` 的标签按钮
    - 新增 `data-tab="settings"` 标签按钮
    - 将原 Spec Setup 面板中的 Mode 切换和 API Token 配置移入新 Settings 面板
    - 将原 Settings 面板中的语言选择、Quick Start、MCP Config、Connection Info 移入新 Settings 面板
    - 移除原 `data-tab-content="spec"` 和 `data-tab-content="guide"` 面板
    - 新增 `data-tab-content="settings"` 面板，包含上述所有内容
    - _需求: 1.3, 1.4_

  - [x] 3.3 为 Tab Bar 和 Tab Pane 添加 ARIA 标记
    - Tab Bar 添加 `role="tablist"`
    - 每个标签按钮添加 `role="tab"`、`id="tab-{name}"`、`aria-controls="panel-{name}"`、`aria-selected`、`type="button"`
    - 每个标签面板添加 `role="tabpanel"`、`id="panel-{name}"`、`aria-labelledby="tab-{name}"`
    - _需求: 8.1, 8.2, 8.3_

  - [x] 3.4 为所有 `<button>` 元素添加 `type="button"` 属性
    - 扫描所有 `<button>` 标签，确保显式设置 `type="button"`
    - _需求: 8.6_

  - [x] 3.5 为 Connect Button 状态圆点添加无障碍文本替代
    - 为 `.status-dot` 添加 `aria-label` 或相邻的 `sr-only` 文本，描述当前连接状态
    - 添加 `.sr-only` CSS 类（视觉隐藏但屏幕阅读器可读）
    - _需求: 8.5_

- [x] 4. 检查点 — 确认 HTML 结构重构完成
  - 确保标签切换、Library Picker 全局可见性、ARIA 标记均正常工作。如有问题请提出。

- [x] 5. JavaScript 逻辑更新
  - [x] 5.1 更新标签切换逻辑以适配新结构
    - 更新 Tab Switching 事件监听器，适配新的 3 标签结构
    - 更新 `aria-selected` 属性的切换逻辑
    - 确保 Library Picker 在 Spec 模式下隐藏（`updateModeUI` 中控制 `#library-bar` 的显隐）
    - _需求: 1.2, 1.5, 8.2_

  - [x] 5.2 实现 Library Picker 键盘导航
    - 上下箭头键在弹出列表项之间移动焦点
    - Enter 键选择当前焦点项
    - Escape 键关闭弹出列表
    - _需求: 8.4_

  - [x] 5.3 将所有 `var` 声明替换为 `let` 或 `const`
    - 不可重赋值的变量使用 `const`（如 DOM 元素引用、常量）
    - 可重赋值的变量使用 `let`（如 `channelId`、`ws`、`connected`、`currentMode` 等）
    - _需求: 9.2_

  - [x] 5.4 为主题检测添加 debounce 机制
    - 将 `MutationObserver` 的 `detectTheme` 回调包裹 150ms debounce
    - 避免连续触发导致主题闪烁
    - _需求: 9.1_

  - [x] 5.5 修复清除日志后切换语言时空状态文本不更新的问题
    - 在 `logClearBtn` 事件中重建空状态元素后调用 `applyLocale()` 或直接使用 `t()` 设置文本
    - 确保重建的元素包含 `data-i18n` 属性以支持后续语言切换
    - _需求: 9.3_

- [x] 6. 交互反馈与错误处理
  - [x] 6.1 改进 Token 保存反馈动画
    - `flashSaved` 函数添加 CSS `transition` 淡入/淡出效果
    - 持续时间从 1200ms 调整为 ≥1500ms
    - _需求: 5.1_

  - [x] 6.2 为 Run Lint 按钮添加 spinner 加载动画
    - 点击后按钮显示与 `.library-popup-add-btn.loading` 一致的旋转动画
    - 复用 `@keyframes spin` 和 `::after` 伪元素方案
    - _需求: 5.2_

  - [x] 6.3 为禁用状态的 Auto Fix 按钮添加 `title` 提示
    - 未连接时：`title` 显示 "请先连接中继服务" / "Connect to relay first"
    - 无可修复项时：`title` 显示 "没有可自动修复的违规项" / "No fixable violations found"
    - _需求: 5.3_

  - [x] 6.4 实现未连接状态下 Run Lint 的面板内错误提示
    - 替代当前仅在日志中输出 "Not connected" 的行为
    - 在 Lint 面板内显示可见的错误提示信息
    - _需求: 5.4_

  - [x] 6.5 Library URL 错误信息 5 秒后自动消失
    - 在 `showPopupError` 中添加 `setTimeout` 5 秒后调用 `clearPopupError`
    - _需求: 6.1_

  - [x] 6.6 优化连接失败错误信息
    - 所有端口不可用时显示用户友好消息，替代 "All relay ports unavailable"
    - 连接失败时提供可操作的排查建议
    - 使用 i18n 键 `error.relay.unavailable` 和 `error.relay.suggestion`
    - _需求: 6.2, 6.3_

  - [x] 6.7 新增 i18n 翻译键
    - 添加 `error.relay.unavailable`、`error.relay.suggestion`、`error.notconnected.lint`、`lint.autofix.disabled.noviolations`、`lint.autofix.disabled.notconnected` 到 EN 和中文翻译表
    - _需求: 6.2, 6.3, 5.3, 5.4_

- [x] 7. 检查点 — 确认交互反馈和错误处理
  - 确保所有交互反馈和错误提示正常工作。如有问题请提出。

- [x] 8. 响应式布局修正
  - [x] 8.1 Lint Score 区域窄面板自适应
    - `.lint-score-top` 添加 `flex-wrap: wrap` 使其在窄面板下自动换行
    - _需求: 7.1_

  - [x] 8.2 Connection Info 网格自适应列宽
    - `.conn-info` 的 `grid-template-columns` 从 `80px 1fr` 改为 `auto 1fr`
    - _需求: 7.2_

  - [x] 8.3 Tab Bar 溢出处理
    - `.tab-bar` 添加 `overflow-x: auto` 和 `white-space: nowrap`，或缩减 `gap` 避免溢出
    - _需求: 7.3_

- [x] 9. 最终检查点 — 全面验证
  - 确保所有修改正确，标签切换、Library Picker、Lint 面板、连接流程、主题切换、语言切换均正常工作。如有问题请提出。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加快 MVP 进度
- 每个任务引用了具体的需求编号以确保可追溯性
- 检查点用于增量验证，确保每个阶段的修改正确
- 所有变更集中在 `src/plugin/ui.html` 单一文件中
