/**
 * Mobile dimensions rule — validate screen root frames use correct standard dimensions.
 *
 * Standard dimensions (AGENTS.md rule 12):
 * - iOS: 402×874 (iPhone 16 Pro)
 * - Android: 412×915 (common Android viewport)
 *
 * Flags screen-like root frames that use legacy or non-standard mobile dimensions.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../../types.js';

const SCREEN_NAME_RE = /welcome|sign.?in|sign.?up|forgot\s+password|create\s+account|screen|page|onboarding|settings|profile|dashboard|checkout|pricing|empty\s+state|home|landing|detail|list/i;

/** Known standard mobile dimensions [width, height]. */
const STANDARD_DIMS: Array<{ platform: string; width: number; height: number }> = [
  { platform: 'iOS', width: 402, height: 874 },
  { platform: 'Android', width: 412, height: 915 },
];

/** Legacy dimensions that should be flagged. */
const LEGACY_DIMS: Array<{ width: number; height: number; suggestion: string }> = [
  { width: 390, height: 844, suggestion: 'Legacy iPhone 14 size. Use 402×874 (iPhone 16 Pro) instead.' },
  { width: 375, height: 812, suggestion: 'Legacy iPhone X/11 Pro size. Use 402×874 (iPhone 16 Pro) instead.' },
  { width: 360, height: 800, suggestion: 'Legacy Android size. Use 412×915 instead.' },
  { width: 360, height: 780, suggestion: 'Legacy Android size. Use 412×915 instead.' },
  { width: 393, height: 852, suggestion: 'Legacy iPhone 15 size. Use 402×874 (iPhone 16 Pro) instead.' },
];

function isScreenLike(node: AbstractNode): boolean {
  if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return false;
  if (node.role === 'screen' || node.role === 'page') return true;
  return SCREEN_NAME_RE.test(node.name) &&
    (node.width ?? 0) >= 300 &&
    (node.height ?? 0) >= 500;
}

function isMobileSized(node: AbstractNode): boolean {
  const w = node.width ?? 0;
  const h = node.height ?? 0;
  // Mobile screens are typically 300-450 wide and 600-1000 tall
  return w >= 300 && w <= 450 && h >= 500 && h <= 1000;
}

export const mobileDimensionsRule: LintRule = {
  name: 'mobile-dimensions',
  description: 'Mobile screen frames should use standard dimensions: iOS 402×874, Android 412×915.',
  category: 'layout',
  severity: 'style',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (!isScreenLike(node)) return [];
    if (!isMobileSized(node)) return [];

    const w = node.width ?? 0;
    const h = node.height ?? 0;

    // Check if it matches a standard dimension — if so, no violation
    for (const std of STANDARD_DIMS) {
      if (w === std.width && h === std.height) return [];
    }

    // Check if it matches a known legacy dimension
    for (const legacy of LEGACY_DIMS) {
      if (w === legacy.width && h === legacy.height) {
        // Determine the best standard to suggest
        const isIosLike = w <= 400;
        const target = isIosLike ? STANDARD_DIMS[0] : STANDARD_DIMS[1];
        return [{
          nodeId: node.id,
          nodeName: node.name,
          rule: 'mobile-dimensions',
          severity: 'style',
          currentValue: `${w}×${h}`,
          expectedValue: `${target.width}×${target.height}`,
          suggestion: `"${node.name}" uses ${legacy.suggestion}`,
          autoFixable: true,
          fixData: { fix: 'resize', width: target.width, height: target.height },
        }];
      }
    }

    // Non-standard but not a known legacy — flag as info, not auto-fixable
    // (auto-resizing could break existing content layout)
    const isIosLike = w <= 406;
    const target = isIosLike ? STANDARD_DIMS[0] : STANDARD_DIMS[1];
    return [{
      nodeId: node.id,
      nodeName: node.name,
      rule: 'mobile-dimensions',
      severity: 'style',
      currentValue: `${w}×${h}`,
      expectedValue: `${target.width}×${target.height}`,
      suggestion: `"${node.name}" uses non-standard mobile dimensions ${w}×${h}. Consider ${target.platform} standard: ${target.width}×${target.height}.`,
      autoFixable: false,
    }];
  },
};
