/**
 * Overlapping children rule — detect unintentional overlaps in non-auto-layout frames.
 *
 * Excludes:
 * - Auto layout frames (children are managed)
 * - Component/Instance parents (overlaps are likely intentional)
 * - Small elements overlapping large ones (decorative badges, indicators)
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

export const overlappingChildrenRule: LintRule = {
  name: 'overlapping-children',
  description: 'Detect overlapping sibling nodes in non-auto-layout frames.',
  category: 'layout',
  severity: 'info',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    // Only check non-auto-layout frames
    if (node.type !== 'FRAME' && node.type !== 'GROUP') return [];
    if (node.layoutMode && node.layoutMode !== 'NONE') return [];
    // Skip components — overlaps are usually intentional
    if (node.type === 'COMPONENT' || node.type === 'INSTANCE') return [];

    const children = node.children?.filter((c) => c.x != null && c.y != null && c.width && c.height) ?? [];
    if (children.length < 2) return [];

    const violations: LintViolation[] = [];
    const reported = new Set<string>();

    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const a = children[i];
        const b = children[j];

        if (!rectsOverlap(a, b)) continue;

        // Skip if sizes differ significantly (small badge on large element)
        const areaA = (a.width ?? 0) * (a.height ?? 0);
        const areaB = (b.width ?? 0) * (b.height ?? 0);
        const ratio = Math.min(areaA, areaB) / Math.max(areaA, areaB);
        if (ratio < 0.3) continue;

        const key = [a.id, b.id].sort().join(':');
        if (reported.has(key)) continue;
        reported.add(key);

        violations.push({
          nodeId: a.id,
          nodeName: a.name,
          rule: 'overlapping-children',
          severity: 'info',
          currentValue: `overlaps with "${b.name}"`,
          suggestion: `"${a.name}" and "${b.name}" overlap in "${node.name}" — consider using auto layout or adjusting positions`,
          autoFixable: false,
        });
      }
    }

    return violations;
  },
};

function rectsOverlap(a: AbstractNode, b: AbstractNode): boolean {
  const ax = a.x ?? 0, ay = a.y ?? 0, aw = a.width ?? 0, ah = a.height ?? 0;
  const bx = b.x ?? 0, by = b.y ?? 0, bw = b.width ?? 0, bh = b.height ?? 0;

  // Allow 2px tolerance for anti-aliasing
  return ax < bx + bw - 2 && ax + aw > bx + 2 && ay < by + bh - 2 && ay + ah > by + 2;
}
