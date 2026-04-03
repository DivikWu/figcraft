/**
 * Placeholder text rule — detect AI-generated or Lorem Ipsum placeholder content.
 *
 * Maps to the `contentRealistic` preflight audit category.
 */

import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';

const LOREM_PATTERNS = [
  /^lorem\s+ipsum/i,
  /^text\s+goes?\s+here/i,
  /^placeholder/i,
  /^sample\s+text/i,
  /^your\s+(text|title|content|name|email)\s+here/i,
  /^enter\s+(your|a)\s+/i,
  /^type\s+here/i,
  /^add\s+(your|a)\s+/i,
];

/** Single-word generic strings that suggest placeholder content (case-insensitive). */
const GENERIC_SINGLES = new Set([
  'button',
  'title',
  'subtitle',
  'label',
  'text',
  'heading',
  'description',
  'item',
  'card',
  'name',
  'content',
  'link',
  'header',
  'footer',
  'section',
  'body',
  'caption',
  'value',
]);

export const placeholderTextRule: LintRule = {
  name: 'placeholder-text',
  description:
    'Detect placeholder or generic text content (Lorem ipsum, "Title", "Button") that should be replaced with realistic copy.',
  category: 'naming',
  severity: 'heuristic',
  ai: {
    preventionHint:
      'Use realistic, contextually appropriate text. Never use "Lorem ipsum", "Title", "Button", or "Text goes here".',
    phase: ['content'],
    tags: ['text'],
  },

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'TEXT') return [];
    const chars = (node.characters ?? '').trim();
    if (!chars) return [];

    // Check Lorem/placeholder patterns
    for (const pattern of LOREM_PATTERNS) {
      if (pattern.test(chars)) {
        return [
          {
            nodeId: node.id,
            nodeName: node.name,
            rule: 'placeholder-text',
            severity: 'heuristic',
            currentValue: chars.length > 40 ? `${chars.slice(0, 40)}…` : chars,
            suggestion: `"${truncate(chars)}" looks like placeholder text — replace with realistic content`,
            autoFixable: false,
          },
        ];
      }
    }

    // Check single-word generic strings
    if (GENERIC_SINGLES.has(chars.toLowerCase()) && chars.length < 20) {
      return [
        {
          nodeId: node.id,
          nodeName: node.name,
          rule: 'placeholder-text',
          severity: 'heuristic',
          currentValue: chars,
          suggestion: `"${chars}" is too generic — use specific, contextual text instead`,
          autoFixable: false,
        },
      ];
    }

    return [];
  },
};

function truncate(s: string, max = 30): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
