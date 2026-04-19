/**
 * Spec-compliance rules must skip descendants of COMPONENT / INSTANCE nodes.
 *
 * Motivation: token binding belongs at the component boundary (Selection
 * Colors / instance overrides). Scanning every internal vector inside an icon
 * instance produces N identical violations per icon — high noise, low signal.
 * This locks in the regression from the "base / Zipcode" icon screenshot:
 * 3× "Vector (Stroke) fill #000000 not bound to token" warnings on the
 * component internals must be suppressed while the instance-level entry node
 * is still audited.
 */
import { describe, expect, it } from 'vitest';
import { runLint } from '../../packages/quality-engine/src/engine.js';
import { hardcodedTokenRule } from '../../packages/quality-engine/src/rules/spec/hardcoded-token.js';
import { noTextStyleRule } from '../../packages/quality-engine/src/rules/spec/no-text-style.js';
import { specBorderRadiusRule } from '../../packages/quality-engine/src/rules/spec/spec-border-radius.js';
import { specColorRule } from '../../packages/quality-engine/src/rules/spec/spec-color.js';
import { specTypographyRule } from '../../packages/quality-engine/src/rules/spec/spec-typography.js';
import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';

const libraryCtx: LintContext = {
  colorTokens: new Map([['color/text/primary', '#111111']]),
  spacingTokens: new Map(),
  radiusTokens: new Map([['radius/sm', 4]]),
  typographyTokens: new Map([['text/body', { fontSize: 14, fontFamily: 'Inter', fontWeight: 'Regular' }]]),
  variableIds: new Map(),
  mode: 'library',
  selectedLibrary: 'YAMI UI/UX Guidelines',
  lang: 'en',
};

function makeNode(overrides: Partial<AbstractNode>): AbstractNode {
  return { id: '1:1', name: 'Test', type: 'FRAME', visible: true, ...overrides };
}

describe('rule-level guards — insideComponentSubtree', () => {
  const insideNode = (partial: Partial<AbstractNode>): AbstractNode =>
    makeNode({ insideComponentSubtree: true, ...partial });

  it('hardcoded-token skips descendants of COMPONENT/INSTANCE', () => {
    const node = insideNode({
      type: 'VECTOR',
      name: 'Vector (Stroke)',
      fills: [{ type: 'SOLID', color: '#000000', visible: true }],
    });
    expect(hardcodedTokenRule.check(node, libraryCtx)).toHaveLength(0);
  });

  it('spec-color skips descendants of COMPONENT/INSTANCE', () => {
    const node = insideNode({
      type: 'VECTOR',
      fills: [{ type: 'SOLID', color: '#111111', visible: true }],
    });
    expect(specColorRule.check(node, libraryCtx)).toHaveLength(0);
  });

  it('spec-typography skips text descendants of COMPONENT/INSTANCE', () => {
    const node = insideNode({
      type: 'TEXT',
      characters: 'label',
      fontSize: 15,
      fontName: { family: 'Inter', style: 'Regular' },
    });
    expect(specTypographyRule.check(node, libraryCtx)).toHaveLength(0);
  });

  it('spec-border-radius skips descendants of COMPONENT/INSTANCE', () => {
    const node = insideNode({
      type: 'RECTANGLE',
      cornerRadius: 3,
    });
    expect(specBorderRadiusRule.check(node, libraryCtx)).toHaveLength(0);
  });

  it('no-text-style skips text descendants of COMPONENT/INSTANCE', () => {
    const node = insideNode({
      type: 'TEXT',
      characters: 'label',
      fontSize: 14,
    });
    expect(noTextStyleRule.check(node, libraryCtx)).toHaveLength(0);
  });
});

describe('engine propagation — instance entry node still audited', () => {
  it('regression: INSTANCE itself is audited; descendants are skipped (3× Vector noise eliminated)', () => {
    // Mirrors the "base / Zipcode" screenshot: a 24×24 icon instance with
    // three Vector (Stroke) children carrying hardcoded #000000 fills.
    // Pre-fix: 3 hardcoded-token violations on the children.
    // Post-fix: violations on children are skipped; the instance's own
    // binding-less state is the only thing audited.
    const screen = makeNode({
      id: 'screen:1',
      name: 'Home',
      role: 'screen',
      type: 'FRAME',
      width: 402,
      height: 874,
      children: [
        makeNode({
          id: 'icon:1',
          name: 'base / Zipcode',
          type: 'INSTANCE',
          width: 24,
          height: 24,
          // Instance-level fill is unset (icon color comes from Selection Colors override).
          children: [
            makeNode({
              id: 'icon:1:union',
              name: 'Union',
              type: 'FRAME',
              children: [
                makeNode({
                  id: 'icon:1:v1',
                  name: 'Vector (Stroke)',
                  type: 'VECTOR',
                  fills: [{ type: 'SOLID', color: '#000000', visible: true }],
                }),
                makeNode({
                  id: 'icon:1:v2',
                  name: 'Vector (Stroke)',
                  type: 'VECTOR',
                  fills: [{ type: 'SOLID', color: '#000000', visible: true }],
                }),
                makeNode({
                  id: 'icon:1:v3',
                  name: 'Vector (Stroke)',
                  type: 'VECTOR',
                  fills: [{ type: 'SOLID', color: '#000000', visible: true }],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const report = runLint([screen], libraryCtx);
    const hardcodedViolations = report.categories
      .find((c) => c.rule === 'hardcoded-token')
      ?.nodes.filter((v) => v.nodeId.startsWith('icon:1:v')) ?? [];

    // No violations on internal vectors — they are inside the instance subtree.
    expect(hardcodedViolations).toHaveLength(0);
  });

  it('top-level VECTOR (not inside any component/instance) is still audited', () => {
    const screen = makeNode({
      id: 'screen:2',
      role: 'screen',
      type: 'FRAME',
      width: 402,
      height: 874,
      children: [
        makeNode({
          id: 'bare-vector',
          type: 'VECTOR',
          name: 'Vector',
          fills: [{ type: 'SOLID', color: '#000000', visible: true }],
        }),
      ],
    });

    const report = runLint([screen], libraryCtx);
    const hardcodedViolations =
      report.categories.find((c) => c.rule === 'hardcoded-token')?.nodes.filter((v) => v.nodeId === 'bare-vector') ?? [];

    // Bare vector at the page level — should fire normally.
    expect(hardcodedViolations.length).toBeGreaterThan(0);
  });
});
