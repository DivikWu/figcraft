/**
 * 输入框工厂函数 — 创建统一配置的表单输入框
 * 
 * 解决的问题：多处输入框手写导致 padding、cornerRadius、layoutAlign 不一致，
 *            以及 lint 自动修复给 Field group 加了不必要的 padding
 * 
 * 用法：在 execute_js 脚本中嵌入此函数
 * 
 * 结构：
 *   Field Group (VERTICAL, STRETCH, 无 padding, 无 cornerRadius)
 *     ├── Label (TEXT)
 *     └── Input Frame (HORIZONTAL, STRETCH, 有 stroke/cornerRadius/padding)
 *           └── Placeholder (TEXT)
 * 
 * 关键点：
 *   - Field Group 不能有 padding 和 cornerRadius（否则 lint 修复会破坏布局）
 *   - Input Frame 必须 layoutAlign: "STRETCH"
 *   - Input Frame 使用 counterAxisSizingMode: "FIXED" 固定高度
 * 
 * 参数：
 *   parentFrame  - 父容器
 *   label        - 标签文本（如 "Email"）
 *   placeholder  - 占位符文本（如 "Enter your email"）
 *   config       - 可选配置（字体、颜色等）
 */

// === 嵌入到 execute_js 中使用 ===
//
// function createInput(parentFrame, label, placeholder, config = {}) {
//   const INPUT_DEFAULTS = {
//     fontLabel: FONT_MEDIUM,    // 需要在外部定义
//     fontPlaceholder: FONT,     // 需要在外部定义
//     colorLabel: COLORS.dark,   // 需要在外部定义
//     colorPlaceholder: COLORS.secondary,
//     colorBg: COLORS.bg,
//     colorBorder: COLORS.inputBorder,
//     height: 48,
//     cornerRadius: 12,
//     labelSize: 14,
//     placeholderSize: 14,
//     itemSpacing: 8
//   };
//
//   const cfg = { ...INPUT_DEFAULTS, ...config };
//
//   const group = figma.createFrame();
//   group.name = label + " Field";
//   group.layoutMode = "VERTICAL";
//   group.itemSpacing = cfg.itemSpacing;
//   group.fills = [];
//   group.layoutAlign = "STRETCH";
//   group.primaryAxisSizingMode = "AUTO";
//   group.counterAxisSizingMode = "AUTO";
//   // 关键：不设 padding 和 cornerRadius，避免 lint 修复破坏布局
//   parentFrame.appendChild(group);
//
//   const lbl = txt(label, cfg.fontLabel, cfg.labelSize, cfg.colorLabel, { name: "Label" });
//   group.appendChild(lbl);
//
//   const input = figma.createFrame();
//   input.name = label + " Input";
//   input.layoutMode = "HORIZONTAL";
//   input.primaryAxisAlignItems = "MIN";
//   input.counterAxisAlignItems = "CENTER";
//   input.fills = fill(cfg.colorBg);
//   input.strokes = fill(cfg.colorBorder);
//   input.strokeWeight = 1;
//   input.cornerRadius = cfg.cornerRadius;
//   input.paddingLeft = 16;
//   input.paddingRight = 16;
//   input.paddingTop = 0;
//   input.paddingBottom = 0;
//   input.layoutAlign = "STRETCH";
//   input.resize(354, cfg.height);
//   input.counterAxisSizingMode = "FIXED";
//   group.appendChild(input);
//
//   const ph = txt(placeholder, cfg.fontPlaceholder, cfg.placeholderSize, cfg.colorPlaceholder, { name: "Placeholder" });
//   input.appendChild(ph);
//
//   return group;
// }
