/**
 * Tests for additional lint rules — layout, wcag, token rules.
 */

import { describe, it, expect } from 'vitest';
import type { AbstractNode, LintContext } from '../src/plugin/linter/types.js';
import { fixedInAutolayoutRule } from '../src/plugin/linter/rules/fixed-in-autolayout.js';
import { hardcodedTokenRule } from '../src/plugin/linter/rules/hardcoded-token.js';
import { wcagTargetSizeRule } from '../src/plugin/linter/rules/wcag-target-size.js';
import { wcagLineHeightRule } from '../src/plugin/linter/rules/wcag-line-height.js';
import { maxNestingDepthRule } from '../src/plugin/linter/rules/max-nesting-depth.js';
import { formConsistencyRule } from '../src/plugin/linter/rules/form-consistency.js';

const emptyCtx: LintContext = {
  colorTokens: new Map(),
  spacingTokens: new Map(),
  radiusTokens: new Map(),
  typographyTokens: new Map(),
  variableIds: new Map(),
};

const libraryCtx: LintContext = {
  ...emptyCtx,
  mode: 'library',
  selectedLibrary: 'TestLib',
};

function makeNode(overrides: Partial<AbstractNode>): AbstractNode {
  return { id: '1:1', name: 'Test', type: 'FRAME', ...overrides };
}

// ─── fixed-in-autolayout ───

describe('fixed-in-autolayout', () => {
  it('flags absolute child in auto layout', () => {
    const node = makeNode({
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      children: [
        makeNode({ id: '2:1', layoutPositioning: 'ABSOLUTE' }),
      ],
    });
    const v = fixedInAutolayoutRule.check(node, emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('passes normal children in auto layout', () => {
    const node = makeNode({
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      children: [makeNode({ id: '2:1' })],
    });
    const v = fixedInAutolayoutRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('ignores non-auto-layout frames', () => {
    const node = makeNode({
      type: 'FRAME',
      children: [makeNode({ id: '2:1', layoutPositioning: 'ABSOLUTE' })],
    });
    const v = fixedInAutolayoutRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });
});

// ─── hardcoded-token ───

describe('hardcoded-token', () => {
  it('flags unbound fill in library mode', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: '#FF0000', visible: true }],
    });
    const v = hardcodedTokenRule.check(node, libraryCtx);
    expect(v.length).toBeGreaterThanOrEqual(1);
    expect(v[0].rule).toBe('hardcoded-token');
  });

  it('passes node with bound variables', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: '#FF0000', visible: true }],
      boundVariables: { fills: [{ id: 'var:123' }] },
    });
    const v = hardcodedTokenRule.check(node, libraryCtx);
    const fillViolations = v.filter((vi) => String(vi.currentValue).includes('fill'));
    expect(fillViolations).toHaveLength(0);
  });

  it('skips in spec mode', () => {
    const specCtx: LintContext = { ...emptyCtx, mode: 'spec' };
    const node = makeNode({
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: '#FF0000', visible: true }],
    });
    const v = hardcodedTokenRule.check(node, specCtx);
    expect(v).toHaveLength(0);
  });
});

// ─── wcag-target-size ───

