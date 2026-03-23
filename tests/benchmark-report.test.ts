import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BENCHMARK_THRESHOLDS,
  evaluateBenchmarkGate,
  renderBenchmarkDashboard,
  type BenchmarkPayload,
} from '../scripts/screen-benchmark-lib.js';

function makePayload(overrides: Partial<BenchmarkPayload> = {}): BenchmarkPayload {
  return {
    generatedAt: '2026-03-22T10:00:00.000Z',
    summary: {
      cases: 2,
      passed: 2,
      failed: 0,
      rules: ['root-misclassified-interactive'],
      overallPassRate: 1,
    },
    results: [
      {
        id: 'auth-sign-in-clean',
        name: 'Healthy sign-in screen',
        expected: 'clean',
        passed: true,
        violations: 0,
        bySeverity: { error: 0, warning: 0, info: 0, hint: 0 },
        triggeredRules: [],
        rootMisclassificationCount: 0,
        nestedInteractiveCount: 0,
        screenShellInvalidCount: 0,
        criticalCount: 0,
        manualPatchesNeededEstimate: 0,
      },
      {
        id: 'dashboard-clean',
        name: 'Healthy dashboard screen',
        expected: 'clean',
        passed: true,
        violations: 0,
        bySeverity: { error: 0, warning: 0, info: 0, hint: 0 },
        triggeredRules: [],
        rootMisclassificationCount: 0,
        nestedInteractiveCount: 0,
        screenShellInvalidCount: 0,
        criticalCount: 0,
        manualPatchesNeededEstimate: 0,
      },
    ],
    ruleFrequency: {},
    logicPathComparisons: [
      {
        id: 'synthetic-auth-screen',
        name: 'Synthetic auth screen',
        passed: true,
        raw: {
          isError: false,
          finalViolations: 2,
          criticalCount: 1,
          fixedCount: 0,
          stageCount: 1,
          patchCallCount: 0,
          patchNodeCount: 0,
          lintFixCallCount: 1,
          warningCount: 2,
          structuralErrorCount: 0,
          maxStageRemaining: 2,
          rootMisclassificationCount: 1,
          nestedInteractiveCount: 0,
          screenShellInvalidCount: 1,
          manualPatchesNeededEstimate: 2,
          remainingRules: ['root-misclassified-interactive', 'screen-shell-invalid'],
        },
        orchestrated: {
          isError: false,
          finalViolations: 0,
          criticalCount: 0,
          fixedCount: 2,
          stageCount: 4,
          patchCallCount: 0,
          patchNodeCount: 0,
          lintFixCallCount: 4,
          warningCount: 0,
          structuralErrorCount: 0,
          maxStageRemaining: 0,
          rootMisclassificationCount: 0,
          nestedInteractiveCount: 0,
          screenShellInvalidCount: 0,
          manualPatchesNeededEstimate: 0,
          remainingRules: [],
        },
      },
    ],
    ...overrides,
  };
}

describe('benchmark gate', () => {
  it('passes when payload satisfies thresholds', () => {
    const gate = evaluateBenchmarkGate(makePayload(), DEFAULT_BENCHMARK_THRESHOLDS);
    expect(gate.ok).toBe(true);
    expect(gate.checks.every((check) => check.ok)).toBe(true);
  });

  it('fails when structural regressions exceed thresholds', () => {
    const payload = makePayload({
      summary: { cases: 2, passed: 1, failed: 1, rules: ['root-misclassified-interactive'], overallPassRate: 0.5 },
      logicPathComparisons: [
        {
          id: 'auth-sign-in-clean',
          name: 'Healthy sign-in screen',
          passed: false,
          raw: {
            isError: false,
            finalViolations: 2,
            criticalCount: 1,
            fixedCount: 0,
            stageCount: 1,
            patchCallCount: 0,
            patchNodeCount: 0,
            lintFixCallCount: 1,
            warningCount: 2,
            structuralErrorCount: 0,
            maxStageRemaining: 2,
            rootMisclassificationCount: 1,
            nestedInteractiveCount: 0,
            screenShellInvalidCount: 0,
            manualPatchesNeededEstimate: 1,
            remainingRules: ['root-misclassified-interactive'],
          },
          orchestrated: {
            isError: false,
            finalViolations: 1,
            criticalCount: 1,
            fixedCount: 0,
            stageCount: 4,
            patchCallCount: 6,
            patchNodeCount: 6,
            lintFixCallCount: 4,
            warningCount: 0,
            structuralErrorCount: 0,
            maxStageRemaining: 1,
            rootMisclassificationCount: 1,
            nestedInteractiveCount: 0,
            screenShellInvalidCount: 0,
            manualPatchesNeededEstimate: 1,
            remainingRules: ['root-misclassified-interactive'],
          },
          reason: 'failed',
        },
        {
          id: 'dashboard-clean',
          name: 'Healthy dashboard screen',
          passed: true,
          raw: {
            isError: false,
            finalViolations: 2,
            criticalCount: 1,
            fixedCount: 0,
            stageCount: 1,
            patchCallCount: 0,
            patchNodeCount: 0,
            lintFixCallCount: 1,
            warningCount: 2,
            structuralErrorCount: 0,
            maxStageRemaining: 2,
            rootMisclassificationCount: 0,
            nestedInteractiveCount: 0,
            screenShellInvalidCount: 0,
            manualPatchesNeededEstimate: 2,
            remainingRules: ['screen-shell-invalid'],
          },
          orchestrated: {
            isError: false,
            finalViolations: 0,
            criticalCount: 0,
            fixedCount: 2,
            stageCount: 4,
            patchCallCount: 0,
            patchNodeCount: 0,
            lintFixCallCount: 4,
            warningCount: 0,
            structuralErrorCount: 0,
            maxStageRemaining: 0,
            rootMisclassificationCount: 0,
            nestedInteractiveCount: 0,
            screenShellInvalidCount: 0,
            manualPatchesNeededEstimate: 0,
            remainingRules: [],
          },
        },
      ],
    });
    const gate = evaluateBenchmarkGate(payload, DEFAULT_BENCHMARK_THRESHOLDS);
    expect(gate.ok).toBe(false);
    expect(gate.checks.some((check) => check.name === 'rootMisclassificationCount' && !check.ok)).toBe(true);
  });
});

describe('benchmark dashboard', () => {
  it('renders summary and delta sections', () => {
    const current = makePayload();
    const previous = makePayload({
      generatedAt: '2026-03-21T10:00:00.000Z',
      summary: { cases: 2, passed: 1, failed: 1, rules: ['root-misclassified-interactive'], overallPassRate: 0.5 },
    });

    const markdown = renderBenchmarkDashboard(current, previous);
    expect(markdown).toContain('# FigCraft Benchmark Dashboard');
    expect(markdown).toContain('## Delta vs Previous');
    expect(markdown).toContain('## Generation Summary');
    expect(markdown).toContain('Generation Comparison');
    expect(markdown).toContain('Generation quality pass rate');
  });
});
