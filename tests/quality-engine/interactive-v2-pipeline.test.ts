/**
 * Full-pipeline integration test — verifies classifier + engine walk +
 * variant rules + cascade suppression all cooperate end-to-end.
 *
 * Locks in the regression that triggered this refactor: TEXT "Sign in to
 * continue shopping" must NOT be flagged as a broken button, while
 * legitimate solid-button issues remain surfaced.
 */
import { describe, expect, it } from 'vitest';
import { getAvailableRules, runLint } from '../../packages/quality-engine/src/engine.js';
import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';

const emptyCtx: LintContext = {
  colorTokens: new Map(),
  spacingTokens: new Map(),
  radiusTokens: new Map(),
  typographyTokens: new Map(),
  variableIds: new Map(),
  lang: 'en',
};

function makeNode(overrides: Partial<AbstractNode>): AbstractNode {
  return { id: '1:1', name: 'Test', type: 'FRAME', visible: true, ...overrides };
}

/** The exact scenario that produced the "TEXT used as button" false positive. */
function loginScreen(): AbstractNode {
  return makeNode({
    id: '1:0',
    name: 'Login Screen',
    type: 'FRAME',
    role: 'screen',
    width: 402,
    height: 874,
    layoutMode: 'VERTICAL',
    platform: 'mobile',
    children: [
      makeNode({
        id: '1:1',
        name: 'Welcome back',
        type: 'TEXT',
        characters: 'Welcome back',
        fontSize: 24,
        height: 32,
      }),
      // ── The regression case: a subtitle that happens to contain "sign in"
      makeNode({
        id: '1:2',
        name: 'Sign in to continue shopping',
        type: 'TEXT',
        characters: 'Sign in to continue shopping',
        fontSize: 14,
        height: 20,
        width: 354,
      }),
      makeNode({
        id: '1:3',
        name: 'Email input',
        type: 'FRAME',
        role: 'input',
        width: 354,
        height: 48,
        strokes: [{ type: 'SOLID', color: '#CCCCCC', visible: true }],
        strokeWeight: 1,
        layoutMode: 'HORIZONTAL',
        paddingLeft: 16,
        paddingRight: 16,
        children: [{ id: '1:3:1', name: 'placeholder', type: 'TEXT', characters: 'Email address' }],
      }),
      // ── A legitimate solid button — must still be linted correctly
      makeNode({
        id: '1:4',
        name: 'Log in',
        type: 'FRAME',
        role: 'button',
        width: 354,
        height: 48,
        layoutMode: 'HORIZONTAL',
        paddingLeft: 24,
        paddingRight: 24,
        primaryAxisAlignItems: 'CENTER',
        counterAxisAlignItems: 'CENTER',
        fills: [{ type: 'SOLID', color: '#E60028', visible: true, opacity: 1 }],
        children: [{ id: '1:4:1', name: 'Log in', type: 'TEXT', characters: 'Log in' }],
      }),
      // ── A standalone link — TEXT node with reactions
      makeNode({
        id: '1:5',
        name: 'Forgot password?',
        type: 'TEXT',
        characters: 'Forgot password?',
        reactions: true,
        height: 20,
        fontSize: 14,
        fills: [{ type: 'SOLID', color: '#000066', visible: true, opacity: 1 }],
      }),
    ],
  });
}

describe('interactive pipeline', () => {
  it('does NOT flag "Sign in to continue shopping" TEXT as a broken button (regression)', () => {
    const report = runLint([loginScreen()], emptyCtx);
    const violationsOnSubtitle = report.categories.flatMap((c) =>
      c.nodes.filter((n) => n.nodeId === '1:2' && (c.rule.startsWith('button-') || c.rule.startsWith('link-'))),
    );
    expect(violationsOnSubtitle).toHaveLength(0);
  });

  it('legacy "button-structure" rule is retired — only variant rules are registered', () => {
    const names = getAvailableRules().map((r) => r.name);
    expect(names).not.toContain('button-structure');
    expect(names).toContain('button-solid-structure');
    expect(names).toContain('button-text-structure');
    expect(names).toContain('link-standalone-structure');
  });

  it('classifies the "Log in" FRAME as button-solid and passes all checks', () => {
    const nodes = [loginScreen()];
    const report = runLint(nodes, emptyCtx);
    const btnViolations = report.categories.flatMap((c) => c.nodes.filter((n) => n.nodeId === '1:4'));
    expect(btnViolations).toHaveLength(0);

    const screen = nodes[0];
    const loginBtn = screen.children?.find((c) => c.id === '1:4');
    expect(loginBtn?.interactive?.kind).toBe('button-solid');
  });

  it('classifies "Forgot password?" TEXT with reactions as link-standalone', () => {
    const nodes = [loginScreen()];
    runLint(nodes, emptyCtx);
    const screen = nodes[0];
    const forgot = screen.children?.find((c) => c.id === '1:5');
    expect(forgot?.interactive?.kind).toBe('link-standalone');
  });

  it('still flags a genuinely broken solid button (missing layout + padding + height)', () => {
    const broken = makeNode({
      id: '2:1',
      name: 'Broken CTA',
      type: 'FRAME',
      role: 'button',
      width: 80,
      height: 20,
      fills: [{ type: 'SOLID', color: '#FF0000', visible: true, opacity: 1 }],
      children: [{ id: '2:1:1', name: 'Go', type: 'TEXT', characters: 'Go' }],
    });
    const report = runLint([broken], emptyCtx);
    const solid = report.categories.find((c) => c.rule === 'button-solid-structure');
    expect(solid, 'button-solid-structure must fire').toBeTruthy();
    expect((solid?.count ?? 0) >= 2).toBe(true); // no-layout + height (at least)
  });

  it('cascade suppression: nested-interactive-shell silences inner variant rules', () => {
    const outer = makeNode({
      id: '3:1',
      name: 'Outer button',
      type: 'FRAME',
      role: 'button',
      width: 200,
      height: 48,
      layoutMode: 'HORIZONTAL',
      paddingLeft: 24,
      paddingRight: 24,
      fills: [{ type: 'SOLID', color: '#000', visible: true, opacity: 1 }],
      children: [
        makeNode({
          id: '3:2',
          name: 'Inner button',
          type: 'FRAME',
          role: 'button',
          width: 80,
          height: 20,
          fills: [{ type: 'SOLID', color: '#fff', visible: true, opacity: 1 }],
          children: [{ id: '3:2:1', name: 'x', type: 'TEXT', characters: 'x' }],
        }),
      ],
    });
    const report = runLint([outer], emptyCtx);
    expect(report.categories.find((c) => c.rule === 'nested-interactive-shell')).toBeTruthy();
    const childSolidViolations = report.categories
      .find((c) => c.rule === 'button-solid-structure')
      ?.nodes.filter((n) => n.nodeId === '3:2');
    expect(childSolidViolations ?? []).toHaveLength(0);
  });
});
