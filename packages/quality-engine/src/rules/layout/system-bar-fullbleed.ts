/**
 * System bar full-bleed rule — validate that screens with system bars
 * have paddingLeft/Right/Top = 0 on the root frame.
 *
 * AGENTS.md rule 11: For screens with a system bar (iOS status bar, Android status bar),
 * the page-level frame MUST have paddingLeft: 0, paddingRight: 0, paddingTop: 0
 * and primaryAxisAlignItems: MIN so the system bar sits flush at the top edge.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../../types.js';

const SCREEN_NAME_RE = /welcome|sign.?in|sign.?up|forgot\s+password|create\s+account|screen|page|onboarding|settings|profile|dashboard|checkout|pricing|empty\s+state|home|landing|detail|list/i;
const SYSTEM_BAR_RE = /status.?bar|system.?bar|notification.?bar|时间栏|状态栏/i;

function isScreenLike(node: AbstractNode): boolean {
  if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return false;
  if (node.role === 'screen' || node.role === 'page') return true;
  return SCREEN_NAME_RE.test(node.name) &&
    (node.width ?? 0) >= 300 &&
    (node.height ?? 0) >= 500;
}

function hasSystemBarChild(node: AbstractNode): boolean {
  if (!node.children) return false;
  // Check first 3 children (system bar is typically at the top)
  const topChildren = node.children.slice(0, 3);
  return topChildren.some(child =>
    SYSTEM_BAR_RE.test(child.name) || child.role === 'system_bar',
  );
}

export const systemBarFullbleedRule: LintRule = {
  name: 'system-bar-fullbleed',
  description: 'Screens with system bars must have paddingLeft/Right/Top = 0 for full-bleed layout.',
  category: 'layout',
  severity: 'unsafe',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (!isScreenLike(node)) return [];
    if (!hasSystemBarChild(node)) return [];

    const violations: LintViolation[] = [];
    const pL = node.paddingLeft ?? 0;
    const pR = node.paddingRight ?? 0;
    const pT = node.paddingTop ?? 0;

    if (pL !== 0 || pR !== 0 || pT !== 0) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'system-bar-fullbleed',
        severity: 'unsafe',
        currentValue: `paddingLeft=${pL}, paddingRight=${pR}, paddingTop=${pT}`,
        expectedValue: 'paddingLeft=0, paddingRight=0, paddingTop=0',
        suggestion: `"${node.name}" has a system bar child but non-zero top/side padding. Set paddingLeft/Right/Top to 0 so the system bar sits flush.`,
        autoFixable: true,
        fixData: {
          fix: 'padding',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
        },
      });
    }

    if (node.primaryAxisAlignItems && node.primaryAxisAlignItems !== 'MIN') {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'system-bar-fullbleed',
        severity: 'unsafe',
        currentValue: `primaryAxisAlignItems=${node.primaryAxisAlignItems}`,
        expectedValue: 'primaryAxisAlignItems=MIN',
        suggestion: `"${node.name}" has a system bar but primaryAxisAlignItems is not MIN. Set to MIN so the system bar aligns to the top.`,
        autoFixable: true,
        fixData: {
          fix: 'alignment',
          primaryAxisAlignItems: 'MIN',
        },
      });
    }

    return violations;
  },
};
