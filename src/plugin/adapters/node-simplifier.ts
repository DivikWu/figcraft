/**
 * Node simplifier — Framelink-style ~90% compression.
 *
 * Strips Figma node data to only layout + style + token binding essentials.
 */

import type { CompressedNode } from '../../shared/types.js';
import { figmaRgbaToHex } from '../utils/color.js';

/** Maximum tree depth to prevent excessive payloads. */
const MAX_DEPTH = 10;

/** Simplify a Figma node tree into compressed JSON. */
export function simplifyNode(node: SceneNode, depth = 0): CompressedNode {
  const base: CompressedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    x: 'x' in node ? node.x : 0,
    y: 'y' in node ? node.y : 0,
    width: 'width' in node ? node.width : 0,
    height: 'height' in node ? node.height : 0,
    visible: node.visible,
  };

  // Fills & strokes
  if ('fills' in node && node.fills !== figma.mixed) {
    const fills = node.fills as readonly Paint[];
    if (fills.length > 0) {
      base.fills = fills.map(simplifyPaint);
    }
  }
  if ('strokes' in node && (node as GeometryMixin).strokes.length > 0) {
    base.strokes = (node as GeometryMixin).strokes.map(simplifyPaint);
  }

  // Effects
  if ('effects' in node) {
    const effects = (node as BlendMixin).effects;
    if (effects.length > 0) {
      base.effects = effects.map(simplifyEffect);
    }
  }

  // Corner radius
  if ('cornerRadius' in node) {
    const rn = node as RectangleCornerMixin & { cornerRadius: number | typeof figma.mixed };
    if (rn.cornerRadius !== figma.mixed) {
      base.cornerRadius = rn.cornerRadius;
    } else {
      base.cornerRadius = [
        rn.topLeftRadius,
        rn.topRightRadius,
        rn.bottomRightRadius,
        rn.bottomLeftRadius,
      ];
    }
  }

  // Opacity
  if ('opacity' in node) {
    const op = (node as BlendMixin).opacity;
    if (op !== 1) {
      base.opacity = op;
    }
  }

  // Auto layout
  if ('layoutMode' in node) {
    const frame = node as FrameNode;
    if (frame.layoutMode !== 'NONE') {
      base.layoutMode = frame.layoutMode;
      base.itemSpacing = frame.itemSpacing;
      base.paddingLeft = frame.paddingLeft;
      base.paddingRight = frame.paddingRight;
      base.paddingTop = frame.paddingTop;
      base.paddingBottom = frame.paddingBottom;
    }
  }

  // Layout positioning (for children of auto-layout frames)
  if ('layoutPositioning' in node) {
    const positioned = node as SceneNode & { layoutPositioning: string };
    if (positioned.layoutPositioning === 'ABSOLUTE') {
      base.layoutPositioning = 'ABSOLUTE';
    }
  }

  // Text
  if (node.type === 'TEXT') {
    const text = node as TextNode;
    base.characters = text.characters;
    if (text.fontSize !== figma.mixed) {
      base.fontSize = text.fontSize;
    }
    if (text.fontName !== figma.mixed) {
      base.fontName = text.fontName;
    }
    if (text.lineHeight !== figma.mixed) {
      base.lineHeight = text.lineHeight;
    }
    if (text.letterSpacing !== figma.mixed) {
      base.letterSpacing = text.letterSpacing;
    }
  }

  // Variable bindings
  if ('boundVariables' in node) {
    const bv = (node as SceneNode & { boundVariables: Record<string, unknown> }).boundVariables;
    if (bv && Object.keys(bv).length > 0) {
      base.boundVariables = simplifyBoundVariables(bv);
    }
  }

  // Style IDs
  if ('fillStyleId' in node) {
    const fid = (node as GeometryMixin).fillStyleId;
    if (typeof fid === 'string' && fid) base.fillStyleId = fid;
  }
  if ('textStyleId' in node) {
    const tid = (node as TextNode).textStyleId;
    if (typeof tid === 'string' && tid) base.textStyleId = tid;
  }
  if ('effectStyleId' in node) {
    const eid = (node as BlendMixin).effectStyleId;
    if (typeof eid === 'string' && eid) base.effectStyleId = eid;
  }

  // Component property definitions (COMPONENT / COMPONENT_SET nodes)
  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    const comp = node as ComponentNode | ComponentSetNode;
    if (comp.componentPropertyDefinitions && Object.keys(comp.componentPropertyDefinitions).length > 0) {
      const defs: Record<string, { type: string; defaultValue?: unknown; variantOptions?: string[] }> = {};
      for (const [key, def] of Object.entries(comp.componentPropertyDefinitions)) {
        const entry: { type: string; defaultValue?: unknown; variantOptions?: string[] } = { type: def.type };
        if (def.defaultValue !== undefined) entry.defaultValue = def.defaultValue;
        if (def.type === 'VARIANT' && 'variantOptions' in def) {
          entry.variantOptions = (def as ComponentPropertyDefinitions[string] & { variantOptions?: string[] }).variantOptions;
        }
        defs[key] = entry;
      }
      base.componentPropertyDefinitions = defs;
    }
  }

  // Component property references (instances and children that reference component props)
  if ('componentPropertyReferences' in node) {
    const refs = (node as SceneNode & { componentPropertyReferences: Record<string, string> | null }).componentPropertyReferences;
    if (refs && Object.keys(refs).length > 0) {
      base.componentPropertyReferences = { ...refs };
    }
  }

  // Children (respect depth limit)
  if ('children' in node && depth < MAX_DEPTH) {
    const children = (node as ChildrenMixin).children;
    if (children.length > 0) {
      base.children = children.map((c) => simplifyNode(c, depth + 1));
    }
  }

  return base;
}

/** Simplify a page to compressed node list. */
export function simplifyPage(page: PageNode, maxNodes = 200): CompressedNode[] {
  const results: CompressedNode[] = [];
  for (const child of page.children) {
    if (results.length >= maxNodes) break;
    results.push(simplifyNode(child));
  }
  return results;
}

// ─── Helpers ───

function simplifyPaint(paint: Paint): unknown {
  const base: Record<string, unknown> = {
    type: paint.type,
    visible: paint.visible,
    opacity: paint.opacity,
  };
  if (paint.type === 'SOLID') {
    const s = paint as SolidPaint;
    base.color = figmaRgbaToHex(s.color);
  }
  return base;
}

function simplifyEffect(effect: Effect): unknown {
  const base: Record<string, unknown> = {
    type: effect.type,
    visible: effect.visible,
  };
  if ('radius' in effect) {
    base.radius = (effect as DropShadowEffect).radius;
  }
  if ('color' in effect) {
    const e = effect as DropShadowEffect;
    base.color = figmaRgbaToHex(e.color);
    base.opacity = e.color.a;
  }
  if ('offset' in effect) {
    const e = effect as DropShadowEffect;
    base.offset = e.offset;
  }
  return base;
}

function simplifyBoundVariables(bv: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(bv)) {
    if (val && typeof val === 'object' && 'id' in (val as Record<string, unknown>)) {
      result[key] = { id: (val as Record<string, unknown>).id };
    } else if (Array.isArray(val)) {
      result[key] = val.map((v) =>
        v && typeof v === 'object' && 'id' in v ? { id: v.id } : v,
      );
    } else {
      result[key] = val;
    }
  }
  return result;
}

