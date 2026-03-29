/**
 * 按钮工厂函数 — 创建统一配置的按钮
 * 
 * 解决的问题：主按钮和次按钮的高度、圆角、对齐方式不一致
 * 
 * 用法：在 execute_js 脚本中嵌入此函数
 * 
 * 支持两种样式：
 *   - "primary"：实心填充背景 + 白色文字
 *   - "outline"：白色背景 + 边框 + 主色文字
 * 
 * 参数：
 *   parentFrame  - 父容器
 *   label        - 按钮文本
 *   style        - "primary" | "outline"
 *   config       - 可选配置覆盖
 */

// === 嵌入到 execute_js 中使用 ===
//
// function createButton(parentFrame, label, style = "primary", config = {}) {
//   const BTN_DEFAULTS = {
//     height: 48,
//     cornerRadius: 12,
//     fontSize: 16,
//     font: FONT_SEMI,           // 需要在外部定义
//     colorPrimary: COLORS.primary,
//     colorWhite: COLORS.white,
//     colorBorder: COLORS.primary
//   };
//
//   const cfg = { ...BTN_DEFAULTS, ...config };
//
//   const btn = figma.createFrame();
//   btn.name = label + " Button";
//   btn.layoutMode = "HORIZONTAL";
//   btn.primaryAxisAlignItems = "CENTER";
//   btn.counterAxisAlignItems = "CENTER";
//   btn.cornerRadius = cfg.cornerRadius;
//   btn.layoutAlign = "STRETCH";
//   btn.resize(354, cfg.height);
//   btn.counterAxisSizingMode = "FIXED";
//
//   if (style === "primary") {
//     btn.fills = fill(cfg.colorPrimary);
//     const btnText = txt(label, cfg.font, cfg.fontSize, cfg.colorWhite, { name: "Label" });
//     btn.appendChild(btnText);
//   } else if (style === "outline") {
//     btn.fills = fill(cfg.colorWhite);
//     btn.strokes = fill(cfg.colorBorder);
//     btn.strokeWeight = 1.5;
//     const btnText = txt(label, cfg.font, cfg.fontSize, cfg.colorPrimary, { name: "Label" });
//     btn.appendChild(btnText);
//   }
//
//   parentFrame.appendChild(btn);
//   return btn;
// }
