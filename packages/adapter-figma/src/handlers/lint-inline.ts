/**
 * Inline lint helpers — run lint entirely within the plugin sandbox,
 * avoiding bridge round-trips for lint_check → lint_fix → lint_check.
 *
 * Key optimization: converts Figma nodes directly to AbstractNode,
 * skipping the simplifyNode → CompressedNode → compressedToAbstract chain.
 */

import { runLint } from '@figcraft/quality-engine';
import type { AbstractNode, LintContext, LintViolation, LintOptions } from '@figcraft/quality-engine';
import { figmaRgbaToHex } from '../utils/color.js';
import { getCachedModeLibrary } from './write-nodes.js';
import { registerCache } from '../utils/cache-manager.js';
import { setSpacingProp } from '../utils/type-guards.js';

/**
 * Map from validateTree/inferStructure rule names to quality-engine rule names.
 * Used to build skipRules set so quality-engine doesn't re-check rules
 * already handled by pre-creation validation.
 */
export const PRE_RULE_TO_LINT_RULE: Record<string, string> = {
  'button-structure-pre': 'button-structure',
  'input-structure-pre': 'input-field-structure',
  'hug-stretch-paradox': 'unbounded-hug',
  'form-consistency-pre': 'form-consistency',
  'screen-shell-pre': 'screen-shell-invalid',
  'system-bar-fullbleed-pre': 'system-bar-fullbleed',
  'cta-width-pre': 'cta-width-inconsistent',
  'mobile-dimensions-pre': 'mobile-dimensions',
  'no-spacer-frame': 'spacer-frame',
  'no-autolayout-multi-children': 'no-autolayout',
};

/**
 * Convert a Figma SceneNode directly to AbstractNode for quality-engine.
 * Skips the intermediate CompressedNode serialization step.
 */
