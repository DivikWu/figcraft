/**
 * Lint handlers — check, fix, rules, annotations.
 *
 * Linter runs entirely in Plugin side (review correction #2).
 */

import { registerHandler } from '../registry.js';
import { simplifyNode } from '../adapters/node-simplifier.js';
import { runLint, getAvailableRules } from '../linter/engine.js';
import type { AbstractNode, LintContext, LintViolation } from '../linter/types.js';
import type { CompressedNode } from '../../shared/types.js';
import type { LintReport } from '../linter/engine.js';

export function registerLintHandlers(): void {

registerHandler('lint_check', async (params) => {
  const nodeIds = params.nodeIds as string[] | undefined;
  const rules = params.rules as string[] | undefined;
  const offset = params.offset as number | undefined;
  const limit = params.limit as number | undefined;
  const annotate = params.annotate as boolean | undefined;

  // Token context (passed from MCP Server or loaded from cache)
  const tokenContext = params.tokenContext as {
    colorTokens?: Record<string, string>;
    spacingTokens?: Record<string, number>;
    radiusTokens?: Record<string, number>;
    typographyTokens?: Record<string, { fontSize?: number; fontFamily?: string; fontWeight?: string }>;
    variableIds?: Record<string, string>;
  } | undefined;

  // Read current mode and selected library from storage
  const currentMode = ((await figma.clientStorage.getAsync('figcraft_mode')) || 'library') as 'library' | 'spec';
  const currentLibrary = (await figma.clientStorage.getAsync('figcraft_library')) as string | undefined;

  // Build lint context
  const ctx: LintContext = {
    colorTokens: new Map(Object.entries(tokenContext?.colorTokens ?? {})),
    spacingTokens: new Map(Object.entries(tokenContext?.spacingTokens ?? {})),
    radiusTokens: new Map(Object.entries(tokenContext?.radiusTokens ?? {})),
    typographyTokens: new Map(Object.entries(tokenContext?.typographyTokens ?? {})),
    variableIds: new Map(Object.entries(tokenContext?.variableIds ?? {})),
    mode: currentMode,
    selectedLibrary: currentLibrary || null,
  };

  // Collect nodes to lint
  let targetNodes: SceneNode[];
  if (nodeIds && nodeIds.length > 0) {
    const resolved = await Promise.all(nodeIds.map((id) => figma.getNodeByIdAsync(id)));
    targetNodes = resolved
      .filter((n): n is SceneNode => n !== null && 'type' in n && n.type !== 'PAGE' && n.type !== 'DOCUMENT');
  } else {
    // Use selection, or fall back to current page children
    const selection = figma.currentPage.selection;
    targetNodes = selection.length > 0 ? [...selection] : [...figma.currentPage.children];
  }

  // Convert to abstract nodes
  const abstractNodes = targetNodes.map((n) => compressedToAbstract(simplifyNode(n)));

  // Run lint
  const report = runLint(abstractNodes, ctx, { rules, offset, limit });

  // Annotate if requested
  if (annotate) {
    await annotateViolations(report);
  }

  return report;
});

registerHandler('lint_fix', async (params) => {
  const violations = params.violations as LintViolation[];

  let fixed = 0;
  let failed = 0;
  const errors: Array<{ nodeId: string; error: string }> = [];

  for (const v of violations) {
    if (!v.autoFixable || !v.fixData) continue;

    try {
      const node = await figma.getNodeByIdAsync(v.nodeId);
      if (!node) { failed++; errors.push({ nodeId: v.nodeId, error: 'Node not found' }); continue; }

      switch (v.rule) {
        case 'spec-color': {
          const variableId = v.fixData.variableId as string | undefined;
          if (variableId) {
            const variable = await figma.variables.getVariableByIdAsync(variableId);
            if (variable && 'fills' in node) {
              const prop = v.fixData.property as string;
              if (prop === 'fills') {
                (node as GeometryMixin).setBoundVariable('fills', 0, variable);
              } else if (prop === 'strokes') {
                (node as GeometryMixin).setBoundVariable('strokes', 0, variable);
              }
              fixed++;
            } else {
              failed++;
              errors.push({ nodeId: v.nodeId, error: 'Variable not found' });
            }
          }
          break;
        }
        case 'spec-border-radius': {
          const value = v.fixData.value as number;
          if ('cornerRadius' in node) {
            (node as RectangleNode).cornerRadius = value;
            fixed++;
          }
          break;
        }
        case 'spec-spacing': {
          const prop = v.fixData.property as string;
          const value = v.fixData.value as number;
          if (prop in node) {
            (node as FrameNode)[prop as keyof FrameNode] = value as never;
            fixed++;
          }
          break;
        }
        default:
          failed++;
          errors.push({ nodeId: v.nodeId, error: `No fix for rule ${v.rule}` });
      }
    } catch (err) {
      failed++;
      errors.push({
        nodeId: v.nodeId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { fixed, failed, errors };
});

registerHandler('lint_rules', async () => {
  return { rules: getAvailableRules() };
});

registerHandler('clear_annotations', async (params) => {
  const nodeIds = params.nodeIds as string[] | undefined;
  const targets = nodeIds
    ? (await Promise.all(nodeIds.map((id) => figma.getNodeByIdAsync(id)))).filter(Boolean) as SceneNode[]
    : [...figma.currentPage.children];

  let cleared = 0;
  function walk(node: SceneNode) {
    if ('annotations' in node) {
      const annotated = node as SceneNode & { annotations: unknown[] };
      if (annotated.annotations.length > 0) {
        annotated.annotations = [];
        cleared++;
      }
    }
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        walk(child);
      }
    }
  }
  targets.forEach(walk);

  return { cleared };
});

} // registerLintHandlers

// ─── Helpers ───

function compressedToAbstract(node: CompressedNode): AbstractNode {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    fills: node.fills as AbstractNode['fills'],
    strokes: node.strokes as AbstractNode['strokes'],
    cornerRadius: node.cornerRadius,
    fontSize: node.fontSize,
    fontName: node.fontName as AbstractNode['fontName'],
    opacity: node.opacity,
    width: node.width,
    height: node.height,
    itemSpacing: node.itemSpacing,
    paddingLeft: node.paddingLeft,
    paddingRight: node.paddingRight,
    paddingTop: node.paddingTop,
    paddingBottom: node.paddingBottom,
    boundVariables: node.boundVariables,
    fillStyleId: node.fillStyleId,
    textStyleId: node.textStyleId,
    effectStyleId: node.effectStyleId,
    children: node.children?.map(compressedToAbstract),
  };
}

async function annotateViolations(report: LintReport): Promise<void> {
  for (const category of report.categories) {
    for (const violation of category.nodes) {
      const node = await figma.getNodeByIdAsync(violation.nodeId);
      if (!node || !('annotations' in node)) continue;
      const annotated = node as SceneNode & {
        annotations: Array<{ label: string; properties: Array<{ type: string }> }>;
      };
      annotated.annotations = [
        ...annotated.annotations,
        {
          label: `[figcraft] ${violation.suggestion}`,
          properties: [{ type: 'design' }],
        },
      ];
    }
  }
}
