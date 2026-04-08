/**
 * Tests for the Harness Pipeline core — phase ordering, glob matching,
 * and action handling (block, transform, enrich, warn, recover).
 */

import { describe, expect, it } from 'vitest';
import { DesignSession } from '../../../packages/core-mcp/src/design-session.js';
import { createHarnessContext, HarnessPipeline } from '../../../packages/core-mcp/src/harness/pipeline.js';
import type { HarnessAction, HarnessRule } from '../../../packages/core-mcp/src/harness/types.js';

function makeCtx(toolName = 'test_tool', params: Record<string, unknown> = {}) {
  return createHarnessContext(toolName, toolName, params, new DesignSession(), false);
}

function makeRule(overrides: Partial<HarnessRule> & { name: string; phase: HarnessRule['phase'] }): HarnessRule {
  return {
    tools: ['*'],
    priority: 100,
    execute: async () => ({ type: 'pass' }) as HarnessAction,
    ...overrides,
  };
}

describe('HarnessPipeline', () => {
  describe('phase ordering', () => {
    it('runs rules in priority order within a phase', async () => {
      const pipeline = new HarnessPipeline();
      const order: string[] = [];

      pipeline.register(
        makeRule({
          name: 'b',
          phase: 'post-enrich',
          priority: 200,
          execute: async () => {
            order.push('b');
            return { type: 'pass' };
          },
        }),
        makeRule({
          name: 'a',
          phase: 'post-enrich',
          priority: 50,
          execute: async () => {
            order.push('a');
            return { type: 'pass' };
          },
        }),
      );

      const ctx = makeCtx();
      await pipeline.run(ctx, async () => ({}));
      expect(order).toEqual(['a', 'b']);
    });
  });

  describe('glob matching', () => {
    it('matches exact tool name', async () => {
      const pipeline = new HarnessPipeline();
      let ran = false;

      pipeline.register(
        makeRule({
          name: 'exact',
          tools: ['create_frame'],
          phase: 'post-enrich',
          execute: async () => {
            ran = true;
            return { type: 'pass' };
          },
        }),
      );

      await pipeline.run(makeCtx('create_frame'), async () => ({}));
      expect(ran).toBe(true);

      ran = false;
      await pipeline.run(makeCtx('other_tool'), async () => ({}));
      expect(ran).toBe(false);
    });

    it('matches glob suffix pattern', async () => {
      const pipeline = new HarnessPipeline();
      const matched: string[] = [];

      pipeline.register(
        makeRule({
          name: 'glob',
          tools: ['create_*'],
          phase: 'post-enrich',
          execute: async (ctx) => {
            matched.push(ctx.toolName);
            return { type: 'pass' };
          },
        }),
      );

      await pipeline.run(makeCtx('create_frame'), async () => ({}));
      await pipeline.run(makeCtx('create_text'), async () => ({}));
      await pipeline.run(makeCtx('nodes'), async () => ({}));

      expect(matched).toEqual(['create_frame', 'create_text']);
    });

    it('matches wildcard *', async () => {
      const pipeline = new HarnessPipeline();
      let count = 0;

      pipeline.register(
        makeRule({
          name: 'wildcard',
          tools: ['*'],
          phase: 'post-enrich',
          execute: async () => {
            count++;
            return { type: 'pass' };
          },
        }),
      );

      await pipeline.run(makeCtx('anything'), async () => ({}));
      await pipeline.run(makeCtx('something_else'), async () => ({}));

      expect(count).toBe(2);
    });
  });

  describe('pre-guard (block)', () => {
    it('blocks execution when guard returns block action', async () => {
      const pipeline = new HarnessPipeline();
      pipeline.register(
        makeRule({
          name: 'blocker',
          phase: 'pre-guard',
          execute: async () => ({ type: 'block', message: 'Not allowed' }),
        }),
      );

      let executed = false;
      await expect(
        pipeline.run(makeCtx(), async () => {
          executed = true;
          return {};
        }),
      ).rejects.toThrow('Not allowed');

      expect(executed).toBe(false);
    });

    it('passes when guard returns pass action', async () => {
      const pipeline = new HarnessPipeline();
      pipeline.register(
        makeRule({
          name: 'passer',
          phase: 'pre-guard',
          execute: async () => ({ type: 'pass' }),
        }),
      );

      let executed = false;
      await pipeline.run(makeCtx(), async () => {
        executed = true;
        return {};
      });

      expect(executed).toBe(true);
    });
  });

  describe('pre-transform', () => {
    it('modifies params before execution', async () => {
      const pipeline = new HarnessPipeline();
      pipeline.register(
        makeRule({
          name: 'transformer',
          phase: 'pre-transform',
          execute: async (ctx) => ({
            type: 'transform',
            params: { ...ctx.params, injected: true },
          }),
        }),
      );

      let receivedParams: Record<string, unknown> = {};
      const ctx = makeCtx('test', { original: true });
      await pipeline.run(ctx, async () => {
        receivedParams = ctx.params;
        return {};
      });

      expect(receivedParams).toEqual({ original: true, injected: true });
    });
  });

  describe('post-enrich', () => {
    it('enriches result with additional fields', async () => {
      const pipeline = new HarnessPipeline();
      pipeline.register(
        makeRule({
          name: 'enricher',
          phase: 'post-enrich',
          execute: async () => ({
            type: 'enrich',
            fields: { _qualityScore: 85 },
          }),
        }),
      );

      const ctx = makeCtx();
      const result = await pipeline.run(ctx, async () => ({ id: '1:234' }));
      expect(result).toEqual({ id: '1:234', _qualityScore: 85 });
    });

    it('accumulates warnings from multiple rules', async () => {
      const pipeline = new HarnessPipeline();
      pipeline.register(
        makeRule({
          name: 'warn1',
          phase: 'post-enrich',
          priority: 50,
          execute: async () => ({ type: 'warn', warnings: ['warning 1'] }),
        }),
        makeRule({
          name: 'warn2',
          phase: 'post-enrich',
          priority: 60,
          execute: async () => ({ type: 'warn', warnings: ['warning 2'] }),
        }),
      );

      const ctx = makeCtx();
      const result = (await pipeline.run(ctx, async () => ({}))) as Record<string, unknown>;
      expect(result._warnings).toEqual(['warning 1', 'warning 2']);
    });

    it('is best-effort — errors in enrichment do not crash pipeline', async () => {
      const pipeline = new HarnessPipeline();
      pipeline.register(
        makeRule({
          name: 'crasher',
          phase: 'post-enrich',
          priority: 50,
          execute: async () => {
            throw new Error('enrich crashed');
          },
        }),
        makeRule({
          name: 'safe',
          phase: 'post-enrich',
          priority: 60,
          execute: async () => ({ type: 'enrich', fields: { _safe: true } }),
        }),
      );

      const ctx = makeCtx();
      const result = (await pipeline.run(ctx, async () => ({}))) as Record<string, unknown>;
      expect(result._safe).toBe(true);
    });
  });

  describe('error-recovery', () => {
    it('appends recovery info to error message', async () => {
      const pipeline = new HarnessPipeline();
      pipeline.register(
        makeRule({
          name: 'recovery',
          phase: 'error-recovery',
          execute: async () => ({
            type: 'recover',
            recovery: { errorType: 'test', suggestion: 'try again' },
          }),
        }),
      );

      const ctx = makeCtx();
      await expect(
        pipeline.run(ctx, async () => {
          throw new Error('something failed');
        }),
      ).rejects.toThrow(/something failed.*_recovery.*try again/s);
    });
  });

  describe('session-update', () => {
    it('is best-effort — errors do not crash pipeline', async () => {
      const pipeline = new HarnessPipeline();
      pipeline.register(
        makeRule({
          name: 'crasher',
          phase: 'session-update',
          execute: async () => {
            throw new Error('session update crashed');
          },
        }),
      );

      const ctx = makeCtx();
      // Should not throw
      const result = await pipeline.run(ctx, async () => ({ ok: true }));
      expect(result).toEqual({ ok: true });
    });
  });

  describe('context metadata', () => {
    it('correctly detects isDryRun', () => {
      const ctx = makeCtx('test', { dryRun: true });
      expect(ctx.meta.isDryRun).toBe(true);
    });

    it('correctly detects isRootLevel', () => {
      const ctx1 = makeCtx('test', {});
      expect(ctx1.meta.isRootLevel).toBe(true);

      const ctx2 = makeCtx('test', { parentId: '1:23' });
      expect(ctx2.meta.isRootLevel).toBe(false);
    });

    it('correctly detects isBatch', () => {
      const ctx1 = makeCtx('test', { items: [{}] });
      expect(ctx1.meta.isBatch).toBe(true);

      const ctx2 = makeCtx('test', {});
      expect(ctx2.meta.isBatch).toBe(false);
    });
  });
});
