/**
 * Tests for naming lint rules — placeholder-text detection.
 */

import { describe, expect, it } from 'vitest';
import { placeholderTextRule } from '../../packages/quality-engine/src/rules/naming/placeholder-text.js';
import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';

const emptyCtx: LintContext = {
  colorTokens: new Map(),
  spacingTokens: new Map(),
  radiusTokens: new Map(),
  typographyTokens: new Map(),
  variableIds: new Map(),
};

function textNode(characters: string, overrides?: Partial<AbstractNode>): AbstractNode {
  return { id: '1:1', name: characters, type: 'TEXT', characters, ...overrides };
}

describe('placeholder-text', () => {
  // ── Lorem ipsum patterns ──
  it('flags "Lorem ipsum dolor sit amet"', () => {
    const v = placeholderTextRule.check(textNode('Lorem ipsum dolor sit amet'), emptyCtx);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('placeholder-text');
  });

  it('flags "lorem ipsum" (case insensitive)', () => {
    const v = placeholderTextRule.check(textNode('lorem ipsum'), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('flags "Text goes here"', () => {
    const v = placeholderTextRule.check(textNode('Text goes here'), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('flags "Placeholder"', () => {
    const v = placeholderTextRule.check(textNode('Placeholder text'), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('flags "Your text here"', () => {
    const v = placeholderTextRule.check(textNode('Your text here'), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('flags "Sample text for preview"', () => {
    const v = placeholderTextRule.check(textNode('Sample text for preview'), emptyCtx);
    expect(v).toHaveLength(1);
  });

  // ── Single-word generic strings ──
  it('flags "Button"', () => {
    const v = placeholderTextRule.check(textNode('Button'), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('flags "Title"', () => {
    const v = placeholderTextRule.check(textNode('Title'), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('flags "Label"', () => {
    const v = placeholderTextRule.check(textNode('Label'), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('flags "text" (lowercase)', () => {
    const v = placeholderTextRule.check(textNode('text'), emptyCtx);
    expect(v).toHaveLength(1);
  });

  // ── Passes realistic content ──
  it('passes "Sign In"', () => {
    const v = placeholderTextRule.check(textNode('Sign In'), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('passes "sarah@email.com"', () => {
    const v = placeholderTextRule.check(textNode('sarah@email.com'), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('passes "$12,480"', () => {
    const v = placeholderTextRule.check(textNode('$12,480'), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('passes "Welcome back"', () => {
    const v = placeholderTextRule.check(textNode('Welcome back'), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('passes "2h ago · 24 likes · 3 replies"', () => {
    const v = placeholderTextRule.check(textNode('2h ago · 24 likes · 3 replies'), emptyCtx);
    expect(v).toHaveLength(0);
  });

  // ── Edge cases ──
  it('skips non-TEXT nodes', () => {
    const node: AbstractNode = { id: '1:1', name: 'Title', type: 'FRAME' };
    const v = placeholderTextRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('skips empty text', () => {
    const v = placeholderTextRule.check(textNode(''), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('skips whitespace-only text', () => {
    const v = placeholderTextRule.check(textNode('   '), emptyCtx);
    expect(v).toHaveLength(0);
  });
});
