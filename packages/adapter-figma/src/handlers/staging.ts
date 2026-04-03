/**
 * Staging handlers — stage, commit, discard changes workflow.
 *
 * Staged nodes are marked with reduced opacity (0.5) and a metadata annotation.
 * Committing restores full opacity and removes the annotation.
 * Discarding deletes the staged nodes.
 *
 * State is persisted via annotations on the nodes themselves, so staged state
 * survives plugin restarts. The in-memory Set is a fast-path cache that is
 * rebuilt from annotations when needed.
 */

import { registerHandler } from '../registry.js';
import { assertHandler } from '../utils/handler-error.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';

const STAGED_TAG = '[FigCraft:staged]';
const STAGED_OPACITY = 0.5;

/** In-memory cache of staged node IDs (fast path). */
const stagedNodeIds = new Set<string>();

// ─── Helpers ───

type BlendableNode = SceneNode & { opacity: number };
type AnnotatableNode = SceneNode & { annotations: Array<{ label: string }> };

function isBlendable(node: BaseNode): node is BlendableNode {
  return 'opacity' in node;
}

function isAnnotatable(node: BaseNode): node is AnnotatableNode {
  return 'annotations' in node;
}

function getStagedAnnotation(node: AnnotatableNode): { label: string } | undefined {
  return node.annotations?.find((a) => a.label.startsWith(STAGED_TAG));
}

function isAlreadyStaged(node: SceneNode): boolean {
  if (!isAnnotatable(node)) return false;
  return !!getStagedAnnotation(node);
}

function parseOriginalOpacity(annotation: { label: string }): number {
  const match = annotation.label.match(/originalOpacity=([\d.]+)/);
  return match ? parseFloat(match[1]) : 1;
}

/**
 * Scan current page for nodes with staged annotations.
 * Rebuilds the in-memory cache from the source of truth (annotations).
 */
function rebuildCacheFromAnnotations(): void {
  stagedNodeIds.clear();
  const MAX_DEPTH = 10;
  function walk(node: SceneNode, depth = 0): void {
    if (depth > MAX_DEPTH) return;
    if (isAnnotatable(node) && getStagedAnnotation(node)) {
      stagedNodeIds.add(node.id);
    }
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        walk(child as SceneNode, depth + 1);
      }
    }
  }
  for (const child of figma.currentPage.children) {
    walk(child);
  }
}

export function registerStagingHandlers(): void {
  registerHandler('stage_changes', async (params) => {
    const nodeIds = params.nodeIds as string[];
    assertHandler(nodeIds && nodeIds.length > 0, 'nodeIds is required');

    let staged = 0;
    let skipped = 0;
    const errors: Array<{ nodeId: string; error: string }> = [];

    for (const id of nodeIds) {
      try {
        const node = await findNodeByIdAsync(id);
        if (!node) {
          errors.push({ nodeId: id, error: 'Node not found' });
          continue;
        }
        const sceneNode = node as SceneNode;

        // Idempotency: skip if already staged (prevents corrupting originalOpacity)
        if (isAlreadyStaged(sceneNode)) {
          stagedNodeIds.add(id); // ensure cache is in sync
          skipped++;
          continue;
        }

        if (!isBlendable(sceneNode)) {
          errors.push({ nodeId: id, error: 'Node does not support opacity' });
          continue;
        }

        // Store original opacity before modifying
        const originalOpacity = sceneNode.opacity;

        // Mark as staged: reduce opacity
        sceneNode.opacity = STAGED_OPACITY;

        // Add annotation (source of truth for staged state)
        if (isAnnotatable(sceneNode)) {
          const existing = sceneNode.annotations || [];
          sceneNode.annotations = [
            ...existing,
            {
              label: `${STAGED_TAG} originalOpacity=${originalOpacity}`,
            },
          ];
        }

        stagedNodeIds.add(id);
        staged++;
      } catch (err) {
        errors.push({ nodeId: id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { staged, skipped, errors, stagedNodeIds: [...stagedNodeIds] };
  });

  registerHandler('commit_changes', async (params) => {
    const nodeIds = params.nodeIds as string[] | undefined;

    // If no explicit IDs, rebuild cache from annotations to catch nodes
    // that survived a plugin restart
    if (!nodeIds || nodeIds.length === 0) {
      rebuildCacheFromAnnotations();
    }
    const targetIds = nodeIds && nodeIds.length > 0 ? nodeIds : [...stagedNodeIds];

    let committed = 0;
    const errors: Array<{ nodeId: string; error: string }> = [];

    for (const id of targetIds) {
      try {
        const node = await findNodeByIdAsync(id);
        if (!node) {
          errors.push({ nodeId: id, error: 'Node not found' });
          stagedNodeIds.delete(id);
          continue;
        }
        const sceneNode = node as SceneNode;

        // Restore original opacity from annotation
        if (isAnnotatable(sceneNode)) {
          const stagedAnnotation = getStagedAnnotation(sceneNode);
          if (stagedAnnotation) {
            const originalOpacity = parseOriginalOpacity(stagedAnnotation);
            if (isBlendable(sceneNode)) {
              sceneNode.opacity = originalOpacity;
            }
            // Remove staged annotation
            sceneNode.annotations = sceneNode.annotations.filter((a) => !a.label.startsWith(STAGED_TAG));
          } else {
            // No staged annotation — node wasn't actually staged
            if (isBlendable(sceneNode)) sceneNode.opacity = 1;
          }
        } else {
          if (isBlendable(sceneNode)) sceneNode.opacity = 1;
        }

        stagedNodeIds.delete(id);
        committed++;
      } catch (err) {
        errors.push({ nodeId: id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { committed, errors, remainingStaged: [...stagedNodeIds] };
  });

  registerHandler('discard_changes', async (params) => {
    const nodeIds = params.nodeIds as string[] | undefined;

    // Rebuild cache if no explicit IDs (handles plugin restart)
    if (!nodeIds || nodeIds.length === 0) {
      rebuildCacheFromAnnotations();
    }
    const targetIds = nodeIds && nodeIds.length > 0 ? nodeIds : [...stagedNodeIds];

    let discarded = 0;
    const errors: Array<{ nodeId: string; error: string }> = [];

    for (const id of targetIds) {
      try {
        const node = await findNodeByIdAsync(id);
        if (!node) {
          errors.push({ nodeId: id, error: 'Node not found' });
          stagedNodeIds.delete(id);
          continue;
        }
        // Remove the node from canvas
        (node as SceneNode).remove();
        stagedNodeIds.delete(id);
        discarded++;
      } catch (err) {
        errors.push({ nodeId: id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { discarded, errors, remainingStaged: [...stagedNodeIds] };
  });

  registerHandler('list_staged', async () => {
    // Always rebuild from annotations to ensure accuracy after plugin restart
    rebuildCacheFromAnnotations();

    const staged: Array<{ id: string; name: string; type: string }> = [];
    for (const id of stagedNodeIds) {
      const node = await findNodeByIdAsync(id);
      if (node) {
        staged.push({ id: node.id, name: (node as SceneNode).name, type: node.type });
      } else {
        stagedNodeIds.delete(id);
      }
    }
    return { staged, count: staged.length };
  });
} // registerStagingHandlers
