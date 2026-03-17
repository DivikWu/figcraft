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
import { STORAGE_KEYS } from '../constants.js';

// Cache last-built LintContext Maps to avoid redundant Map construction on repeated calls
// with the same tokenContext (common in iterative lint workflows).
let _cachedTokenContextKey: string | null = null;
let _cachedTokenMaps: Pick<LintContext, 'colorTokens' | 'spacingTokens' | 'radiusTokens' | 'typographyTokens' | 'variableIds'> | null = null;

export function registerLintHandlers(): void {

registerHandler('lint_check', async (params) => {
  const nodeIds = params.nodeIds as string[] | undefined;
  const rules = params.rules as string[] | undefined;
  const categories = params.categories as string[] | undefined;
  const offset = params.offset as number | undefined;
  const limit = params.limit as number | undefined;
  const maxViolations = params.maxViolations as number | undefined;
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
  const currentMode = ((await figma.clientStorage.getAsync(STORAGE_KEYS.MODE)) || 'library') as 'library' | 'spec';
  const currentLibrary = (await figma.clientStorage.getAsync(STORAGE_KEYS.LIBRARY)) as string | undefined;

  // Build lint context — cache Maps when tokenContext is unchanged (common in iterative workflows)
  const tokenContextKey = tokenContext ? JSON.stringify(tokenContext) : null;
  if (tokenContextKey !== _cachedTokenContextKey || _cachedTokenMaps === null) {
    _cachedTokenContextKey = tokenContextKey;
    _cachedTokenMaps = {
      colorTokens: new Map(Object.entries(tokenContext?.colorTokens ?? {})),
      spacingTokens: new Map(Object.entries(tokenContext?.spacingTokens ?? {})),
      radiusTokens: new Map(Object.entries(tokenContext?.radiusTokens ?? {})),
      typographyTokens: new Map(Object.entries(tokenContext?.typographyTokens ?? {})),
      variableIds: new Map(Object.entries(tokenContext?.variableIds ?? {})),
    };
  }
  const ctx: LintContext = {
    ..._cachedTokenMaps,
    mode: currentMode,
    selectedLibrary: currentLibrary || null,
  };

  // Collect nodes to lint
  let targetNodes: SceneNode[];
  let scope: { type: 'selection' | 'page'; count: number; names?: string[] };
  if (nodeIds && nodeIds.length > 0) {
    const resolved = await Promise.all(nodeIds.map((id) => figma.getNodeByIdAsync(id)));
    targetNodes = resolved
      .filter((n): n is SceneNode => n !== null && 'type' in n && n.type !== 'PAGE' && n.type !== 'DOCUMENT');
    scope = { type: 'selection', count: targetNodes.length, names: targetNodes.slice(0, 5).map((n) => n.name) };
  } else {
    // Use selection, or fall back to current page children
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
      targetNodes = [...selection];
      scope = { type: 'selection', count: targetNodes.length, names: targetNodes.slice(0, 5).map((n) => n.name) };
    } else {
      targetNodes = [...figma.currentPage.children];
      scope = { type: 'page', count: targetNodes.length };
    }
  }

  // Cap top-level nodes to prevent oversized payloads on huge pages
  const MAX_TOP_NODES = 200;
  let truncatedNodes = false;
  if (targetNodes.length > MAX_TOP_NODES) {
    targetNodes = targetNodes.slice(0, MAX_TOP_NODES);
    truncatedNodes = true;
  }

  // Convert to abstract nodes
  const abstractNodes = targetNodes.map((n) => compressedToAbstract(simplifyNode(n)));

  // Run lint
  const report = runLint(abstractNodes, ctx, { rules, categories, offset, limit, maxViolations });

  // Annotate if requested
  if (annotate) {
    await annotateViolations(report);
  }

  return { ...report, scope: { ...scope, pageName: figma.currentPage.name, truncated: truncatedNodes } };
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
              const geom = node as GeometryMixin;
              if (prop === 'fills') {
                const fills = [...geom.fills] as Paint[];
                if (fills.length > 0 && fills[0].type === 'SOLID') {
                  fills[0] = figma.variables.setBoundVariableForPaint(
                    fills[0] as SolidPaint,
                    'color',
                    variable,
                  );
                  geom.fills = fills;
                }
              } else if (prop === 'strokes') {
                const strokes = [...geom.strokes] as Paint[];
                if (strokes.length > 0 && strokes[0].type === 'SOLID') {
                  strokes[0] = figma.variables.setBoundVariableForPaint(
                    strokes[0] as SolidPaint,
                    'color',
                    variable,
                  );
                  geom.strokes = strokes;
                }
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
        case 'wcag-text-size': {
          const fontSize = v.fixData.fontSize as number;
          if ('fontSize' in node) {
            (node as TextNode).fontSize = fontSize;
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

  const MAX_DEPTH = 10;
  let cleared = 0;
  function walk(node: SceneNode, depth = 0) {
    if (depth > MAX_DEPTH) return;
    if ('annotations' in node) {
      const annotated = node as SceneNode & { annotations: unknown[] };
      if (annotated.annotations.length > 0) {
        annotated.annotations = [];
        cleared++;
      }
    }
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        walk(child, depth + 1);
      }
    }
  }
  targets.forEach((n) => walk(n));

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
    lineHeight: node.lineHeight,
    letterSpacing: node.letterSpacing,
    opacity: node.opacity,
    width: node.width,
    height: node.height,
    layoutMode: node.layoutMode,
    layoutPositioning: node.layoutPositioning,
    itemSpacing: node.itemSpacing,
    paddingLeft: node.paddingLeft,
    paddingRight: node.paddingRight,
    paddingTop: node.paddingTop,
    paddingBottom: node.paddingBottom,
    x: node.x,
    y: node.y,
    characters: node.characters,
    boundVariables: node.boundVariables,
    fillStyleId: node.fillStyleId,
    textStyleId: node.textStyleId,
    effectStyleId: node.effectStyleId,
    componentPropertyDefinitions: node.componentPropertyDefinitions,
    componentPropertyReferences: node.componentPropertyReferences,
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
