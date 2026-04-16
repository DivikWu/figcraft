/**
 * Tests for the token-binding-failures harness rule.
 *
 * Validates the core P0 fix: when a create_* / nodes handler returns
 * `_tokenBindingFailures` on the response, the harness must surface it as
 * a `_nextSteps` recovery instruction so agents can self-correct on the
 * next tool call instead of discovering the failure by reading logs.
 */

import { describe, expect, it } from 'vitest';
import { DesignSession } from '../../../packages/core-mcp/src/design-session.js';
import { createHarnessContext, HarnessPipeline } from '../../../packages/core-mcp/src/harness/pipeline.js';
import { nextStepsRule } from '../../../packages/core-mcp/src/harness/rules/next-steps.js';
import { tokenBindingFailuresRule } from '../../../packages/core-mcp/src/harness/rules/token-binding-failures.js';

function makeCtx(toolName = 'create_component') {
  return createHarnessContext(toolName, toolName, {}, new DesignSession(), true);
}

describe('tokenBindingFailuresRule', () => {
  it('is a no-op when the response has no _tokenBindingFailures field', async () => {
    const pipeline = new HarnessPipeline();
    pipeline.register(tokenBindingFailuresRule);

    const result = (await pipeline.run(makeCtx(), async () => ({ id: '1:2', name: 'Frame' }))) as Record<
      string,
      unknown
    >;

    expect(result._nextSteps).toBeUndefined();
  });

  it('is a no-op when _tokenBindingFailures is an empty array', async () => {
    const pipeline = new HarnessPipeline();
    pipeline.register(tokenBindingFailuresRule);

    const result = (await pipeline.run(makeCtx(), async () => ({
      id: '1:2',
      _tokenBindingFailures: [],
    }))) as Record<string, unknown>;

    expect(result._nextSteps).toBeUndefined();
  });

  it('injects _nextSteps when a binding failure is present on a top-level response', async () => {
    const pipeline = new HarnessPipeline();
    pipeline.register(tokenBindingFailuresRule);

    const result = (await pipeline.run(makeCtx('create_frame'), async () => ({
      id: '1:2',
      _tokenBindingFailures: [{ requested: 'text/primary', type: 'variable', action: 'skipped' }],
    }))) as Record<string, unknown>;

    expect(Array.isArray(result._nextSteps)).toBe(true);
    const steps = result._nextSteps as string[];
    expect(steps.length).toBeGreaterThanOrEqual(2);
    // The summary line must call out that the node kept Figma's default color.
    expect(steps[0]).toMatch(/NOT applied/);
    expect(steps[0]).toMatch(/default color/);
    // The failure list must name the requested variable and the action.
    expect(steps[1]).toContain('"text/primary"');
    expect(steps[1]).toContain('skipped');
    // The recovery line must point to batch_bind as the canonical recovery tool.
    expect(steps[steps.length - 1]).toContain('batch_bind');
  });

  it('collects failures from nested results[] on patch_nodes responses', async () => {
    // patch_nodes / nodes.update (write-nodes.ts:676-680) returns
    // `{ results: [{ nodeId, ok, _tokenBindingFailures? }, ...] }`.
    const pipeline = new HarnessPipeline();
    pipeline.register(tokenBindingFailuresRule);

    const result = (await pipeline.run(makeCtx('nodes'), async () => ({
      results: [
        {
          nodeId: '1:2',
          ok: true,
          _tokenBindingFailures: [{ requested: 'a', type: 'variable', action: 'skipped' }],
        },
        {
          nodeId: '1:3',
          ok: true,
          _tokenBindingFailures: [{ requested: 'b', type: 'variable', action: 'scope-mismatch' }],
        },
      ],
    }))) as Record<string, unknown>;

    const steps = result._nextSteps as string[];
    expect(steps[0]).toMatch(/2 variable\/style bindings/);
    expect(steps[1]).toContain('"a"');
    expect(steps[1]).toContain('"b"');
  });

  it('defensive fallback: collects from items[] if a future handler uses that shape', async () => {
    // No current handler produces this shape, but the rule accepts it as a
    // safety net so future batch handlers can drop into the same pipeline.
    const pipeline = new HarnessPipeline();
    pipeline.register(tokenBindingFailuresRule);

    const result = (await pipeline.run(makeCtx(), async () => ({
      created: 1,
      items: [
        { id: '1:2', ok: true, _tokenBindingFailures: [{ requested: 'z', type: 'variable', action: 'skipped' }] },
      ],
    }))) as Record<string, unknown>;

    const steps = result._nextSteps as string[];
    expect(steps[1]).toContain('"z"');
  });

  it('deduplicates repeated failures (same requested+action) in the listing line', async () => {
    const pipeline = new HarnessPipeline();
    pipeline.register(tokenBindingFailuresRule);

    const failures = Array.from({ length: 24 }, () => ({
      requested: 'text/primary',
      type: 'variable' as const,
      action: 'skipped' as const,
    }));

    const result = (await pipeline.run(makeCtx(), async () => ({
      id: '1:2',
      _tokenBindingFailures: failures,
    }))) as Record<string, unknown>;

    const steps = result._nextSteps as string[];
    // Summary still reports the raw count
    expect(steps[0]).toMatch(/24 variable\/style bindings/);
    // But the listing line collapses to one entry (no "… +N more" suffix since unique=1)
    expect(steps[1]).toBe('Unresolved: "text/primary" (variable, skipped)');
  });

  it('merges with _nextSteps from nextStepsRule instead of overwriting', async () => {
    const pipeline = new HarnessPipeline();
    // Both rules registered — nextStepsRule runs first (priority 80),
    // tokenBindingFailuresRule runs after (priority 90) and must append.
    pipeline.register(nextStepsRule);
    pipeline.register(tokenBindingFailuresRule);

    const result = (await pipeline.run(makeCtx('create_component'), async () => ({
      id: '1:2',
      _tokenBindingFailures: [{ requested: 'text/primary', type: 'variable', action: 'skipped' }],
    }))) as Record<string, unknown>;

    const steps = result._nextSteps as string[];
    // Our 3 steps are at the front, followed by nextStepsRule's original steps.
    expect(steps.length).toBeGreaterThan(3);
    expect(steps[0]).toMatch(/NOT applied/);
    // nextStepsRule's create_component guidance about size variants should still be present.
    expect(steps.some((s) => /SIZE VARIANTS/i.test(s))).toBe(true);
  });

  it('is a no-op on error responses', async () => {
    const pipeline = new HarnessPipeline();
    pipeline.register(tokenBindingFailuresRule);

    // Throw an error — pipeline should skip post-enrich.
    await expect(
      pipeline.run(makeCtx(), async () => {
        throw new Error('bridge not connected');
      }),
    ).rejects.toThrow();
  });
});
