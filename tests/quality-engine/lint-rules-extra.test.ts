/**
 * Tests for additional lint rules — layout, wcag, token rules.
 */

import { describe, expect, it } from 'vitest';
import { fixedInAutolayoutRule } from '../../packages/quality-engine/src/rules/layout/fixed-in-autolayout.js';
import { maxNestingDepthRule } from '../../packages/quality-engine/src/rules/layout/max-nesting-depth.js';
import { screenBottomOverflowRule } from '../../packages/quality-engine/src/rules/layout/screen-bottom-overflow.js';
import { sectionSpacingCollapseRule } from '../../packages/quality-engine/src/rules/layout/section-spacing-collapse.js';
import { hardcodedTokenRule } from '../../packages/quality-engine/src/rules/spec/hardcoded-token.js';
import { ctaWidthInconsistentRule } from '../../packages/quality-engine/src/rules/structure/cta-width-inconsistent.js';
import { formConsistencyRule } from '../../packages/quality-engine/src/rules/structure/form-consistency.js';
import { headerFragmentedRule } from '../../packages/quality-engine/src/rules/structure/header-fragmented.js';
import { headerOutOfBandRule } from '../../packages/quality-engine/src/rules/structure/header-out-of-band.js';
import { inputFieldStructureRule } from '../../packages/quality-engine/src/rules/structure/input-field-structure.js';
import { navOvercrowdedRule } from '../../packages/quality-engine/src/rules/structure/nav-overcrowded.js';
import { nestedInteractiveShellRule } from '../../packages/quality-engine/src/rules/structure/nested-interactive-shell.js';
import { rootMisclassifiedInteractiveRule } from '../../packages/quality-engine/src/rules/structure/root-misclassified-interactive.js';
import { screenShellInvalidRule } from '../../packages/quality-engine/src/rules/structure/screen-shell-invalid.js';
import { socialRowCrampedRule } from '../../packages/quality-engine/src/rules/structure/social-row-cramped.js';
import { statsRowCrampedRule } from '../../packages/quality-engine/src/rules/structure/stats-row-cramped.js';
import { wcagLineHeightRule } from '../../packages/quality-engine/src/rules/wcag/wcag-line-height.js';
import { wcagTargetSizeRule } from '../../packages/quality-engine/src/rules/wcag/wcag-target-size.js';
import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';

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
      children: [makeNode({ id: '2:1', layoutPositioning: 'ABSOLUTE' })],
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
    expect(v[0].severity).toBe('heuristic');
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
      children: [makeNode({ id: '2:1', type: 'FRAME', children: [makeNode({ id: '3:1', type: 'TEXT' })] })],
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

