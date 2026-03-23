import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

function isFormLike(node: AbstractNode): boolean {
  return node.role === 'form' || node.role === 'actions' || /form|actions|footer|content|body/i.test(node.name);
}

function isButtonLike(node: AbstractNode): boolean {
  if (node.role === 'button') return true;
  return /button|btn|submit|continue|next|sign.?in|sign.?up|login|register|cta/i.test(node.name) ||
    !!node.fills?.some((fill) => fill.visible !== false && fill.type === 'SOLID');
}

function isInputLike(node: AbstractNode): boolean {
  if (node.role === 'input' || node.role === 'field') return true;
  return /input|field|email|password|username|search/i.test(node.name) ||
    !!node.strokes?.some((stroke) => stroke.visible !== false);
}

export const ctaWidthInconsistentRule: LintRule = {
  name: 'cta-width-inconsistent',
  description: 'Primary CTA buttons inside forms should match the dominant field width instead of appearing noticeably narrower.',
  category: 'layout',
  severity: 'warning',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return [];
    if (node.layoutMode !== 'VERTICAL') return [];
    if (!isFormLike(node)) return [];
    if (!node.children || node.children.length < 2) return [];

    const inputs = node.children.filter(isInputLike).filter((child) => child.width != null);
    const buttons = node.children.filter(isButtonLike).filter((child) => child.width != null);
    if (inputs.length === 0 || buttons.length === 0) return [];

    const targetWidth = Math.max(...inputs.map((child) => child.width as number));
    return buttons
      .filter((button) => (button.width as number) < targetWidth * 0.9)
      .map((button) => ({
        nodeId: button.id,
        nodeName: button.name,
        rule: 'cta-width-inconsistent',
        severity: 'warning' as const,
        currentValue: `CTA width ${Math.round(button.width as number)}px vs field width ${Math.round(targetWidth)}px`,
        suggestion: `"${button.name}" is noticeably narrower than the form fields in "${node.name}". Set layoutAlign: STRETCH for a consistent CTA width.`,
        autoFixable: true,
        fixData: {
          fix: 'stretch',
          layoutAlign: 'STRETCH',
        },
      }));
  },
};
