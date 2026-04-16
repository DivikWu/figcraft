/**
 * Harness Rule: component-defaults-injection (Layer 1 — Pre-Transform)
 *
 * Auto-injects section parentId for create_component.
 * When a section was recently created (tracked in session), new components
 * automatically land inside it.
 *
 * Fill/color variable injection is NOT done here — AI passes fillVariableId
 * directly from designContext.defaults (ID-based binding is more reliable
 * than name-based, and the correct variable depends on variant type which
 * the harness can't know).
 */

import type { HarnessAction, HarnessRule } from '../types.js';
import { PASS } from '../types.js';

const INJECTED_KEY = 'component-defaults-injected';

export const componentDefaultsInjection: HarnessRule = {
  name: 'component-defaults-injection',
  tools: ['create_component'],
  phase: 'pre-transform',
  priority: 45,

  async execute(ctx): Promise<HarnessAction> {
    const params = ctx.params;
    const injected: Record<string, string> = {};

    // Auto-inject parentId from last created section (if no explicit parentId)
    if (!params.parentId && ctx.session.lastSectionId) {
      params.parentId = ctx.session.lastSectionId;
      injected.parentId = ctx.session.lastSectionId;
    }

    if (Object.keys(injected).length > 0) {
      ctx.ruleState[INJECTED_KEY] = injected;
      return { type: 'transform', params };
    }
    return PASS;
  },
};

export const componentDefaultsPostEnrich: HarnessRule = {
  name: 'component-defaults-injected',
  tools: ['create_component'],
  phase: 'post-enrich',
  priority: 55,

  async execute(ctx): Promise<HarnessAction> {
    const injected = ctx.ruleState[INJECTED_KEY] as Record<string, string> | undefined;
    if (!injected || !ctx.result) return PASS;

    return {
      type: 'enrich',
      fields: { _autoInjected: injected },
    };
  },
};

/** Session-update rule: cache section ID when create_section succeeds. */
export const trackSectionCreation: HarnessRule = {
  name: 'track-section-creation',
  tools: ['create_section'],
  phase: 'session-update',
  priority: 100,

  async execute(ctx): Promise<HarnessAction> {
    if (!ctx.result) return PASS;
    const result = ctx.result as Record<string, unknown>;
    if (result.id && typeof result.id === 'string') {
      ctx.session.lastSectionId = result.id;
    }
    return PASS;
  },
};

/** Session-update rule: clear cached section ID if a delete operation removes it. */
export const clearDeletedSection: HarnessRule = {
  name: 'clear-deleted-section',
  tools: ['*'],
  phase: 'session-update',
  priority: 101,

  async execute(ctx): Promise<HarnessAction> {
    if (!ctx.session.lastSectionId) return PASS;
    if (ctx.error) return PASS;

    const method = ctx.bridgeMethod;
    if (method !== 'delete_nodes' && method !== 'delete_node') return PASS;

    // Extract deleted IDs from params
    const deletedIds = new Set<string>();
    const { nodeId, nodeIds } = ctx.params;
    if (typeof nodeId === 'string') deletedIds.add(nodeId);
    if (Array.isArray(nodeIds)) {
      for (const id of nodeIds) {
        if (typeof id === 'string') deletedIds.add(id);
      }
    }

    if (deletedIds.has(ctx.session.lastSectionId)) {
      ctx.session.lastSectionId = null;
    }
    return PASS;
  },
};