import { textOverflowRule } from '../../packages/quality-engine/src/rules/layout/text-overflow.js';
import { buttonStructureRule } from '../../packages/quality-engine/src/rules/structure/button-structure.js';

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
        name: 'Login Button',
        type: 'FRAME',
        width: 120,
        height: 48,
        children: [makeNode({ id: '2:1', type: 'TEXT', name: 'Login', characters: 'Login' })],
      }),
      emptyCtx,
    );
    expect(v.some((vi) => vi.fixData?.fix === 'layout' || vi.fixData?.layoutMode)).toBe(true);
    expect(v.some((vi) => vi.autoFixable)).toBe(true);
  });

  it('flags button with insufficient padding', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Submit Btn',
        type: 'FRAME',
        width: 120,
        height: 48,
        layoutMode: 'HORIZONTAL',
        paddingLeft: 4,
        paddingRight: 4,
        children: [makeNode({ id: '2:1', type: 'TEXT', name: 'Submit', characters: 'Submit' })],
      }),
      emptyCtx,
    );
    const padViolation = v.find((vi) => vi.fixData?.fix === 'padding');
    expect(padViolation).toBeDefined();
    expect(padViolation!.autoFixable).toBe(true);
    expect(padViolation!.fixData!.paddingLeft).toBe(24);
  });

  it('passes button with adequate padding', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Submit Btn',
        type: 'FRAME',
        width: 120,
        height: 48,
        layoutMode: 'HORIZONTAL',
        paddingLeft: 24,
        paddingRight: 24,
        children: [makeNode({ id: '2:1', type: 'TEXT', name: 'Submit', characters: 'Submit' })],
      }),
      emptyCtx,
    );
    const padViolation = v.find((vi) => vi.fixData?.fix === 'padding');
    expect(padViolation).toBeUndefined();
  });

  it('flags button with height below 44', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Tiny Button',
        type: 'FRAME',
        width: 120,
        height: 30,
        layoutMode: 'HORIZONTAL',
        paddingLeft: 24,
        paddingRight: 24,
      }),
      emptyCtx,
    );
    const heightViolation = v.find((vi) => vi.fixData?.fix === 'height');
    expect(heightViolation).toBeDefined();
    expect(heightViolation!.autoFixable).toBe(true);
    expect(heightViolation!.fixData!.height).toBe(48);
  });

  it('passes button with adequate height', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Good Button',
        type: 'FRAME',
        width: 120,
        height: 48,
        layoutMode: 'HORIZONTAL',
        paddingLeft: 24,
        paddingRight: 24,
      }),
      emptyCtx,
    );
    const heightViolation = v.find((vi) => vi.fixData?.fix === 'height');
    expect(heightViolation).toBeUndefined();
  });

  it('flags decorative shapes overlapping text without auto-layout', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Fancy Button',
        type: 'FRAME',
        width: 120,
        height: 48,
        children: [
          makeNode({ id: '2:1', type: 'TEXT', name: 'Click', characters: 'Click' }),
          makeNode({ id: '2:2', type: 'ELLIPSE', name: 'Circle', width: 40, height: 40 }),
        ],
      }),
      emptyCtx,
    );
    const shapeViolation = v.find((vi) => String(vi.currentValue).includes('shape'));
    expect(shapeViolation).toBeDefined();
    expect(shapeViolation!.autoFixable).toBe(true); // now fixable via auto-layout
  });

  it('detects button by fill + single text child pattern', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Primary Action',
        type: 'FRAME',
        width: 120,
        height: 48,
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
        name: 'Submit Button',
        type: 'COMPONENT',
        width: 120,
        height: 30,
        layoutMode: 'HORIZONTAL',
        paddingLeft: 4,
        paddingRight: 4,
      }),
      emptyCtx,
    );
    // Should NOT have padding or height violations (component-defined)
    const padViolation = v.find((vi) => vi.fixData?.fix === 'padding');
    const heightViolation = v.find((vi) => vi.fixData?.fix === 'height');
    expect(padViolation).toBeUndefined();
    expect(heightViolation).toBeUndefined();
  });

  it('skips padding/height checks for INSTANCE buttons', () => {
    const v = buttonStructureRule.check(
      makeNode({
        name: 'Submit Button',
        type: 'INSTANCE',
        width: 120,
        height: 30,
        layoutMode: 'HORIZONTAL',
        paddingLeft: 2,
        paddingRight: 2,
      }),
      emptyCtx,
    );
    const padViolation = v.find((vi) => vi.fixData?.fix === 'padding');
    const heightViolation = v.find((vi) => vi.fixData?.fix === 'height');
    expect(padViolation).toBeUndefined();
    expect(heightViolation).toBeUndefined();
  });
});

// ─── text-overflow (enhanced) ───

