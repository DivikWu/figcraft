/**
 * Tests for role-aware lint rules — declaration-driven identification.
 *
 * When node.role is set, lint rules use it deterministically instead of name-regex guessing.
 */
import { describe, expect, it } from 'vitest';
import { buttonStructureRule } from '../../packages/quality-engine/src/rules/structure/button-structure.js';
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

// ─── button-structure: role-aware ───

describe('button-structure role-aware', () => {
  it('role:"screen" prevents button detection even with matching name', () => {
    const node = makeNode({
      name: 'Screen / 登录',
      role: 'screen',
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      width: 402,
      height: 874,
    });
    const v = buttonStructureRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('role:"button" forces button detection regardless of name', () => {
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
    });
    const v = buttonStructureRule.check(node, emptyCtx);
    // Should be detected as button but passes all checks (has layout, padding, height)
    expect(v).toHaveLength(0);
  });

  it('role:"button" with missing layout triggers violations', () => {
    const node = makeNode({
      name: 'Some Frame',
      role: 'button',
      type: 'FRAME',
      height: 48,
    });
    const v = buttonStructureRule.check(node, emptyCtx);
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((vi) => vi.rule === 'button-structure')).toBe(true);
  });

  it('role:"container" prevents button detection even with "登录" in name', () => {
    const node = makeNode({
      name: '登录表单',
      role: 'container',
      type: 'FRAME',
    });
    const v = buttonStructureRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('no role falls back to name-based detection', () => {
    const node = makeNode({
      name: '登录',
      type: 'FRAME',
      height: 48,
      children: [{ id: '2:1', name: 'Text', type: 'TEXT', characters: '登录' }],
    });
    const v = buttonStructureRule.check(node, emptyCtx);
    // Should be detected as button via BUTTON_NAME_RE and flagged for missing auto-layout
    expect(v.length).toBeGreaterThan(0);
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