describe('wcag-target-size', () => {
  it('flags small button', () => {
    const v = wcagTargetSizeRule.check(
      makeNode({ name: 'Submit Button', type: 'FRAME', width: 30, height: 30 }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe('error');
  });

  it('passes large button', () => {
    const v = wcagTargetSizeRule.check(
      makeNode({ name: 'Submit Button', type: 'FRAME', width: 120, height: 48 }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });

  it('ignores non-interactive elements', () => {
    const v = wcagTargetSizeRule.check(
      makeNode({ name: 'Decorative Frame', type: 'FRAME', width: 10, height: 10 }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

// ─── wcag-line-height ───

describe('wcag-line-height', () => {
  it('flags tight line height', () => {
    const v = wcagLineHeightRule.check(
      makeNode({ type: 'TEXT', fontSize: 16, lineHeight: { unit: 'PIXELS', value: 12 } }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
  });

  it('passes adequate line height', () => {
    const v = wcagLineHeightRule.check(
      makeNode({ type: 'TEXT', fontSize: 16, lineHeight: { unit: 'PIXELS', value: 24 } }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });

  it('passes AUTO line height', () => {
    const v = wcagLineHeightRule.check(
      makeNode({ type: 'TEXT', fontSize: 16, lineHeight: { unit: 'AUTO' } }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

// ─── max-nesting-depth ───

describe('max-nesting-depth', () => {
  it('flags deeply nested frames', () => {
    let deepest: AbstractNode = makeNode({ id: '9:1', name: 'Deep', type: 'FRAME' });
    for (let i = 8; i >= 2; i--) {
      deepest = makeNode({ id: `${i}:1`, name: `Level ${i}`, type: 'FRAME', children: [deepest] });
    }
    const root = makeNode({ id: '1:1', name: 'Root', type: 'FRAME', children: [deepest] });

    const v = maxNestingDepthRule.check(root, emptyCtx);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].rule).toBe('max-nesting-depth');
  });

  it('passes shallow nesting', () => {
    const node = makeNode({
      type: 'FRAME',
      children: [
        makeNode({ id: '2:1', type: 'FRAME', children: [
          makeNode({ id: '3:1', type: 'TEXT' }),
        ]}),
      ],
    });
    const v = maxNestingDepthRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('ignores non-container types', () => {
    const v = maxNestingDepthRule.check(makeNode({ type: 'RECTANGLE' }), emptyCtx);
    expect(v).toHaveLength(0);
  });
});

// ─── button-structure (enhanced) ───

import { buttonStructureRule } from '../src/plugin/linter/rules/button-structure.js';
import { textOverflowRule } from '../src/plugin/linter/rules/text-overflow.js';

describe('button-structure', () => {
  it('flags non-frame button', () => {
    const v = buttonStructureRule.check(
      makeNode({ name: 'Submit Button', type: 'RECTANGLE', width: 120, height: 48 }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].autoFixable).toBe(false);
  });

  it('flags button without auto-layout', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Login Button', type: 'FRAME', width: 120, height: 48,
        children: [makeNode({ id: '2:1', type: 'TEXT', name: 'Login', characters: 'Login' })],
      }),
      emptyCtx,
    );
    expect(v.some(vi => vi.fixData?.fix === 'layout' || vi.fixData?.layoutMode)).toBe(true);
    expect(v.some(vi => vi.autoFixable)).toBe(true);
  });

  it('flags button with insufficient padding', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Submit Btn', type: 'FRAME', width: 120, height: 48,
        layoutMode: 'HORIZONTAL',
        paddingLeft: 4, paddingRight: 4,
        children: [makeNode({ id: '2:1', type: 'TEXT', name: 'Submit', characters: 'Submit' })],
      }),
      emptyCtx,
    );
    const padViolation = v.find(vi => vi.fixData?.fix === 'padding');
    expect(padViolation).toBeDefined();
    expect(padViolation!.autoFixable).toBe(true);
    expect(padViolation!.fixData!.paddingLeft).toBe(24);
  });

  it('passes button with adequate padding', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Submit Btn', type: 'FRAME', width: 120, height: 48,
        layoutMode: 'HORIZONTAL',
        paddingLeft: 24, paddingRight: 24,
        children: [makeNode({ id: '2:1', type: 'TEXT', name: 'Submit', characters: 'Submit' })],
      }),
      emptyCtx,
    );
    const padViolation = v.find(vi => vi.fixData?.fix === 'padding');
    expect(padViolation).toBeUndefined();
  });

  it('flags button with height below 44', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Tiny Button', type: 'FRAME', width: 120, height: 30,
        layoutMode: 'HORIZONTAL', paddingLeft: 24, paddingRight: 24,
      }),
      emptyCtx,
    );
    const heightViolation = v.find(vi => vi.fixData?.fix === 'height');
    expect(heightViolation).toBeDefined();
    expect(heightViolation!.autoFixable).toBe(true);
    expect(heightViolation!.fixData!.height).toBe(48);
  });

  it('passes button with adequate height', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Good Button', type: 'FRAME', width: 120, height: 48,
        layoutMode: 'HORIZONTAL', paddingLeft: 24, paddingRight: 24,
      }),
      emptyCtx,
    );
    const heightViolation = v.find(vi => vi.fixData?.fix === 'height');
    expect(heightViolation).toBeUndefined();
  });

  it('flags decorative shapes overlapping text without auto-layout', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Fancy Button', type: 'FRAME', width: 120, height: 48,
        children: [
          makeNode({ id: '2:1', type: 'TEXT', name: 'Click', characters: 'Click' }),
          makeNode({ id: '2:2', type: 'ELLIPSE', name: 'Circle', width: 40, height: 40 }),
        ],
      }),
      emptyCtx,
    );
    const shapeViolation = v.find(vi => String(vi.currentValue).includes('shape'));
    expect(shapeViolation).toBeDefined();
    expect(shapeViolation!.autoFixable).toBe(true); // now fixable via auto-layout
  });

  it('detects button by fill + single text child pattern', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Primary Action', type: 'FRAME', width: 120, height: 48,
        fills: [{ type: 'SOLID', color: '#007AFF', visible: true }],
        children: [makeNode({ id: '2:1', type: 'TEXT', name: 'Go', characters: 'Go' })],
      }),
      emptyCtx,
    );
    // Should detect as button even without "button" in name
    expect(v.length).toBeGreaterThan(0);
  });

  it('ignores non-button frames', () => {
    const v = buttonStructureRule.check(
      makeNode({ name: 'Header Section', type: 'FRAME', width: 400, height: 60 }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });

  it('skips padding/height checks for COMPONENT buttons', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Submit Button', type: 'COMPONENT', width: 120, height: 30,
        layoutMode: 'HORIZONTAL', paddingLeft: 4, paddingRight: 4,
      }),
      emptyCtx,
    );
    // Should NOT have padding or height violations (component-defined)
    const padViolation = v.find(vi => vi.fixData?.fix === 'padding');
    const heightViolation = v.find(vi => vi.fixData?.fix === 'height');
    expect(padViolation).toBeUndefined();
    expect(heightViolation).toBeUndefined();
  });

  it('skips padding/height checks for INSTANCE buttons', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Submit Button', type: 'INSTANCE', width: 120, height: 30,
        layoutMode: 'HORIZONTAL', paddingLeft: 2, paddingRight: 2,
      }),
      emptyCtx,
    );
    const padViolation = v.find(vi => vi.fixData?.fix === 'padding');
    const heightViolation = v.find(vi => vi.fixData?.fix === 'height');
    expect(padViolation).toBeUndefined();
    expect(heightViolation).toBeUndefined();
  });
});

