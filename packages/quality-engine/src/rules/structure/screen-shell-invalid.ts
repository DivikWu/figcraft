import { SCREEN_NAME_RE } from '../../constants.js';
import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';

function isScreenLike(node: AbstractNode): boolean {
  if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return false;
  if (node.role === 'screen' || node.role === 'page') return true;
  const frameLikeChildren =
    node.children?.filter((child) => child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'INSTANCE')
      .length ?? 0;
  return (
    SCREEN_NAME_RE.test(node.name) && (node.width ?? 0) >= 360 && (node.height ?? 0) >= 640 && frameLikeChildren >= 2
  );
}

export const screenShellInvalidRule: LintRule = {
  name: 'screen-shell-invalid',
  description: 'Screen roots should use a stable vertical shell with explicit viewport dimensions.',
  category: 'layout',
  severity: 'error',
  // When the screen shell itself is broken, descendant layout/header/overflow
  // checks produce bogus violations (everything shifts once you fix the shell).
  // Let the user fix the root cause first.
  suppressesInSubtree: [
    'no-autolayout',
    'overflow-parent',
    'screen-bottom-overflow',
    'section-spacing-collapse',
    'unbounded-hug',
  ],

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    if (!isScreenLike(node)) return [];

    const violations: LintViolation[] = [];
    if (node.width == null || node.height == null) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'screen-shell-invalid',
        severity: 'error',
        currentValue: `width=${node.width ?? 'missing'} height=${node.height ?? 'missing'}`,
        suggestion: tr(
          ctx.lang,
          `"${node.name}" should declare explicit screen dimensions before sections are composed.`,
          `「${node.name}」应在组合子区块前声明明确的屏幕尺寸。`,
        ),
        autoFixable: false,
      });
    }
    if (!node.layoutMode || node.layoutMode === 'NONE' || node.layoutMode === 'HORIZONTAL') {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'screen-shell-invalid',
        severity: 'error',
        currentValue: node.layoutMode ?? 'NONE',
        suggestion: tr(
          ctx.lang,
          `"${node.name}" should use a VERTICAL auto-layout shell so sections stack predictably.`,
          `「${node.name}」应使用 VERTICAL 自动布局外壳,让子区块可预期地纵向堆叠。`,
        ),
        autoFixable: true,
        fixData: { layoutMode: 'VERTICAL' },
      });
    }
    return violations;
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData?.layoutMode) return null;
    return {
      kind: 'set-properties',
      props: { layoutMode: v.fixData.layoutMode },
      requireType: ['FRAME', 'COMPONENT'],
    };
  },
};
