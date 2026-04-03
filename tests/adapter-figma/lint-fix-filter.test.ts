/**
 * Regression tests for lint_fix heuristic filter change.
 *
 * The filter was changed from skipping all heuristic/style severity violations
 * to only skipping verbose severity. This validates:
 * - verbose violations are still skipped
 * - heuristic violations with autoFixable + fixDescriptor are NOT skipped
 * - style violations with autoFixable + fixDescriptor are NOT skipped
 * - non-autoFixable violations are always skipped (regardless of severity)
 */

import { describe, expect, it } from 'vitest';
import type { LintSeverity, LintViolation } from '../../packages/quality-engine/src/types.js';

/**
 * Extracted filter logic from lint_fix handler (lint.ts lines 510-514).
 * Returns 'fix' | 'skip-not-fixable' | 'skip-verbose' | 'skip-no-descriptor'
 */
function classifyViolation(v: Pick<LintViolation, 'autoFixable' | 'severity' | 'fixDescriptor'>): string {
  if (!v.autoFixable) return 'skip-not-fixable';
  if (v.severity === 'verbose') return 'skip-verbose';
  if (!v.fixDescriptor) return 'skip-no-descriptor';
  return 'fix';
}

function makeViolation(
  overrides: Partial<LintViolation>,
): Pick<LintViolation, 'autoFixable' | 'severity' | 'fixDescriptor'> {
  return {
    autoFixable: true,
    severity: 'heuristic',
    fixDescriptor: { kind: 'resize', width: 44 },
    ...overrides,
  };
}

describe('lint_fix severity filter (regression)', () => {
  it('skips verbose severity (WCAG AAA / enhancement checks)', () => {
    expect(classifyViolation(makeViolation({ severity: 'verbose' }))).toBe('skip-verbose');
  });

  it('fixes heuristic severity with fixDescriptor', () => {
    expect(classifyViolation(makeViolation({ severity: 'heuristic' }))).toBe('fix');
  });

  it('fixes style severity with fixDescriptor', () => {
    expect(classifyViolation(makeViolation({ severity: 'style' }))).toBe('fix');
  });

  it('fixes error severity with fixDescriptor', () => {
    expect(classifyViolation(makeViolation({ severity: 'error' }))).toBe('fix');
  });

  it('fixes unsafe severity with fixDescriptor', () => {
    expect(classifyViolation(makeViolation({ severity: 'unsafe' }))).toBe('fix');
  });

  it('skips non-autoFixable regardless of severity', () => {
    const severities: LintSeverity[] = ['error', 'unsafe', 'heuristic', 'style', 'verbose'];
    for (const severity of severities) {
      expect(classifyViolation(makeViolation({ severity, autoFixable: false }))).toBe('skip-not-fixable');
    }
  });

  it('fails gracefully when fixDescriptor is missing', () => {
    expect(
      classifyViolation(
        makeViolation({
          severity: 'heuristic',
          autoFixable: true,
          fixDescriptor: undefined,
        }),
      ),
    ).toBe('skip-no-descriptor');
  });
});

describe('lint_fix heuristic filter — real-world scenarios', () => {
  it('wcag-target-size (heuristic + resize) should be fixed', () => {
    const v = makeViolation({
      severity: 'heuristic',
      autoFixable: true,
      fixDescriptor: { kind: 'resize', width: 44, height: 44 },
    });
    expect(classifyViolation(v)).toBe('fix');
  });

  it('wcag-target-size TEXT node (heuristic + deferred) should be fixed', () => {
    const v = makeViolation({
      severity: 'heuristic',
      autoFixable: true,
      fixDescriptor: {
        kind: 'deferred',
        strategy: 'wrap-touch-target',
        data: { minWidth: 44, minHeight: 44 },
      },
    });
    expect(classifyViolation(v)).toBe('fix');
  });

  it('default-name (style severity) should be fixed', () => {
    const v = makeViolation({
      severity: 'style',
      autoFixable: true,
      fixDescriptor: { kind: 'set-properties', props: { name: 'Button' } },
    });
    expect(classifyViolation(v)).toBe('fix');
  });
});
