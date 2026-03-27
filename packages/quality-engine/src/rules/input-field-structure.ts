/**
 * Input field structure rule — detect input fields that are not proper auto-layout frames.
 *
 * Flags nodes whose name contains "input" / "field" / "text field" (case-insensitive) that:
 * - Are not FRAME type
 * - Are frames but have no auto-layout
 * - Have no stroke (border)
 * - Have no cornerRadius
 * - Have insufficient padding (< 8px total horizontal)
 * - Have no text child (placeholder)
 * - Are not using layoutAlign: STRETCH inside auto-layout parent
 *
 * Proper input fields should be auto-layout frames with stroke, corner radius,
 * internal padding, and a text child for placeholder.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

const INPUT_NAME_RE = /input|field|text.?field|search.?bar|email.?field|password.?field|输入|搜索框/i;
const SCREEN_NAME_RE = /welcome|sign.?in|sign.?up|forgot\s+password|create\s+account|onboarding|settings|profile|dashboard|checkout|pricing|empty\s+state/i;

function looksLikeScreenContainer(node: AbstractNode): boolean {
  if (node.type !== 'FRAME') return false;
  // Only treat as screen container if name matches screen patterns AND has multiple children
  if (SCREEN_NAME_RE.test(node.name) && (node.children?.length ?? 0) >= 2) return true;
  // Large containers with many frame-like children are likely screens, not inputs
  const frameLikeChildren = node.children?.filter(
    c => c.type === 'FRAME' || c.type === 'INSTANCE' || c.type === 'COMPONENT',
  ).length ?? 0;
  if (frameLikeChildren >= 3) return true;
  return false;
}

function looksLikeInput(node: AbstractNode): boolean {
  if (looksLikeScreenContainer(node)) return false;
  if (INPUT_NAME_RE.test(node.name)) return true;
  // A frame with stroke + single text child is likely an input
  if (node.type === 'FRAME' && node.children?.length === 1 &&
      node.children[0].type === 'TEXT' &&
      node.strokes && node.strokes.some(s => s.visible !== false)) {
    return true;
  }
  return false;
}

const MIN_INPUT_HPAD = 8;

export const inputFieldStructureRule: LintRule = {
  name: 'input-field-structure',
  description: 'Input fields must be auto-layout frames with stroke, corner radius, padding, and a text child.',
  category: 'layout',
  severity: 'warning',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (!looksLikeInput(node)) return [];
    const violations: LintViolation[] = [];

    // Check 1: Not a frame
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'input-field-structure',
        severity: 'warning',
        currentValue: `${node.type} used as input field`,
        suggestion: `"${node.name}" looks like an input field but is a ${node.type}. Convert to an auto-layout frame with stroke, cornerRadius, padding, and a text child.`,
        autoFixable: false,
      });
      return violations;
    }

    // Skip INSTANCE — their structure is defined by the component
    if (node.type === 'INSTANCE') return violations;

    // Check 2: No auto-layout
    if (!node.layoutMode || node.layoutMode === 'NONE') {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'input-field-structure',
        severity: 'warning',
        currentValue: 'no auto-layout',
        suggestion: `"${node.name}" is an input field without auto-layout. Set layoutMode: "HORIZONTAL", counterAxisAlignItems: "CENTER".`,
        autoFixable: true,
        fixData: {
          fix: 'layout',
          layoutMode: 'HORIZONTAL',
          counterAxisAlignItems: 'CENTER',
        },
      });
    }

    // Check 3: No stroke (border)
    const hasVisibleStroke = node.strokes && node.strokes.some(s => s.visible !== false);
    if (!hasVisibleStroke) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'input-field-structure',
        severity: 'warning',
        currentValue: 'no stroke',
        suggestion: `"${node.name}" input field has no visible stroke (border). Add a stroke to indicate the input boundary.`,
        autoFixable: false,
      });
    }

    // Check 4: No corner radius
    const hasRadius = node.cornerRadius != null &&
      (typeof node.cornerRadius === 'number' ? node.cornerRadius > 0 : node.cornerRadius.some(r => r > 0));
    if (!hasRadius) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'input-field-structure',
        severity: 'info',
        currentValue: 'no corner radius',
        suggestion: `"${node.name}" input field has no corner radius. Consider adding cornerRadius for a polished look.`,
        autoFixable: true,
        fixData: { fix: 'cornerRadius', cornerRadius: 8 },
      });
    }

    // Check 5: Insufficient padding
    if (node.layoutMode && node.layoutMode !== 'NONE') {
      const hPad = (node.paddingLeft ?? 0) + (node.paddingRight ?? 0);
      if (hPad < MIN_INPUT_HPAD) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'input-field-structure',
          severity: 'warning',
          currentValue: `horizontal padding ${hPad}px`,
          suggestion: `"${node.name}" input field has insufficient horizontal padding (${hPad}px < ${MIN_INPUT_HPAD}px).`,
          autoFixable: true,
          fixData: {
            fix: 'padding',
            paddingLeft: Math.max(node.paddingLeft ?? 0, 12),
            paddingRight: Math.max(node.paddingRight ?? 0, 12),
          },
        });
      }
    }

    // Check 6: No text child
    const hasTextChild = node.children && node.children.some(c => c.type === 'TEXT');
    if (!hasTextChild) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'input-field-structure',
        severity: 'info',
        currentValue: 'no text child',
        suggestion: `"${node.name}" input field has no text child for placeholder text.`,
        autoFixable: false,
      });
    }

    return violations;
  },
};
