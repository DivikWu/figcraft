/**
 * WCAG non-text contrast rule — UI components and graphical objects need 3:1 contrast.
 *
 * WCAG 1.4.11: Non-text elements (icons, borders, form controls) must have
 * at least 3:1 contrast ratio against adjacent colors.
 *
 * Since we can't determine the actual background from AbstractNode,
 * we check against both white and black — same conservative approach as wcag-contrast.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';
import { hexToRgbTuple } from '../../utils/color.js';
import { contrastRatioTuple } from './wcag-helpers.js';

const THRESHOLD = 3;

/** Node types that are likely UI components or graphical objects. */
const NON_TEXT_TYPES = ['RECTANGLE', 'ELLIPSE', 'LINE', 'VECTOR', 'POLYGON', 'STAR'];

/** Name patterns suggesting interactive/meaningful UI elements. */
const UI_PATTERNS = [
  /icon/i, /button/i, /btn/i, /input/i, /checkbox/i, /radio/i,
  /toggle/i, /switch/i, /divider/i, /border/i, /indicator/i,
  /badge/i, /avatar/i, /arrow/i, /caret/i, /chevron/i,
];

export const wcagNonTextContrastRule: LintRule = {
  name: 'wcag-non-text-contrast',
  description: 'Check WCAG 1.4.11 non-text contrast (3:1 for UI components and graphical objects).',
  category: 'wcag',
  severity: 'warning',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    // Only check non-text shapes that look like UI elements
    if (!NON_TEXT_TYPES.includes(node.type)) return [];
    if (!UI_PATTERNS.some((p) => p.test(node.name))) return [];

    const colors = collectColors(node);
    if (colors.length === 0) return [];

    const violations: LintViolation[] = [];

    for (const { hex, source } of colors) {
      const rgb = hexToRgbTuple(hex);
      if (!rgb) continue;

      const ratioOnWhite = contrastRatioTuple(rgb, [1, 1, 1]);
      const ratioOnBlack = contrastRatioTuple(rgb, [0, 0, 0]);

      if (ratioOnWhite >= THRESHOLD || ratioOnBlack >= THRESHOLD) continue;

      const worstRatio = Math.max(ratioOnWhite, ratioOnBlack);
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'wcag-non-text-contrast',
        severity: 'warning',
        currentValue: `${source}: ${worstRatio.toFixed(2)}:1`,
        expectedValue: `>= ${THRESHOLD}:1`,
        suggestion: `"${node.name}" ${source} has insufficient non-text contrast (${worstRatio.toFixed(2)}:1)`,
        autoFixable: false,
      });
    }

    return violations;
  },
};

function collectColors(node: AbstractNode): Array<{ hex: string; source: string }> {
  const colors: Array<{ hex: string; source: string }> = [];

  if (node.fills) {
    for (const fill of node.fills) {
      if (fill.type === 'SOLID' && fill.color && fill.visible !== false) {
        colors.push({ hex: fill.color, source: 'fill' });
      }
    }
  }
  if (node.strokes) {
    for (const stroke of node.strokes) {
      if (stroke.type === 'SOLID' && stroke.color && stroke.visible !== false) {
        colors.push({ hex: stroke.color, source: 'stroke' });
      }
    }
  }

  return colors;
}
