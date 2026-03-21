/**
 * Node simplifier — Framelink-style ~90% compression.
 *
 * Strips Figma node data to only layout + style + token binding essentials.
 * Supports configurable depth limits and time budgets to prevent timeouts
 * on large pages.
 */

import type { CompressedNode } from '../../shared/types.js';
import { figmaRgbaToHex } from '../utils/color.js';

/** Default maximum tree depth to prevent excessive payloads. */
const DEFAULT_MAX_DEPTH = 10;

/** Maximum total nodes in a single simplifyNode call. */
const MAX_NODES = 2000;

/** Default time budget for simplifyPage (ms). */
const DEFAULT_TIME_BUDGET_MS = 15_000;

/** Traversal context shared across recursive calls. */
export interface SimplifyContext {
  count: number;
  maxDepth: number;
  startTime: number;
  timeBudgetMs: number;
  timedOut: boolean;
}

function createContext(maxDepth?: number, timeBudgetMs?: number): SimplifyContext {
  return {
    count: 0,
    maxDepth: maxDepth ?? DEFAULT_MAX_DEPTH,
    startTime: Date.now(),
    timeBudgetMs: timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS,
    timedOut: false,
  };
}

function isOverBudget(ctx: SimplifyContext): boolean {
  if (ctx.timedOut) return true;
  // Check time every 50 nodes to avoid excessive Date.now() calls
  if (ctx.count % 50 === 0 && Date.now() - ctx.startTime > ctx.timeBudgetMs) {
    ctx.timedOut = true;
    return true;
  }
  return false;
}

/** Simplify a Figma node tree into compressed JSON. */
export function simplifyNode(node: SceneNode, depth = 0, counter?: { count: number }, ctx?: SimplifyContext): CompressedNode {
  // Legacy counter support for backward compatibility
  const context = ctx ?? (counter ? { count: counter.count, maxDepth: DEFAULT_MAX_DEPTH, startTime: Date.now(), timeBudgetMs: DEFAULT_TIME_BUDGET_MS, timedOut: false } : createContext());
  context.count++;
  // Sync legacy counter if provided
  if (counter) counter.count = context.count;

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
      base.layoutMode = frame.layoutMode as 'HORIZONTAL' | 'VERTICAL';
      base.itemSpacing = frame.itemSpacing;
      base.paddingLeft = frame.paddingLeft;
      base.paddingRight = frame.paddingRight;
      base.paddingTop = frame.paddingTop;
      base.paddingBottom = frame.paddingBottom;
      if (frame.primaryAxisAlignItems) base.primaryAxisAlignItems = frame.primaryAxisAlignItems;
      if (frame.counterAxisAlignItems) base.counterAxisAlignItems = frame.counterAxisAlignItems;
    }
  }

  // Clip content
  if ('clipsContent' in node) {
    const frame = node as FrameNode;
    if (frame.clipsContent) base.clipsContent = true;
  }

  // Stroke weight
  if ('strokeWeight' in node) {
    const sw = (node as GeometryMixin).strokeWeight;
    if (typeof sw === 'number' && sw > 0) base.strokeWeight = sw;
  }

  // Layout align (for children of auto-layout frames)
  if ('layoutAlign' in node) {
    const la = (node as SceneNode & { layoutAlign: string }).layoutAlign;
    if (la && la !== 'INHERIT') base.layoutAlign = la;
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
    if (text.textAutoResize) {
      base.textAutoResize = text.textAutoResize;
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

  // Children (respect depth limit, node count limit, and time budget)
  if ('children' in node && depth < context.maxDepth && context.count < MAX_NODES && !isOverBudget(context)) {
    const children = (node as ChildrenMixin).children;
    if (children.length > 0) {
      base.children = [];
      for (const child of children) {
        if (context.count >= MAX_NODES || isOverBudget(context)) {
          base.truncated = true;
          base.truncatedChildCount = children.length - base.children.length;
          break;
        }
        base.children.push(simplifyNode(child, depth + 1, counter, context));
      }
    }
  } else if ('children' in node && (node as ChildrenMixin).children.length > 0) {
    // At depth/count/time limit but has children — mark as truncated
    base.truncated = true;
    base.truncatedChildCount = (node as ChildrenMixin).children.length;
  }

  return base;
}

/** Simplify a page to compressed node list. */
export function simplifyPage(page: PageNode, maxNodes = 200, maxDepth?: number, timeBudgetMs?: number): CompressedNode[] {
  const results: CompressedNode[] = [];
  const ctx = createContext(maxDepth, timeBudgetMs);
  for (const child of page.children) {
    if (results.length >= maxNodes) break;
    if (isOverBudget(ctx)) break;
    results.push(simplifyNode(child, 0, undefined, ctx));
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
    if (val && typeof val === 'object' && !Array.isArray(val) && 'id' in (val as Record<string, unknown>)) {
      result[key] = { id: (val as Record<string, unknown>).id };
    } else if (Array.isArray(val)) {
      result[key] = val.map((v) => {
        if (v && typeof v === 'object' && 'id' in v) return { id: v.id };
        // Handle nested objects within arrays (e.g. fills array with bound variables)
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const nested = v as Record<string, unknown>;
          if ('id' in nested) return { id: nested.id };
          // Recursively simplify nested bound variable objects
          const simplified: Record<string, unknown> = {};
          for (const [nk, nv] of Object.entries(nested)) {
            if (nv && typeof nv === 'object' && !Array.isArray(nv) && 'id' in (nv as Record<string, unknown>)) {
              simplified[nk] = { id: (nv as Record<string, unknown>).id };
            } else {
              simplified[nk] = nv;
            }
          }
          return simplified;
        }
        return v;
      });
    } else {
      result[key] = val;
    }
  }
  return result;
}

