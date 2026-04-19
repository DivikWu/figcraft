/**
 * Tests for token-related lint rules: spec-color, spec-typography, spec-border-radius.
 */

import { describe, expect, it } from 'vitest';
import { hardcodedTokenRule } from '../../packages/quality-engine/src/rules/spec/hardcoded-token.js';
import { noTextStyleRule } from '../../packages/quality-engine/src/rules/spec/no-text-style.js';
import { specBorderRadiusRule } from '../../packages/quality-engine/src/rules/spec/spec-border-radius.js';
import { specColorRule } from '../../packages/quality-engine/src/rules/spec/spec-color.js';
import { specTypographyRule } from '../../packages/quality-engine/src/rules/spec/spec-typography.js';
import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';

function makeNode(overrides: Partial<AbstractNode>): AbstractNode {
  return { id: '1:1', name: 'Test', type: 'FRAME', ...overrides };
}

const emptyCtx: LintContext = {
  colorTokens: new Map(),
  spacingTokens: new Map(),
  radiusTokens: new Map(),
  typographyTokens: new Map(),
  variableIds: new Map(),
};

// ─── token rules preventionHint ───

describe('token rules preventionHint', () => {
  it('spec-color has preventionHint', () => {
    expect(specColorRule.ai?.preventionHint).toBeDefined();
  });
  it('hardcoded-token has preventionHint', () => {
    expect(hardcodedTokenRule.ai?.preventionHint).toBeDefined();
  });
  it('no-text-style has preventionHint', () => {
    expect(noTextStyleRule.ai?.preventionHint).toBeDefined();
  });
});

// ─── spec-color ───

describe('spec-color', () => {
  const colorCtx: LintContext = {
    ...emptyCtx,
    colorTokens: new Map([
      ['color/brand/primary', '#0066ff'],
      ['color/neutral/white', '#ffffff'],
      ['color/neutral/black', '#000000'],
    ]),
    variableIds: new Map([['color/brand/primary', 'var:1']]),
  };

  it('flags hardcoded fill matching a token', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: '#0066ff', visible: true }],
    });
    const v = specColorRule.check(node, colorCtx);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('spec-color');
    expect(v[0].autoFixable).toBe(true);
    expect(v[0].fixData?.variableId).toBe('var:1');
  });

  it('flags near-match color (within delta)', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: '#0065fe', visible: true }],
    });
    const v = specColorRule.check(node, colorCtx);
    expect(v).toHaveLength(1);
    expect(v[0].expectedValue).toBe('#0066ff');
  });

  it('skips node with bound variables', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: '#0066ff', visible: true }],
      boundVariables: { fills: [{ id: 'var:1' }] },
    });
    const v = specColorRule.check(node, colorCtx);
    expect(v).toHaveLength(0);
  });

  it('skips node with fillStyleId', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: '#0066ff', visible: true }],
      fillStyleId: 'S:abc',
    });
    const v = specColorRule.check(node, colorCtx);
    expect(v).toHaveLength(0);
  });

  it('flags stroke color matching a token', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      strokes: [{ type: 'SOLID', color: '#000000', visible: true }],
    });
    const v = specColorRule.check(node, colorCtx);
    expect(v).toHaveLength(1);
    expect(v[0].fixData?.property).toBe('strokes');
  });

  it('skips invisible fills', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: '#0066ff', visible: false }],
    });
    const v = specColorRule.check(node, colorCtx);
    expect(v).toHaveLength(0);
  });

  it('skips gradient fills', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      fills: [{ type: 'GRADIENT_LINEAR', visible: true }],
    });
    const v = specColorRule.check(node, colorCtx);
    expect(v).toHaveLength(0);
  });

  it('returns empty when no color tokens', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: '#ff0000', visible: true }],
    });
    const v = specColorRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });
});

// ─── spec-typography ───

describe('spec-typography', () => {
  const typoCtx: LintContext = {
    ...emptyCtx,
    typographyTokens: new Map([
      ['typography/body', { fontSize: 16, fontFamily: 'Inter' }],
      ['typography/heading', { fontSize: 24, fontFamily: 'Inter' }],
      ['typography/caption', { fontSize: 12 }],
    ]),
  };

  it('flags text matching a typography token', () => {
    const node = makeNode({
      type: 'TEXT',
      fontSize: 16,
      fontName: { family: 'Inter', style: 'Regular' },
    });
    const v = specTypographyRule.check(node, typoCtx);
    expect(v).toHaveLength(1);
    expect(v[0].expectedValue).toBe('typography/body');
    expect(v[0].autoFixable).toBe(true);
  });

  it('matches token without fontFamily constraint', () => {
    const node = makeNode({
      type: 'TEXT',
      fontSize: 12,
      fontName: { family: 'Roboto', style: 'Regular' },
    });
    const v = specTypographyRule.check(node, typoCtx);
    expect(v).toHaveLength(1);
    expect(v[0].expectedValue).toBe('typography/caption');
  });

  it('skips text with textStyleId', () => {
    const node = makeNode({
      type: 'TEXT',
      fontSize: 16,
      textStyleId: 'S:abc',
    });
    const v = specTypographyRule.check(node, typoCtx);
    expect(v).toHaveLength(0);
  });

  it('skips non-text nodes', () => {
    const v = specTypographyRule.check(makeNode({ type: 'FRAME' }), typoCtx);
    expect(v).toHaveLength(0);
  });

  it('returns empty when no typography tokens', () => {
    const node = makeNode({ type: 'TEXT', fontSize: 16 });
    const v = specTypographyRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('skips text with non-matching fontSize', () => {
    const node = makeNode({
      type: 'TEXT',
      fontSize: 18,
      fontName: { family: 'Inter', style: 'Regular' },
    });
    const v = specTypographyRule.check(node, typoCtx);
    expect(v).toHaveLength(0);
  });
});

// ─── spec-border-radius ───

describe('spec-border-radius', () => {
  const radiusCtx: LintContext = {
    ...emptyCtx,
    radiusTokens: new Map([
      ['radius/sm', 4],
      ['radius/md', 8],
      ['radius/lg', 16],
    ]),
  };

  it('flags non-token corner radius', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      cornerRadius: 6,
    });
    const v = specBorderRadiusRule.check(node, radiusCtx);
    expect(v).toHaveLength(1);
    expect(v[0].autoFixable).toBe(true);
  });

  it('passes exact token match', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      cornerRadius: 8,
    });
    const v = specBorderRadiusRule.check(node, radiusCtx);
    expect(v).toHaveLength(0);
  });

  it('flags array corner radius', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      cornerRadius: [6, 6, 6, 6],
    });
    const v = specBorderRadiusRule.check(node, radiusCtx);
    expect(v.length).toBeGreaterThanOrEqual(1);
  });

  it('skips zero radius', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      cornerRadius: 0,
    });
    const v = specBorderRadiusRule.check(node, radiusCtx);
    expect(v).toHaveLength(0);
  });

  it('skips bound variables', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      cornerRadius: 6,
      boundVariables: { cornerRadius: { id: 'var:1' } },
    });
    const v = specBorderRadiusRule.check(node, radiusCtx);
    expect(v).toHaveLength(0);
  });

  it('returns empty when no radius tokens', () => {
    const node = makeNode({ type: 'RECTANGLE', cornerRadius: 6 });
    const v = specBorderRadiusRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('skips node without cornerRadius', () => {
    const node = makeNode({ type: 'TEXT' });
    const v = specBorderRadiusRule.check(node, radiusCtx);
    expect(v).toHaveLength(0);
  });
});