export function figmaNodeToAbstract(node: SceneNode): AbstractNode {
  const result: AbstractNode = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  // Role from plugin data
  try {
    const role = node.getPluginData('role');
    if (role) result.role = role;
  } catch { /* ignore */ }

  // Geometry
  if ('width' in node) result.width = (node as any).width;
  if ('height' in node) result.height = (node as any).height;
  if ('x' in node) result.x = (node as any).x;
  if ('y' in node) result.y = (node as any).y;
  if ('opacity' in node) result.opacity = (node as any).opacity;

  // Fills
  if ('fills' in node) {
    const fills = (node as any).fills;
    if (fills !== figma.mixed && Array.isArray(fills)) {
      result.fills = fills.map((f: Paint) => {
        const entry: AbstractNode['fills'] extends (infer T)[] | undefined ? T : never = {
          type: f.type,
          visible: f.visible,
        };
        if (f.type === 'SOLID') {
          const solid = f as SolidPaint;
          entry.color = figmaRgbaToHex({
            r: solid.color.r, g: solid.color.g, b: solid.color.b,
            a: solid.opacity ?? 1,
          });
          entry.opacity = solid.opacity;
        }
        return entry;
      });
    }
  }

  // Strokes
  if ('strokes' in node) {
    const strokes = (node as any).strokes;
    if (Array.isArray(strokes)) {
      result.strokes = strokes.map((s: Paint) => {
        const entry: any = { type: s.type, visible: s.visible };
        if (s.type === 'SOLID') {
          const solid = s as SolidPaint;
          entry.color = figmaRgbaToHex({
            r: solid.color.r, g: solid.color.g, b: solid.color.b,
            a: solid.opacity ?? 1,
          });
        }
        return entry;
      });
    }
  }

  // Corner radius
  if ('cornerRadius' in node) {
    const cr = (node as any).cornerRadius;
    if (cr !== figma.mixed) result.cornerRadius = cr;
  }

  // Stroke weight
  if ('strokeWeight' in node) {
    const sw = (node as any).strokeWeight;
    if (sw !== figma.mixed) result.strokeWeight = sw;
  }

  // Layout
  if ('layoutMode' in node) result.layoutMode = (node as any).layoutMode;
  if ('layoutPositioning' in node) result.layoutPositioning = (node as any).layoutPositioning;
  if ('itemSpacing' in node) result.itemSpacing = (node as any).itemSpacing;
  if ('paddingLeft' in node) result.paddingLeft = (node as any).paddingLeft;
  if ('paddingRight' in node) result.paddingRight = (node as any).paddingRight;
  if ('paddingTop' in node) result.paddingTop = (node as any).paddingTop;
  if ('paddingBottom' in node) result.paddingBottom = (node as any).paddingBottom;
  if ('primaryAxisAlignItems' in node) result.primaryAxisAlignItems = (node as any).primaryAxisAlignItems;
  if ('counterAxisAlignItems' in node) result.counterAxisAlignItems = (node as any).counterAxisAlignItems;
  if ('clipsContent' in node) result.clipsContent = (node as any).clipsContent;
  if ('layoutAlign' in node) result.layoutAlign = (node as any).layoutAlign;

  // Text
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    result.characters = textNode.characters;
    if (textNode.fontSize !== figma.mixed) result.fontSize = textNode.fontSize as number;
    if (textNode.fontName !== figma.mixed) {
      result.fontName = {
        family: (textNode.fontName as FontName).family,
        style: (textNode.fontName as FontName).style,
      };
    }
    result.lineHeight = textNode.lineHeight;
    result.letterSpacing = textNode.letterSpacing;
    result.textAutoResize = textNode.textAutoResize;
  }

  // Bindings
  result.boundVariables = (node as any).boundVariables ?? {};
  if ('fillStyleId' in node) {
    const fsi = (node as any).fillStyleId;
    if (fsi && fsi !== figma.mixed) result.fillStyleId = fsi;
  }
  if ('textStyleId' in node) {
    const tsi = (node as any).textStyleId;
    if (tsi && tsi !== figma.mixed) result.textStyleId = tsi;
  }
  if ('effectStyleId' in node) {
    const esi = (node as any).effectStyleId;
    if (esi && esi !== figma.mixed) result.effectStyleId = esi;
  }

  // Component properties
  if ('componentPropertyDefinitions' in node) {
    result.componentPropertyDefinitions = (node as any).componentPropertyDefinitions;
  }
  if ('componentPropertyReferences' in node) {
    result.componentPropertyReferences = (node as any).componentPropertyReferences;
  }

  // Children
  if ('children' in node) {
    const children = (node as any).children as SceneNode[];
    result.children = children.map(figmaNodeToAbstract);
  }

  return result;
}

/**
 * Cached lint context — avoids repeated figma.clientStorage.getAsync calls
 * during multi-pass lint flows where multiple lint passes run in quick succession.
 * Cache is invalidated after 30s (same TTL as getCachedModeLibrary).
 */
let _cachedLintCtx: LintContext | null = null;
let _lintCtxTimestamp = 0;
const LINT_CTX_TTL_MS = 30_000;

/** Invalidate the cached lint context (call when mode/library changes). */
export function invalidateLintContextCache(): void {
  _cachedLintCtx = null;
  _lintCtxTimestamp = 0;
}

// Register with centralized cache manager
registerCache('lint-context', invalidateLintContextCache);

/**
 * Build a LintContext from plugin storage (runs entirely in plugin sandbox).
 * Mirrors the logic in lint.ts lint_check handler but without bridge round-trip.
 *
 * Uses a 30s TTL cache to avoid repeated figma.clientStorage.getAsync calls
 * during multi-pass lint flows (e.g. scoped lint + final lint).
 */
export async function buildLintContextFromStorage(): Promise<LintContext> {
  const now = Date.now();
  if (_cachedLintCtx !== null && now - _lintCtxTimestamp < LINT_CTX_TTL_MS) {
    return _cachedLintCtx;
  }

  const [currentMode, currentLibrary] = await getCachedModeLibrary() as ['library' | 'spec', string | undefined];

  // In inline lint we don't have tokenContext from MCP — use empty maps.
  // Token-based rules (spec-color, hardcoded-token, etc.) will be severity-downgraded
  // by the engine when no tokens are present, which is acceptable for post-create lint.
  const ctx: LintContext = {
    colorTokens: new Map(),
    spacingTokens: new Map(),
    radiusTokens: new Map(),
    typographyTokens: new Map(),
    variableIds: new Map(),
    mode: currentMode,
    selectedLibrary: currentLibrary || null,
  };
  _cachedLintCtx = ctx;
  _lintCtxTimestamp = now;
  return ctx;
}

