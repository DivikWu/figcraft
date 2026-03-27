---
inclusion: fileMatch
fileMatchPattern: "packages/adapter-figma/**,packages/core-mcp/src/tools/**,.kiro/steering/figma-*,.kiro/skills/figma-*"
description: "使用 FigCraft execute_js 构建/更新 Figma 设计的工作流指南"
---

# 使用 execute_js 构建/更新 Figma 设计

本指南将官方 `figma-generate-design` skill 的工作流适配到 FigCraft 的 `execute_js` 工具。
核心原则：复用设计系统中的组件、变量和样式，而不是用硬编码值画原始图形。

使用 `execute_js` 前必须先阅读 #[[file:.kiro/steering/execute-js-guide.md]]。

## 工作流

### 第 1 步：理解要构建的界面

1. 如果从代码构建，阅读相关源文件理解页面结构
2. 识别主要区块（Header、Hero、Content、Footer 等）
3. 列出每个区块涉及的 UI 组件

### 第 2 步：发现设计系统资产

#### 2a：发现组件

优先检查文件中已有的界面。用 `execute_js` 遍历现有 frame 的实例：

```js
const frame = figma.currentPage.findOne(n => n.name === "Existing Screen");
const uniqueSets = new Map();
frame.findAll(n => n.type === "INSTANCE").forEach(inst => {
  const mc = inst.mainComponent;
  const cs = mc?.parent?.type === "COMPONENT_SET" ? mc.parent : null;
  const key = cs ? cs.key : mc?.key;
  const name = cs ? cs.name : mc?.name;
  if (key && !uniqueSets.has(key)) {
    uniqueSets.set(key, { name, key, isSet: !!cs, sampleVariant: mc.name });
  }
});
return [...uniqueSets.values()];
```

如果文件中没有现有界面，用 FigCraft 的 `load_toolset("library")` → `list_library_components` 搜索库组件。

#### 2b：发现变量

检查现有界面绑定的变量：

```js
const frame = figma.currentPage.findOne(n => n.name === "Existing Screen");
const varMap = new Map();
for (const node of frame.findAll(() => true)) {
  const bv = node.boundVariables;
  if (!bv) continue;
  for (const [prop, binding] of Object.entries(bv)) {
    const bindings = Array.isArray(binding) ? binding : [binding];
    for (const b of bindings) {
      if (b?.id && !varMap.has(b.id)) {
        const v = await figma.variables.getVariableByIdAsync(b.id);
        if (v) varMap.set(b.id, { name: v.name, id: v.id, key: v.key, resolvedType: v.resolvedType });
      }
    }
  }
}
return [...varMap.values()];
```

也可以用 `load_toolset("library")` → `list_library_variables` 搜索库变量。

#### 2c：发现样式

用 FigCraft 的 `scan_styles` 或 `list_library_styles` 发现文本样式和效果样式。

### 第 3 步：创建页面包裹 Frame

用单独的 `execute_js` 调用创建包裹 frame，定位到远离现有内容的位置：

```js
let maxX = 0;
for (const child of figma.currentPage.children) {
  maxX = Math.max(maxX, child.x + child.width);
}
const wrapper = figma.createFrame();
wrapper.name = "Homepage";
wrapper.layoutMode = "VERTICAL";
wrapper.primaryAxisAlignItems = "CENTER";
wrapper.counterAxisAlignItems = "CENTER";
wrapper.resize(1440, 100);
wrapper.layoutSizingHorizontal = "FIXED";
wrapper.layoutSizingVertical = "HUG";
wrapper.x = maxX + 200;
wrapper.y = 0;
return { wrapperId: wrapper.id };
```

### 第 4 步：逐区块构建

每个区块一次 `execute_js` 调用。每次脚本开头通过 ID 获取 wrapper：

```js
const createdNodeIds = [];
const wrapper = await figma.getNodeByIdAsync("WRAPPER_ID");

// 导入设计系统组件
const buttonSet = await figma.importComponentSetByKeyAsync("BUTTON_KEY");
const primaryButton = buttonSet.children.find(c =>
  c.type === "COMPONENT" && c.name.includes("variant=primary")
) || buttonSet.defaultVariant;

// 导入变量
const bgColorVar = await figma.variables.importVariableByKeyAsync("BG_VAR_KEY");
const spacingVar = await figma.variables.importVariableByKeyAsync("SPACING_VAR_KEY");

// 构建区块
const section = figma.createFrame();
section.name = "Header";
section.layoutMode = "HORIZONTAL";
section.setBoundVariable("paddingLeft", spacingVar);
section.setBoundVariable("paddingRight", spacingVar);

// 绑定背景色变量
const bgPaint = figma.variables.setBoundVariableForPaint(
  { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', bgColorVar
);
section.fills = [bgPaint];

// 创建组件实例
const btnInstance = primaryButton.createInstance();
section.appendChild(btnInstance);
createdNodeIds.push(btnInstance.id);

// 添加到 wrapper
wrapper.appendChild(section);
section.layoutSizingHorizontal = "FILL"; // 必须在 appendChild 之后

createdNodeIds.push(section.id);
return { success: true, createdNodeIds };
```

每个区块完成后用 `get_screenshot` 验证再继续。

### 第 5 步：验证完整界面

所有区块完成后，对整个页面 frame 截图比对。用针对性的 `execute_js` 修复问题，不要重建整个界面。

## 关键原则

- 永远不要硬编码 hex 颜色或像素间距——用变量绑定
- 优先使用组件实例而非手动构建
- 每次只构建一个区块
- 每次调用都返回节点 ID
- 匹配文件中已有的命名和布局约定
