/**
 * Generic fix applicator — dispatches FixDescriptor to Figma API calls.
 *
 * Replaces the triplicated switch/case blocks in lint.ts and lint-inline.ts.
 * Each descriptor kind maps to a small, focused handler.
 */

import type { FixDescriptor } from '@figcraft/quality-engine';
import { setSpacingProp } from './type-guards.js';

export interface FixResult {
  fixed: boolean;
  error?: string;
}

export interface FixApplyOptions {
  /** When false (inline mode), deferred fixes are skipped. Default: true. */
  allowDeferred?: boolean;
  /** Deferred strategy handlers (keyed by strategy name). Only needed in bridge mode. */
  deferredStrategies?: Record<string, DeferredStrategyHandler>;
  /** Library name for deferred strategies that need it. */
  libraryName?: string;
}

export type DeferredStrategyHandler = (
  node: SceneNode,
  data: Record<string, unknown>,
  libraryName?: string,
) => Promise<FixResult>;

/** Known spacing properties that use setSpacingProp instead of direct assignment. */
const SPACING_PROPS = new Set([
  'itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
  'counterAxisSpacing',
]);

/** Properties that need lineHeight wrapper: { value, unit: 'PIXELS' }. */
const LINE_HEIGHT_PROP = 'lineHeight';

/**
 * Apply a FixDescriptor to a Figma SceneNode.
 * Single entry point that replaces all per-rule switch/case blocks.
 */
export async function applyFixDescriptor(
  node: SceneNode,
  descriptor: FixDescriptor,
  opts: FixApplyOptions = {},
): Promise<FixResult> {
  // Type guard check
  if ('requireType' in descriptor && descriptor.requireType) {
    if (!descriptor.requireType.includes(node.type)) {
      return { fixed: false, error: `Expected ${descriptor.requireType.join('/')}, got ${node.type}` };
    }
  }

  switch (descriptor.kind) {
    case 'set-properties':
      return applyPropertyFix(node, descriptor.props, descriptor.requireFontLoad);

    case 'resize':
      return applyResizeFix(node, descriptor);

    case 'remove-and-redistribute':
      return applyRemoveAndRedistribute(node, descriptor.dimension);

    case 'deferred': {
      if (opts.allowDeferred === false) {
        return { fixed: false, error: `Deferred fix (${descriptor.strategy}) skipped in inline mode` };
      }
      const handler = opts.deferredStrategies?.[descriptor.strategy];
      if (!handler) {
        return { fixed: false, error: `No handler for deferred strategy: ${descriptor.strategy}` };
      }
      return handler(node, descriptor.data, opts.libraryName);
    }
  }
}

/**
 * Apply property assignments to a node. Handles spacing props, lineHeight, and direct assignment.
 */
async function applyPropertyFix(
  node: SceneNode,
  props: Record<string, unknown>,
  requireFontLoad?: boolean,
): Promise<FixResult> {
  try {
    // Load font if needed (text nodes)
    if (requireFontLoad && node.type === 'TEXT') {
      const textNode = node as TextNode;
      if (textNode.fontName !== figma.mixed) {
        await figma.loadFontAsync(textNode.fontName);
      }
    }

    for (const [key, value] of Object.entries(props)) {
      if (value === undefined) continue;

      // Spacing properties use safe setter
      if (SPACING_PROPS.has(key)) {
        setSpacingProp(node, key, value as number);
        continue;
      }

      // lineHeight needs Figma's { value, unit } wrapper
      if (key === LINE_HEIGHT_PROP && typeof value === 'number') {
        if ('lineHeight' in node) {
          (node as TextNode).lineHeight = { value, unit: 'PIXELS' };
        }
        continue;
      }

      // Direct property assignment
      if (key in node) {
        (node as any)[key] = value;
      }
    }

    return { fixed: true };
  } catch (err) {
    return { fixed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Resize a node, optionally setting minHeight.
 */
function applyResizeFix(
  node: SceneNode,
  desc: { width?: number; height?: number; minHeight?: number },
): FixResult {
  try {
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT') {
      return { fixed: false, error: `Cannot resize ${node.type}` };
    }
    const frame = node as FrameNode;
    const w = desc.width ?? frame.width;
    const h = desc.height ?? frame.height;
    frame.resize(w, h);
    if (desc.minHeight != null && 'minHeight' in frame) {
      frame.minHeight = desc.minHeight;
    }
    return { fixed: true };
  } catch (err) {
    return { fixed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Remove a spacer node and redistribute its dimension to parent spacing/padding.
 * Extracted from the duplicated logic in lint.ts and lint-inline.ts.
 */
function applyRemoveAndRedistribute(
  node: SceneNode,
  dimension: { width?: number; height?: number },
): FixResult {
  try {
    const parent = node.parent;
    if (!parent || !('layoutMode' in parent)) {
      return { fixed: false, error: 'Parent is not an auto-layout frame' };
    }
    const parentFrame = parent as FrameNode;
    if (parentFrame.layoutMode === 'NONE') {
      return { fixed: false, error: 'Parent has no auto-layout' };
    }

    const isVertical = parentFrame.layoutMode === 'VERTICAL';
    const spacerDim = isVertical
      ? (dimension.height ?? (node as FrameNode).height ?? 0)
      : (dimension.width ?? (node as FrameNode).width ?? 0);

    const siblings = [...parentFrame.children];
    const idx = siblings.indexOf(node);

    if (idx === 0) {
      // First child → add to start padding
      if (isVertical) {
        parentFrame.paddingTop = (parentFrame.paddingTop ?? 0) + spacerDim;
      } else {
        parentFrame.paddingLeft = (parentFrame.paddingLeft ?? 0) + spacerDim;
      }
    } else if (idx === siblings.length - 1) {
      // Last child → add to end padding
      if (isVertical) {
        parentFrame.paddingBottom = (parentFrame.paddingBottom ?? 0) + spacerDim;
      } else {
        parentFrame.paddingRight = (parentFrame.paddingRight ?? 0) + spacerDim;
      }
    } else {
      // Middle child → convert to itemSpacing
      const currentSpacing = parentFrame.itemSpacing ?? 0;
      if (currentSpacing === 0 || currentSpacing === spacerDim) {
        parentFrame.itemSpacing = spacerDim;
      }
    }

    node.remove();
    return { fixed: true };
  } catch (err) {
    return { fixed: false, error: err instanceof Error ? err.message : String(err) };
  }
}
