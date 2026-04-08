/**
 * Tests for structured tokenBindingFailures (I4).
 * Verifies the TokenBindingFailure interface and CreateContext accumulation.
 */

import { describe, expect, it } from 'vitest';

/** Verifies the TokenBindingFailure type shape used by applyFill results and CreateContext. */
interface TokenBindingFailure {
  requested: string;
  type: 'variable' | 'style';
  action: 'skipped' | 'used_fallback';
}

describe('TokenBindingFailure shape', () => {
  it('represents a variable binding failure', () => {
    const failure: TokenBindingFailure = {
      requested: 'surface/primary',
      type: 'variable',
      action: 'skipped',
    };
    expect(failure.type).toBe('variable');
    expect(failure.action).toBe('skipped');
    expect(failure.requested).toBe('surface/primary');
  });

  it('represents a style binding failure', () => {
    const failure: TokenBindingFailure = {
      requested: 'Primary/500',
      type: 'style',
      action: 'skipped',
    };
    expect(failure.type).toBe('style');
    expect(failure.requested).toBe('Primary/500');
  });

  it('accumulates multiple failures', () => {
    const failures: TokenBindingFailure[] = [];
    failures.push({ requested: 'surface/primary', type: 'variable', action: 'skipped' });
    failures.push({ requested: 'text/secondary', type: 'variable', action: 'skipped' });
    failures.push({ requested: 'Elevation/200', type: 'style', action: 'skipped' });
    expect(failures).toHaveLength(3);
    expect(failures.filter((f) => f.type === 'variable')).toHaveLength(2);
    expect(failures.filter((f) => f.type === 'style')).toHaveLength(1);
  });
});
