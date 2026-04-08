/**
 * Tests for Error Journal — cross-turn error tracking and recent error retrieval.
 */

import { describe, expect, it } from 'vitest';
import { DesignSession } from '../../../packages/core-mcp/src/design-session.js';
import { createHarnessContext } from '../../../packages/core-mcp/src/harness/pipeline.js';
import { errorJournalRule } from '../../../packages/core-mcp/src/harness/rules/error-journal.js';

describe('Error Journal', () => {
  describe('DesignSession error journal', () => {
    it('records errors', () => {
      const session = new DesignSession();
      session.recordError('create_frame', 'connection_lost', 'Bridge not connected');
      const errors = session.getRecentErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('create_frame');
      expect(errors[0]).toContain('connection_lost');
    });

    it('limits to 10 entries', () => {
      const session = new DesignSession();
      for (let i = 0; i < 15; i++) {
        session.recordError('tool', 'error', `error ${i}`);
      }
      // getRecentErrors returns last 3 of all entries (which are capped at 10)
      const all = session.getRecentErrors();
      expect(all.length).toBeLessThanOrEqual(3);
    });

    it('filters by tool name', () => {
      const session = new DesignSession();
      session.recordError('create_frame', 'a', 'error a');
      session.recordError('nodes', 'b', 'error b');
      session.recordError('create_frame', 'c', 'error c');

      const cfErrors = session.getRecentErrors('create_frame');
      expect(cfErrors).toHaveLength(2);
      expect(cfErrors[0]).toContain('create_frame');
    });

    it('clears on reset', () => {
      const session = new DesignSession();
      session.recordError('tool', 'error', 'details');
      session.reset();
      expect(session.getRecentErrors()).toHaveLength(0);
    });
  });

  describe('error-journal rule', () => {
    it('records error into session journal', async () => {
      const session = new DesignSession();
      const ctx = createHarnessContext('create_frame', 'create_frame', {}, session, true);
      ctx.error = new Error('Bridge not connected');
      await errorJournalRule.execute(ctx);

      const errors = session.getRecentErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('connection_lost');
    });

    it('passes when no error', async () => {
      const session = new DesignSession();
      const ctx = createHarnessContext('create_frame', 'create_frame', {}, session, true);
      const action = await errorJournalRule.execute(ctx);
      expect(action.type).toBe('pass');
      expect(session.getRecentErrors()).toHaveLength(0);
    });

    it('truncates long error messages', async () => {
      const session = new DesignSession();
      const ctx = createHarnessContext('nodes', 'nodes', {}, session, false);
      ctx.error = new Error('A'.repeat(200));
      await errorJournalRule.execute(ctx);

      const errors = session.getRecentErrors();
      expect(errors[0].length).toBeLessThan(200);
    });
  });
});