// ─── text-overflow (enhanced) ───

describe('text-overflow', () => {
  it('flags text wider than parent', () => {
    const v = textOverflowRule.check(
      makeNode({
        type: 'TEXT', name: 'Long Label', width: 500, height: 20,
        characters: 'This is a very long text that overflows',
        parentWidth: 300,
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].autoFixable).toBe(true);
    // No parent layout → WIDTH_AND_HEIGHT
    expect(v[0].fixData?.textAutoResize).toBe('WIDTH_AND_HEIGHT');
  });

  it('uses HEIGHT fix when parent has auto-layout', () => {
    const v = textOverflowRule.check(
      makeNode({
        type: 'TEXT', name: 'Long Label', width: 500, height: 20,
        characters: 'This is a very long text that overflows',
        parentWidth: 300,
        parentLayoutMode: 'VERTICAL',
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].fixData?.textAutoResize).toBe('HEIGHT');
  });

  it('passes text within parent bounds', () => {
    const v = textOverflowRule.check(
      makeNode({
        type: 'TEXT', name: 'Short Label', width: 100, height: 20,
        characters: 'Hello',
        parentWidth: 300,
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });

  it('flags heuristic overflow for long single-line text', () => {
    const longText = 'A'.repeat(200);
    const v = textOverflowRule.check(
      makeNode({
        type: 'TEXT', name: 'Clipped Text', width: 100, height: 20,
        characters: longText, fontSize: 16,
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].autoFixable).toBe(true);
  });

  it('ignores non-text nodes', () => {
    const v = textOverflowRule.check(
      makeNode({ type: 'FRAME', name: 'Container', width: 300 }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });

  it('ignores short text', () => {
    const v = textOverflowRule.check(
      makeNode({
        type: 'TEXT', name: 'OK', width: 30, height: 20,
        characters: 'OK', fontSize: 16,
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

// ─── form-consistency ───

describe('form-consistency', () => {
  it('flags narrow children in a form container', () => {
    const v = formConsistencyRule.check(
      makeNode({
        name: 'Login Form',
        type: 'FRAME',
        layoutMode: 'VERTICAL',
        width: 350,
        children: [
          makeNode({ id: '2:1', name: 'Email Input', type: 'FRAME', width: 350,
            fills: [{ type: 'SOLID', color: '#FFFFFF', visible: true }] }),
          makeNode({ id: '2:2', name: 'Password Input', type: 'FRAME', width: 350,
            strokes: [{ type: 'SOLID', color: '#E0E0E0', visible: true }] }),
          makeNode({ id: '2:3', name: 'Login Button', type: 'FRAME', width: 200,
            fills: [{ type: 'SOLID', color: '#0066FF', visible: true }] }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].nodeName).toBe('Login Button');
    expect(v[0].rule).toBe('form-consistency');
    expect(v[0].autoFixable).toBe(true);
  });

  it('passes when all children have consistent widths', () => {
    const v = formConsistencyRule.check(
      makeNode({
        name: 'Login Form',
        type: 'FRAME',
        layoutMode: 'VERTICAL',
        width: 350,
        children: [
          makeNode({ id: '2:1', name: 'Email Input', type: 'FRAME', width: 350,
            strokes: [{ type: 'SOLID', color: '#E0E0E0', visible: true }] }),
          makeNode({ id: '2:2', name: 'Login Button', type: 'FRAME', width: 350,
            fills: [{ type: 'SOLID', color: '#0066FF', visible: true }] }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });

  it('skips non-form containers', () => {
    const v = formConsistencyRule.check(
      makeNode({
        name: 'Header',
        type: 'FRAME',
        layoutMode: 'VERTICAL',
        width: 350,
        children: [
          makeNode({ id: '2:1', name: 'Title', type: 'TEXT', width: 200 }),
          makeNode({ id: '2:2', name: 'Subtitle', type: 'TEXT', width: 150 }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });

  it('skips HORIZONTAL layout containers', () => {
    const v = formConsistencyRule.check(
      makeNode({
        name: 'Login Form',
        type: 'FRAME',
        layoutMode: 'HORIZONTAL',
        width: 350,
        children: [
          makeNode({ id: '2:1', name: 'Email Input', type: 'FRAME', width: 200,
            strokes: [{ type: 'SOLID', color: '#E0E0E0', visible: true }] }),
          makeNode({ id: '2:2', name: 'Login Button', type: 'FRAME', width: 100,
            fills: [{ type: 'SOLID', color: '#0066FF', visible: true }] }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});
