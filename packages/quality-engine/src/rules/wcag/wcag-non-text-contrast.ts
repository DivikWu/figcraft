/**
 * WCAG 1.4.11 Non-text Contrast — UI components and graphical objects
 * need at least 3:1 contrast ratio against adjacent colors.
 *
 * Checks strokes on any applicable node and fills on small/interactive-sized
 * elements (≤200px). Large containers are skipped as they're likely backgrounds.
 */

import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';
import { hexToRgbTuple } from '../../utils/color.js';
import { contrastRatioTuple } from './wcag-helpers.js';

const NON_TEXT_THRESHOLD = 3;

const APPLICABLE_TYPES = new Set([
  'RECTANGLE',
  'ELLIPSE',
  'FRAME',
  'VECTOR',
  'LINE',
  'STAR',
  'POLYGON',
  'COMPONENT',
  'INSTANCE',
]);

/** Large nodes are likely backgrounds, not interactive elements. */
const MAX_INTERACTIVE_SIZE = 200;

function getParentBg(node: AbstractNode): [number, number, number] | null {
  if (!node.parentBgColor) return null;
  return hexToRgbTuple(node.parentBgColor);
}

export const wcagNonTextContrastRule: LintRule = {
  name: 'wcag-non-text-contrast',
  description: 'Non-text UI components need at least 3:1 contrast against adjacent colors (WCAG 1.4.11).',
  category: 'wcag',
  severity: 'heuristic',
  ai: {
    preventionHint:
      'Ensure non-text UI elements (borders, icons, form controls) have at least 3:1 contrast ratio against their background.',
    phase: ['styling', 'accessibility'],
    tags: ['non-text', 'contrast'],
  },

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type === 'TEXT') return [];
    if (!APPLICABLE_TYPES.has(node.type)) return [];

    const parentBg = getParentBg(node);
    if (!parentBg) return [];

    const violations: LintViolation[] = [];

    // Check 1: Stroke contrast (form borders, icon outlines)
    if (node.strokes?.length && node.strokeWeight && node.strokeWeight > 0) {
      const strokeFill = node.strokes.find((s) => s.type === 'SOLID' && s.visible !== false);
      if (strokeFill?.color) {
        const strokeRgb = hexToRgbTuple(strokeFill.color);
        if (strokeRgb) {
          const ratio = contrastRatioTuple(strokeRgb, parentBg);
          if (ratio < NON_TEXT_THRESHOLD) {
            violations.push({
              nodeId: node.id,
              nodeName: node.name,
              rule: 'wcag-non-text-contrast',
              severity: 'heuristic',
              currentValue: `${ratio.toFixed(2)}:1 (stroke)`,
              expectedValue: `>= ${NON_TEXT_THRESHOLD}:1`,
              suggestion: `"${node.name}" stroke contrast is only ${ratio.toFixed(2)}:1 — needs at least 3:1 for WCAG 1.4.11`,
              autoFixable: false,
            });
          }
        }
      }
    }

    // Check 2: Fill contrast for small/interactive-sized elements only
    const w = node.width ?? Infinity;
    const h = node.height ?? Infinity;
    if (w > MAX_INTERACTIVE_SIZE && h > MAX_INTERACTIVE_SIZE) return violations;

    if (node.fills?.length) {
      const solidFill = node.fills.find((f) => f.type === 'SOLID' && f.visible !== false);
      if (solidFill?.color) {
        const fillRgb = hexToRgbTuple(solidFill.color);
        if (fillRgb) {
          const ratio = contrastRatioTuple(fillRgb, parentBg);
          if (ratio < NON_TEXT_THRESHOLD) {
            violations.push({
              nodeId: node.id,
              nodeName: node.name,
              rule: 'wcag-non-text-contrast',
              severity: 'heuristic',
              currentValue: `${ratio.toFixed(2)}:1 (fill)`,
              expectedValue: `>= ${NON_TEXT_THRESHOLD}:1`,
              suggestion: `"${node.name}" fill contrast is only ${ratio.toFixed(2)}:1 — may be hard to see against its background (needs 3:1 for WCAG 1.4.11)`,
              autoFixable: false,
            });
          }
        }
      }
    }

    return violations;
  },
};