describe('text-overflow', () => {
  it('flags text wider than parent', () => {
    const v = textOverflowRule.check(
      makeNode({
        type: 'TEXT',
        name: 'Long Label',
        width: 500,
        height: 20,
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
        type: 'TEXT',
        name: 'Long Label',
        width: 500,
        height: 20,
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
        type: 'TEXT',
        name: 'Short Label',
        width: 100,
        height: 20,
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
        type: 'TEXT',
        name: 'Clipped Text',
        width: 100,
        height: 20,
        characters: longText,
        fontSize: 16,
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].autoFixable).toBe(true);
  });

  it('ignores non-text nodes', () => {
    const v = textOverflowRule.check(makeNode({ type: 'FRAME', name: 'Container', width: 300 }), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('ignores short text', () => {
    const v = textOverflowRule.check(
      makeNode({
        type: 'TEXT',
        name: 'OK',
        width: 30,
        height: 20,
        characters: 'OK',
        fontSize: 16,
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
          makeNode({
            id: '2:1',
            name: 'Email Input',
            type: 'FRAME',
            width: 350,
            fills: [{ type: 'SOLID', color: '#FFFFFF', visible: true }],
          }),
          makeNode({
            id: '2:2',
            name: 'Password Input',
            type: 'FRAME',
            width: 350,
            strokes: [{ type: 'SOLID', color: '#E0E0E0', visible: true }],
          }),
          makeNode({
            id: '2:3',
            name: 'Login Button',
            type: 'FRAME',
            width: 200,
            fills: [{ type: 'SOLID', color: '#0066FF', visible: true }],
          }),
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
          makeNode({
            id: '2:1',
            name: 'Email Input',
            type: 'FRAME',
            width: 350,
            strokes: [{ type: 'SOLID', color: '#E0E0E0', visible: true }],
          }),
          makeNode({
            id: '2:2',
            name: 'Login Button',
            type: 'FRAME',
            width: 350,
            fills: [{ type: 'SOLID', color: '#0066FF', visible: true }],
          }),
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
          makeNode({
            id: '2:1',
            name: 'Email Input',
            type: 'FRAME',
            width: 200,
            strokes: [{ type: 'SOLID', color: '#E0E0E0', visible: true }],
          }),
          makeNode({
            id: '2:2',
            name: 'Login Button',
            type: 'FRAME',
            width: 100,
            fills: [{ type: 'SOLID', color: '#0066FF', visible: true }],
          }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

describe('cta-width-inconsistent', () => {
  it('flags CTA buttons that are noticeably narrower than form fields', () => {
    const v = ctaWidthInconsistentRule.check(
      makeNode({
        name: 'Login Form',
        role: 'form',
        type: 'FRAME',
        layoutMode: 'VERTICAL',
        width: 350,
        children: [
          makeNode({ id: '2:1', name: 'Email Input', role: 'input', type: 'FRAME', width: 350 }),
          makeNode({ id: '2:2', name: 'Password Input', role: 'input', type: 'FRAME', width: 350 }),
          makeNode({ id: '2:3', name: 'Sign In Button', role: 'button', type: 'FRAME', width: 220 }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('cta-width-inconsistent');
    expect(v[0].fixData?.fix).toBe('stretch');
  });

  it('passes when CTA width matches the field width', () => {
    const v = ctaWidthInconsistentRule.check(
      makeNode({
        name: 'Login Form',
        role: 'form',
        type: 'FRAME',
        layoutMode: 'VERTICAL',
        width: 350,
        children: [
          makeNode({ id: '2:1', name: 'Email Input', role: 'input', type: 'FRAME', width: 350 }),
          makeNode({ id: '2:2', name: 'Sign In Button', role: 'button', type: 'FRAME', width: 350 }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

describe('header-fragmented', () => {
  it('flags screens with floating top-level title and back control', () => {
    const v = headerFragmentedRule.check(
      makeNode({
        name: 'Sign In',
        role: 'screen',
        type: 'FRAME',
        children: [
          makeNode({ id: '2:1', name: 'Back Arrow', type: 'VECTOR', width: 24, y: 80 }),
          makeNode({ id: '2:2', name: 'Sign In Title', type: 'TEXT', y: 96 }),
          makeNode({ id: '2:3', name: 'Form', role: 'form', type: 'FRAME', y: 180 }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].autoFixable).toBe(false);
  });

  it('passes when a dedicated header container already exists', () => {
    const v = headerFragmentedRule.check(
      makeNode({
        name: 'Sign In',
        role: 'screen',
        type: 'FRAME',
        children: [
          makeNode({ id: '2:1', name: 'Header', role: 'header', type: 'FRAME', y: 80 }),
          makeNode({ id: '2:2', name: 'Form', role: 'form', type: 'FRAME', y: 180 }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

describe('section-spacing-collapse', () => {
  it('flags tight section stacks on screen containers', () => {
    const v = sectionSpacingCollapseRule.check(
      makeNode({
        name: 'Auth Screen',
        role: 'screen',
        type: 'FRAME',
        layoutMode: 'VERTICAL',
        itemSpacing: 8,
        children: [
          makeNode({ id: '2:1', name: 'Header', type: 'FRAME' }),
          makeNode({ id: '2:2', name: 'Form', type: 'FRAME' }),
          makeNode({ id: '2:3', name: 'Footer', type: 'FRAME' }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].fixData?.fix).toBe('item-spacing');
    expect(v[0].fixData?.itemSpacing).toBe(16);
  });

  it('passes when section rhythm is already healthy', () => {
    const v = sectionSpacingCollapseRule.check(
      makeNode({
        name: 'Auth Screen',
        role: 'screen',
        type: 'FRAME',
        layoutMode: 'VERTICAL',
        itemSpacing: 20,
        children: [
          makeNode({ id: '2:1', name: 'Header', type: 'FRAME' }),
          makeNode({ id: '2:2', name: 'Form', type: 'FRAME' }),
          makeNode({ id: '2:3', name: 'Footer', type: 'FRAME' }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

describe('header-out-of-band', () => {
  it('flags header containers that start too low in the screen', () => {
    const v = headerOutOfBandRule.check(
      makeNode({
        name: 'Sign In',
        role: 'screen',
        type: 'FRAME',
        height: 874,
        children: [makeNode({ id: '2:1', name: 'Header', role: 'header', type: 'FRAME', y: 220, height: 72 })],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('header-out-of-band');
  });

  it('passes when the header is near the top', () => {
    const v = headerOutOfBandRule.check(
      makeNode({
        name: 'Sign In',
        role: 'screen',
        type: 'FRAME',
        height: 874,
        children: [makeNode({ id: '2:1', name: 'Header', role: 'header', type: 'FRAME', y: 80, height: 72 })],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

describe('screen-bottom-overflow', () => {
  it('flags sections that extend past the bottom of the screen', () => {
    const v = screenBottomOverflowRule.check(
      makeNode({
        name: 'Forgot Password',
        role: 'screen',
        type: 'FRAME',
        height: 874,
        children: [makeNode({ id: '2:1', name: 'Footer', role: 'footer', type: 'FRAME', y: 820, height: 100 })],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('screen-bottom-overflow');
  });

  it('passes when all sections stay within the viewport', () => {
    const v = screenBottomOverflowRule.check(
      makeNode({
        name: 'Forgot Password',
        role: 'screen',
        type: 'FRAME',
        height: 874,
        children: [makeNode({ id: '2:1', name: 'Footer', role: 'footer', type: 'FRAME', y: 720, height: 100 })],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

describe('social-row-cramped', () => {
  it('flags social rows whose children do not fit horizontally', () => {
    const v = socialRowCrampedRule.check(
      makeNode({
        name: 'Social Login Row',
        role: 'social_row',
        type: 'FRAME',
        width: 260,
        layoutMode: 'HORIZONTAL',
        itemSpacing: 16,
        children: [
          makeNode({ id: '2:1', name: 'Apple Button', role: 'button', width: 96, height: 48 }),
          makeNode({ id: '2:2', name: 'Google Button', role: 'button', width: 96, height: 48 }),
          makeNode({ id: '2:3', name: 'Facebook Button', role: 'button', width: 96, height: 48 }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('social-row-cramped');
  });

  it('passes social rows with enough space', () => {
    const v = socialRowCrampedRule.check(
      makeNode({
        name: 'Social Login Row',
        role: 'social_row',
        type: 'FRAME',
        width: 340,
        layoutMode: 'HORIZONTAL',
        itemSpacing: 12,
        children: [
          makeNode({ id: '2:1', name: 'Apple Button', role: 'button', width: 96, height: 48 }),
          makeNode({ id: '2:2', name: 'Google Button', role: 'button', width: 96, height: 48 }),
          makeNode({ id: '2:3', name: 'Facebook Button', role: 'button', width: 96, height: 48 }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

describe('nav-overcrowded', () => {
  it('flags nav rows that cannot fit all items', () => {
    const v = navOvercrowdedRule.check(
      makeNode({
        name: 'Primary Nav',
        role: 'nav',
        type: 'FRAME',
        width: 240,
        layoutMode: 'HORIZONTAL',
        itemSpacing: 16,
        children: [
          makeNode({ id: '2:1', name: 'Overview', width: 80, height: 40 }),
          makeNode({ id: '2:2', name: 'Reports', width: 80, height: 40 }),
          makeNode({ id: '2:3', name: 'Customers', width: 96, height: 40 }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('nav-overcrowded');
  });

  it('passes nav rows with enough width', () => {
    const v = navOvercrowdedRule.check(
      makeNode({
        name: 'Primary Nav',
        role: 'nav',
        type: 'FRAME',
        width: 360,
        layoutMode: 'HORIZONTAL',
        itemSpacing: 12,
        children: [
          makeNode({ id: '2:1', name: 'Overview', width: 80, height: 40 }),
          makeNode({ id: '2:2', name: 'Reports', width: 80, height: 40 }),
          makeNode({ id: '2:3', name: 'Customers', width: 96, height: 40 }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

describe('stats-row-cramped', () => {
  it('flags stats rows that cannot fit all cards', () => {
    const v = statsRowCrampedRule.check(
      makeNode({
        name: 'Metrics',
        role: 'stats',
        type: 'FRAME',
        width: 640,
        layoutMode: 'HORIZONTAL',
        itemSpacing: 24,
        paddingLeft: 24,
        paddingRight: 24,
        children: [
          makeNode({ id: '2:1', name: 'Revenue Card', role: 'card', width: 220, height: 120 }),
          makeNode({ id: '2:2', name: 'MRR Card', role: 'card', width: 220, height: 120 }),
          makeNode({ id: '2:3', name: 'Churn Card', role: 'card', width: 220, height: 120 }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('stats-row-cramped');
  });

  it('passes stats rows with enough width', () => {
    const v = statsRowCrampedRule.check(
      makeNode({
        name: 'Metrics',
        role: 'stats',
        type: 'FRAME',
        width: 960,
        layoutMode: 'HORIZONTAL',
        itemSpacing: 16,
        paddingLeft: 24,
        paddingRight: 24,
        children: [
          makeNode({ id: '2:1', name: 'Revenue Card', role: 'card', width: 220, height: 120 }),
          makeNode({ id: '2:2', name: 'MRR Card', role: 'card', width: 220, height: 120 }),
          makeNode({ id: '2:3', name: 'Churn Card', role: 'card', width: 220, height: 120 }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

describe('root-misclassified-interactive', () => {
  it('flags screen-sized roots that carry button semantics', () => {
    const v = rootMisclassifiedInteractiveRule.check(
      makeNode({
        name: 'Sign In',
        role: 'button',
        type: 'FRAME',
        width: 402,
        height: 874,
        children: [
          makeNode({ id: '2:1', name: 'Header', type: 'FRAME', height: 88 }),
          makeNode({ id: '2:2', name: 'Form', type: 'FRAME', height: 320 }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('root-misclassified-interactive');
    expect(v[0].severity).toBe('error');
  });

  it('passes normal screen roots', () => {
    const v = rootMisclassifiedInteractiveRule.check(
      makeNode({
        name: 'Sign In',
        role: 'screen',
        type: 'FRAME',
        width: 402,
        height: 874,
        children: [
          makeNode({ id: '2:1', name: 'Header', type: 'FRAME', height: 88 }),
          makeNode({ id: '2:2', name: 'Form', type: 'FRAME', height: 320 }),
        ],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

describe('nested-interactive-shell', () => {
  it('flags interactive shells nested inside interactive parents', () => {
    const v = nestedInteractiveShellRule.check(
      makeNode({
        name: 'Email Input',
        role: 'input',
        type: 'FRAME',
        width: 354,
        height: 48,
        children: [makeNode({ id: '2:1', name: 'Inner Input', role: 'input', type: 'FRAME', width: 320, height: 48 })],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('nested-interactive-shell');
    expect(v[0].severity).toBe('error');
  });

  it('passes when interactive parents only contain text/content children', () => {
    const v = nestedInteractiveShellRule.check(
      makeNode({
        name: 'Email Input',
        role: 'input',
        type: 'FRAME',
        width: 354,
        height: 48,
        children: [makeNode({ id: '2:1', name: 'Placeholder', type: 'TEXT', characters: 'Email' })],
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

describe('screen-shell-invalid', () => {
  it('flags screen roots without vertical auto-layout', () => {
    const v = screenShellInvalidRule.check(
      makeNode({
        name: 'Checkout',
        role: 'screen',
        type: 'FRAME',
        width: 402,
        height: 874,
        layoutMode: 'HORIZONTAL',
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('screen-shell-invalid');
    expect(v[0].severity).toBe('error');
  });

  it('passes stable screen shells', () => {
    const v = screenShellInvalidRule.check(
      makeNode({
        name: 'Checkout',
        role: 'screen',
        type: 'FRAME',
        width: 402,
        height: 874,
        layoutMode: 'VERTICAL',
      }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

// ─── input-field-structure ───

describe('input-field-structure', () => {
  it('skips field group containers (label TEXT + input FRAME)', () => {
    // "Email Field" wrapping a label + actual input should NOT be flagged
    const node = makeNode({
      name: 'Email Field',
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      children: [
        makeNode({ id: '2:1', name: 'Email', type: 'TEXT' }),
        makeNode({
          id: '2:2',
          name: 'Email Input',
          type: 'FRAME',
          strokes: [{ type: 'SOLID', visible: true, opacity: 1 }],
          cornerRadius: 12,
          paddingLeft: 16,
          paddingRight: 16,
        }),
      ],
    });
    const v = inputFieldStructureRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('skips containers with 3+ children', () => {
    const node = makeNode({
      name: 'Form Fields',
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      children: [
        makeNode({ id: '2:1', name: 'Name Field', type: 'FRAME' }),
        makeNode({ id: '2:2', name: 'Email Field', type: 'FRAME' }),
        makeNode({ id: '2:3', name: 'Password Field', type: 'FRAME' }),
      ],
    });
    const v = inputFieldStructureRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('still flags actual input frames (stroke + single text child)', () => {
    const node = makeNode({
      name: 'search-input',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      paddingLeft: 0,
      paddingRight: 0,
      cornerRadius: 0,
      strokes: [{ type: 'SOLID', visible: true, opacity: 1 }],
      children: [makeNode({ id: '2:1', name: 'Search...', type: 'TEXT' })],
    });
    const v = inputFieldStructureRule.check(node, emptyCtx);
    // Should flag: no cornerRadius + insufficient padding
    expect(v.length).toBeGreaterThanOrEqual(1);
    expect(v.some((violation) => violation.rule === 'input-field-structure')).toBe(true);
  });

  it('flags input fields matched by name without field group structure', () => {
    // A frame named "Email Input" with no children — not a field group, should be flagged
    const node = makeNode({
      name: 'Email Input',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      paddingLeft: 0,
      paddingRight: 0,
      cornerRadius: 0,
    });
    const v = inputFieldStructureRule.check(node, emptyCtx);
    expect(v.length).toBeGreaterThanOrEqual(1);
  });

  it('skips password field containers with label + input + helper text', () => {
    const node = makeNode({
      name: 'Password Field',
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      children: [
        makeNode({ id: '2:1', name: 'Password', type: 'TEXT' }),
        makeNode({ id: '2:2', name: 'Password Input', type: 'FRAME' }),
        makeNode({ id: '2:3', name: 'Helper Text', type: 'TEXT' }),
      ],
    });
    const v = inputFieldStructureRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });
});
