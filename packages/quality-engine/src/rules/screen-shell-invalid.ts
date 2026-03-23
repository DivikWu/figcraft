import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

const SCREEN_NAME_RE = /welcome|sign.?in|sign.?up|forgot\s+password|create\s+account|screen|page|onboarding|settings|profile|dashboard|checkout|pricing|empty\s+state/i;

function isScreenLike(node: AbstractNode): boolean {
  if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return false;
  if (node.role === 'screen' || node.role === 'page') return true;
  const frameLikeChildren = node.children?.filter((child) => child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'INSTANCE').length ?? 0;
  return SCREEN_NAME_RE.test(node.name) &&
    (node.width ?? 0) >= 360 &&
    (node.height ?? 0) >= 640 &&
    frameLikeChildren >= 2;
}

export const screenShellInvalidRule: LintRule = {
  name: 'screen-shell-invalid',
  description: 'Screen roots should use a stable vertical shell with explicit viewport dimensions.',
  category: 'layout',
  severity: 'error',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (!isScreenLike(node)) return [];

    const violations: LintViolation[] = [];
    if (node.width == null || node.height == null) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'screen-shell-invalid',
        severity: 'error',
        currentValue: `width=${node.width ?? 'missing'} height=${node.height ?? 'missing'}`,
        suggestion: `"${node.name}" should declare explicit screen dimensions before sections are composed.`,
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
        suggestion: `"${node.name}" should use a VERTICAL auto-layout shell so sections stack predictably.`,
        autoFixable: false,
      });
    }
    return violations;
  },
};
