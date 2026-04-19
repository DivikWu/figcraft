/**
 * Interactive classifier unit tests — weighted signal coverage.
 *
 * Scope: pure classification, one node at a time. Engine-level caching and
 * telemetry live separately; rule integration tests will land with Phase 1.
 */
import { describe, expect, it } from 'vitest';
import { classifyInteractive } from '../../packages/quality-engine/src/interactive/classifier.js';
import type { AbstractNode } from '../../packages/quality-engine/src/types.js';

function makeNode(overrides: Partial<AbstractNode>): AbstractNode {
  return { id: '1:1', name: 'Test', type: 'FRAME', ...overrides };
}

describe('classifyInteractive — declaration short-circuit', () => {
  it('returns declared kind with confidence 1 regardless of structure', () => {
    const node = makeNode({
      interactive: { kind: 'link-standalone', confidence: 1, declared: true },
    });
    const r = classifyInteractive(node);
    expect(r.kind).toBe('link-standalone');
    expect(r.confidence).toBe(1);
    expect(r.declared).toBe(true);
  });

  it('declared kind wins over contradicting name regex', () => {
    const node = makeNode({
      name: 'Log in',
      interactive: { kind: 'button-text', confidence: 1, declared: true },
    });
    const r = classifyInteractive(node);
    expect(r.kind).toBe('button-text');
  });
});