/**
 * Apply a single lint violation fix directly on a Figma node.
 * Reuses the fix logic from lint.ts lint_fix handler but operates
 * on already-available SceneNode references (no findNodeByIdAsync needed
 * since we have the node map from creation).
 *
 * Returns true if fix was applied, false otherwise.
 */
async function applyFixDirect(
  node: SceneNode,
  violation: LintViolation,
): Promise<{ fixed: boolean; error?: string }> {
  if (!violation.autoFixable || !violation.fixData) {
    return { fixed: false };
  }

  try {
    switch (violation.rule) {
      case 'button-structure': {
        if (node.type !== 'FRAME' && node.type !== 'COMPONENT') {
          return { fixed: false, error: 'Not a frame' };
        }
        const frame = node as FrameNode;
        const fixType = violation.fixData.fix as string | undefined;
        if (fixType === 'layout' || (!fixType && violation.fixData.layoutMode)) {
          if (violation.fixData.layoutMode) frame.layoutMode = violation.fixData.layoutMode as 'HORIZONTAL' | 'VERTICAL';
          if (violation.fixData.primaryAxisAlignItems) (frame as any).primaryAxisAlignItems = violation.fixData.primaryAxisAlignItems;
          if (violation.fixData.counterAxisAlignItems) (frame as any).counterAxisAlignItems = violation.fixData.counterAxisAlignItems;
          return { fixed: true };
        } else if (fixType === 'padding') {
          if (violation.fixData.paddingLeft != null) frame.paddingLeft = violation.fixData.paddingLeft as number;
          if (violation.fixData.paddingRight != null) frame.paddingRight = violation.fixData.paddingRight as number;
          return { fixed: true };
        } else if (fixType === 'height') {
          const targetHeight = (violation.fixData.height as number) ?? 48;
          if (frame.height < targetHeight) {
            frame.resize(frame.width, targetHeight);
            if ('minHeight' in frame) frame.minHeight = targetHeight;
          }
          return { fixed: true };
        }
        return { fixed: false, error: `Unknown fix type: ${fixType}` };
      }

      case 'text-overflow': {
        if (node.type !== 'TEXT') return { fixed: false, error: 'Not a text node' };
        const textNode = node as TextNode;
        if (textNode.fontName !== figma.mixed) {
          await figma.loadFontAsync(textNode.fontName);
        }
        textNode.textAutoResize = (violation.fixData.textAutoResize as TextNode['textAutoResize']) ?? 'WIDTH_AND_HEIGHT';
        return { fixed: true };
      }

      case 'form-consistency':
      case 'cta-width-inconsistent':
      case 'overflow-parent': {
        if ('layoutAlign' in node) {
          (node as SceneNode & { layoutAlign: string }).layoutAlign =
            (violation.fixData.layoutAlign as string) ?? 'STRETCH';
          return { fixed: true };
        }
        return { fixed: false, error: 'No layoutAlign' };
      }

      case 'unbounded-hug': {
        if (violation.fixData.fix === 'stretch-self' && 'layoutAlign' in node) {
          (node as SceneNode & { layoutAlign: string }).layoutAlign =
            (violation.fixData.layoutAlign as string) ?? 'STRETCH';
          return { fixed: true };
        }
        return { fixed: false, error: 'No auto-fix available' };
      }

      case 'no-autolayout': {
        if (node.type === 'FRAME' || node.type === 'COMPONENT') {
          (node as FrameNode).layoutMode =
            (violation.fixData.layoutMode as 'HORIZONTAL' | 'VERTICAL') ?? 'VERTICAL';
          return { fixed: true };
        }
        return { fixed: false, error: 'Not a frame' };
      }

      case 'section-spacing-collapse': {
        if ((node.type === 'FRAME' || node.type === 'COMPONENT') && typeof violation.fixData.itemSpacing === 'number') {
          (node as FrameNode).itemSpacing = violation.fixData.itemSpacing as number;
          return { fixed: true };
        }
        return { fixed: false, error: 'No itemSpacing support' };
      }

      case 'input-field-structure': {
        if (node.type !== 'FRAME' && node.type !== 'COMPONENT') {
          return { fixed: false, error: 'Not a frame' };
        }
        const frame = node as FrameNode;
        const fixType = violation.fixData.fix as string | undefined;
        if (fixType === 'layout') {
          if (violation.fixData.layoutMode) frame.layoutMode = violation.fixData.layoutMode as 'HORIZONTAL' | 'VERTICAL';
          if (violation.fixData.counterAxisAlignItems) (frame as any).counterAxisAlignItems = violation.fixData.counterAxisAlignItems;
          return { fixed: true };
        } else if (fixType === 'padding') {
          if (violation.fixData.paddingLeft != null) frame.paddingLeft = violation.fixData.paddingLeft as number;
          if (violation.fixData.paddingRight != null) frame.paddingRight = violation.fixData.paddingRight as number;
          return { fixed: true };
        } else if (fixType === 'cornerRadius') {
          if ('cornerRadius' in frame) {
            (frame as any).cornerRadius = violation.fixData.cornerRadius ?? 8;
            return { fixed: true };
          }
        }
        return { fixed: false, error: `Unknown fix type: ${fixType}` };
      }

      case 'mobile-dimensions': {
        if (node.type === 'FRAME' || node.type === 'COMPONENT') {
          const w = violation.fixData.width as number | undefined;
          const h = violation.fixData.height as number | undefined;
          if (w != null && h != null) {
            (node as FrameNode).resize(w, h);
            return { fixed: true };
          }
        }
        return { fixed: false, error: 'Missing dimensions or not a frame' };
      }

      case 'system-bar-fullbleed': {
        if (node.type !== 'FRAME' && node.type !== 'COMPONENT') {
          return { fixed: false, error: 'Not a frame' };
        }
        const frame = node as FrameNode;
        const fixType = violation.fixData.fix as string | undefined;
        if (fixType === 'padding') {
          if (violation.fixData.paddingLeft != null) frame.paddingLeft = violation.fixData.paddingLeft as number;
          if (violation.fixData.paddingRight != null) frame.paddingRight = violation.fixData.paddingRight as number;
          if (violation.fixData.paddingTop != null) frame.paddingTop = violation.fixData.paddingTop as number;
          return { fixed: true };
        } else if (fixType === 'alignment') {
          if (violation.fixData.primaryAxisAlignItems) (frame as any).primaryAxisAlignItems = violation.fixData.primaryAxisAlignItems;
          return { fixed: true };
        }
        return { fixed: false, error: `Unknown fix type: ${fixType}` };
      }

      case 'screen-shell-invalid': {
        if (node.type === 'FRAME' || node.type === 'COMPONENT') {
          if (typeof violation.fixData.layoutMode === 'string') {
            (node as FrameNode).layoutMode = violation.fixData.layoutMode as 'HORIZONTAL' | 'VERTICAL';
            return { fixed: true };
          }
        }
        return { fixed: false, error: 'Not a frame or missing layoutMode' };
      }

      case 'spacer-frame': {
        // Remove spacer frame and convert its dimension to parent spacing
        const parent = node.parent;
        if (!parent || !('layoutMode' in parent)) {
          return { fixed: false, error: 'Spacer parent is not an auto-layout frame' };
        }
        const parentFrame = parent as FrameNode;
        if (parentFrame.layoutMode === 'NONE') {
          return { fixed: false, error: 'Spacer parent has no auto-layout' };
        }
        const isVertical = parentFrame.layoutMode === 'VERTICAL';
        const spacerDim = isVertical
          ? (violation.fixData.height as number ?? (node as FrameNode).height ?? 0)
          : (violation.fixData.width as number ?? (node as FrameNode).width ?? 0);

        const siblings = [...parentFrame.children];
        const idx = siblings.indexOf(node as SceneNode);
        if (idx === 0) {
          if (isVertical) {
            parentFrame.paddingTop = (parentFrame.paddingTop ?? 0) + spacerDim;
          } else {
            parentFrame.paddingLeft = (parentFrame.paddingLeft ?? 0) + spacerDim;
          }
        } else if (idx === siblings.length - 1) {
          if (isVertical) {
            parentFrame.paddingBottom = (parentFrame.paddingBottom ?? 0) + spacerDim;
          } else {
            parentFrame.paddingRight = (parentFrame.paddingRight ?? 0) + spacerDim;
          }
        } else {
          const currentSpacing = parentFrame.itemSpacing ?? 0;
          if (currentSpacing === 0 || currentSpacing === spacerDim) {
            parentFrame.itemSpacing = spacerDim;
          }
        }
        node.remove();
        return { fixed: true };
      }

      case 'wcag-text-size': {
        if ('fontSize' in node && typeof violation.fixData.fontSize === 'number') {
          (node as TextNode).fontSize = violation.fixData.fontSize;
          return { fixed: true };
        }
        return { fixed: false, error: 'Not a text node' };
      }

      case 'wcag-line-height': {
        if ('lineHeight' in node && typeof violation.fixData.lineHeight === 'number') {
          (node as TextNode).lineHeight = { value: violation.fixData.lineHeight as number, unit: 'PIXELS' };
          return { fixed: true };
        }
        return { fixed: false, error: 'Not a text node' };
      }

      case 'spec-border-radius': {
        if ('cornerRadius' in node && typeof violation.fixData.value === 'number') {
          (node as RectangleNode).cornerRadius = violation.fixData.value;
          return { fixed: true };
        }
        return { fixed: false, error: 'No cornerRadius support' };
      }

      case 'spec-spacing': {
        const prop = violation.fixData.property as string;
        const value = violation.fixData.value as number;
        if (setSpacingProp(node, prop, value)) {
          return { fixed: true };
        }
        return { fixed: false, error: `Cannot set ${prop}` };
      }

      default:
        // Rules that require library variable lookup (spec-color, hardcoded-token, no-text-style)
        // are NOT handled inline — they need async library imports which are expensive.
        // These will be caught by the MCP-level lint_fix_all if needed.
        return { fixed: false, error: `Rule ${violation.rule} not supported in inline fix` };
    }
  } catch (err) {
    return { fixed: false, error: err instanceof Error ? err.message : String(err) };
  }
}


