import { DESIGN_CONSTANTS } from '../../constants.js';
import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';

function isSectionStack(node: AbstractNode): boolean {
  return (
    node.role === 'screen' ||
    node.role === 'body' ||
    node.role === 'content' ||
    node.role === 'actions' ||
    /\b(screen|page|content|body|form|footer|actions)\b/i.test(node.name)
  );
}

/** Minimum vertical padding on a child for it to count as "self-spaced". */
const CHILD_SELF_PAD_THRESHOLD = 8;

/** Does this single node carry a direct "self-contained" visual signal? */
function hasOwnRhythmSignal(node: AbstractNode): boolean {
  const verticalPad = (node.paddingTop ?? 0) + (node.paddingBottom ?? 0);
  if (verticalPad >= CHILD_SELF_PAD_THRESHOLD) return true;

  const hasVisibleFill = node.fills?.some((f) => f.visible !== false && f.type !== 'NONE');
  if (hasVisibleFill) return true;

  const hasStroke = node.strokes?.some((s) => s.visible !== false);
  if (hasStroke) return true;

  const hasEffect = node.effects?.some((e) => e.visible !== false);
  if (hasEffect) return true;

  const radius = typeof node.cornerRadius === 'number' ? node.cornerRadius : 0;
  if (radius > 0) return true;

  return false;
}

/**
 * A child is "visually self-contained" when it (or its first layer of inner
 * wrappers) carries a rhythm signal — own padding, background fill, stroke,
 * shadow, or rounded corners. Section-level library components often ship a
 * thin COMPONENT root with padding = 0 and push all visuals into inner
 * Header/Content wrappers, so peeking one level catches that common case
 * without flagging truly empty stacks.
 */
function isVisuallySelfContained(child: AbstractNode): boolean {
  if (hasOwnRhythmSignal(child)) return true;

  // Peek one level in — covers thin COMPONENT wrappers that delegate visuals
  // to direct children (e.g. Header + Content pair). Bounded to the first few
  // children to keep the check cheap.
  const innerProbe = child.children?.slice(0, 4);
  if (innerProbe?.some(hasOwnRhythmSignal)) return true;

  return false;
}

export const sectionSpacingCollapseRule: LintRule = {
  name: 'section-spacing-collapse',
  description:
    'Major vertical section stacks should keep a healthy itemSpacing rhythm instead of collapsing sections together.',
  category: 'layout',
  severity: 'heuristic',
  ai: {
    preventionHint: `Section stacks (screen/body/content) need itemSpacing ≥${DESIGN_CONSTANTS.spacing.minSection}px to maintain visual rhythm`,
    phase: ['layout'],
    tags: ['screen'],
  },

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return [];
    if (node.layoutMode !== 'VERTICAL') return [];
    if (!isSectionStack(node)) return [];
    if (!node.children || node.children.length < 3) return [];

    const frameLikeChildren = node.children.filter(
      (child) => child.type === 'FRAME' || child.type === 'INSTANCE' || child.type === 'COMPONENT',
    );
    if (frameLikeChildren.length < 3) return [];

    const spacing = node.itemSpacing ?? 0;
    if (spacing >= DESIGN_CONSTANTS.spacing.minSection) return [];

    // If most children are visually self-contained (own padding, fills, strokes,
    // effects, or radius), visual rhythm is supplied by the cards themselves —
    // parent itemSpacing 8 is fine. Flagging would push a cosmetic fix that
    // double-pads the layout.
    const selfContained = frameLikeChildren.filter(isVisuallySelfContained);
    if (selfContained.length * 2 >= frameLikeChildren.length) return [];

    return [
      {
        nodeId: node.id,
        nodeName: node.name,
        rule: 'section-spacing-collapse',
        severity: 'heuristic',
        currentValue: `itemSpacing ${spacing}px across ${frameLikeChildren.length} sections`,
        suggestion: `"${node.name}" packs major sections too tightly. Increase itemSpacing to restore a clearer vertical rhythm.`,
        autoFixable: true,
        fixData: {
          fix: 'item-spacing',
          itemSpacing: DESIGN_CONSTANTS.spacing.sectionFix,
        },
      },
    ];
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData || v.fixData.itemSpacing == null) return null;
    return { kind: 'set-properties', props: { itemSpacing: v.fixData.itemSpacing } };
  },
};
