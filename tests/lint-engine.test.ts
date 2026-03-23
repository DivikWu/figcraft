/**
 * Tests for lint engine — rule execution, filtering, pagination.
 */

import { describe, it, expect } from 'vitest';
import { runLint, getAvailableRules } from '../packages/quality-engine/src/engine.js';
import type { AbstractNode, LintContext } from '../packages/quality-engine/src/types.js';
import { downgradeSeverity } from '../packages/quality-engine/src/types.js';

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
    const node = makeNode({ name: 'Header', type: 'FRAME', children: [
      makeNode({ id: '2:1', name: 'Title', type: 'TEXT', fontSize: 16, textStyleId: 'S:abc', characters: 'Title' }),
    ]});
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
    const full = runLint(nodes, emptyCtx, { rules: ['default-name'] });
    const page1 = runLint(nodes, emptyCtx, { rules: ['default-name'], offset: 0, limit: 3 });

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
    const report = runLint(nodes, emptyCtx, { rules: ['default-name'], maxViolations: 5 });
    expect(report.summary.violations).toBeLessThanOrEqual(5);
    expect(report.summary.truncated).toBe(true);
  });

  it('includes bySeverity counts in summary', () => {
    const node = makeNode({ name: 'Frame 1', type: 'FRAME', children: [] });
    const report = runLint([node], emptyCtx, { rules: ['default-name'] });
    expect(report.summary.bySeverity).toBeDefined();
    expect(typeof report.summary.bySeverity.error).toBe('number');
    expect(typeof report.summary.bySeverity.warning).toBe('number');
    expect(typeof report.summary.bySeverity.info).toBe('number');
    expect(typeof report.summary.bySeverity.hint).toBe('number');
    // default-name is warning severity
    expect(report.summary.bySeverity.warning).toBeGreaterThan(0);
  });

  it('filters by minSeverity', () => {
    // max-nesting-depth produces hint-level violations
    const deep = makeNode({
      name: 'Root', type: 'FRAME', children: [
        makeNode({ id: '2:1', name: 'L1', type: 'FRAME', children: [
          makeNode({ id: '3:1', name: 'L2', type: 'FRAME', children: [
            makeNode({ id: '4:1', name: 'L3', type: 'FRAME', children: [
              makeNode({ id: '5:1', name: 'L4', type: 'FRAME', children: [
                makeNode({ id: '6:1', name: 'L5', type: 'FRAME', children: [
                  makeNode({ id: '7:1', name: 'L6', type: 'FRAME', children: [
                    makeNode({ id: '8:1', name: 'L7', type: 'FRAME', children: [] }),
                  ]}),
                ]}),
              ]}),
            ]}),
          ]}),
        ]}),
      ],
    });
    const allReport = runLint([deep], emptyCtx, { rules: ['max-nesting-depth'] });
    const filteredReport = runLint([deep], emptyCtx, { rules: ['max-nesting-depth'], minSeverity: 'info' });
    // hint violations should be excluded when minSeverity is 'info'
    expect(allReport.summary.violations).toBeGreaterThan(0);
    expect(filteredReport.summary.violations).toBe(0);
  });

  it('downgrades token rule severity when no tokens and no library', () => {
    // no-text-style is a warning-level token rule that fires regardless of token context
    // (it checks for missing textStyleId on TEXT nodes)
    const node = makeNode({
      type: 'TEXT', name: 'Label', fontSize: 16,
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
    // With library: should stay warning (no downgrade)
    const withLib = runLint([node], ctxWithLibrary, { rules: ['no-text-style'] });
    expect(withLib.summary.violations).toBe(1);
    expect(withLib.categories[0].nodes[0].severity).toBe('warning');
    expect(withLib.categories[0].nodes[0].baseSeverity).toBeUndefined();

    // Without tokens or library: should downgrade warning → info
    const withoutCtx = runLint([node], emptyCtx, { rules: ['no-text-style'] });
    expect(withoutCtx.summary.violations).toBe(1);
    expect(withoutCtx.categories[0].nodes[0].severity).toBe('info');
    expect(withoutCtx.categories[0].nodes[0].baseSeverity).toBe('warning');
  });
});

describe('downgradeSeverity', () => {
  it('error → warning', () => expect(downgradeSeverity('error')).toBe('warning'));
  it('warning → info', () => expect(downgradeSeverity('warning')).toBe('info'));
  it('info → hint', () => expect(downgradeSeverity('info')).toBe('hint'));
  it('hint → hint (floor)', () => expect(downgradeSeverity('hint')).toBe('hint'));
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
      expect(['error', 'warning', 'info', 'hint']).toContain(rule.severity);
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
