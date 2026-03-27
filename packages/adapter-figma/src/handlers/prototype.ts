/**
 * Prototype interaction handlers — add, remove, and set reactions on nodes.
 *
 * Figma Plugin API: node.reactions is a readonly array of Reaction objects.
 * To modify, we clone the array, mutate, and reassign.
 */

import { registerHandler } from '../registry.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';
import { assertHandler, HandlerError } from '../utils/handler-error.js';

// ─── Types ───

interface ReactionAction {
  type: string;               // NODE | BACK | CLOSE | URL
  destinationId?: string | null;
  navigation?: string;        // NAVIGATE | SWAP | OVERLAY | SCROLL_TO | CHANGE_TO
  url?: string;
  transition?: {
    type: string;             // DISSOLVE | SMART_ANIMATE | MOVE_IN | MOVE_OUT | PUSH | SLIDE_IN | SLIDE_OUT | INSTANT
    duration: number;
    easing?: { type: string; easingFunctionCubicBezier?: { x1: number; y1: number; x2: number; y2: number } };
    direction?: string;
  } | null;
  overlay?: {
    position?: string;
  } | null;
}

interface ReactionTrigger {
  type: string;               // ON_CLICK | ON_HOVER | ON_PRESS | ON_DRAG | AFTER_TIMEOUT | MOUSE_ENTER | MOUSE_LEAVE | MOUSE_UP | MOUSE_DOWN
  delay?: number;
  timeout?: number;
}

interface ReactionSpec {
  trigger: ReactionTrigger;
  actions: ReactionAction[];
}

type ReactionNode = SceneNode & { reactions: readonly Reaction[] };

function hasReactions(node: BaseNode): node is ReactionNode {
  return 'reactions' in node;
}

// ─── Helpers ───

function buildReaction(spec: ReactionSpec): Reaction {
  // Figma's Trigger type is a discriminated union — we build it dynamically,
  // so `as any` is needed for optional fields not present on all trigger variants.
  const trigger = { type: spec.trigger.type } as Trigger;
  if (spec.trigger.delay != null) (trigger as any).delay = spec.trigger.delay;
  if (spec.trigger.timeout != null) (trigger as any).timeout = spec.trigger.timeout;

  const actions: Action[] = spec.actions.map((a) => {
    const action: Record<string, unknown> = { type: a.type };
    if (a.destinationId) action.destinationId = a.destinationId;
    if (a.navigation) action.navigation = a.navigation;
    if (a.url) action.url = a.url;
    if (a.transition) action.transition = a.transition;
    if (a.overlay) action.overlay = a.overlay;
    return action as Action;
  });

  return { trigger, actions } as Reaction;
}

// ─── Handler Registration ───

export function registerPrototypeHandlers(): void {

/**
 * add_reaction — Add a prototype reaction to a node.
 * Supports single reaction or batch (items array).
 */
registerHandler('add_reaction', async (params) => {
  // Batch mode: items array
  const items = params.items as Array<{
    nodeId: string;
    trigger: ReactionTrigger;
    actions: ReactionAction[];
  }> | undefined;

  const targets = items ?? [{
    nodeId: params.nodeId as string,
    trigger: params.trigger as ReactionTrigger,
    actions: params.actions as ReactionAction[],
  }];

  const results: Array<{ nodeId: string; ok: boolean; reactionCount?: number; error?: string }> = [];

  for (const item of targets) {
    try {
      const node = await findNodeByIdAsync(item.nodeId);
      if (!node || !hasReactions(node)) {
        results.push({ nodeId: item.nodeId, ok: false, error: 'Node not found or does not support reactions' });
        continue;
      }

      const newReaction = buildReaction({ trigger: item.trigger, actions: item.actions });
      const existing = [...node.reactions];
      existing.push(newReaction);
      (node as any).reactions = existing;

      results.push({ nodeId: item.nodeId, ok: true, reactionCount: existing.length });
    } catch (err) {
      results.push({ nodeId: item.nodeId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return items ? { results } : results[0];
});

/**
 * remove_reaction — Remove reactions from a node by index or trigger type.
 */
registerHandler('remove_reaction', async (params) => {
  const nodeId = params.nodeId as string;
  const node = await findNodeByIdAsync(nodeId);
  assertHandler(node && hasReactions(node), 'Node not found or does not support reactions', 'NOT_FOUND');

  const index = params.index as number | undefined;
  const triggerType = params.triggerType as string | undefined;
  const removeAll = params.removeAll as boolean | undefined;

  let reactions = [...node.reactions];
  const beforeCount = reactions.length;

  if (removeAll) {
    reactions = [];
  } else if (index != null) {
    if (index < 0 || index >= reactions.length) {
      throw new HandlerError(`Index ${index} out of range (0-${reactions.length - 1})`);
    }
    reactions.splice(index, 1);
  } else if (triggerType) {
    reactions = reactions.filter((r) => r.trigger && r.trigger.type !== triggerType);
  } else {
    throw new HandlerError('Provide index, triggerType, or removeAll');
  }

  (node as any).reactions = reactions;
  return { ok: true, removed: beforeCount - reactions.length, remaining: reactions.length };
});

/**
 * set_reactions — Replace all reactions on a node with a new set.
 */
registerHandler('set_reactions', async (params) => {
  const nodeId = params.nodeId as string;
  const node = await findNodeByIdAsync(nodeId);
  assertHandler(node && hasReactions(node), 'Node not found or does not support reactions', 'NOT_FOUND');

  const specs = params.reactions as ReactionSpec[];
  const newReactions = specs.map(buildReaction);
  (node as any).reactions = newReactions;

  return { ok: true, reactionCount: newReactions.length };
});

} // registerPrototypeHandlers
