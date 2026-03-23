/**
 * Screen benchmark tests — regression-style quality baselines for complete screens.
 *
 * These intentionally focus on the new screen-level layout/visual rules so we can
 * track whole-screen quality instead of only unit-testing isolated rule helpers.
 */

import { describe, it, expect } from 'vitest';
import { runLint } from '../packages/quality-engine/src/engine.js';
import { screenBenchmarkCases, screenBenchmarkContext, screenBenchmarkRules } from './helpers/screen-benchmark-fixtures.js';

describe('screen benchmarks', () => {
  for (const benchmark of screenBenchmarkCases) {
    it(`${benchmark.id}: ${benchmark.name}`, () => {
      const report = runLint(benchmark.nodes, screenBenchmarkContext, {
        rules: [...screenBenchmarkRules],
        minSeverity: 'warning',
      });
      const triggered = new Set(report.categories.map((category) => category.rule));

      if (benchmark.expected === 'clean') {
        expect(report.summary.violations).toBe(0);
        return;
      }

      expect(report.summary.violations).toBeGreaterThanOrEqual(benchmark.minViolations ?? 1);
      for (const rule of benchmark.requiredRules ?? []) {
        expect(triggered.has(rule)).toBe(true);
      }
    });
  }
});
