import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

const SCREEN_NAME_RE = /welcome|sign.?in|sign.?up|forgot\s+password|create\s+account|screen|page|onboarding|settings|profile|dashboard|checkout|pricing/i;

function isScreenLike(node: AbstractNode): boolean {
  return node.role === 'screen' || node.role === 'page' || SCREEN_NAME_RE.test(node.name);
}

function isHeaderContainer(node: AbstractNode): boolean {
  return node.role === 'header' || /header|top\s?bar|navbar|app\s?bar/i.test(node.name);
}

function isLikelyBackControl(node: AbstractNode): boolean {
  if (node.role === 'button') return /back|close|dismiss|arrow|返回|关闭/i.test(node.name);
  return /back|close|dismiss|arrow|返回|关闭/i.test(node.name) || (!!node.width && node.width <= 48);
}

export const headerFragmentedRule: LintRule = {
  name: 'header-fragmented',
  description: 'Screen-level header elements should be grouped into a dedicated header container instead of floating as separate top-level children.',
  category: 'layout',
  severity: 'warning',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return [];
    if (!isScreenLike(node)) return [];
    if (!node.children || node.children.length < 2) return [];
    if (node.children.some(isHeaderContainer)) return [];

    const topBand = node.children.filter((child) => (child.y ?? 0) <= 140);
    const hasTitle = topBand.some((child) => child.type === 'TEXT');
    const hasBack = topBand.some(isLikelyBackControl);
    if (!(hasTitle && hasBack)) return [];

    return [{
      nodeId: node.id,
      nodeName: node.name,
      rule: 'header-fragmented',
      severity: 'warning',
      currentValue: 'top-level title/back elements are not grouped',
      suggestion: `"${node.name}" has header-like elements floating at the screen root. Group the back control, title, and subtitle into a dedicated header frame for more stable layout.`,
      autoFixable: false,
    }];
  },
};
