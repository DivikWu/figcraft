/**
 * Mobile dimensions rule — validate screen root frames use correct standard dimensions.
 *
 * Standard dimensions (AGENTS.md rule 12):
 * - iOS: 402×874 (iPhone 16 Pro)
 * - Android: 412×915 (common Android viewport)
 *
 * Flags screen-like root frames that use legacy or non-standard mobile dimensions.
 */

import { DESIGN_CONSTANTS, SCREEN_NAME_RE } from '../../constants.js';
import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';

/** Known standard mobile dimensions [width, height]. */
const STANDARD_DIMS: Array<{ platform: string; width: number; height: number }> = [
  { platform: 'iOS', width: DESIGN_CONSTANTS.screen.ios.width, height: DESIGN_CONSTANTS.screen.ios.height },
  { platform: 'Android', width: DESIGN_CONSTANTS.screen.android.width, height: DESIGN_CONSTANTS.screen.android.height },
];

/** Legacy dimensions that should be flagged. */
const LEGACY_DIMS: Array<{ width: number; height: number; en: string; zh: string }> = [
  { width: 390, height: 844, en: 'Legacy iPhone 14 size. Use 402×874 (iPhone 16 Pro) instead.', zh: 'iPhone 14 旧尺寸。建议改用 402×874(iPhone 16 Pro)。' },
  { width: 375, height: 812, en: 'Legacy iPhone X/11 Pro size. Use 402×874 (iPhone 16 Pro) instead.', zh: 'iPhone X / 11 Pro 旧尺寸。建议改用 402×874(iPhone 16 Pro)。' },
  { width: 360, height: 800, en: 'Legacy Android size. Use 412×915 instead.', zh: 'Android 旧尺寸。建议改用 412×915。' },
  { width: 360, height: 780, en: 'Legacy Android size. Use 412×915 instead.', zh: 'Android 旧尺寸。建议改用 412×915。' },
  { width: 393, height: 852, en: 'Legacy iPhone 15 size. Use 402×874 (iPhone 16 Pro) instead.', zh: 'iPhone 15 旧尺寸。建议改用 402×874(iPhone 16 Pro)。' },
];

function isScreenLike(node: AbstractNode): boolean {
  if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return false;
  if (node.role === 'screen' || node.role === 'page') return true;
  return SCREEN_NAME_RE.test(node.name) && (node.width ?? 0) >= 300 && (node.height ?? 0) >= 500;
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
  ai: {
    preventionHint: `Mobile screen dimensions: iOS ${DESIGN_CONSTANTS.screen.ios.width}×${DESIGN_CONSTANTS.screen.ios.height}, Android ${DESIGN_CONSTANTS.screen.android.width}×${DESIGN_CONSTANTS.screen.android.height} (no legacy sizes)`,
    phase: ['layout'],
    tags: ['screen'],
  },

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    if (!isScreenLike(node)) return [];
    if (!isMobileSized(node)) return [];

    const w = node.width ?? 0;
    const h = node.height ?? 0;

    // Only flag explicit legacy sizes we want to migrate away from.
    // Designers legitimately use many other mobile sizes (SE, Pro Max, foldables,
    // custom web viewports) — flagging "not exactly 402×874" is noise, not signal.
    for (const legacy of LEGACY_DIMS) {
      if (w === legacy.width && h === legacy.height) {
        const isIosLike = w <= 400;
        const target = isIosLike ? STANDARD_DIMS[0] : STANDARD_DIMS[1];
        return [
          {
            nodeId: node.id,
            nodeName: node.name,
            rule: 'mobile-dimensions',
            severity: 'style',
            currentValue: `${w}×${h}`,
            expectedValue: `${target.width}×${target.height}`,
            suggestion: tr(
              ctx.lang,
              `"${node.name}" uses ${legacy.en}`,
              `「${node.name}」使用了${legacy.zh}`,
            ),
            autoFixable: true,
            fixData: { fix: 'resize', width: target.width, height: target.height },
          },
        ];
      }
    }

    return [];
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData || v.fixData.width == null || v.fixData.height == null) return null;
    return {
      kind: 'resize',
      width: v.fixData.width as number,
      height: v.fixData.height as number,
      requireType: ['FRAME', 'COMPONENT'],
    };
  },
};
