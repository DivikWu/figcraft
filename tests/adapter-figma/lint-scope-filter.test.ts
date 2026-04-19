/**
 * Regression tests for lint_check default-scope filter that excludes remote
 * library components from auto-scan.
 *
 * The filter applies only when user has no explicit selection (page-level
 * scan). Explicit selection paths bypass this filter entirely — the user's
 * selection is always honored.
 *
 * Rules verified:
 * - non-component nodes always kept
 * - remote=true COMPONENT / COMPONENT_SET excluded
 * - remote=false COMPONENT / COMPONENT_SET kept (any publishStatus)
 */

import { describe, expect, it } from 'vitest';

/**
 * Extracted predicate from handlers/lint.ts default-scope branch.
 * Kept in sync with the production filter logic.
 */
function keepInDefaultScope(n: { type: string; remote?: boolean }): boolean {
  if (n.type !== 'COMPONENT' && n.type !== 'COMPONENT_SET') return true;
  return !n.remote;
}

describe('lint_check default-scope filter', () => {
  it('keeps non-component nodes regardless of any flags', () => {
    expect(keepInDefaultScope({ type: 'FRAME' })).toBe(true);
    expect(keepInDefaultScope({ type: 'TEXT' })).toBe(true);
    expect(keepInDefaultScope({ type: 'INSTANCE' })).toBe(true);
    expect(keepInDefaultScope({ type: 'GROUP' })).toBe(true);
    expect(keepInDefaultScope({ type: 'SECTION' })).toBe(true);
  });

  it('excludes remote COMPONENT', () => {
    expect(keepInDefaultScope({ type: 'COMPONENT', remote: true })).toBe(false);
  });

  it('excludes remote COMPONENT_SET', () => {
    expect(keepInDefaultScope({ type: 'COMPONENT_SET', remote: true })).toBe(false);
  });

  it('keeps local COMPONENT (any publishStatus)', () => {
    // Local component = remote:false. The filter is publishStatus-agnostic by
    // design — keeping UNPUBLISHED / CHANGED / CURRENT all scanned.
    expect(keepInDefaultScope({ type: 'COMPONENT', remote: false })).toBe(true);
  });

  it('keeps local COMPONENT_SET (any publishStatus)', () => {
    expect(keepInDefaultScope({ type: 'COMPONENT_SET', remote: false })).toBe(true);
  });

  it('keeps COMPONENT with remote undefined (defensive default)', () => {
    // If remote isn't set on the node shape (shouldn't happen in real Figma,
    // but defensive behavior matters), treat as local.
    expect(keepInDefaultScope({ type: 'COMPONENT' })).toBe(true);
  });

  it('filter applied end-to-end: mixed page with both remote and local masters', () => {
    const pageChildren = [
      { type: 'FRAME', name: 'Login Screen' },
      { type: 'COMPONENT', name: 'Local Button', remote: false },
      { type: 'COMPONENT', name: 'Remote Icon', remote: true },
      { type: 'INSTANCE', name: 'Sign Up Button' },
      { type: 'COMPONENT_SET', name: 'Remote Chip', remote: true },
      { type: 'COMPONENT_SET', name: 'Local Card', remote: false },
    ];
    const kept = pageChildren.filter(keepInDefaultScope).map((n) => n.name);
    expect(kept).toEqual(['Login Screen', 'Local Button', 'Sign Up Button', 'Local Card']);
  });
});