/** Build a node ID → SceneNode map from created node IDs. */
function buildNodeMap(nodeIds: string[]): Map<string, SceneNode> {
  const map = new Map<string, SceneNode>();
  for (const id of nodeIds) {
    const node = figma.getNodeById(id);
    if (node && 'type' in node && node.type !== 'PAGE' && node.type !== 'DOCUMENT') {
      map.set(id, node as SceneNode);
    }
  }
  return map;
}

/** Lightweight lint summary for post-creation feedback (no fixing, minimal overhead). */
export interface QuickLintSummary {
  violations: number;
  autoFixable: number;
  topIssues: Array<{ rule: string; count: number; severity: string }>;
  /** Component reuse suggestions — existing components that match created nodes. */
  componentSuggestions?: Array<{ nodeName: string; componentName: string; componentId: string; isSet: boolean }>;
}

/**
 * Run a lightweight lint scan on a node and return a summary.
 * Does NOT fix anything — just counts violations and top issues.
 * Returns null if no violations found (to avoid bloating the response).
 */
export async function quickLintSummary(nodeId: string, autoFix = false, skipRules?: Set<string>): Promise<QuickLintSummary | null> {
  const node = figma.getNodeById(nodeId);
  if (!node || !('type' in node) || node.type === 'PAGE' || node.type === 'DOCUMENT') return null;

  const ctx = await buildLintContextFromStorage();
  const abstractNode = figmaNodeToAbstract(node as SceneNode);
  const report = runLint([abstractNode], ctx, {
    maxViolations: 20,
    minSeverity: 'heuristic',
    skipRules,
  });

  if (report.summary.violations === 0) return null;

  const allViolations = report.categories.flatMap(c => c.nodes);
  const autoFixable = allViolations.filter(v => v.autoFixable).length;

  // ── Auto-fix deterministic layout issues (no library lookups) ──
  let autoFixed = 0;
  if (autoFix && autoFixable > 0) {
    const fixableViolations = allViolations.filter(v => v.autoFixable);
    // Only fix layout/structural rules that don't need library imports
    const INLINE_FIXABLE_RULES = new Set([
      'no-autolayout', 'text-overflow', 'overflow-parent', 'unbounded-hug',
      'section-spacing-collapse', 'spacer-frame', 'button-structure',
      'input-field-structure', 'system-bar-fullbleed', 'screen-shell-invalid',
      'wcag-line-height', 'wcag-text-size', 'mobile-dimensions',
      'form-consistency', 'cta-width-inconsistent',
    ]);
    for (const v of fixableViolations) {
      if (!INLINE_FIXABLE_RULES.has(v.rule)) continue;
      const fixNode = figma.getNodeById(v.nodeId);
      if (!fixNode || !('type' in fixNode)) continue;
      const result = await applyFixDirect(fixNode as SceneNode, v);
      if (result.fixed) autoFixed++;
    }
  }

  // Top issues: grouped by rule, sorted by count descending, max 5
  const topIssues = report.categories
    .map(c => ({ rule: c.rule, count: c.count, severity: c.nodes[0]?.severity ?? 'heuristic' }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── Component reuse suggestions ──
  // Check if any child node names match existing components (lightweight scan)
  const suggestions: QuickLintSummary['componentSuggestions'] = [];
  try {
    const sceneNode = node as SceneNode;
    if ('children' in sceneNode) {
      const childNames = new Set<string>();
      for (const child of (sceneNode as FrameNode).children) {
        childNames.add(child.name.toLowerCase());
      }
      if (childNames.size > 0) {
        // Walk page-level components (shallow — only top-level and their direct children)
        for (const pageChild of figma.currentPage.children) {
          if (pageChild.type === 'COMPONENT' || pageChild.type === 'COMPONENT_SET') {
            const compName = pageChild.name.toLowerCase();
            for (const cn of childNames) {
              if (compName === cn || compName.includes(cn) || cn.includes(compName)) {
                suggestions.push({
                  nodeName: cn,
                  componentName: pageChild.name,
                  componentId: pageChild.id,
                  isSet: pageChild.type === 'COMPONENT_SET',
                });
                break;
              }
            }
            if (suggestions.length >= 3) break; // limit suggestions
          }
        }
      }
    }
  } catch { /* component scan is best-effort */ }

  const result: QuickLintSummary = {
    violations: autoFix ? report.summary.violations - autoFixed : report.summary.violations,
    autoFixable: autoFix ? autoFixable - autoFixed : autoFixable,
    topIssues,
  };
  if (autoFixed > 0) (result as any).autoFixed = autoFixed;
  if (suggestions.length > 0) result.componentSuggestions = suggestions;
  return result;
}

export interface InlineLintResult {
  initial: { total: number; pass: number; violations: number; bySeverity: Record<string, number> };
  fixable: number;
  fixed: number;
  fixFailed: number;
  remaining: number;
  final: { total: number; pass: number; violations: number; bySeverity: Record<string, number> };
  scopedNodeIds: string[];
  fixErrors?: Array<{ nodeId: string; error: string }>;
  remainingViolations?: LintViolation[];
}

/**
 * Run lint + fix entirely within the plugin sandbox.
 * Replaces the 3-call bridge round-trip: lint_check → lint_fix → lint_check.
 *
 * @param rootNodeIds - IDs of root nodes to lint (typically createdRootIds)
 * @param options.skipRules - Rule names to skip (already handled by pre-creation validation)
 * @param options.maxViolations - Max violations to collect
 * @param options.includeRemainingViolations - Include remaining violations in result
 * @param options.minSeverity - Minimum severity to include
 */
export async function runInlineLintAndFix(
  rootNodeIds: string[],
  options: {
    skipRules?: Set<string>;
    maxViolations?: number;
    includeRemainingViolations?: boolean;
    minSeverity?: 'error' | 'unsafe' | 'heuristic' | 'style' | 'verbose';
  } = {},
): Promise<InlineLintResult> {
  const ctx = await buildLintContextFromStorage();

  // Collect root SceneNodes
  const rootNodes: SceneNode[] = [];
  for (const id of rootNodeIds) {
    const node = figma.getNodeById(id);
    if (node && 'type' in node && node.type !== 'PAGE' && node.type !== 'DOCUMENT') {
      rootNodes.push(node as SceneNode);
    }
  }

  if (rootNodes.length === 0) {
    const empty = { total: 0, pass: 0, violations: 0, bySeverity: { error: 0, unsafe: 0, heuristic: 0, style: 0, verbose: 0 } };
    return {
      initial: empty,
      fixable: 0,
      fixed: 0,
      fixFailed: 0,
      remaining: 0,
      final: empty,
      scopedNodeIds: rootNodeIds,
    };
  }

  // Convert Figma nodes directly to AbstractNode (skip CompressedNode intermediate)
  const abstractNodes = rootNodes.map(figmaNodeToAbstract);

  // Run initial lint
  const lintOptions: LintOptions = {
    maxViolations: options.maxViolations ?? 200,
    minSeverity: options.minSeverity ?? 'heuristic',
    skipRules: options.skipRules,
  };
  const initialReport = runLint(abstractNodes, ctx, lintOptions);

  // Collect fixable violations
  const allViolations = initialReport.categories.flatMap((c) => c.nodes);
  const fixable = allViolations.filter((v) => v.autoFixable);

  const initialSummary = {
    total: initialReport.summary.total,
    pass: initialReport.summary.pass,
    violations: initialReport.summary.violations,
    bySeverity: initialReport.summary.bySeverity,
  };

  // P0 optimization: if nothing is fixable, skip the fix loop, re-conversion, and re-lint entirely.
  // The final state is identical to the initial state when no fixes can be applied.
  if (fixable.length === 0) {
    const result: InlineLintResult = {
      initial: initialSummary,
      fixable: 0,
      fixed: 0,
      fixFailed: 0,
      remaining: initialReport.summary.violations,
      final: initialSummary,
      scopedNodeIds: rootNodeIds,
    };
    if (options.includeRemainingViolations) {
      result.remainingViolations = allViolations;
    }
    return result;
  }

  // Build node map for direct access
  const allNodeIds = new Set<string>();
  function collectIds(node: AbstractNode) {
    allNodeIds.add(node.id);
    node.children?.forEach(collectIds);
  }
  abstractNodes.forEach(collectIds);
  const nodeMap = buildNodeMap([...allNodeIds]);

  // Apply fixes directly on Figma nodes
  let fixed = 0;
  let fixFailed = 0;
  const fixErrors: Array<{ nodeId: string; error: string }> = [];

  for (const violation of fixable) {
    const node = nodeMap.get(violation.nodeId);
    if (!node) {
      fixFailed++;
      fixErrors.push({ nodeId: violation.nodeId, error: 'Node not found in map' });
      continue;
    }
    const fixResult = await applyFixDirect(node, violation);
    if (fixResult.fixed) {
      fixed++;
    } else {
      fixFailed++;
      if (fixResult.error) {
        fixErrors.push({ nodeId: violation.nodeId, error: fixResult.error });
      }
    }
  }

  // Re-lint after fixes (re-convert nodes since they've been mutated)
  const finalAbstractNodes = rootNodes.map(figmaNodeToAbstract);
  const finalReport = runLint(finalAbstractNodes, ctx, lintOptions);

  const result: InlineLintResult = {
    initial: initialSummary,
    fixable: fixable.length,
    fixed,
    fixFailed,
    remaining: finalReport.summary.violations,
    final: {
      total: finalReport.summary.total,
      pass: finalReport.summary.pass,
      violations: finalReport.summary.violations,
      bySeverity: finalReport.summary.bySeverity,
    },
    scopedNodeIds: rootNodeIds,
  };

  if (fixErrors.length > 0) {
    result.fixErrors = fixErrors;
  }

  if (options.includeRemainingViolations) {
    result.remainingViolations = finalReport.categories.flatMap((c) => c.nodes);
  }

  return result;
}