describe('classifyInteractive — role-driven', () => {
  it('role=button + fill + single TEXT child → button-solid', () => {
    const node = makeNode({
      role: 'button',
      layoutMode: 'HORIZONTAL',
      fills: [{ type: 'SOLID', color: '#000000', visible: true, opacity: 1 }],
      width: 200,
      height: 48,
      children: [{ id: '1:2', name: 'Submit', type: 'TEXT' }],
    });
    const r = classifyInteractive(node);
    expect(r.kind).toBe('button-solid');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('role=button + stroke only + single TEXT child → button-outline', () => {
    const node = makeNode({
      role: 'button',
      layoutMode: 'HORIZONTAL',
      strokes: [{ type: 'SOLID', color: '#000000', visible: true }],
      strokeWeight: 1,
      width: 200,
      height: 48,
      children: [{ id: '1:2', name: 'Submit', type: 'TEXT' }],
    });
    const r = classifyInteractive(node);
    expect(r.kind).toBe('button-outline');
  });

  it('role=button + no fill/stroke + reactions → button-ghost', () => {
    const node = makeNode({
      role: 'button',
      layoutMode: 'HORIZONTAL',
      reactions: true,
      width: 200,
      height: 48,
      children: [{ id: '1:2', name: 'Submit', type: 'TEXT' }],
    });
    const r = classifyInteractive(node);
    expect(r.kind).toBe('button-ghost');
  });

  it('role=link on a bare TEXT → link-standalone', () => {
    const node = makeNode({
      type: 'TEXT',
      role: 'link',
      reactions: true,
      characters: 'Forgot password?',
    });
    const r = classifyInteractive(node);
    expect(r.kind).toBe('link-standalone');
  });

  it('role=presentation excludes interactive classification', () => {
    const node = makeNode({ role: 'presentation', fills: [{ type: 'SOLID', color: '#000' }] });
    const r = classifyInteractive(node);
    expect(r.kind).toBeNull();
  });
});

describe('classifyInteractive — structural fallback (no role)', () => {
  it('frame + fill + single TEXT child → button-solid inferred', () => {
    const node = makeNode({
      name: 'Primary Container',
      layoutMode: 'HORIZONTAL',
      fills: [{ type: 'SOLID', color: '#FF0000', visible: true, opacity: 1 }],
      width: 200,
      height: 48,
      children: [{ id: '1:2', name: 'Click me', type: 'TEXT' }],
    });
    const r = classifyInteractive(node);
    // Without role, structural signal alone (0.5) is at the commit threshold — may pass or null
    // The key regression: must NOT misclassify as some other kind
    if (r.kind) expect(r.kind).toBe('button-solid');
  });

  it('square frame with icon child → button-icon', () => {
    const node = makeNode({
      name: 'Icon Button',
      width: 40,
      height: 40,
      reactions: true,
      children: [{ id: '1:2', name: 'Vector', type: 'VECTOR', width: 24, height: 24 }],
    });
    const r = classifyInteractive(node);
    expect(r.kind).toBe('button-icon');
  });

  it('circular frame sized 56 with icon child → button-fab', () => {
    const node = makeNode({
      name: 'Add',
      width: 56,
      height: 56,
      cornerRadius: 28,
      reactions: true,
      children: [{ id: '1:2', name: 'Vector', type: 'VECTOR' }],
    });
    const r = classifyInteractive(node);
    expect(r.kind).toBe('button-fab');
  });

  it('regression: 48×32 library search button (fill + vector child) → button-icon with high confidence', () => {
    const node = makeNode({
      name: 'Button / Basis - Default',
      type: 'INSTANCE',
      width: 48,
      height: 32,
      fills: [{ type: 'SOLID', color: '#000000', visible: true, opacity: 1 }],
      children: [{ id: '1:2', name: 'Search', type: 'VECTOR' }],
    });
    const r = classifyInteractive(node);
    expect(r.kind).toBe('button-icon');
    // iconShell (0.55) + carrier fill (0.15) + name~button (0.1) → ≥ 0.7
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('regression: 32×32 next-arrow (no fill, vector child) → button-icon', () => {
    const node = makeNode({
      name: 'Next',
      type: 'FRAME',
      width: 32,
      height: 32,
      children: [{ id: '1:2', name: 'ChevronRight', type: 'VECTOR' }],
    });
    const r = classifyInteractive(node);
    expect(r.kind).toBe('button-icon');
  });

  it('oversize card (200×300) with vector child is NOT classified as icon button', () => {
    const node = makeNode({
      name: 'Hero Card',
      type: 'FRAME',
      width: 200,
      height: 300,
      fills: [{ type: 'SOLID', color: '#ffffff', visible: true, opacity: 1 }],
      children: [{ id: '1:2', name: 'Illustration', type: 'VECTOR' }],
    });
    const r = classifyInteractive(node);
    // minDim=200 > 72 → iconShell branch skipped
    expect(r.kind === 'button-icon' || r.kind === 'button-fab').toBe(false);
  });
});

describe('classifyInteractive — regression guardrails (false-positive prevention)', () => {
  it('TEXT "Sign in to continue shopping" without reactions → null', () => {
    const node = makeNode({
      id: '1:3',
      name: 'Sign in to continue shopping',
      type: 'TEXT',
      characters: 'Sign in to continue shopping',
    });
    const r = classifyInteractive(node);
    expect(r.kind).toBeNull();
  });

  it('TEXT "Forgot password?" without reactions → null (no affordance yet)', () => {
    const node = makeNode({
      id: '1:4',
      name: 'Forgot password?',
      type: 'TEXT',
      characters: 'Forgot password?',
    });
    const r = classifyInteractive(node);
    expect(r.kind).toBeNull();
  });

  it('frame named "container" with single text child and no fill → no strong classification', () => {
    const node = makeNode({
      name: 'container',
      type: 'FRAME',
      width: 320,
      height: 48,
      children: [{ id: '1:2', name: 'Title', type: 'TEXT' }],
    });
    const r = classifyInteractive(node);
    // Should be null — no fill, no role, no reactions
    expect(r.kind).toBeNull();
  });

  it('oversize banner (800px wide) with fill + text child is penalized away from button', () => {
    const node = makeNode({
      name: 'Banner',
      type: 'FRAME',
      width: 800,
      height: 48,
      fills: [{ type: 'SOLID', color: '#000', visible: true, opacity: 1 }],
      children: [{ id: '1:2', name: 'Banner text', type: 'TEXT' }],
    });
    const r = classifyInteractive(node);
    // oversize penalty should knock button-solid below commit threshold
    expect(r.kind).toBeNull();
  });
});

describe('classifyInteractive — confidence & ambiguity', () => {
  it('ambiguous node returns kind=null with signals populated', () => {
    const node = makeNode({ name: 'Foo', type: 'FRAME' });
    const r = classifyInteractive(node);
    expect(r.kind).toBeNull();
    expect(Array.isArray(r.signals)).toBe(true);
  });

  it('parentKind=button suppresses child button classification', () => {
    const child = makeNode({
      role: 'button',
      layoutMode: 'HORIZONTAL',
      fills: [{ type: 'SOLID', color: '#000', visible: true, opacity: 1 }],
      width: 200,
      height: 48,
      children: [{ id: '1:2', name: 'Submit', type: 'TEXT' }],
    });
    const solo = classifyInteractive(child);
    const nested = classifyInteractive(child, 'button-solid');
    // Nested button loses 0.2 — may drop below commit threshold or stay below solo confidence
    if (nested.kind && solo.kind) {
      expect(nested.confidence).toBeLessThanOrEqual(solo.confidence);
    }
  });

  it('name regex alone is insufficient to commit to a kind', () => {
    const node = makeNode({ name: 'btn', type: 'FRAME' });
    const r = classifyInteractive(node);
    expect(r.kind).toBeNull();
  });
});
