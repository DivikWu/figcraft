# 需求文档

## 简介

FigCraft 是一个 Figma 插件，作为 Figma 与 IDE 之间的 MCP 桥接工具。当前插件面板（`src/plugin/ui.html`）存在信息架构、视觉层级、无障碍、间距规范、交互反馈、错误处理、响应式布局和代码质量等多方面的 UX/UI 问题。本次改版旨在系统性地修复这些问题，提升面板的可用性、可访问性和视觉一致性。

## 术语表

- **Panel**: FigCraft 插件的 UI 面板，即 `src/plugin/ui.html` 渲染的完整界面
- **Header**: Panel 顶部的固定区域，包含频道输入和连接按钮
- **Library_Picker**: 组件库选择器，包含触发按钮和弹出下拉列表
- **Tab_Bar**: 标签栏，用于在不同功能面板之间切换
- **Activity_Tab**: 日志标签页，显示 MCP 命令的收发记录
- **Lint_Tab**: 检查标签页，运行设计规范检查并展示结果
- **Settings_Tab**: 设置标签页，包含模式切换、语言选择等配置项
- **Connect_Button**: 连接按钮，用于建立/断开与中继服务器的 WebSocket 连接
- **Mode_Indicator**: 模式指示器，在 Activity_Tab 中显示当前工作模式（Library/Spec）
- **Lint_Score_Circle**: Lint 评分圆圈，以颜色和数字展示检查得分
- **8dp_Grid**: 项目强制执行的 8dp 间距系统，所有尺寸属性必须为 2 的倍数（优先使用 4 的倍数）
- **WCAG_AA**: Web 内容无障碍指南 AA 级标准，要求普通文本对比度不低于 4.5:1
- **ARIA**: 无障碍富互联网应用规范，为辅助技术提供语义信息

## 需求

### 需求 1：信息架构重构 — Library_Picker 提升至全局位置

**用户故事：** 作为设计师，我希望 Library_Picker 位于 Header 区域与频道输入同级，以便在任何标签页下都能快速切换组件库，因为所有功能（Lint、Activity、MCP 操作）都依赖于当前选中的组件库。

#### 验收标准

1. THE Panel SHALL 在 Header 区域的频道栏下方显示 Library_Picker，使其在所有标签页中始终可见
2. WHEN 用户切换标签页时，THE Library_Picker SHALL 保持可见且状态不变
3. THE Tab_Bar SHALL 仅包含三个标签：Activity、Lint、Settings（移除原 Spec Setup 标签）
4. THE Settings_Tab SHALL 包含原 Spec Setup 标签中的 Mode 切换和 API Token 配置项
5. WHEN 当前模式为 Spec 模式时，THE Library_Picker SHALL 隐藏，因为 Spec 模式不依赖组件库选择

### 需求 2：视觉层级修正 — 中性色优先策略

**用户故事：** 作为设计师，我希望界面的视觉权重与操作频率匹配，以便核心操作（如 Run Lint）获得最高视觉优先级，而一次性操作（如 Connect）不会过度吸引注意力。

#### 验收标准

1. WHILE 处于未连接状态时，THE Connect_Button SHALL 使用中性边框样式（透明背景 + 边框），而非实心蓝色填充
2. WHILE 处于未连接状态时，THE Connect_Button SHALL 在按钮内显示一个小型彩色状态圆点以指示连接状态
3. WHILE 处于已连接状态时，THE Connect_Button SHALL 使用中性边框样式并显示绿色状态圆点
4. THE Mode_Indicator SHALL 使用灰色纯文本或低对比度标签样式，而非蓝色强调背景
5. THE Lint_Tab 中的 "Run Lint" 按钮 SHALL 保持主要操作样式（实心强调色填充），作为该标签页的核心操作

### 需求 3：文本对比度 WCAG AA 合规

**用户故事：** 作为设计师，我希望面板中所有文本都满足 WCAG AA 对比度标准，以便在各种环境下都能清晰阅读。

#### 验收标准

1. THE Panel 的浅色主题 SHALL 将 `--text-secondary` 的对比度提升至不低于 4.5:1（相对于 `--bg: #ffffff`）
2. THE Panel 的浅色主题 SHALL 将 `--text-tertiary` 的对比度提升至不低于 4.5:1（相对于 `--bg: #ffffff`）
3. THE Panel 的深色主题 SHALL 将 `--text-tertiary` 的对比度提升至不低于 4.5:1（相对于 `--bg: #2c2c2c`）
4. THE Lint_Score_Circle 在 warn 状态下 SHALL 确保前景文本与 `--warning` 背景色的对比度不低于 4.5:1
5. THE Panel 的深色主题 SHALL 将 `--text-secondary` 的对比度提升至不低于 4.5:1（相对于 `--bg: #2c2c2c`）

### 需求 4：8dp_Grid 间距合规

**用户故事：** 作为开发者，我希望面板的所有间距值都符合项目的 8dp_Grid 规范（`.kiro/steering/ui-spacing.md`），以便保持视觉一致性并遵守团队约定。

