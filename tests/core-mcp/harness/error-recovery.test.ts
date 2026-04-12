/**
 * Tests for Error Recovery rules — data-driven from content/harness/recovery-patterns.yaml.
 */

import { describe, expect, it } from 'vitest';
import { DesignSession } from '../../../packages/core-mcp/src/design-session.js';
import { RECOVERY_PATTERNS } from '../../../packages/core-mcp/src/harness/_harness.js';
import { createHarnessContext } from '../../../packages/core-mcp/src/harness/pipeline.js';
import { createRecoveryRules } from '../../../packages/core-mcp/src/harness/rules/data-recovery.js';

function makeErrorCtx(toolName: string, errorMessage: string) {
  const ctx = createHarnessContext(toolName, toolName, {}, new DesignSession(), false);
  ctx.error = new Error(errorMessage);
  return ctx;
}

describe('Data-driven Error Recovery Rules', () => {
  const rules = createRecoveryRules();

  it('generates rules from compiled YAML', () => {
    expect(rules.length).toBe(RECOVERY_PATTERNS.length);
    expect(rules.length).toBeGreaterThanOrEqual(7);
  });

  it('all rules have correct phase', () => {
    for (const rule of rules) {
      expect(rule.phase).toBe('error-recovery');
    }
  });

  it('transport-level rules have higher priority than domain rules', () => {
    const connectionRule = rules.find((r) => r.name === 'recovery-connection-lost');
    const timeoutRule = rules.find((r) => r.name === 'recovery-request-timeout');
    const tokenRule = rules.find((r) => r.name === 'recovery-token-not-found');
    expect(connectionRule).toBeDefined();
    expect(timeoutRule).toBeDefined();
    expect(tokenRule).toBeDefined();
    expect(connectionRule!.priority).toBeLessThan(tokenRule!.priority!);
    expect(timeoutRule!.priority).toBeLessThan(tokenRule!.priority!);
  });

  describe('connection-lost', () => {
    const rule = rules.find((r) => r.name === 'recovery-connection-lost')!;

    it('matches "Bridge not connected"', async () => {
      const ctx = makeErrorCtx('create_frame', 'Bridge not connected');
      const action = await rule.execute(ctx);
      expect(action.type).toBe('recover');
      if (action.type === 'recover') {
        expect(action.recovery.errorType).toBe('connection_lost');
      }
    });

    it('matches "Connection closed"', async () => {
      const ctx = makeErrorCtx('create_frame', 'Connection closed');
      const action = await rule.execute(ctx);
      expect(action.type).toBe('recover');
    });

    it('does NOT match request-level timeouts (those are request_timeout)', async () => {
      const ctx = makeErrorCtx('nodes', 'Request search_nodes timed out after 30000ms');
      const action = await rule.execute(ctx);
      expect(action.type).toBe('pass');
    });

    it('passes on unrelated errors', async () => {
      const ctx = makeErrorCtx('nodes', 'Some other error');
      const action = await rule.execute(ctx);
      expect(action.type).toBe('pass');
    });
  });

  describe('request-timeout', () => {
    const rule = rules.find((r) => r.name === 'recovery-request-timeout')!;

    it('matches "Request search_nodes timed out after 30000ms"', async () => {
      const ctx = makeErrorCtx('nodes', 'Request search_nodes timed out after 30000ms');
      const action = await rule.execute(ctx);
      expect(action.type).toBe('recover');
      if (action.type === 'recover') {
        expect(action.recovery.errorType).toBe('request_timeout');
        expect(action.recovery.suggestion).toContain('NOT help');
      }
    });

    it('matches timeouts after progress was received', async () => {
      const ctx = makeErrorCtx('nodes', 'Request timed out after 30000ms (progress was received)');
      const action = await rule.execute(ctx);
      expect(action.type).toBe('recover');
    });

    it('does NOT match "Bridge not connected"', async () => {
      const ctx = makeErrorCtx('create_frame', 'Bridge not connected');
      const action = await rule.execute(ctx);
      expect(action.type).toBe('pass');
    });
  });

  describe('token-not-found', () => {
    const rule = rules.find((r) => r.name === 'recovery-token-not-found')!;

    it('matches variable not found errors', async () => {
      const ctx = makeErrorCtx('create_frame', 'Variable "bg/primary" not found in library');
      const action = await rule.execute(ctx);
      expect(action.type).toBe('recover');
      if (action.type === 'recover') {
        expect(action.recovery.errorType).toBe('token_not_found');
        expect(action.recovery.suggestion).toContain('search_design_system');
        expect(action.recovery.retryHint).toBeDefined();
      }
    });
  });

  describe('node-deleted', () => {
    const rule = rules.find((r) => r.name === 'recovery-node-deleted')!;

    it('matches node does not exist errors', async () => {
      const ctx = makeErrorCtx('nodes', 'Node 1:234 does not exist');
      const action = await rule.execute(ctx);
      expect(action.type).toBe('recover');
    });
  });

  describe('file-not-found', () => {
    const rule = rules.find((r) => r.name === 'recovery-file-not-found')!;

    it('matches ENOENT errors', async () => {
      const ctx = makeErrorCtx('sync_tokens', 'ENOENT: no such file or directory');
      const action = await rule.execute(ctx);
      expect(action.type).toBe('recover');
    });
  });

  describe('parse-error', () => {
    const rule = rules.find((r) => r.name === 'recovery-parse-error')!;

    it('matches JSON parse errors', async () => {
      const ctx = makeErrorCtx('sync_tokens', 'Unexpected token in JSON at position 42');
      const action = await rule.execute(ctx);
      expect(action.type).toBe('recover');
    });
  });

  describe('response-too-large', () => {
    const rule = rules.find((r) => r.name === 'recovery-response-too-large')!;

    it('matches size limit errors', async () => {
      const ctx = makeErrorCtx('nodes', 'Response too large for context');
      const action = await rule.execute(ctx);
      expect(action.type).toBe('recover');
    });
  });
});
