/**
 * Harness Rule: component-defaults-injection (Layer 1 — Pre-Transform)
 *
 * Auto-injects variable bindings for create_component based on role + designContext.defaults.
 * When AI calls create_component(role:"button") without fillVariableName, this rule
 * looks up defaults.buttonEmphasis and injects fillVariableName automatically.
 * Same for text children: auto-injects fontColorVariableName based on parent role.
 *
 * This is Layer 1 (code enforcement) — works regardless of AI behavior or skill loading.
 */

import type { HarnessAction, HarnessRule } from '../types.js';
import { PASS } from '../types.js';

const INJECTED_KEY = 'component-defaults-injected';

/** Role → default fill variable role mapping. */
const ROLE_FILL_MAP: Record<string, string> = {
  button: 'buttonEmphasis',
  input: 'inputBackground',
};

/** Role → default text color variable role mapping (for text children). */
const ROLE_TEXT_MAP: Record<string, string> = {
  button: 'textInverse',
};

/** Role → default stroke variable role mapping. */
const ROLE_STROKE_MAP: Record<string, string> = {
  input: 'border',
};

export const componentDefaultsInjection: HarnessRule = {
  name: 'component-defaults-injection',
  tools: ['create_component'],
  phase: 'pre-transform',
  priority: 45, // before resolve-icons (50)

  async execute(ctx): Promise<HarnessAction> {
    const defaults = ctx.session.designContextDefaults;
    if (!defaults) return PASS;

    const params = ctx.params;
    const role = params.role as string | undefined;
    if (!role) return PASS;

    const injected: Record<string, string> = {};

    // Auto-inject parentId from last created section (if no explicit parentId)
    if (!params.parentId && ctx.session.lastSectionId) {
      params.parentId = ctx.session.lastSectionId;
      injected.parentId = ctx.session.lastSectionId;
    }

    // Auto-inject fillVariableName if not explicitly set
    const fillRole = ROLE_FILL_MAP[role];
    if (fillRole && !params.fill && !params.fillVariableName) {
      const defaultVar = defaults[fillRole];
      if (defaultVar?.name) {
        params.fillVariableName = defaultVar.name;
        injected.fillVariableName = defaultVar.name;
      }
    }

    // Auto-inject strokeVariableName if not explicitly set
    const strokeRole = ROLE_STROKE_MAP[role];
    if (strokeRole && !params.strokeColor && !params.strokeVariableName) {
      const defaultVar = defaults[strokeRole];
      if (defaultVar?.name) {
        params.strokeVariableName = defaultVar.name;
        injected.strokeVariableName = defaultVar.name;
      }
    }

    // Auto-inject fontColorVariableName for text children
    const textColorRole = ROLE_TEXT_MAP[role];
    if (textColorRole && Array.isArray(params.children)) {
      const defaultVar = defaults[textColorRole];
      if (defaultVar?.name) {
        for (const child of params.children as Array<Record<string, unknown>>) {
          if (child.type === 'text' && !child.fill && !child.fontColorVariableName) {
            child.fontColorVariableName = defaultVar.name;
            injected.fontColorVariableName = defaultVar.name;
          }
        }
      }
    }

    // Store injected info for companion post-enrich rule
    if (Object.keys(injected).length > 0) {
      ctx.ruleState[INJECTED_KEY] = injected;
    }

    return Object.keys(injected).length > 0 ? { type: 'transform', params } : PASS;
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
