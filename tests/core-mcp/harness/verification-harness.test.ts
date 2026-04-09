/**
 * Tests for Verification Harness — debt tracking, recording, and reminders.
 */

import { describe, expect, it } from 'vitest';
import { DesignSession } from '../../../packages/core-mcp/src/design-session.js';
import { createHarnessContext } from '../../../packages/core-mcp/src/harness/pipeline.js';
import {
  recordCreationDebtRule,
  recordVerificationRule,
  verificationDebtRemindRule,
} from '../../../packages/core-mcp/src/harness/rules/verification-debt.js';

function makeCtx(toolName: string, params: Record<string, unknown>, result: unknown, session: DesignSession) {
  const ctx = createHarnessContext(toolName, toolName, params, session, true);
  ctx.result = result;
  return ctx;
}

describe('Verification Harness', () => {
  describe('DesignSession verification debt', () => {
    it('records single creation', () => {
      const session = new DesignSession();
      session.recordCreation('1:234', 'Login Screen');
      expect(session.verificationDebt).toBe(1);
      expect(session.unverifiedNodes).toEqual([{ nodeId: '1:234', name: 'Login Screen' }]);
    });

    it('records batch creations', () => {
      const session = new DesignSession();
      session.recordCreations([
        { nodeId: '1:1', name: 'Screen A' },
        { nodeId: '1:2', name: 'Screen B' },
      ]);
      expect(session.verificationDebt).toBe(2);
    });

    it('clears specific node on verification', () => {
      const session = new DesignSession();
      session.recordCreation('1:1', 'A');
      session.recordCreation('1:2', 'B');
      session.recordVerification('1:1');
      expect(session.verificationDebt).toBe(1);
      expect(session.unverifiedNodes[0].nodeId).toBe('1:2');
    });

    it('clears all on page-level verification', () => {
      const session = new DesignSession();
      session.recordCreation('1:1', 'A');
      session.recordCreation('1:2', 'B');
      session.recordVerification();
      expect(session.verificationDebt).toBe(0);
    });

    it('clears on session reset', () => {
      const session = new DesignSession();
      session.recordCreation('1:1', 'A');
      session.reset();
      expect(session.verificationDebt).toBe(0);
    });
  });

  describe('record-creation-debt rule', () => {
    it('records debt for single root-level creation', async () => {
      const session = new DesignSession();
      const ctx = makeCtx('create_frame', {}, { id: '1:234', name: 'Screen' }, session);
      await recordCreationDebtRule.execute(ctx);
      expect(session.verificationDebt).toBe(1);
    });

    it('records debt for batch items', async () => {
      const session = new DesignSession();
      const ctx = makeCtx(
        'create_frame',
        { items: [{}, {}, {}] },
        {
          items: [
            { id: '1:1', name: 'A', ok: true },
            { id: '1:2', name: 'B', ok: true },
            { id: '1:3', name: 'C', ok: false, error: 'failed' },
          ],
        },
        session,
      );
      await recordCreationDebtRule.execute(ctx);
      expect(session.verificationDebt).toBe(2); // only successful items
    });

    it('skips dryRun', async () => {
      const session = new DesignSession();
      const ctx = makeCtx('create_frame', { dryRun: true }, { id: '1:234' }, session);
      await recordCreationDebtRule.execute(ctx);
      expect(session.verificationDebt).toBe(0);
    });

    it('skips child frames without role', async () => {
      const session = new DesignSession();
      const ctx = makeCtx('create_frame', { parentId: '1:100' }, { id: '1:234' }, session);
      await recordCreationDebtRule.execute(ctx);
      expect(session.verificationDebt).toBe(0);
    });

    it('records child frames WITH role', async () => {
      const session = new DesignSession();
      const ctx = makeCtx(
        'create_frame',
        { parentId: '1:100', role: 'button' },
        { id: '1:234', name: 'Button' },
        session,
      );
      await recordCreationDebtRule.execute(ctx);
      expect(session.verificationDebt).toBe(1);
    });
  });

  describe('record-verification rule', () => {
    it('clears specific node debt', async () => {
      const session = new DesignSession();
      session.recordCreation('1:1', 'A');
      session.recordCreation('1:2', 'B');
      const ctx = makeCtx('verify_design', { nodeId: '1:1' }, {}, session);
      await recordVerificationRule.execute(ctx);
      expect(session.verificationDebt).toBe(1);
    });

    it('clears all debt on page-level verify', async () => {
      const session = new DesignSession();
      session.recordCreation('1:1', 'A');
      session.recordCreation('1:2', 'B');
      const ctx = makeCtx('verify_design', {}, {}, session);
      await recordVerificationRule.execute(ctx);
      expect(session.verificationDebt).toBe(0);
    });

    it('clears all debt on lint_fix_all', async () => {
      const session = new DesignSession();
      session.recordCreation('1:1', 'A');
      const ctx = makeCtx('lint_fix_all', {}, {}, session);
      await recordVerificationRule.execute(ctx);
      expect(session.verificationDebt).toBe(0);
    });

    it('does not clear debt on error', async () => {
      const session = new DesignSession();
      session.recordCreation('1:1', 'A');
      const ctx = makeCtx('verify_design', {}, {}, session);
      ctx.error = new Error('lint failed');
      await recordVerificationRule.execute(ctx);
      expect(session.verificationDebt).toBe(1);
    });
  });

  describe('verification-debt-remind rule', () => {
    it('injects reminder when debt > 0 and grace period elapsed', async () => {
      const session = new DesignSession();
      session.recordCreation('1:1', 'Screen');
      // Simulate grace period elapsed by backdating the creation timestamp
      const creations = (session as any)._unverifiedCreations as Array<{ ts: number }>;
      creations[0].ts = Date.now() - 100_000; // 100s ago, past 90s grace period
      const ctx = makeCtx('nodes', {}, { id: '1:1' }, session);
      const action = await verificationDebtRemindRule.execute(ctx);
      expect(action.type).toBe('enrich');
      if (action.type === 'enrich') {
        expect(action.fields._verificationDebt).toBeDefined();
        const debt = action.fields._verificationDebt as Record<string, unknown>;
        expect(debt.unverifiedCount).toBe(1);
      }
    });

    it('suppresses reminder during grace period (< 90s after creation)', async () => {
      const session = new DesignSession();
      session.recordCreation('1:1', 'Screen'); // ts = Date.now(), within grace period
      const ctx = makeCtx('nodes', {}, { id: '1:1' }, session);
      const action = await verificationDebtRemindRule.execute(ctx);
      expect(action.type).toBe('pass'); // suppressed by grace period
    });

    it('passes when debt is 0', async () => {
      const session = new DesignSession();
      const ctx = makeCtx('nodes', {}, {}, session);
      const action = await verificationDebtRemindRule.execute(ctx);
      expect(action.type).toBe('pass');
    });

    it('skips lint_check method (no recursive reminder)', async () => {
      const session = new DesignSession();
      session.recordCreation('1:1', 'Screen');
      const ctx = createHarnessContext('lint_check', 'lint_check', {}, session, false);
      ctx.result = {};
      const action = await verificationDebtRemindRule.execute(ctx);
      expect(action.type).toBe('pass');
    });
  });
});
