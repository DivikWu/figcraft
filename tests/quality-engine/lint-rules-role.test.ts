/**
 * Tests for role-aware lint rules — declaration-driven identification.
 *
 * When node.role is set, the classifier uses it deterministically instead of
 * falling back to name-regex heuristics.
 */
import { describe, expect, it } from 'vitest';
import { classifyInteractive } from '../../packages/quality-engine/src/interactive/classifier.js';
import { buttonSolidStructureRule } from '../../packages/quality-engine/src/rules/structure/button-solid-structure.js';
import { inputFieldStructureRule } from '../../packages/quality-engine/src/rules/structure/input-field-structure.js';
import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';

const emptyCtx: LintContext = {
  colorTokens: new Map(),
  spacingTokens: new Map(),
  radiusTokens: new Map(),
  typographyTokens: new Map(),
  variableIds: new Map(),
};

function makeNode(overrides: Partial<AbstractNode>): AbstractNode {
  return { id: '1:1', name: 'Test', type: 'FRAME', ...overrides };
}

/** Simulate the engine's cache-then-check step for a single node. */
function classifyAndCheck(node: AbstractNode, rule: typeof buttonSolidStructureRule) {
  const result = classifyInteractive(node);
  if (result.kind) {
    node.interactive = {
      kind: result.kind,
      confidence: result.confidence,
      signals: result.signals,
      declared: false,
    };
  }
  return rule.check(node, emptyCtx);
}

// ─── button-solid-structure: role-aware ───

describe('button-solid-structure role-aware', () => {
  it('role:"screen" prevents button detection even with matching name', () => {
    const node = makeNode({
      name: 'Screen / 登录',
      role: 'screen',
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      width: 402,
      height: 874,
    });
    const v = classifyAndCheck(node, buttonSolidStructureRule);
    expect(v).toHaveLength(0);
  });

  it('role:"button" + fill passes all checks when well-formed', () => {
    const node = makeNode({
      name: 'Primary Action',
      role: 'button',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'CENTER',
      counterAxisAlignItems: 'CENTER',
      paddingLeft: 24,
      paddingRight: 24,
      height: 48,
      fills: [{ type: 'SOLID', color: '#000000', visible: true, opacity: 1 }],
      children: [{ id: '2:1', name: 'Go', type: 'TEXT' }],
    });
    const v = classifyAndCheck(node, buttonSolidStructureRule);
    expect(v).toHaveLength(0);
  });

  it('role:"button" with fill + missing layout triggers violations', () => {
    const node = makeNode({
      name: 'Some Frame',
      role: 'button',
      type: 'FRAME',
      height: 48,
      fills: [{ type: 'SOLID', color: '#000000', visible: true, opacity: 1 }],
      children: [{ id: '2:1', name: 'Go', type: 'TEXT' }],
    });
    const v = classifyAndCheck(node, buttonSolidStructureRule);
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((vi) => vi.rule === 'button-solid-structure')).toBe(true);
  });

  it('role:"container" prevents button detection even with "登录" in name', () => {
    const node = makeNode({
      name: '登录表单',
      role: 'container',
      type: 'FRAME',
    });
    const v = classifyAndCheck(node, buttonSolidStructureRule);
    expect(v).toHaveLength(0);
  });
});

// ─── input-field-structure: role-aware ───

describe('input-field-structure role-aware', () => {
  it('role:"screen" prevents input detection even with "输入" in name', () => {
    const node = makeNode({
      name: '输入页面',
      role: 'screen',
      type: 'FRAME',
      width: 402,
      height: 874,
    });
    const v = inputFieldStructureRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('role:"input" forces input detection regardless of name', () => {
    const node = makeNode({
      name: 'Custom Element',
      role: 'input',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      counterAxisAlignItems: 'CENTER',
      strokes: [{ visible: true, type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
      cornerRadius: 8,
      paddingLeft: 12,
      paddingRight: 12,
      children: [{ id: '2:1', name: 'Placeholder', type: 'TEXT', characters: 'Enter...' }],
    });
    const v = inputFieldStructureRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('role:"button" prevents input detection', () => {
    const node = makeNode({
      name: 'input-like name',
      role: 'button',
      type: 'FRAME',
    });
    const v = inputFieldStructureRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });
});
