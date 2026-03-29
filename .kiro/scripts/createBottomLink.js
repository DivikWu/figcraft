/**
 * 底部链接区域工厂函数 — 创建统一的底部辅助链接
 * 
 * 解决的问题：底部链接区域的 layoutGrow、primaryAxisAlignItems 等属性不一致
 * 
 * 用法：在 execute_js 脚本中嵌入此函数
 * 
 * 结构：
 *   Bottom Link Area (VERTICAL, STRETCH, layoutGrow=1, primaryAxisAlignItems="MAX")
 *     └── Link Row (HORIZONTAL, itemSpacing=4)
 *           ├── Text (普通文字)
 *           └── Link (链接文字，主色)
 * 
 * 参数：
 *   parentScreen  - 父屏幕 Frame
 *   text          - 普通文字（如 "Don't have an account?"）
 *   linkText      - 链接文字（如 "Sign Up"）
 *   config        - 可选配置
 */

// === 嵌入到 execute_js 中使用 ===
//
// function createBottomLink(parentScreen, text, linkText, config = {}) {
//   const LINK_DEFAULTS = {
//     fontText: FONT,            // 需要在外部定义
//     fontLink: FONT_SEMI,       // 需要在外部定义
//     colorText: COLORS.secondary,
//     colorLink: COLORS.primary,
//     fontSize: 14
//   };
//
//   const cfg = { ...LINK_DEFAULTS, ...config };
//
//   const bottomArea = figma.createFrame();
//   bottomArea.name = "Bottom Link Area";
//   bottomArea.layoutMode = "VERTICAL";
//   bottomArea.primaryAxisAlignItems = "MAX";
//   bottomArea.counterAxisAlignItems = "CENTER";
//   bottomArea.fills = [];
//   bottomArea.layoutAlign = "STRETCH";
//   bottomArea.layoutGrow = 1;
//   parentScreen.appendChild(bottomArea);
//
//   const bottomRow = figma.createFrame();
//   bottomRow.name = linkText + " Link Row";
//   bottomRow.layoutMode = "HORIZONTAL";
//   bottomRow.itemSpacing = 4;
//   bottomRow.fills = [];
//   bottomRow.primaryAxisSizingMode = "AUTO";
//   bottomRow.counterAxisSizingMode = "AUTO";
//   bottomArea.appendChild(bottomRow);
//
//   const textNode = txt(text, cfg.fontText, cfg.fontSize, cfg.colorText, { name: "Text" });
//   bottomRow.appendChild(textNode);
//   const linkNode = txt(linkText, cfg.fontLink, cfg.fontSize, cfg.colorLink, { name: linkText + " Link" });
//   bottomRow.appendChild(linkNode);
//
//   return bottomArea;
// }
