/**
 * Foreign style rule — detect nodes using paint/text/effect styles
 * that don't belong to the currently selected library.
 *
 * Existing rules (hardcoded-token, spec-color, no-text-style) skip nodes
 * that have a fillStyleId/textStyleId set, assuming "has a style = compliant".
 * This rule closes that gap by verifying the style actually belongs to the
 * selected library — not a leftover from a different library or file.
 *
 * Only active in library mode when libraryStyleIds is populated.
 */

import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';

export const foreignStyleRule: LintRule = {
  name: 'foreign-style',
  description: 'Detect styles (fill, text, effect) that belong to a different library than the one selected.',
  category: 'token',
  severity: 'heuristic',
  ai: {
    preventionHint:
      'Use fillVariableName/textStyleName from the selected library — avoid applying styles from other libraries',
    phase: ['styling'],
    tags: ['color', 'text'],
  },

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    // Only active in library mode with a library selected and style IDs populated
    if (ctx.mode !== 'library' || !ctx.selectedLibrary) return [];
    if (!ctx.libraryStyleIds || ctx.libraryStyleIds.size === 0) return [];

    // Descendants of COMPONENT/INSTANCE: style binding is the component
    // author's concern — skip to avoid noise on icon vectors etc.
    if (node.insideComponentSubtree) return [];

    const violations: LintViolation[] = [];

    // Check fillStyleId
    if (node.fillStyleId && !ctx.libraryStyleIds.has(node.fillStyleId)) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'foreign-style',
        severity: 'heuristic',
        currentValue: `fillStyleId: ${node.fillStyleId}`,
        suggestion: tr(
          ctx.lang,
          `"${node.name}" uses a fill style from a different library — rebind to a variable or style from "${ctx.selectedLibrary}"`,
          `「${node.name}」使用了其他库的填充样式——请改用「${ctx.selectedLibrary}」中的变量或样式`,
        ),
        autoFixable: true,
        fixData: {
          property: 'fills',
          hex: node.fills?.find((f) => f.type === 'SOLID' && f.visible !== false)?.color ?? null,
          opacity: node.fills?.find((f) => f.type === 'SOLID' && f.visible !== false)?.opacity ?? 1,
          nodeType: node.type,
          clearStyleId: true,
        },
      });
    }

    // Check textStyleId
    if (node.textStyleId && !ctx.libraryStyleIds.has(node.textStyleId)) {
      const hasValidFontSize = node.fontSize != null;
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'foreign-style',
        severity: 'heuristic',
        currentValue: `textStyleId: ${node.textStyleId}`,
        suggestion: tr(
          ctx.lang,
          `"${node.name}" uses a text style from a different library — apply a text style from "${ctx.selectedLibrary}"`,
          `「${node.name}」使用了其他库的文字样式——请改用「${ctx.selectedLibrary}」中的文字样式`,
        ),
        autoFixable: hasValidFontSize,
        fixData: { fontSize: node.fontSize, fontFamily: node.fontName?.family },
      });
    }

    // Check effectStyleId
    if (node.effectStyleId && !ctx.libraryStyleIds.has(node.effectStyleId)) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'foreign-style',
        severity: 'heuristic',
        currentValue: `effectStyleId: ${node.effectStyleId}`,
        suggestion: tr(
          ctx.lang,
          `"${node.name}" uses an effect style from a different library — apply an effect style from "${ctx.selectedLibrary}"`,
          `「${node.name}」使用了其他库的效果样式——请改用「${ctx.selectedLibrary}」中的效果样式`,
        ),
        autoFixable: false,
        fixData: {},
      });
    }

    return violations;
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData) return null;
    const prop = v.fixData.property as string | undefined;
    // Fill style → rebind to library color variable
    if (prop === 'fills') {
      return {
        kind: 'deferred',
        strategy: 'library-color-bind',
        data: { hex: v.fixData.hex, opacity: v.fixData.opacity, nodeType: v.fixData.nodeType },
      };
    }
    // Text style → rebind to library text style
    if (v.fixData.fontSize != null) {
      return {
        kind: 'deferred',
        strategy: 'library-text-style',
        data: { fontSize: v.fixData.fontSize, fontFamily: v.fixData.fontFamily },
      };
    }
    return null;
  },
};
