/**
 * Button structure rule — detect buttons that are not proper auto-layout frames.
 *
 * Flags nodes whose name contains "button" (case-insensitive) that:
 * - Are not FRAME type (e.g. bare rectangles or groups used as buttons)
 * - Are frames but have no auto-layout (layoutMode === undefined or 'NONE')
 * - Have overlapping children (e.g. a circle/rectangle stacked on top of text)
 * - Have insufficient padding (< 16px total horizontal)
 * - Have insufficient height (< 44pt)
 *
 * Proper buttons should be auto-layout frames with centered text inside.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

const BUTTON_NAME_RE = /button|btn|按钮|登录|注册|submit|sign.?in|sign.?up|log.?in/i;

function looksLikeButton(node: AbstractNode): boolean {
  if (BUTTON_NAME_RE.test(node.name)) return true;
  // A frame with exactly one text child + a fill is likely a button
  if (node.type === 'FRAME' && node.children?.length === 1 &&
      node.children[0].type === 'TEXT' &&
      node.fills && node.fills.some(f => f.visible !== false && f.opacity !== 0)) {
    return true;
  }
  return false;
}

const MIN_BUTTON_HEIGHT = 44;
const MIN_BUTTON_HPAD = 16; // minimum total horizontal padding (left + right)

export const buttonStructureRule: LintRule = {
  name: 'button-structure',
  description: 'Buttons must be auto-layout frames with centered text, adequate padding and height.',
  category: 'layout',
  severity: 'warning',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (!looksLikeButton(node)) return [];
    const violations: LintViolation[] = [];

    // Check 1: Button is not a frame
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'button-structure',
        severity: 'warning',
        currentValue: `${node.type} used as button`,
        suggestion: `"${node.name}" looks like a button but is a ${node.type}. Convert to an auto-layout frame with text inside, using primaryAxisAlignItems: CENTER and counterAxisAlignItems: CENTER.`,
        autoFixable: false,
      });
      return violations;
    }

    // Check 2: Frame button without auto-layout
    if (node.type === 'FRAME' && (!node.layoutMode || node.layoutMode === 'NONE')) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'button-structure',
        severity: 'warning',
        currentValue: 'no auto-layout',
        suggestion: `"${node.name}" is a button without auto-layout. Set layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER".`,
        autoFixable: true,
        fixData: {
          fix: 'layout',
          layoutMode: 'HORIZONTAL',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
        },
      });
    }

    // Check 3: Button has non-text children that could overlap text (decorative shapes)
    if (node.children && node.children.length > 1) {
      const textChildren = node.children.filter(c => c.type === 'TEXT');
      const shapeChildren = node.children.filter(c =>
        c.type === 'ELLIPSE' || c.type === 'RECTANGLE' || c.type === 'VECTOR',
      );
      if (textChildren.length > 0 && shapeChildren.length > 0 &&
          (!node.layoutMode || node.layoutMode === 'NONE')) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'button-structure',
          severity: 'warning',
          currentValue: `${shapeChildren.length} shape(s) + ${textChildren.length} text node(s) without auto-layout`,
          suggestion: `"${node.name}" has shapes overlapping text. Enable auto-layout so children stack properly, or remove decorative shapes.`,
          autoFixable: true,
          fixData: {
            fix: 'layout',
            layoutMode: 'HORIZONTAL',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
          },
        });
      }
    }

    // Check 4: Button has auto-layout but insufficient padding
    // Skip COMPONENT/INSTANCE — their padding is defined by the component and shouldn't be overridden
    if (node.type === 'FRAME' && node.layoutMode && node.layoutMode !== 'NONE') {
      const hPad = (node.paddingLeft ?? 0) + (node.paddingRight ?? 0);
      if (hPad < MIN_BUTTON_HPAD) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'button-structure',
          severity: 'warning',
          currentValue: `horizontal padding ${hPad}px`,
          suggestion: `"${node.name}" button has insufficient horizontal padding (${hPad}px < ${MIN_BUTTON_HPAD}px). Text needs breathing room.`,
          autoFixable: true,
          fixData: {
            fix: 'padding',
            paddingLeft: Math.max(node.paddingLeft ?? 0, 24),
            paddingRight: Math.max(node.paddingRight ?? 0, 24),
          },
        });
      }
    }

    // Check 5: Button height too small for touch target
    // Skip COMPONENT/INSTANCE — their size is defined by the component
    if (node.type === 'FRAME' && node.height != null && node.height < MIN_BUTTON_HEIGHT) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'button-structure',
        severity: 'warning',
        currentValue: `height ${node.height}px`,
        suggestion: `"${node.name}" button is ${node.height}px tall, below ${MIN_BUTTON_HEIGHT}px minimum touch target.`,
        autoFixable: true,
        fixData: {
          fix: 'height',
          height: 48,
        },
      });
    }

    return violations;
  },
};
