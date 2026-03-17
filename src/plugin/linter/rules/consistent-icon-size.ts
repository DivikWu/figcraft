/**
 * consistent-icon-size — Warn when icon-like nodes have inconsistent sizes.
 *
 * Detects nodes whose name contains "icon" (case-insensitive) and checks
 * that they use standard icon sizes (16, 20, 24, 32, 40, 48).
 * Also flags non-square icons.
 *
 * Category: component | Severity: info
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

const ICON_PATTERN = /icon/i;
const STANDARD_SIZES = [12, 16, 20, 24, 32, 40, 48, 64];
const SIZE_TOLERANCE = 1; // allow 1px rounding

export const consistentIconSizeRule: LintRule = {
  name: 'consistent-icon-size',
  description: 'Check that icon nodes use standard sizes and are square.',
  category: 'component',
  severity: 'info',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (!ICON_PATTERN.test(node.name)) return [];

    const w = node.width ?? 0;
    const h = node.height ?? 0;
    if (w === 0 || h === 0) return [];

    const violations: LintViolation[] = [];

    // Check square
    if (Math.abs(w - h) > SIZE_TOLERANCE) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'consistent-icon-size',
        severity: 'info',
        currentValue: `${w}x${h}`,
        expectedValue: 'square (equal width and height)',
        suggestion: `Icon "${node.name}" is ${w}x${h}px — icons should be square`,
        autoFixable: false,
      });
    }

    // Check standard size
    const size = Math.max(w, h);
    const isStandard = STANDARD_SIZES.some((s) => Math.abs(size - s) <= SIZE_TOLERANCE);
    if (!isStandard) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'consistent-icon-size',
        severity: 'info',
        currentValue: `${size}px`,
        expectedValue: `one of ${STANDARD_SIZES.join(', ')}px`,
        suggestion: `Icon "${node.name}" is ${size}px — consider using a standard size (${STANDARD_SIZES.join('/')})`,
        autoFixable: false,
      });
    }

    return violations;
  },
};
