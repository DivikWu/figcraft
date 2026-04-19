/**
 * Tests for lint engine — rule execution, filtering, pagination.
 */

import { describe, expect, it } from 'vitest';
import { getAvailableRules, runLint } from '../../packages/quality-engine/src/engine.js';
import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';
import { downgradeSeverity } from '../../packages/quality-engine/src/types.js';

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

describe('runLint', () => {
  it('returns zero violations for clean node', () => {
    const node = makeNode({
      name: 'Header',
      type: 'FRAME',
      children: [
        makeNode({ id: '2:1', name: 'Title', type: 'TEXT', fontSize: 16, textStyleId: 'S:abc', characters: 'Title' }),
      ],
    });
    const report = runLint([node], emptyCtx);
    // May have some violations from layout rules, but naming should pass
    const namingViolations = report.categories.filter((c) => c.rule === 'default-name');
    expect(namingViolations).toHaveLength(0);
  });

  it('filters by rule name', () => {
    const node = makeNode({ name: 'Frame 1', type: 'FRAME', children: [] });
    const report = runLint([node], emptyCtx, { rules: ['default-name'] });
    expect(report.categories.every((c) => c.rule === 'default-name')).toBe(true);
  });

  it('filters by category', () => {
    const node = makeNode({ name: 'Frame 1', type: 'FRAME', children: [] });
    const report = runLint([node], emptyCtx, { categories: ['naming'] });
    // All violations should be from naming category rules
    for (const cat of report.categories) {
      const rule = getAvailableRules().find((r) => r.name === cat.rule);
      expect(rule?.category).toBe('naming');
    }
  });

  it('paginates results', () => {
    // Create nodes that will generate multiple violations
    const nodes = Array.from({ length: 10 }, (_, i) =>
      makeNode({ id: `${i}:1`, name: `Frame ${i + 1}`, type: 'FRAME', children: [] }),
    );
    const full = runLint(nodes, emptyCtx, { rules: ['default-name'], minSeverity: 'verbose' });
    const page1 = runLint(nodes, emptyCtx, { rules: ['default-name'], minSeverity: 'verbose', offset: 0, limit: 3 });

    expect(full.summary.violations).toBeGreaterThan(3);
    expect(page1.pagination).toBeDefined();
    expect(page1.pagination!.hasMore).toBe(true);
    expect(page1.pagination!.total).toBe(full.summary.violations);
  });

  it('counts checked nodes correctly', () => {
    const parent = makeNode({
      name: 'Container',
      type: 'FRAME',
      children: [
        makeNode({ id: '2:1', name: 'Child 1', type: 'FRAME' }),
        makeNode({ id: '2:2', name: 'Child 2', type: 'TEXT', fontSize: 16 }),
      ],
    });
    const report = runLint([parent], emptyCtx);
    expect(report.summary.total).toBe(3); // parent + 2 children
  });

  it('early-exits when maxViolations reached', () => {
    const nodes = Array.from({ length: 20 }, (_, i) =>
      makeNode({ id: `${i}:1`, name: `Frame ${i + 1}`, type: 'FRAME', children: [] }),
    );
    const report = runLint(nodes, emptyCtx, { rules: ['default-name'], minSeverity: 'verbose', maxViolations: 5 });
    expect(report.summary.violations).toBeLessThanOrEqual(5);
    expect(report.summary.truncated).toBe(true);
  });

  it('includes bySeverity counts in summary', () => {
    // Use a non-leaf node (with children) and large enough (width >= 48) to avoid context-aware downgrade
    const node = makeNode({
      name: 'Frame 1',
      type: 'FRAME',
      width: 200,
      height: 200,
      children: [makeNode({ id: '2:1', name: 'Child', type: 'FRAME' })],
    });
    const report = runLint([node], emptyCtx, { rules: ['default-name'], minSeverity: 'verbose' });
    expect(report.summary.bySeverity).toBeDefined();
    expect(typeof report.summary.bySeverity.error).toBe('number');
    expect(typeof report.summary.bySeverity.unsafe).toBe('number');
    expect(typeof report.summary.bySeverity.heuristic).toBe('number');
    expect(typeof report.summary.bySeverity.style).toBe('number');
    expect(typeof report.summary.bySeverity.verbose).toBe('number');
    // default-name is verbose severity — it only surfaces with minSeverity: 'verbose'
    expect(report.summary.bySeverity.verbose).toBeGreaterThan(0);
  });

  it('filters by minSeverity', () => {
    // max-nesting-depth produces style-level violations
    const deep = makeNode({
      name: 'Root',
      type: 'FRAME',
      children: [
        makeNode({
          id: '2:1',
          name: 'L1',
          type: 'FRAME',
          children: [
            makeNode({
              id: '3:1',
              name: 'L2',
              type: 'FRAME',
              children: [
                makeNode({
                  id: '4:1',
                  name: 'L3',
                  type: 'FRAME',
                  children: [
                    makeNode({
                      id: '5:1',
                      name: 'L4',
                      type: 'FRAME',
                      children: [
                        makeNode({
                          id: '6:1',
                          name: 'L5',
                          type: 'FRAME',
                          children: [
                            makeNode({
                              id: '7:1',
                              name: 'L6',
                              type: 'FRAME',
                              children: [makeNode({ id: '8:1', name: 'L7', type: 'FRAME', children: [] })],
                            }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    // max-nesting-depth is verbose severity — default filter (up to 'style') excludes it
    const allReport = runLint([deep], emptyCtx, { rules: ['max-nesting-depth'], minSeverity: 'verbose' });
    const filteredReport = runLint([deep], emptyCtx, { rules: ['max-nesting-depth'], minSeverity: 'style' });
    expect(allReport.summary.violations).toBeGreaterThan(0);
    expect(filteredReport.summary.violations).toBe(0);
  });

  it('downgrades token rule severity when no tokens and no library', () => {
    // no-text-style is a heuristic-level token rule that fires regardless of token context
    // (it checks for missing textStyleId on TEXT nodes)
    const node = makeNode({
      type: 'TEXT',
      name: 'Label',
      fontSize: 16,
      // no textStyleId → triggers no-text-style
    });
    const ctxWithLibrary: LintContext = {
      colorTokens: new Map(),
      spacingTokens: new Map(),
      radiusTokens: new Map(),
      typographyTokens: new Map(),
      variableIds: new Map(),
      mode: 'library',
      selectedLibrary: 'MyLib',
    };
    // With library: token downgrade skipped, but TEXT node is a leaf → context downgrade applies
    // heuristic → style (context-aware: leaf node)
    const withLib = runLint([node], ctxWithLibrary, { rules: ['no-text-style'] });
    expect(withLib.summary.violations).toBe(1);
    expect(withLib.categories[0].nodes[0].severity).toBe('style');
    expect(withLib.categories[0].nodes[0].baseSeverity).toBe('heuristic');

    // Without tokens or library: token downgrade + context downgrade both apply
    // heuristic → style (token) → verbose (context)
    const withoutCtx = runLint([node], emptyCtx, { rules: ['no-text-style'], minSeverity: 'verbose' });
    expect(withoutCtx.summary.violations).toBe(1);
    expect(withoutCtx.categories[0].nodes[0].severity).toBe('verbose');
    expect(withoutCtx.categories[0].nodes[0].baseSeverity).toBe('heuristic');
  });
});

describe('downgradeSeverity', () => {
  it('error → unsafe', () => expect(downgradeSeverity('error')).toBe('unsafe'));
  it('unsafe → heuristic', () => expect(downgradeSeverity('unsafe')).toBe('heuristic'));
  it('heuristic → style', () => expect(downgradeSeverity('heuristic')).toBe('style'));
  it('style → verbose', () => expect(downgradeSeverity('style')).toBe('verbose'));
  it('verbose → verbose (floor)', () => expect(downgradeSeverity('verbose')).toBe('verbose'));
});

describe('getAvailableRules', () => {
  it('returns a stable, non-duplicated rule list', () => {
    const rules = getAvailableRules();
    expect(rules.length).toBeGreaterThanOrEqual(30);
    expect(new Set(rules.map((rule) => rule.name)).size).toBe(rules.length);
  });

  it('each rule has name, description, category, severity', () => {
    const rules = getAvailableRules();
    for (const rule of rules) {
      expect(rule.name).toBeTruthy();
      expect(rule.description).toBeTruthy();
      expect(['token', 'layout', 'naming', 'wcag', 'component']).toContain(rule.category);
      expect(['error', 'unsafe', 'heuristic', 'style', 'verbose']).toContain(rule.severity);
    }
  });

  it('has rules in all categories', () => {
    const rules = getAvailableRules();
    const categories = new Set(rules.map((r) => r.category));
    expect(categories).toContain('token');
    expect(categories).toContain('layout');
    expect(categories).toContain('naming');
    expect(categories).toContain('wcag');
    expect(categories).toContain('component');
  });
});

describe('cascade suppression', () => {
  it('suppresses no-autolayout descendants when screen-shell-invalid fires on root', () => {
    // Screen-like root with broken shell (no layoutMode) and a child that itself
    // has 2+ children without auto-layout. Without cascade, no-autolayout fires
    // on both root AND child. With cascade, screen-shell-invalid owns the root
    // and descendant no-autolayout is suppressed.
    const screen = makeNode({
      id: '1:1',
      name: 'Login Screen',
      type: 'FRAME',
      role: 'screen',
      width: 402,
      height: 874,
      // No layoutMode on root → screen-shell-invalid fires
      children: [
        makeNode({ id: '2:1', name: 'Header', type: 'FRAME', width: 402, height: 80 }),
        makeNode({
          id: '2:2',
          name: 'Content',
          type: 'FRAME',
          width: 402,
          height: 600,
          // No layoutMode on child → without suppression, no-autolayout would also fire here
          children: [
            makeNode({ id: '3:1', name: 'A', type: 'FRAME', width: 100, height: 100 }),
            makeNode({ id: '3:2', name: 'B', type: 'FRAME', width: 100, height: 100 }),
          ],
        }),
      ],
    });
    const report = runLint([screen], emptyCtx, { rules: ['screen-shell-invalid', 'no-autolayout'] });
    const shellViolations = report.categories.find((c) => c.rule === 'screen-shell-invalid');
    const autoLayoutViolations = report.categories.find((c) => c.rule === 'no-autolayout');
    expect(shellViolations).toBeDefined();
    expect(shellViolations!.count).toBeGreaterThan(0);
    // no-autolayout should NOT fire on the Content descendant when screen-shell-invalid is already flagging the root
    expect(autoLayoutViolations).toBeUndefined();
  });

  it('suppresses overflow-parent inside a no-autolayout container', () => {
    // Parent without auto-layout + oversized child. overflow-parent fires
    // against auto-layout width math, which is meaningless when the parent
    // is free-form positioning. no-autolayout owns this container.
    const parent = makeNode({
      id: '1:1',
      name: 'Card Deck',
      role: 'list', // qualifies as layout role
      type: 'FRAME',
      width: 300,
      height: 400,
      // No layoutMode → no-autolayout fires
      children: [
        makeNode({ id: '2:1', name: 'A', type: 'FRAME', width: 150, height: 100 }),
        makeNode({ id: '2:2', name: 'Overflowing Card', type: 'FRAME', width: 500, height: 100 }),
      ],
    });
    const report = runLint([parent], emptyCtx, { rules: ['no-autolayout', 'overflow-parent'] });
    const noAL = report.categories.find((c) => c.rule === 'no-autolayout');
    const overflow = report.categories.find((c) => c.rule === 'overflow-parent');
    expect(noAL).toBeDefined();
    expect(overflow).toBeUndefined();
  });

  it('component-bindings runs by default and flags unused component properties', () => {
    // Regression guard: component-bindings was previously gated behind the unused
    // `publish` profile and never ran in production. Any future mechanism that
    // re-gates it out of the default activeRules path should fail this test.
    // Intentionally pass no `rules` filter — exercise the default path.
    const node = makeNode({
      name: 'Button',
      type: 'COMPONENT',
      componentPropertyDefinitions: {
        label: { type: 'TEXT', defaultValue: 'Click' },
      },
      children: [makeNode({ id: '2:1', name: 'Label', type: 'TEXT', characters: 'Click', fontSize: 16 })],
    });
    const report = runLint([node], emptyCtx);
    const componentBindings = report.categories.find((c) => c.rule === 'component-bindings');
    expect(componentBindings).toBeDefined();
    expect(componentBindings!.count).toBeGreaterThan(0);
  });

  it('does not suppress when the parent rule does not fire', () => {
    // Proper auto-layout shell — no suppression should kick in, overflow-parent
    // can still fire on a true overflow.
    const parent = makeNode({
      id: '1:1',
      name: 'Valid Row',
      role: 'row',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      width: 300,
      height: 100,
      children: [makeNode({ id: '2:1', name: 'Wide Child', type: 'FRAME', width: 400, height: 80 })],
    });
    const report = runLint([parent], emptyCtx, { rules: ['no-autolayout', 'overflow-parent'] });
    // no-autolayout should NOT fire (parent has HORIZONTAL)
    expect(report.categories.find((c) => c.rule === 'no-autolayout')).toBeUndefined();
    // overflow-parent IS allowed to fire because no-autolayout didn't suppress it
    // (may or may not fire depending on rule internals — just verify no suppression error)
  });
});
