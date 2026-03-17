/**
 * Stale text name rule — detect text nodes whose name doesn't match their content.
 *
 * When a text node's content is changed but the layer name isn't updated,
 * it creates confusion in the layer panel. Figma auto-names text layers
 * after their content, so a mismatch usually means stale naming.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

/** Prefixes that indicate intentional semantic naming (not stale). */
const SEMANTIC_PREFIXES = [
  'label', 'heading', 'title', 'subtitle', 'body', 'caption',
  'placeholder', 'hint', 'error', 'helper', 'description',
  'cta', 'link', 'nav', 'menu', 'tab', 'badge', 'tag', 'chip',
  'header', 'footer', 'section',
];

export const staleTextNameRule: LintRule = {
  name: 'stale-text-name',
  description: 'Detect text nodes whose layer name no longer matches their text content.',
  category: 'naming',
  severity: 'info',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'TEXT') return [];
    if (!node.characters) return [];

    const name = node.name.trim();
    const content = node.characters.trim();

    // Skip if name matches content (normal state)
    if (name === content) return [];

    // Skip if name starts with content (Figma truncates long text)
    if (content.startsWith(name) || name.startsWith(content)) return [];

    // Skip semantic names — these are intentional
    const lowerName = name.toLowerCase();
    if (SEMANTIC_PREFIXES.some((p) => lowerName.startsWith(p))) return [];

    // Skip very short names that might be abbreviations
    if (name.length <= 2) return [];

    // The name looks like old text content that wasn't updated
    return [{
      nodeId: node.id,
      nodeName: node.name,
      rule: 'stale-text-name',
      severity: 'info',
      currentValue: `name: "${name}", content: "${content.slice(0, 50)}${content.length > 50 ? '…' : ''}"`,
      suggestion: `Layer name "${name}" doesn't match text content — consider renaming to match`,
      autoFixable: false,
    }];
  },
};
