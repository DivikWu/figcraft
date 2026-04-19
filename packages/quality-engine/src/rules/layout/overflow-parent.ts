/**
 * Overflow parent rule — detect children that exceed their parent's inner space.
 *
 * Flags child nodes whose width or height exceeds the parent's available inner space
 * (parent dimension minus padding). This catches visual clipping that is almost always
 * unintentional in auto-layout containers.
 *
 * Auto-fix: set layoutAlign=STRETCH (for cross-axis overflow) or reduce child dimension.
 */

import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';

/** Leaf types that should never be STRETCH-ed — they have intrinsic dimensions. */
const VECTOR_TYPES = new Set(['VECTOR', 'LINE', 'ELLIPSE', 'STAR', 'POLYGON', 'BOOLEAN_OPERATION', 'GROUP']);

/** Max dimension (px) for a child to be considered icon-like. */
const ICON_MAX_SIZE = 48;

/**
 * Ratio above which a child overflow is almost certainly an intentional
 * carousel / scrollable tab bar rather than a layout mistake. STRETCH
 * would destroy the design in these cases (squish a 2000px carousel to
 * 375px), so we downgrade to a heuristic suggestion and drop autofix.
 */
const CAROUSEL_RATIO = 1.5;

/** Does the parent declare prototype scroll on the given axis? */
function scrollsOnAxis(parent: AbstractNode, axis: 'HORIZONTAL' | 'VERTICAL'): boolean {
  const d = parent.overflowDirection;
  if (!d || d === 'NONE') return false;
  if (d === 'BOTH') return true;
  return d === axis;
}

/**
 * Detect children that are icons or vector graphics and should keep fixed size.
 * These nodes must NOT be auto-fixed with layoutAlign: STRETCH — stretching
 * distorts their aspect ratio.
 */
function looksLikeIcon(child: AbstractNode): boolean {
  // Direct vector/group nodes are always fixed-size
  if (VECTOR_TYPES.has(child.type)) return true;
  // Small frames containing vectors (icon wrappers from icon_create)
  if (
    child.type === 'FRAME' &&
    child.width != null &&
    child.width <= ICON_MAX_SIZE &&
    child.height != null &&
    child.height <= ICON_MAX_SIZE &&
    child.children?.some((c) => VECTOR_TYPES.has(c.type))
  ) {
    return true;
  }
  return false;
}

function getInnerWidth(node: AbstractNode): number | null {
  if (node.width == null) return null;
  const pl = node.paddingLeft ?? 0;
  const pr = node.paddingRight ?? 0;
  return node.width - pl - pr;
}

function getInnerHeight(node: AbstractNode): number | null {
  if (node.height == null) return null;
  const pt = node.paddingTop ?? 0;
  const pb = node.paddingBottom ?? 0;
  return node.height - pt - pb;
}

export const overflowParentRule: LintRule = {
  name: 'overflow-parent',
  description: 'Detect children that overflow their parent container bounds.',
  category: 'layout',
  severity: 'unsafe',
  ai: {
    preventionHint:
      'Responsive children (inputs, buttons, dividers, content sections) use layoutAlign: STRETCH to fill parent width',
    phase: ['layout'],
  },

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    // Only check containers with auto-layout (non-AL containers use absolute positioning)
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return [];
    if (!node.layoutMode || node.layoutMode === 'NONE') return [];
    if (!node.children || node.children.length === 0) return [];
    // Skip if clipsContent is explicitly false — designer intends overflow
    if (node.clipsContent === false) return [];

    const violations: LintViolation[] = [];
    const innerW = getInnerWidth(node);
    const innerH = getInnerHeight(node);
    const isVertical = node.layoutMode === 'VERTICAL';

    for (const child of node.children) {
      if (child.width == null || child.height == null) continue;
      // Skip absolute-positioned children
      if (child.layoutPositioning === 'ABSOLUTE') continue;
      // Skip icon/vector children — they must keep fixed dimensions
      if (looksLikeIcon(child)) continue;

      // Cross-axis overflow check
      // In VERTICAL layout, cross-axis is width; in HORIZONTAL, cross-axis is height
      if (isVertical && innerW != null && child.width > innerW + 1) {
        // Parent declares horizontal scroll intent — not a bug.
        if (scrollsOnAxis(node, 'HORIZONTAL')) continue;

        const ratio = child.width / Math.max(innerW, 1);
        if (ratio >= CAROUSEL_RATIO) {
          // Likely a carousel / scrollable row. STRETCH would squish it — no auto-fix.
          violations.push({
            nodeId: child.id,
            nodeName: child.name,
            rule: 'overflow-parent',
            severity: 'heuristic',
            currentValue: `width ${Math.round(child.width)}px far exceeds parent inner width ${Math.round(innerW)}px (${ratio.toFixed(1)}×)`,
            suggestion: `"${child.name}" is ${ratio.toFixed(1)}× wider than "${node.name}". If this is a horizontal scroll/carousel, set overflowDirection: HORIZONTAL on the parent (Prototype panel). Otherwise reduce "${child.name}" width.`,
            autoFixable: false,
          });
          continue;
        }

        violations.push({
          nodeId: child.id,
          nodeName: child.name,
          rule: 'overflow-parent',
          severity: 'unsafe',
          currentValue: `width ${Math.round(child.width)}px exceeds parent inner width ${Math.round(innerW)}px`,
          suggestion: `"${child.name}" overflows "${node.name}" horizontally. Set layoutAlign: STRETCH or reduce width.`,
          autoFixable: true,
          fixData: {
            fix: 'stretch',
            layoutAlign: 'STRETCH',
          },
        });
      } else if (!isVertical && innerH != null && child.height > innerH + 1) {
        // Parent declares vertical scroll intent — not a bug.
        if (scrollsOnAxis(node, 'VERTICAL')) continue;
        // Single-line text inside a HORIZONTAL auto-layout commonly reports height slightly
        // greater than its parent due to line-height ascender/descender metrics — visually
        // fine, and layoutAlign: STRETCH wouldn't change text height anyway (driven by
        // fontSize × lineHeight, not cross-axis alignment). Skip to avoid useless fixes.
        if (child.type === 'TEXT' && child.characters != null && !child.characters.includes('\n')) {
          continue;
        }

        const ratio = child.height / Math.max(innerH, 1);
        if (ratio >= CAROUSEL_RATIO) {
          violations.push({
            nodeId: child.id,
            nodeName: child.name,
            rule: 'overflow-parent',
            severity: 'heuristic',
            currentValue: `height ${Math.round(child.height)}px far exceeds parent inner height ${Math.round(innerH)}px (${ratio.toFixed(1)}×)`,
            suggestion: `"${child.name}" is ${ratio.toFixed(1)}× taller than "${node.name}". If this is a vertical scroll area, set overflowDirection: VERTICAL on the parent (Prototype panel). Otherwise reduce "${child.name}" height.`,
            autoFixable: false,
          });
          continue;
        }

        violations.push({
          nodeId: child.id,
          nodeName: child.name,
          rule: 'overflow-parent',
          severity: 'unsafe',
          currentValue: `height ${Math.round(child.height)}px exceeds parent inner height ${Math.round(innerH)}px`,
          suggestion: `"${child.name}" overflows "${node.name}" vertically. Set layoutAlign: STRETCH or reduce height.`,
          autoFixable: true,
          fixData: {
            fix: 'stretch',
            layoutAlign: 'STRETCH',
          },
        });
      }
    }

    return violations;
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData) return null;
    return { kind: 'set-properties', props: { layoutAlign: v.fixData.layoutAlign ?? 'STRETCH' } };
  },
};
