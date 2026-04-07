/**
 * Icon SVG handler — creates a vector node from SVG markup.
 * Used by the icon_create MCP tool (Iconify integration).
 * Supports color variable binding and hex fill for fill or stroke icons.
 */

import { simplifyNode } from '../adapters/node-simplifier.js';
import { registerHandler } from '../registry.js';
import { hexToFigmaRgb } from '../utils/color.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';

/**
 * Apply color to an icon node's vector children.
 * Supports both hex fill (direct color) and variable binding.
 * Detects whether the icon uses fill or stroke and applies accordingly.
 */
export async function applyIconColor(node: FrameNode, fill?: string, colorVariableName?: string): Promise<void> {
  const vectors = node.findAll((n) => n.type === 'VECTOR' || n.type === 'BOOLEAN_OPERATION') as SceneNode[];

  // Apply hex fill directly
  if (fill && !colorVariableName) {
    const rgb = hexToFigmaRgb(fill);
    for (const vec of vectors) {
      const hasFill =
        'fills' in vec &&
        Array.isArray(vec.fills) &&
        vec.fills.length > 0 &&
        vec.fills.some((f: Paint) => f.type === 'SOLID' && f.visible !== false);
      const hasStroke =
        'strokes' in vec &&
        Array.isArray(vec.strokes) &&
        vec.strokes.length > 0 &&
        vec.strokes.some((s: Paint) => s.type === 'SOLID' && s.visible !== false);

      if (hasFill && 'fills' in vec) {
        (vec as any).fills = [{ type: 'SOLID', color: rgb }];
      }
      if (hasStroke && 'strokes' in vec) {
        (vec as any).strokes = [{ type: 'SOLID', color: rgb }];
      }
    }
    return;
  }

  // Apply color variable binding
  if (colorVariableName) {
    const varName = colorVariableName;
    const colorVars = await figma.variables.getLocalVariablesAsync('COLOR');
    const variable =
      colorVars.find((v) => v.name === varName) ??
      colorVars.find((v) => v.name.toLowerCase() === varName.toLowerCase()) ??
      colorVars.find((v) => v.name.toLowerCase().endsWith(`/${varName.toLowerCase()}`));

    if (variable) {
      for (const vec of vectors) {
        const hasFill =
          'fills' in vec &&
          Array.isArray(vec.fills) &&
          vec.fills.length > 0 &&
          vec.fills.some((f: Paint) => f.type === 'SOLID' && f.visible !== false);
        const hasStroke =
          'strokes' in vec &&
          Array.isArray(vec.strokes) &&
          vec.strokes.length > 0 &&
          vec.strokes.some((s: Paint) => s.type === 'SOLID' && s.visible !== false);

        if (hasFill && 'fills' in vec) {
          const fills = [...((vec as any).fills as Paint[])];
          const solidIdx = fills.findIndex((f: Paint) => f.type === 'SOLID');
          if (solidIdx >= 0) {
            fills[solidIdx] = figma.variables.setBoundVariableForPaint(
              fills[solidIdx] as SolidPaint,
              'color',
              variable,
            );
            (vec as any).fills = fills;
          }
        }
        if (hasStroke && 'strokes' in vec) {
          const strokes = [...((vec as any).strokes as Paint[])];
          const solidIdx = strokes.findIndex((s: Paint) => s.type === 'SOLID');
          if (solidIdx >= 0) {
            strokes[solidIdx] = figma.variables.setBoundVariableForPaint(
              strokes[solidIdx] as SolidPaint,
              'color',
              variable,
            );
            (vec as any).strokes = strokes;
          }
        }
      }
    }
  }
}

export function registerIconSvgHandler(): void {
  registerHandler('create_icon_svg', async (params) => {
    const svg = params.svg as string;
    const name = (params.name as string) ?? 'Icon';

    // Create SVG node via Figma API
    const node = figma.createNodeFromSvg(svg);
    node.name = name;

    if (params.x != null) node.x = params.x as number;
    if (params.y != null) node.y = params.y as number;

    // Append to parent (with optional index for insertion position)
    if (params.parentId) {
      const parent = await findNodeByIdAsync(params.parentId as string);
      if (parent && 'appendChild' in parent) {
        const container = parent as FrameNode;
        if (params.index != null) {
          const idx = Math.min(Math.max(0, params.index as number), container.children.length);
          container.insertChild(idx, node);
        } else {
          container.appendChild(node);
        }
      }
    }

    // Apply color (hex fill or variable binding)
    await applyIconColor(node, params.fill as string | undefined, params.colorVariableName as string | undefined);

    return simplifyNode(node);
  });
}
