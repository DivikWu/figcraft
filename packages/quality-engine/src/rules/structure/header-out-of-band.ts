import type { AbstractNode, LintContext, LintViolation, LintRule } from '../../types.js';
import { SCREEN_NAME_RE } from '../../constants.js';

function isScreenLike(node: AbstractNode): boolean {
  return node.role === 'screen' || SCREEN_NAME_RE.test(node.name);
}

function isHeaderLike(node: AbstractNode): boolean {
  return node.role === 'header' || /header|top\s?bar|app\s?bar|navbar/i.test(node.name);
}

export const headerOutOfBandRule: LintRule = {
  name: 'header-out-of-band',
  description: 'Header containers should stay near the top of the screen instead of floating deep into the content area.',
  category: 'layout',
  severity: 'heuristic',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return [];
    if (!isScreenLike(node)) return [];
    if (!node.children || node.children.length === 0) return [];

    const header = node.children.find(isHeaderLike);
    if (!header) return [];
    if ((header.y ?? 0) <= 160) return [];

    return [{
      nodeId: header.id,
      nodeName: header.name,
      rule: 'header-out-of-band',
      severity: 'heuristic',
      currentValue: `header starts at y=${Math.round(header.y ?? 0)}`,
      suggestion: `"${header.name}" starts too low in "${node.name}". Move the header closer to the top safe area to restore expected screen hierarchy.`,
      autoFixable: false,
    }];
  },
};
