/**
 * WCAG contrast rule — check text/background contrast ratio.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

export const wcagContrastRule: LintRule = {
  name: 'wcag-contrast',
  description: 'Check WCAG AA contrast ratio (4.5:1 for normal text, 3:1 for large text).',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'TEXT') return [];
    if (!node.fills || node.fills.length === 0) return [];

    const violations: LintViolation[] = [];

    // Get foreground color
    const fgFill = node.fills.find((f) => f.type === 'SOLID' && f.visible !== false);
    if (!fgFill?.color) return violations;

    const fgRgb = hexToRgbNorm(fgFill.color);
    if (!fgRgb) return violations;

    // Assume white background if we can't determine it
    const bgRgb: [number, number, number] = [1, 1, 1];

    const ratio = contrastRatio(fgRgb, bgRgb);
    const isLargeText = (node.fontSize ?? 16) >= 18 || ((node.fontSize ?? 16) >= 14 && node.fontName?.style?.includes('Bold'));

    const threshold = isLargeText ? 3 : 4.5;

    if (ratio < threshold) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'wcag-contrast',
        currentValue: `${ratio.toFixed(2)}:1`,
        expectedValue: `>= ${threshold}:1`,
        suggestion: `Text contrast ratio ${ratio.toFixed(2)}:1 is below WCAG AA threshold of ${threshold}:1`,
        autoFixable: false,
      });
    }

    return violations;
  },
};

function hexToRgbNorm(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return null;
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