#### 验收标准

1. THE `.setting-desc` 样式 SHALL 将 `margin-top: -2px` 替换为符合 8dp_Grid 的非负值
2. THE `.log-entry` 样式 SHALL 将 `padding: 1px 0` 和 `margin-bottom: 1px` 替换为 2 的倍数值
3. THE `.library-popup` 样式 SHALL 将 `gap: 1px` 替换为 2 的倍数值
4. THE `.library-popup-add-row .input` 样式 SHALL 将 `height: 28px` 调整为 24px 或 32px
5. THE `.library-popup-add-btn` 样式 SHALL 将 `height: 28px` 和 `width: 28px` 调整为 24px 或 32px

### 需求 5：交互反馈一致性

**用户故事：** 作为设计师，我希望面板中所有操作都有一致且充分的视觉反馈，以便我能清楚地了解操作状态和结果。

#### 验收标准

1. THE Token 保存反馈 SHALL 包含平滑的过渡动画（淡入/淡出），且持续时间不少于 1.5 秒
2. WHEN 用户点击 "Run Lint" 按钮时，THE Lint_Tab SHALL 显示与 Library 添加按钮一致的加载旋转动画（spinner）
3. WHILE "Auto Fix" 按钮处于禁用状态时，THE "Auto Fix" 按钮 SHALL 通过 `title` 属性提供禁用原因的提示文本
4. WHEN 用户在未连接状态下点击 "Run Lint" 按钮时，THE Lint_Tab SHALL 在 Lint 面板内显示可见的错误提示信息


### 需求 6：错误处理优化

**用户故事：** 作为设计师，我希望错误信息清晰易懂且提供可操作的指引，以便我能自行解决问题而无需查阅技术文档。

#### 验收标准

1. THE Library_Picker 中的 URL 错误信息 SHALL 在 5 秒后自动消失
2. WHEN 所有中继端口不可用时，THE Panel SHALL 显示用户友好的错误信息（如"无法连接到中继服务，请确认 IDE 已启动 FigCraft"），而非技术性消息 "All relay ports unavailable"
3. WHEN 连接失败时，THE Panel SHALL 在错误信息中提供至少一条可操作的排查建议

### 需求 7：窄面板响应式布局

**用户故事：** 作为设计师，我希望面板在 Figma 的窄宽度（约 300px）下仍能正常显示，以便我在小屏幕或侧边栏模式下使用插件。

#### 验收标准

1. THE `.lint-score-top` 布局 SHALL 在面板宽度不足时自动换行（从水平排列切换为垂直排列），避免内容被挤压
2. THE `.conn-info` 网格 SHALL 使用自适应列宽（如 `auto`），而非硬编码的 `80px`，以适配中文等较长标签文本
3. THE Tab_Bar SHALL 在标签数量导致溢出时提供水平滚动能力（`overflow-x: auto`），或通过缩减间距避免溢出

### 需求 8：无障碍（A11y）合规

**用户故事：** 作为使用辅助技术的用户，我希望面板的所有交互元素都具备正确的语义标记，以便屏幕阅读器和键盘导航能正常工作。

#### 验收标准

1. THE Tab_Bar SHALL 使用 `role="tablist"` 标记，每个标签按钮 SHALL 使用 `role="tab"`，每个标签面板 SHALL 使用 `role="tabpanel"`
2. THE Tab_Bar 中的活动标签 SHALL 设置 `aria-selected="true"`，非活动标签 SHALL 设置 `aria-selected="false"`
3. THE 每个 `role="tab"` 元素 SHALL 通过 `aria-controls` 关联对应的 `role="tabpanel"` 元素，每个 `role="tabpanel"` 元素 SHALL 通过 `aria-labelledby` 关联对应的 `role="tab"` 元素
4. THE Library_Picker 弹出列表 SHALL 支持键盘导航：上下箭头键移动焦点、Enter 键选择、Escape 键关闭
5. THE 状态圆点（status dot）SHALL 在颜色指示之外提供文本替代方案（如 `aria-label` 或相邻的屏幕阅读器专用文本），以支持色觉障碍用户
6. THE Panel 中所有 `<button>` 元素 SHALL 显式设置 `type="button"` 属性

### 需求 9：代码质量改善（影响 UX 的部分）

**用户故事：** 作为开发者，我希望修复影响用户体验的代码质量问题，以便消除主题闪烁、变量作用域泄漏和国际化同步等潜在 bug。

#### 验收标准

1. THE 主题检测逻辑 SHALL 使用防抖机制（debounce），避免 MutationObserver 触发时的主题闪烁
2. THE Panel 的 JavaScript 代码 SHALL 将所有 `var` 声明替换为 `let` 或 `const`（根据变量是否被重新赋值选择）
3. WHEN 用户清除日志后切换语言时，THE 空状态文本 SHALL 正确更新为新语言的翻译文本
