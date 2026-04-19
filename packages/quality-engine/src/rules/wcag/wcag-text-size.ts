/**
 * WCAG text size rule — minimum readable text size, platform-aware.
 *
 * Mobile (≤500px wide screen): ≥10px — denser viewing distance allows smaller text.
 * Desktop / tablet / web (>500px):  ≥12px — standard readability floor.
 *
 * Platform is determined from the nearest screen-like ancestor's width by the
 * engine's traversal (see `detectPlatform` in engine.ts). Falls back to
 * parentWidth heuristic when no screen ancestor was detected.
 */

import { DESIGN_CONSTANTS } from '../../constants.js';
import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';

const MOBILE_MIN = DESIGN_CONSTANTS.text.mobileMinSize;
const DESKTOP_MIN = DESIGN_CONSTANTS.text.desktopMinSize;

/** Determine the minimum font size threshold for this node's platform. */
function pickThreshold(node: AbstractNode): { min: number; platform: 'mobile' | 'desktop' } {
  if (node.platform === 'mobile') return { min: MOBILE_MIN, platform: 'mobile' };
  if (node.platform === 'desktop') return { min: DESKTOP_MIN, platform: 'desktop' };
  // Fallback: no screen ancestor detected. Use parentWidth as a weaker hint.
  if (node.parentWidth != null && node.parentWidth <= 500) {
    return { min: MOBILE_MIN, platform: 'mobile' };
  }
  return { min: DESKTOP_MIN, platform: 'desktop' };
}

export const wcagTextSizeRule: LintRule = {
  name: 'wcag-text-size',
  description: `Detect text smaller than the platform minimum (${MOBILE_MIN}px mobile, ${DESKTOP_MIN}px desktop) — very small text can be hard to read for many users.`,
  category: 'wcag',
  severity: 'heuristic',
  ai: {
    preventionHint: `Text fontSize must be ≥${MOBILE_MIN}px on mobile screens, ≥${DESKTOP_MIN}px on desktop/tablet/web`,
    phase: ['accessibility'],
    tags: ['text'],
  },

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    if (node.type !== 'TEXT') return [];
    if (!node.fontSize) return [];

    const { min, platform } = pickThreshold(node);
    if (node.fontSize >= min) return [];

    const platformLabelEn = platform === 'mobile' ? 'mobile' : 'desktop';
    const platformLabelZh = platform === 'mobile' ? '移动端' : '桌面端';

    return [
      {
        nodeId: node.id,
        nodeName: node.name,
        rule: 'wcag-text-size',
        severity: 'heuristic',
        currentValue: `${node.fontSize}px`,
        expectedValue: `>= ${min}px (${platformLabelEn})`,
        suggestion: tr(
          ctx.lang,
          `"${node.name}" is only ${node.fontSize}px — bump it to at least ${min}px for comfortable reading on ${platformLabelEn}`,
          `「${node.name}」字号仅 ${node.fontSize}px——${platformLabelZh}建议至少 ${min}px 以便舒适阅读`,
        ),
        autoFixable: true,
        fixData: { fontSize: min },
      },
    ];
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData) return null;
    return { kind: 'set-properties', props: { fontSize: v.fixData.fontSize } };
  },
};
