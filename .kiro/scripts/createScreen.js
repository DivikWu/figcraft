/**
 * 屏幕工厂函数 — 创建统一配置的移动端屏幕 Frame
 * 
 * 解决的问题：多屏创建时逐屏手写导致 counterAxisAlignItems、padding 等属性不一致
 * 
 * 用法：在 execute_js 脚本中嵌入此函数，所有屏幕通过调用同一个函数创建
 * 
 * 参数：
 *   wrapper  - 父容器 Frame（Flow Row）
 *   name     - 屏幕名称（如 "Login"、"Sign Up"）
 *   config   - 可选配置覆盖（用于 Welcome 等特殊屏幕）
 * 
 * 默认配置（iOS 402×874）：
 *   - counterAxisAlignItems: "MIN"（左对齐）
 *   - primaryAxisAlignItems: "MIN"（顶部对齐）
 *   - padding: 80/48/24/24（上/下/左/右）
 *   - itemSpacing: 0
 *   - 白色背景
 *   - 固定高度
 * 
 * 示例：
 *   const login = createScreen(wrapper, "Login");
 *   const signUp = createScreen(wrapper, "Sign Up");
 *   const welcome = createScreen(wrapper, "Welcome", {
 *     counterAxisAlignItems: "CENTER",
 *     primaryAxisAlignItems: "CENTER",
 *     paddingTop: 0
 *   });
 */

// === 嵌入到 execute_js 中使用 ===
// 
// function createScreen(wrapper, name, config = {}) {
//   const SCREEN_DEFAULTS = {
//     width: 402,
//     height: 874,
//     layoutMode: "VERTICAL",
//     primaryAxisAlignItems: "MIN",
//     counterAxisAlignItems: "MIN",
//     paddingTop: 80,
//     paddingBottom: 48,
//     paddingLeft: 24,
//     paddingRight: 24,
//     itemSpacing: 0,
//     bgColor: { r: 1, g: 1, b: 1 }
//   };
//   
//   const cfg = { ...SCREEN_DEFAULTS, ...config };
//   
//   const s = figma.createFrame();
//   s.name = name;
//   s.resize(cfg.width, cfg.height);
//   s.layoutMode = cfg.layoutMode;
//   s.primaryAxisSizingMode = "FIXED";
//   s.primaryAxisAlignItems = cfg.primaryAxisAlignItems;
//   s.counterAxisAlignItems = cfg.counterAxisAlignItems;
//   s.fills = [{ type: 'SOLID', color: cfg.bgColor }];
//   s.paddingTop = cfg.paddingTop;
//   s.paddingBottom = cfg.paddingBottom;
//   s.paddingLeft = cfg.paddingLeft;
//   s.paddingRight = cfg.paddingRight;
//   s.itemSpacing = cfg.itemSpacing;
//   wrapper.appendChild(s);
//   return s;
// }
