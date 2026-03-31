/**
 * Icon SVG handler — creates a vector node from SVG markup.
 * Used by the icon_create MCP tool (Iconify integration).
 * Supports color variable binding for fill or stroke icons.
 */

import { registerHandler } from '../registry.js';
import { simplifyNode } from '../adapters/node-simplifier.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';

export function registerIconSvgHandler(): void {
  registerHandler('create_icon_svg', async (params) => {
    const svg = params.svg as string;
    const name = (params.name as string) ?? 'Icon';

    // Create SVG node via Figma API
    const node = figma.createNodeFromSvg(svg);
    node.name = name;

    if (params.x != null) node.x = params.x as number;
    if (params.y != null) node.y = params.y as number;

    // Append to parent
    if (params.parentId) {
      const parent = await findNodeByIdAsync(params.parentId as string);
      if (parent && 'appendChild' in parent) {
        (parent as FrameNode).appendChild(node);
      }
    }

    // Color variable binding — detect fill vs stroke icon
    if (params.colorVariableName) {
      const varName = params.colorVariableName as string;
      const colorVars = await figma.variables.getLocalVariablesAsync('COLOR');
      const variable = colorVars.find(v => v.name === varName)
        ?? colorVars.find(v => v.name.toLowerCase() === varName.toLowerCase())
        ?? colorVars.find(v => v.name.toLowerCase().endsWith('/' + varName.toLowerCase()));

      if (variable) {
        // Walk all vector children and bind color
        const vectors = node.findAll(n => n.type === 'VECTOR' || n.type === 'BOOLEAN_OPERATION') as SceneNode[];
        for (const vec of vectors) {
          // Detect if icon uses fill or stroke
          const hasFill = 'fills' in vec && Array.isArray(vec.fills) && vec.fills.length > 0
            && vec.fills.some((f: Paint) => f.type === 'SOLID' && f.visible !== false);
          const hasStroke = 'strokes' in vec && Array.isArray(vec.strokes) && vec.strokes.length > 0
            && vec.strokes.some((s: Paint) => s.type === 'SOLID' && s.visible !== false);

          if (hasFill && 'fills' in vec) {
            const fills = [...(vec as any).fills as Paint[]];
            const solidIdx = fills.findIndex((f: Paint) => f.type === 'SOLID');
            if (solidIdx >= 0) {
              fills[solidIdx] = figma.variables.setBoundVariableForPaint(
                fills[solidIdx] as SolidPaint, 'color', variable,
              );
              (vec as any).fills = fills;
            }
          }
          if (hasStroke && 'strokes' in vec) {
            const strokes = [...(vec as any).strokes as Paint[]];
            const solidIdx = strokes.findIndex((s: Paint) => s.type === 'SOLID');
            if (solidIdx >= 0) {
              strokes[solidIdx] = figma.variables.setBoundVariableForPaint(
                strokes[solidIdx] as SolidPaint, 'color', variable,
              );
              (vec as any).strokes = strokes;
            }
          }
        }
      }
    }

    return simplifyNode(node);
  });
}
