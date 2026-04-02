/**
 * Node creation handlers — create_frame, create_text, and supporting logic.
 *
 * Extracted from write-nodes.ts for maintainability.
 */

import { registerHandler } from '../registry.js';
import { simplifyNode } from '../adapters/node-simplifier.js';
import { autoBindTypography } from '../utils/design-context.js';
import { ensureLoaded, getTextStyleId } from '../utils/style-registry.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';
import { applyFill, applyStroke, applyCornerRadius, applyTokenField, applyTokenFields, setComponentProperties } from '../utils/node-helpers.js';
import { hexToFigmaRgb } from '../utils/color.js';
import { structuredHintsToInferences, formatDiff, buildCorrectedPayload, validateParams, inferDirection } from './inline-tree.js';
import type { Inference } from './inline-tree.js';
import { aggregateHints, structuredHintsToTyped } from '../utils/hint-aggregator.js';
import type { StructuredHint } from '../utils/hint-aggregator.js';
import type { Hint } from '../utils/hint-aggregator.js';
import { quickLintSummary, PRE_RULE_TO_LINT_RULE } from './lint-inline.js';
import { assertHandler } from '../utils/handler-error.js';
import { getCachedModeLibrary, loadFontWithFallback, resolveFontAsync } from './write-nodes.js';
import { applySizingOverrides, getLayoutSizing, setLayoutSizing, setLayoutWrap, setBlendMode, setLayoutPositioning, setStrokeProps, setEffectStyleIdAsync, setFillStyleIdAsync, setTextStyleIdAsync, resolveComponent } from '../utils/figma-compat.js';

// ─── Shared context for library-aware creation ───
interface CreateContext {
  useLib: boolean;
  library: string | undefined;
  libraryBindings: string[];
  hints: StructuredHint[];
  warnings: string[];
  /** Typed hints emitted directly (bypassing StructuredHint conversion). */
  typedHints: Hint[];
}

async function initCreateContext(): Promise<CreateContext> {
  const [mode, library] = await getCachedModeLibrary();
  const useLib = mode === 'library' && !!library;
  if (useLib) await ensureLoaded(library!);
  return { useLib, library, libraryBindings: [], hints: [], warnings: [], typedHints: [] };
}

// ─── Alias normalization: fillVariableName/fillStyleName → fill ───
function normalizeAliases(p: Record<string, unknown>): void {
  // Conflict detection: fill + alias cannot coexist
  const fillAliases = ['fillVariableName', 'fillStyleName', 'fontColorVariableName', 'fontColorStyleName']
    .filter(k => p[k] != null);
  if (p.fill != null && fillAliases.length > 0) {
    throw new Error(`Conflicting fill: "fill" and "${fillAliases.join('", "')}" both specified. Use only one.`);
  }
  if (p.strokeColor != null && p.strokeVariableName != null) {
    throw new Error('Conflicting stroke: "strokeColor" and "strokeVariableName" both specified. Use only one.');
  }
  // Fill aliases
  if (!p.fill && p.fillVariableName) {
    p.fill = { _variable: p.fillVariableName }; delete p.fillVariableName;
  } else if (!p.fill && p.fillStyleName) {
    p.fill = { _style: p.fillStyleName }; delete p.fillStyleName;
  }
  // Font color aliases (for text)
  if (!p.fill && p.fontColorVariableName) {
    p.fill = { _variable: p.fontColorVariableName }; delete p.fontColorVariableName;
  } else if (!p.fill && p.fontColorStyleName) {
    p.fill = { _style: p.fontColorStyleName }; delete p.fontColorStyleName;
  }
  // Stroke aliases
  if (!p.strokeColor && p.strokeVariableName) {
    p.strokeColor = { _variable: p.strokeVariableName }; delete p.strokeVariableName;
  }
  // Padding shorthand — warn if mixed with per-side padding (ambiguous intent)
  if (p.padding != null) {
    const perSide = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].filter(k => p[k] != null);
    if (perSide.length > 0) {
      throw new Error(
        `Conflicting padding: "padding" and "${perSide.join('", "')}" both specified. Use either "padding" shorthand or individual sides, not both.`,
      );
    }
    p.paddingTop = p.padding;
    p.paddingRight = p.padding;
    p.paddingBottom = p.padding;
    p.paddingLeft = p.padding;
  }
}

// ─── Batch progress ───
function sendBatchProgress(commandId: string | undefined, current: number, total: number): void {
  if (!commandId) return;
  figma.ui.postMessage({ type: 'command_progress', commandId, current, total });
}

// ─── Font style normalization: numeric weights → Figma style names ───
const WEIGHT_TO_STYLE: Record<string, string> = {
  '100': 'Thin', '200': 'ExtraLight', '300': 'Light',
  '400': 'Regular', '500': 'Medium', '600': 'SemiBold',
  '700': 'Bold', '800': 'ExtraBold', '900': 'Black',
};
function normalizeFontStyle(style: string): string {
  // Numeric weight (e.g. "700") → Figma style name (e.g. "Bold")
  if (/^\d{3}$/.test(style)) return WEIGHT_TO_STYLE[style] ?? 'Regular';
  // CamelCase split: "SemiBold" → "Semi Bold", "ExtraLight" → "Extra Light"
  const split = style.replace(/([a-z])([A-Z])/g, '$1 $2');
  // Common aliases
  const lower = split.toLowerCase();
  if (lower === 'normal') return 'Regular';
  if (lower === 'bold italic' || lower === 'bolditalic') return 'Bold Italic';
  if (lower === 'italic') return 'Italic';
  return split;
}

// ─── Local color matching (no library mode) ───
// Tries to match a node's current solid fill to a local COLOR variable or paint style.
// Uses a short-lived cache to avoid redundant async fetches during batch operations.

interface ColorVarEntry {
  variable: Variable;
  rgb: { r: number; g: number; b: number };
}

let _colorVarCache: { entries: ColorVarEntry[]; ts: number } | null = null;
let _paintStyleCache: { styles: PaintStyle[]; ts: number } | null = null;
const COLOR_CACHE_TTL = 10_000; // 10s — covers batch operations

async function getCachedColorVars(): Promise<ColorVarEntry[]> {
  if (_colorVarCache && Date.now() - _colorVarCache.ts < COLOR_CACHE_TTL) {
    return _colorVarCache.entries;
  }
  const colorVars = await figma.variables.getLocalVariablesAsync('COLOR');
  const uniqueCollIds = [...new Set(colorVars.map(v => v.variableCollectionId))];
  const fetchedColls = await Promise.all(
    uniqueCollIds.map(id => figma.variables.getVariableCollectionByIdAsync(id)),
  );
  const collectionMap = new Map<string, VariableCollection>();
  for (let i = 0; i < uniqueCollIds.length; i++) {
    if (fetchedColls[i]) collectionMap.set(uniqueCollIds[i], fetchedColls[i]!);
  }
  const entries: ColorVarEntry[] = [];
  for (const v of colorVars) {
    const collection = collectionMap.get(v.variableCollectionId);
    if (!collection) continue;
    const val = v.valuesByMode[collection.defaultModeId];
    if (val && typeof val === 'object' && 'r' in val) {
      entries.push({ variable: v, rgb: val as { r: number; g: number; b: number } });
    }
  }
  _colorVarCache = { entries, ts: Date.now() };
  return entries;
}

async function getCachedPaintStyles(): Promise<PaintStyle[]> {
  if (_paintStyleCache && Date.now() - _paintStyleCache.ts < COLOR_CACHE_TTL) {
    return _paintStyleCache.styles;
  }
  const styles = await figma.getLocalPaintStylesAsync();
  _paintStyleCache = { styles, ts: Date.now() };
  return styles;
}

async function tryLocalColorMatch(
  node: SceneNode & { fills: readonly Paint[] | Paint[] },
  role: string,
): Promise<string | null> {
  const fills = node.fills as Paint[];
  if (!fills.length || fills[0].type !== 'SOLID') return null;
  const color = (fills[0] as SolidPaint).color;

  // Try local COLOR variables first (cached)
  const colorEntries = await getCachedColorVars();
  for (const { variable: v, rgb: vc } of colorEntries) {
    if (Math.abs(vc.r - color.r) < 0.01 && Math.abs(vc.g - color.g) < 0.01 && Math.abs(vc.b - color.b) < 0.01) {
      const newFills = [...fills];
      newFills[0] = figma.variables.setBoundVariableForPaint(newFills[0] as SolidPaint, 'color', v);
      node.fills = newFills;
      return `var:${v.name}`;
    }
  }

  // Try local paint styles (cached)
  const paintStyles = await getCachedPaintStyles();
  for (const s of paintStyles) {
    if (s.paints.length === 1 && s.paints[0].type === 'SOLID') {
      const sc = (s.paints[0] as SolidPaint).color;
      if (Math.abs(sc.r - color.r) < 0.01 && Math.abs(sc.g - color.g) < 0.01 && Math.abs(sc.b - color.b) < 0.01) {
        try {
          await setFillStyleIdAsync(node, s.id);
          return `fill:${s.name}`;
        } catch { /* skip */ }
      }
    }
  }

  return null;
}

// ─── Smart default: infer layoutMode from AL params ───
function inferLayoutMode(p: Record<string, unknown>, hints: StructuredHint[]): 'HORIZONTAL' | 'VERTICAL' | null {
  const hasALParams =
    p.itemSpacing != null || p.paddingTop != null || p.paddingRight != null ||
    p.paddingBottom != null || p.paddingLeft != null ||
    p.primaryAxisAlignItems != null || p.counterAxisAlignItems != null ||
    (p.layoutWrap != null && p.layoutWrap !== 'NO_WRAP');
  const hasHUGSizing =
    p.layoutSizingHorizontal === 'HUG' || p.layoutSizingVertical === 'HUG';
  const hasChildren = Array.isArray(p.children) && p.children.length > 0;

  // Conflict: explicit NONE + AL params is contradictory
  if (p.layoutMode === 'NONE' && (hasALParams || hasHUGSizing)) {
    const conflicting = [
      hasALParams && 'padding/spacing/alignment',
      hasHUGSizing && 'HUG sizing',
    ].filter(Boolean).join(' and ');
    throw new Error(
      `layoutMode:"NONE" conflicts with ${conflicting}. ` +
      'Static frames do not support layout properties. Remove layoutMode:"NONE" to enable auto-layout.',
    );
  }

  if (p.layoutMode) return null; // explicit — no inference

  if (hasALParams || hasHUGSizing) {
    const direction = inferDirection(p);
    hints.push({ confidence: 'deterministic', field: 'layoutMode', value: direction, reason: `inferred from padding/spacing/alignment params${direction === 'HORIZONTAL' ? ' (horizontal signals detected)' : ''}` });
    return direction;
  }
  if (hasChildren) {
    const direction = inferDirection(p);
    hints.push({ confidence: 'deterministic', field: 'layoutMode', value: direction, reason: `inferred from children param${direction === 'HORIZONTAL' ? ' (horizontal signals detected)' : ''}` });
    return direction;
  }
  return null;
}

// ─── Per-child inline validation (O(1) checks, runs after each appendChild) ───

/**
 * Per-child inline validation + self-healing.
 *
 * Runs immediately after each child is created and appended. Two behaviors:
 * - **Self-heal**: deterministic fixes applied immediately (text overflow → HEIGHT resize)
 * - **Warn**: issues without a clear fix are reported for AI to handle
 *
 * Touch target & cross-sibling consistency are deferred to quickLintSummary
 * (wcag-target-size, form-consistency) which uses more reliable heuristics.
 */
function validateChildNode(
  node: SceneNode,
  parent: FrameNode,
  childPath: string,
  ctx: CreateContext,
): void {
  try {
    const w = Math.round(node.width);
    const h = Math.round(node.height);

    // ── Self-heal: text issues with deterministic fixes ──
    if (node.type === 'TEXT') {
      const text = node as TextNode;
      const parentContentWidth = parent.width - parent.paddingLeft - parent.paddingRight;

      // Empty text + WIDTH_AND_HEIGHT → will collapse to 0 width.
      // Fix: switch to HEIGHT resize so it keeps parent width.
      if ((!text.characters || text.characters.trim() === '') && text.textAutoResize === 'WIDTH_AND_HEIGHT') {
        text.textAutoResize = 'HEIGHT';
        ctx.hints.push({
          confidence: 'deterministic',
          field: 'textAutoResize',
          value: 'HEIGHT',
          reason: `[${childPath}] empty text auto-healed: WIDTH_AND_HEIGHT → HEIGHT to prevent 0-width collapse`,
        });
      }

      // Text overflows parent content area → switch to HEIGHT resize (wrap).
      else if (text.textAutoResize === 'WIDTH_AND_HEIGHT' && w > parentContentWidth + 2) {
        text.textAutoResize = 'HEIGHT';
        ctx.hints.push({
          confidence: 'deterministic',
          field: 'textAutoResize',
          value: 'HEIGHT',
          reason: `[${childPath}] text overflow auto-healed: width ${w} > parent ${Math.round(parentContentWidth)}, switched to HEIGHT resize`,
        });
      }

      // Line height below fontSize → text lines overlap (WCAG readability).
      const fontSize = typeof text.fontSize === 'number' ? text.fontSize : 0;
      if (fontSize > 0) {
        const lh = text.lineHeight as { unit: string; value?: number };
        if (lh && lh.unit === 'PIXELS' && lh.value != null && lh.value < fontSize) {
          const fixed = Math.ceil(fontSize * 1.0);
          text.lineHeight = { unit: 'PIXELS', value: fixed };
          ctx.hints.push({
            confidence: 'deterministic',
            field: 'lineHeight',
            value: fixed,
            reason: `[${childPath}] line-height ${lh.value}px < fontSize ${fontSize}px, auto-healed to ${fixed}px`,
          });
        }
      }

      // Font size below mobile readability (suggest — may be intentional)
      if (fontSize > 0 && fontSize < 12) {
        ctx.typedHints.push({ type: 'suggest', message: `[${childPath}] fontSize ${fontSize} below mobile minimum (12px)` });
      }
    }

    // ── Suggest: structural anomalies without deterministic fixes ──

    // Collapsed dimensions (cause varies — HUG+empty, FILL in HUG parent, etc.)
    if (w <= 0 || h <= 0) {
      // Skip if already self-healed above (text node would have been fixed)
      if (node.type !== 'TEXT') {
        ctx.typedHints.push({ type: 'suggest', message: `[${childPath}] collapsed to ${w}×${h} — check sizing` });
      }
    }

    // Invisible frame (no fills, no strokes, no children)
    if (node.type === 'FRAME') {
      const frame = node as FrameNode;
      const hasFills = Array.isArray(frame.fills) && (frame.fills as readonly Paint[]).some(f => f.visible !== false);
      const hasStrokes = Array.isArray(frame.strokes) && (frame.strokes as readonly Paint[]).some(s => s.visible !== false);
      if (!hasFills && !hasStrokes && frame.children.length === 0) {
        ctx.typedHints.push({ type: 'suggest', message: `[${childPath}] invisible empty frame — no fills, strokes, or children` });
      }
    }

    // Text-as-icon placeholder detection (Layer 2 warning)
    if (node.type === 'TEXT') {
      const chars = (node as TextNode).characters.trim();
      const iconPlaceholders: Record<string, string> = {
        '>': 'lucide:chevron-right', '›': 'lucide:chevron-right', '→': 'lucide:arrow-right',
        '<': 'lucide:chevron-left', '‹': 'lucide:chevron-left', '←': 'lucide:arrow-left',
        '...': 'lucide:ellipsis', '…': 'lucide:ellipsis', '•••': 'lucide:ellipsis',
        '×': 'lucide:x', '✕': 'lucide:x', 'X': 'lucide:x',
      };
      if (iconPlaceholders[chars]) {
        ctx.typedHints.push({ type: 'warn', message: `[${childPath}] "${chars}" looks like an icon placeholder — use icon_create(icon:"${iconPlaceholders[chars]}") instead of text` });
      }
    }

    // Rectangle-as-container detection (Layer 2 warning)
    if (node.type === 'RECTANGLE') {
      const nameLC = node.name.toLowerCase();
      if (/logo|avatar|icon|placeholder|image|thumb/.test(nameLC)) {
        ctx.typedHints.push({ type: 'warn', message: `[${childPath}] "${node.name}" is a rectangle — use type:"frame" with centered icon inside if it needs children later` });
      }
    }
  } catch {
    // Validation must never block creation
  }
}

// ─── Smart default: infer child sizing from parent auto-layout ───

/** Shape types that only support FIXED and FILL sizing (not HUG). */
const SHAPE_TYPES = new Set(['RECTANGLE', 'ELLIPSE', 'STAR', 'POLYGON', 'LINE', 'VECTOR']);

/** Mobile screen detection: width 320–440, height 568–932 (iPhone SE → Pro Max, common Android). */
/** Detect mobile/tablet screen sizes — these should keep FIXED sizing, not HUG. */
function isScreenSize(node: SceneNode): boolean {
  if (!('width' in node) || !('height' in node)) return false;
  const w = Math.round((node as any).width);
  const h = Math.round((node as any).height);
  // Mobile: iPhone SE (320x568) → iPhone 16 Pro Max (430x932), Samsung/Pixel (360-412)
  const isMobile = w >= 320 && w <= 440 && h >= 568 && h <= 932;
  // Tablet: iPad mini (768x1024) → iPad Pro 12.9" (1024x1366)
  const isTablet = w >= 768 && w <= 1024 && h >= 1024 && h <= 1366;
  return isMobile || isTablet;
}

/** Check if a node is a shape or SVG-generated frame without auto-layout. */
function isShapeNode(node: SceneNode): boolean {
  if (SHAPE_TYPES.has(node.type)) return true;
  // SVG createNodeFromSvg() returns a FRAME but without auto-layout — treat as shape
  if (node.type === 'FRAME' && (node as FrameNode).layoutMode === 'NONE' && (node as FrameNode).children.length > 0) {
    // Heuristic: frames created from SVG have mostly vector children
    // Use majority check — an SVG frame may contain a TEXT label alongside vector shapes
    const kids = (node as FrameNode).children;
    const vectorCount = kids.filter(
      c => c.type === 'VECTOR' || c.type === 'BOOLEAN_OPERATION' || c.type === 'GROUP',
    ).length;
    if (vectorCount > kids.length / 2) return true;
  }
  return false;
}

function inferChildSizing(
  node: SceneNode,
  parent: BaseNode | null,
  explicitH: string | undefined,
  explicitV: string | undefined,
  hints: StructuredHint[],
  hasExplicitWidth?: boolean,
  hasExplicitHeight?: boolean,
): void {
  // Root-level frames (direct children of page, no auto-layout parent):
  // Default to HUG/HUG so the frame wraps its content instead of collapsing to Figma's default 100px.
  if (!parent || !('layoutMode' in parent) || (parent as FrameNode).layoutMode === 'NONE') {
    // Mobile screen dimensions → always FIXED even when root frame (no auto-layout parent)
    if (isScreenSize(node)) {
      if (!explicitH) {
        setLayoutSizing(node, 'horizontal', 'FIXED');
        hints.push({ confidence: 'deterministic', field: 'layoutSizingHorizontal', value: 'FIXED', reason: 'mobile screen dimensions detected — locked to FIXED' });
      }
      if (!explicitV) {
        setLayoutSizing(node, 'vertical', 'FIXED');
        hints.push({ confidence: 'deterministic', field: 'layoutSizingVertical', value: 'FIXED', reason: 'mobile screen dimensions detected — locked to FIXED' });
      }
      return;
    }
    if ('layoutMode' in node && (node as FrameNode).layoutMode !== 'NONE') {
      if (!explicitH) {
        setLayoutSizing(node, 'horizontal', 'HUG');
        hints.push({ confidence: 'deterministic', field: 'layoutSizingHorizontal', value: 'HUG', reason: 'root frame — HUG to wrap content (no auto-layout parent)' });
      }
      if (!explicitV) {
        setLayoutSizing(node, 'vertical', 'HUG');
        hints.push({ confidence: 'deterministic', field: 'layoutSizingVertical', value: 'HUG', reason: 'root frame — HUG to wrap content (no auto-layout parent)' });
      }
    }
    return;
  }
  const parentFrame = parent as FrameNode;
  const parentDir = parentFrame.layoutMode;
  if (parentDir === 'NONE') return;

  // Mobile screen dimensions → always FIXED on both axes (never HUG/FILL)
  if (isScreenSize(node)) {
    if (!explicitH) {
      setLayoutSizing(node, 'horizontal', 'FIXED');
      hints.push({ confidence: 'deterministic', field: 'layoutSizingHorizontal', value: 'FIXED', reason: 'mobile screen dimensions detected — locked to FIXED' });
    }
    if (!explicitV) {
      setLayoutSizing(node, 'vertical', 'FIXED');
      hints.push({ confidence: 'deterministic', field: 'layoutSizingVertical', value: 'FIXED', reason: 'mobile screen dimensions detected — locked to FIXED' });
    }
    return;
  }

  const isVertical = parentDir === 'VERTICAL';
  const isShape = isShapeNode(node);

  // Determine safe cross-axis default:
  // - If parent HUGs on cross-axis → child can't FILL (would collapse to 0), use HUG (or FIXED for shapes)
  // - If parent uses CENTER/MAX/BASELINE alignment → FILL would override alignment, use HUG/FIXED
  // - Otherwise → FILL (stretch to fill parent)
  function safeCrossDefault(): { sizing: 'FILL' | 'HUG' | 'FIXED'; reason: string } {
    const crossSizing = getLayoutSizing(parentFrame, isVertical ? 'horizontal' : 'vertical');
    if (crossSizing === 'HUG') {
      return isShape
        ? { sizing: 'FIXED', reason: 'parent HUGs on cross-axis; shape keeps explicit size' }
        : { sizing: 'HUG', reason: 'parent HUGs on cross-axis' };
    }
    const crossAlign = parentFrame.counterAxisAlignItems;
    if (crossAlign === 'CENTER' || crossAlign === 'MAX') {
      return isShape
        ? { sizing: 'FIXED', reason: `parent aligns children ${crossAlign}; shape keeps explicit size` }
        : { sizing: 'HUG', reason: `parent aligns children ${crossAlign} — FILL would override` };
    }
    if ((crossAlign as string) === 'BASELINE') {
      return isShape
        ? { sizing: 'FIXED', reason: 'parent uses BASELINE alignment; shape keeps explicit size' }
        : { sizing: 'HUG', reason: 'parent uses BASELINE alignment — FILL would override' };
    }
    return { sizing: 'FILL', reason: 'stretch to fill parent' };
  }

  const cross = safeCrossDefault();

  // Shapes don't support HUG — use FIXED for primary axis instead
  const primaryDefault = isShape ? 'FIXED' : 'HUG';
  const primaryReason = isShape ? 'shape keeps explicit size along flow' : 'shrink to content along flow';

  // Cross-axis → FILL or HUG/FIXED (context-dependent), primary-axis → HUG or FIXED (shapes)
  if (!explicitH) {
    if (hasExplicitWidth) {
      // Explicit width provided without layoutSizingHorizontal → keep FIXED (don't override with HUG/FILL)
      setLayoutSizing(node, 'horizontal', 'FIXED');
      hints.push({ confidence: 'deterministic', field: 'layoutSizingHorizontal', value: 'FIXED', reason: 'explicit width provided — keeping FIXED' });
    } else {
      const val = isVertical ? cross.sizing : primaryDefault;
      setLayoutSizing(node, 'horizontal', val);
      const reason = isVertical ? cross.reason : primaryReason;
      const confidence = val === 'FILL' ? 'ambiguous' : 'deterministic';
      hints.push({ confidence, field: 'layoutSizingHorizontal', value: val, reason });
    }
  }
  if (!explicitV) {
    if (hasExplicitHeight) {
      // Explicit height provided without layoutSizingVertical → keep FIXED (don't override with HUG/FILL)
      setLayoutSizing(node, 'vertical', 'FIXED');
      hints.push({ confidence: 'deterministic', field: 'layoutSizingVertical', value: 'FIXED', reason: 'explicit height provided — keeping FIXED' });
    } else {
      const val = isVertical ? primaryDefault : cross.sizing;
      setLayoutSizing(node, 'vertical', val);
      const reason = isVertical ? primaryReason : cross.reason;
      const confidence = val === 'FILL' ? 'ambiguous' : 'deterministic';
      hints.push({ confidence, field: 'layoutSizingVertical', value: val, reason });
    }
  }
}

// ─── Core frame setup (shared by create_frame and inline children) ───
async function setupFrame(
  frame: FrameNode,
  p: Record<string, unknown>,
  ctx: CreateContext,
): Promise<void> {
  normalizeAliases(p);

  frame.name = (p.name as string) ?? 'Frame';
  if (p.x != null) frame.x = p.x as number;
  if (p.y != null) frame.y = p.y as number;

  // ── Smart default: infer layoutMode ──
  const inferredMode = inferLayoutMode(p, ctx.hints);
  const effectiveLayoutMode = (p.layoutMode as string) ?? inferredMode;

  // Resize — only when dimensions provided or no auto-layout
  if (p.width != null || p.height != null) {
    frame.resize((p.width as number) ?? 100, (p.height as number) ?? 100);
  } else if (!effectiveLayoutMode) {
    frame.resize(100, 100);
  }

  // ── Fill ──
  if (p.fill != null) {
    const fillResult = await applyFill(
      frame, p.fill as any, 'background', ctx.useLib, ctx.library,
      { stylesPreloaded: true },
    );
    if (fillResult.autoBound) ctx.libraryBindings.push(fillResult.autoBound);
    if (fillResult.colorHint) ctx.warnings.push(fillResult.colorHint);
    // When not in library mode but fill is a hex color, try matching local variables/styles
    if (!fillResult.autoBound && !ctx.useLib && typeof p.fill === 'string') {
      try {
        const localBound = await tryLocalColorMatch(frame as any, 'background');
        if (localBound) ctx.libraryBindings.push(localBound);
      } catch { /* best effort */ }
    }
  } else if (ctx.useLib) {
    const fillResult = await applyFill(
      frame, undefined, 'background', ctx.useLib, ctx.library,
      { stylesPreloaded: true },
    );
    if (fillResult.autoBound) ctx.libraryBindings.push(fillResult.autoBound);
    if (fillResult.colorHint) ctx.warnings.push(fillResult.colorHint);
  } else {
    frame.fills = []; // clear default white
  }

  // ── Gradient fill ──
  if (p.gradient) {
    const g = p.gradient as { type?: string; stops: Array<{ color: string; position: number }>; angle?: number };
    if (g.stops && g.stops.length >= 2) {
      const gradStops: ColorStop[] = g.stops.map(s => ({
        position: s.position,
        color: { ...hexToFigmaRgb(s.color), a: 1 },
      }));
      const gradType = (g.type ?? 'LINEAR') === 'RADIAL' ? 'GRADIENT_RADIAL' : 'GRADIENT_LINEAR';
      // Compute transform from angle (default 180 = top-to-bottom)
      const angleDeg = g.angle ?? 180;
      const angleRad = (angleDeg * Math.PI) / 180;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);
      frame.fills = [{
        type: gradType,
        gradientStops: gradStops,
        gradientTransform: [
          [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
          [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5],
        ],
      } as GradientPaint];
    }
  }

  // ── Image fill (URL or pexel:<id> — resolved by MCP server) ──
  if (p.imageUrl) {
    try {
      const url = p.imageUrl as string;
      const image = await figma.createImageAsync(url);
      const scaleMode = (p.imageScaleMode as string) ?? 'FILL';
      frame.fills = [{
        type: 'IMAGE',
        imageHash: image.hash,
        scaleMode: scaleMode as 'FILL' | 'FIT' | 'CROP' | 'TILE',
      }];
    } catch (err) {
      ctx.warnings.push(`imageUrl failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Stroke ──
  if (p.strokeColor != null) {
    await applyStroke(frame, p.strokeColor as any, (p.strokeWeight as number) ?? 1, ctx.useLib, ctx.library);
  } else {
    // No stroke requested — clear Figma's default strokeWeight to prevent phantom borders
    frame.strokeWeight = 0;
  }
  setStrokeProps(frame, {
    strokeAlign: (p.strokeAlign && 'strokeAlign' in frame) ? p.strokeAlign as string : undefined,
    dashPattern: (p.strokeDashes && Array.isArray(p.strokeDashes)) ? p.strokeDashes as number[] : undefined,
    strokeCap: p.strokeCap as string | undefined,
    strokeJoin: p.strokeJoin as string | undefined,
  });

  // ── Layout mode ──
  if (effectiveLayoutMode) {
    frame.layoutMode = effectiveLayoutMode as 'HORIZONTAL' | 'VERTICAL';
    // When dimensions are explicitly provided with auto-layout, ensure FIXED sizing
    // (layoutMode assignment resets sizing to HUG by default, which would override resize)
    if (p.width != null && !p.layoutSizingHorizontal) {
      setLayoutSizing(frame, 'horizontal', 'FIXED');
    }
    if (p.height != null && !p.layoutSizingVertical) {
      setLayoutSizing(frame, 'vertical', 'FIXED');
    }
  }

  // ── Spacing & padding: bind to float tokens in library mode ──
  const spacingFields = ['itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'counterAxisSpacing'] as const;
  if (ctx.useLib) {
    const tokenFieldMap: Record<string, number | undefined> = {};
    for (const key of spacingFields) {
      if (p[key] != null && typeof p[key] === 'number') tokenFieldMap[key] = p[key] as number;
    }
    if (Object.keys(tokenFieldMap).length > 0) {
      const bound = await applyTokenFields(frame as SceneNode, tokenFieldMap);
      ctx.libraryBindings.push(...bound);
    }
  }
  for (const key of spacingFields) {
    if (p[key] != null && !(ctx.useLib && typeof p[key] === 'number')) {
      (frame as any)[key] = p[key] as number;
    }
  }

  // ── Padding vs frame dimension sanity check ──
  {
    const fw = frame.width;
    const fh = frame.height;
    const pl = (p.paddingLeft as number) ?? 0;
    const pr = (p.paddingRight as number) ?? 0;
    const pt = (p.paddingTop as number) ?? 0;
    const pb = (p.paddingBottom as number) ?? 0;
    if (fw > 0 && (pl + pr) >= fw) {
      ctx.warnings.push(`Padding H (${pl}+${pr}=${pl + pr}) ≥ frame width (${fw}px) — children will have no horizontal space`);
    }
    if (fh > 0 && (pt + pb) >= fh) {
      ctx.warnings.push(`Padding V (${pt}+${pb}=${pt + pb}) ≥ frame height (${fh}px) — children will have no vertical space`);
    }
  }

  // ── Corner radius ──
  if (p.cornerRadius != null) {
    const radiusBound = await applyCornerRadius(frame as SceneNode, p.cornerRadius as any, ctx.useLib);
    ctx.libraryBindings.push(...radiusBound);
  }
  // Per-corner overrides (after uniform cornerRadius so they take precedence)
  if (p.topLeftRadius != null) frame.topLeftRadius = p.topLeftRadius as number;
  if (p.topRightRadius != null) frame.topRightRadius = p.topRightRadius as number;
  if (p.bottomRightRadius != null) frame.bottomRightRadius = p.bottomRightRadius as number;
  if (p.bottomLeftRadius != null) frame.bottomLeftRadius = p.bottomLeftRadius as number;

  // ── Alignment ──
  if (p.primaryAxisAlignItems) {
    frame.primaryAxisAlignItems = p.primaryAxisAlignItems as 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  }
  if (p.counterAxisAlignItems) {
    frame.counterAxisAlignItems = p.counterAxisAlignItems as 'MIN' | 'CENTER' | 'MAX';
  }
  if (p.layoutWrap) {
    setLayoutWrap(frame, p.layoutWrap as string);
  }

  // ── Appearance ──
  if (p.opacity != null) frame.opacity = p.opacity as number;
  if (p.visible === false) frame.visible = false;
  if (p.rotation != null) frame.rotation = p.rotation as number;
  if (p.blendMode) setBlendMode(frame, p.blendMode as string);
  if (p.clipsContent != null) frame.clipsContent = p.clipsContent as boolean;
  if (p.layoutPositioning === 'ABSOLUTE') setLayoutPositioning(frame, 'ABSOLUTE');

  // ── Effect style (shadows/blurs) ──
  if (p.effectStyleName) {
    try {
      const effectStyles = await figma.getLocalEffectStylesAsync();
      const name = p.effectStyleName as string;
      const match = effectStyles.find(s => s.name === name)
        ?? effectStyles.find(s => s.name.toLowerCase() === name.toLowerCase());
      if (match) {
        await setEffectStyleIdAsync(frame, match.id);
      } else {
        ctx.warnings.push(`effectStyle "${name}" not found`);
      }
    } catch (err) { ctx.warnings.push(`effectStyle failed: ${err instanceof Error ? err.message : String(err)}`); }
  }

  // ── Responsive constraints ──
  if (p.minWidth != null) frame.minWidth = p.minWidth as number;
  if (p.maxWidth != null) frame.maxWidth = p.maxWidth as number;
  if (p.minHeight != null) frame.minHeight = p.minHeight as number;
  if (p.maxHeight != null) frame.maxHeight = p.maxHeight as number;

  // ── Auto-infer responsive constraints when FILL + children + no explicit constraints ──
  if (p.minWidth == null && p.maxWidth == null && frame.layoutMode && frame.layoutMode !== 'NONE') {
    const name = frame.name.toLowerCase();
    // Cards and panels: set minWidth to avoid collapse
    if (/card|panel|tile/.test(name) && frame.width >= 120) {
      frame.minWidth = Math.max(120, Math.round(frame.width * 0.5));
      ctx.hints.push({ confidence: 'deterministic', field: 'minWidth', value: frame.minWidth, reason: 'card/panel minimum' });
    }
    // Buttons: minimum touch target + label space
    if (/button|btn|cta/.test(name)) {
      frame.minWidth = Math.max(48, Math.round(frame.width * 0.5));
      frame.minHeight = frame.minHeight ?? Math.max(36, Math.min(frame.height, 48));
      ctx.hints.push({ confidence: 'deterministic', field: 'minWidth', value: frame.minWidth, reason: 'button constraints' });
      ctx.hints.push({ confidence: 'deterministic', field: 'minHeight', value: frame.minHeight, reason: 'button constraints' });
    }
    // Input fields: minimum usable width
    if (/input|field|text.?field|search.?bar/.test(name)) {
      frame.minWidth = Math.max(80, Math.round(frame.width * 0.4));
      ctx.hints.push({ confidence: 'deterministic', field: 'minWidth', value: frame.minWidth, reason: 'input field minimum' });
    }
  }
}

// ─── Core text setup (shared by create_text and inline children) ───
async function setupText(
  text: TextNode,
  p: Record<string, unknown>,
  ctx: CreateContext,
): Promise<void> {
  normalizeAliases(p);

  const content = (p.content as string) ?? (p.text as string) ?? '';
  const name = (p.name as string) ?? (content || 'Text');
  const fontSize = (p.fontSize as number) ?? 14;
  const fontFamily = (p.fontFamily as string) ?? 'Inter';
  const fontStyle = normalizeFontStyle((p.fontStyle as string) ?? 'Regular');

  const fontResolution = await resolveFontAsync(fontFamily, fontStyle);
  text.fontName = fontResolution.fontName;
  if (fontResolution.fallbackNote) ctx.warnings.push(fontResolution.fallbackNote);
  text.name = name;
  text.fontSize = fontSize;
  text.characters = content;

  if (p.x != null) text.x = p.x as number;
  if (p.y != null) text.y = p.y as number;

  // ── Width → fixed width + HEIGHT auto-resize ──
  if (p.width != null) {
    text.resize(p.width as number, text.height);
    text.textAutoResize = 'HEIGHT';
  }

  // ── Fill / color ──
  if (p.fill != null) {
    const fillResult = await applyFill(
      text, p.fill as any, 'textColor', ctx.useLib, ctx.library,
      { stylesPreloaded: true },
    );
    if (fillResult.autoBound) ctx.libraryBindings.push(fillResult.autoBound);
    if (fillResult.colorHint) ctx.warnings.push(fillResult.colorHint);
    // When not in library mode but fill is a hex color, try matching local variables/styles
    if (!fillResult.autoBound && !ctx.useLib && typeof p.fill === 'string') {
      try {
        const localBound = await tryLocalColorMatch(text as any, 'textColor');
        if (localBound) ctx.libraryBindings.push(localBound);
      } catch { /* best effort */ }
    }
  } else if (ctx.useLib) {
    const fillResult = await applyFill(
      text, undefined, 'textColor', ctx.useLib, ctx.library,
      { stylesPreloaded: true },
    );
    if (fillResult.autoBound) ctx.libraryBindings.push(fillResult.autoBound);
    if (fillResult.colorHint) ctx.warnings.push(fillResult.colorHint);
  }

  // ── Line height (before typography binding so it can be overridden) ──
  if (p.lineHeight != null) {
    text.lineHeight = { value: p.lineHeight as number, unit: 'PIXELS' };
  }

  // ── Text style binding ──
  if (p.textStyleName) {
    let bound = false;
    // Try library style registry first (if library mode)
    if (ctx.useLib) {
      const styleMatch = getTextStyleId(fontSize, { styleName: p.textStyleName as string } as any);
      if (styleMatch) {
        try {
          await setTextStyleIdAsync(text,styleMatch.id);
          ctx.libraryBindings.push(`textStyle:${styleMatch.name}`);
          bound = true;
        } catch (err) { ctx.warnings.push(`textStyle bind failed: ${err instanceof Error ? err.message : String(err)}`); }
      }
    }
    // Fallback: try local text styles
    if (!bound) {
      try {
        const localStyles = await figma.getLocalTextStylesAsync();
        const name = p.textStyleName as string;
        const match = localStyles.find(s => s.name === name)
          ?? localStyles.find(s => s.name.toLowerCase() === name.toLowerCase());
        if (match) {
          await setTextStyleIdAsync(text,match.id);
          ctx.libraryBindings.push(`textStyle:${match.name}`);
        } else {
          ctx.warnings.push(`textStyle "${name}" not found`);
        }
      } catch (err) { ctx.warnings.push(`textStyle lookup failed: ${err instanceof Error ? err.message : String(err)}`); }
    }
  } else if (ctx.useLib) {
    // Auto-bind typography by fontSize
    const fontHints = { fontFamily: fontResolution.fontName.family, fontWeight: fontResolution.fontName.style };
    const styleMatch = getTextStyleId(fontSize, fontHints);
    if (styleMatch) {
      try {
        await setTextStyleIdAsync(text,styleMatch.id);
        ctx.libraryBindings.push(`textStyle:${styleMatch.name}`);
      } catch { /* skip */ }
    } else {
      try {
        const typoResult = await autoBindTypography(text, fontSize, ctx.library!, {
          skipFontFamily: p.fontFamily !== undefined,
        });
        if (typoResult?.scale) ctx.libraryBindings.push(`typo:${typoResult.scale}`);
      } catch { /* skip */ }
    }
  }

  // ── Typography props ──
  if (p.letterSpacing != null) {
    text.letterSpacing = { value: p.letterSpacing as number, unit: 'PIXELS' };
  }
  if (p.textAlignHorizontal) {
    text.textAlignHorizontal = p.textAlignHorizontal as 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  }
  if (p.textAlignVertical) {
    text.textAlignVertical = p.textAlignVertical as 'TOP' | 'CENTER' | 'BOTTOM';
  }
  if (p.textAutoResize && !p.width) {
    text.textAutoResize = p.textAutoResize as 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE';
  }
  if (p.textCase) {
    text.textCase = p.textCase as 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE' | 'SMALL_CAPS' | 'SMALL_CAPS_FORCED';
  }
  if (p.textDecoration) {
    text.textDecoration = p.textDecoration as 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
  }

  // ── Appearance ──
  if (p.opacity != null) text.opacity = p.opacity as number;
  if (p.visible === false) text.visible = false;

  // ── Component text property auto-bind (best effort) ──
  try {
    const ancestorComp = findAncestorComponent(text);
    if (ancestorComp) {
      const defs = ancestorComp.componentPropertyDefinitions;
      const matchingKey = Object.keys(defs).find(
        k => defs[k].type === 'TEXT' && k.startsWith(text.name + '#'),
      );
      if (matchingKey) {
        text.componentPropertyReferences = { characters: matchingKey };
        ctx.warnings.push(`Auto-bound text "${text.name}" to component property`);
      }
    }
  } catch { /* best effort — do not fail text creation */ }
}

/** Walk up the parent chain to find the nearest ComponentNode ancestor. */
function findAncestorComponent(node: BaseNode): ComponentNode | null {
  let current = node.parent;
  while (current) {
    if (current.type === 'COMPONENT') return current as ComponentNode;
    current = current.parent;
  }
  return null;
}

// ─── Shape child helper (deduplicates rectangle/ellipse/star/polygon creation) ───
/** Insert child into parent, respecting optional index for ordering control. */
function insertOrAppend(parent: FrameNode, child: SceneNode, index?: number): void {
  if (index != null) {
    parent.insertChild(index, child);
  } else {
    parent.appendChild(child);
  }
}

async function createShapeChild(
  node: SceneNode,
  figmaType: string,
  defaultName: string,
  child: Record<string, unknown>,
  parent: FrameNode,
  ctx: CreateContext,
  opts?: { supportsCornerRadius?: boolean },
): Promise<{ id: string; type: string; name: string }> {
  (node as any).name = (child.name as string) ?? defaultName;
  (node as any).resize((child.width as number) ?? 100, (child.height as number) ?? 100);

  const fillInput = child.fillVariableName ? { _variable: child.fillVariableName }
    : child.fillStyleName ? { _style: child.fillStyleName } : child.fill;
  if (fillInput != null) {
    const fr = await applyFill(node as any, fillInput as any, 'background', ctx.useLib, ctx.library);
    if (fr.autoBound) ctx.libraryBindings.push(fr.autoBound);
  }
  const strokeInput = child.strokeVariableName ? { _variable: child.strokeVariableName } : child.strokeColor;
  if (strokeInput != null) {
    const sb = await applyStroke(node as any, strokeInput as any, (child.strokeWeight as number) ?? 1, ctx.useLib, ctx.library);
    if (sb) ctx.libraryBindings.push(sb);
  }
  if (opts?.supportsCornerRadius && child.cornerRadius != null) {
    const rb = await applyCornerRadius(node as any, child.cornerRadius as any, ctx.useLib);
    ctx.libraryBindings.push(...rb);
  }
  if (child.opacity != null) (node as any).opacity = child.opacity as number;
  if (child.rotation != null) (node as any).rotation = child.rotation as number;

  insertOrAppend(parent, node, child.index as number | undefined);
  inferChildSizing(node, parent, child.layoutSizingHorizontal as string | undefined,
    child.layoutSizingVertical as string | undefined, ctx.hints, child.width != null, child.height != null);
  applySizingOverrides(node, child);
  return { id: node.id, type: figmaType, name: (node as any).name };
}

// ─── Inline children: recursive tree builder ───
const MAX_INLINE_DEPTH = 10;

/** Recursively collect unique font specs from text children for batch preloading. */
function collectTextFonts(children: unknown[]): Array<{ family: string; style: string }> {
  const fonts: Array<{ family: string; style: string }> = [];
  for (const childDef of children) {
    const child = childDef as Record<string, unknown>;
    const type = (child.type as string) ?? 'frame';
    if (type === 'text') {
      fonts.push({
        family: (child.fontFamily as string) ?? 'Inter',
        style: normalizeFontStyle((child.fontStyle as string) ?? 'Regular'),
      });
    }
    if (Array.isArray(child.children)) {
      fonts.push(...collectTextFonts(child.children));
    }
  }
  return fonts;
}

async function createInlineChildren(
  parent: FrameNode,
  children: unknown[],
  ctx: CreateContext,
  depth = 0,
): Promise<Array<{ id: string; type: string; name: string }>> {
  if (depth >= MAX_INLINE_DEPTH) {
    ctx.warnings.push(`Max inline children depth (${MAX_INLINE_DEPTH}) reached — deeper children skipped`);
    return [];
  }

  // Batch-preload all text fonts at root level (parallel Promise.all vs serial per-node)
  if (depth === 0) {
    const fonts = collectTextFonts(children);
    const unique = [...new Map(fonts.map(f => [`${f.family}:${f.style}`, f])).values()];
    if (unique.length > 0) {
      await Promise.all(unique.map(f => resolveFontAsync(f.family, f.style)));
    }
  }

  const results: Array<{ id: string; type: string; name: string }> = [];

  for (const [idx, childDef] of children.entries()) {
    const child = { ...(childDef as Record<string, unknown>) };
    const childType = (child.type as string) ?? 'frame';
    const childName = (child.name as string) ?? `child[${idx}]`;
    const childPath = `${parent.name} > ${childName}`;
    let createdNode: SceneNode | undefined;

    try {
    if (childType === 'text') {
      const text = figma.createText();
      await setupText(text, child, ctx);
      insertOrAppend(parent, text, child.index as number | undefined);
      // Smart default: text in vertical AL → FILL width + HEIGHT resize
      inferChildSizing(text, parent, child.layoutSizingHorizontal as string | undefined, child.layoutSizingVertical as string | undefined, ctx.hints, child.width != null, child.height != null);
      applySizingOverrides(text, child);
      // Text in vertical auto-layout: default to HEIGHT auto-resize when FILL width
      if (!child.textAutoResize && !child.width && parent.layoutMode === 'VERTICAL') {
        text.textAutoResize = 'HEIGHT';
      }
      createdNode = text;
      results.push({ id: text.id, type: 'TEXT', name: text.name });
    } else if (childType === 'rectangle') {
      const rect = figma.createRectangle();
      const result = await createShapeChild(rect, 'RECTANGLE', 'Rectangle', child, parent, ctx, { supportsCornerRadius: true });
      createdNode = rect;
      results.push(result);
    } else if (childType === 'instance') {
      const componentId = child.componentId as string;
      assertHandler(componentId, 'instance child requires componentId');
      const cNode = await findNodeByIdAsync(componentId);
      assertHandler(cNode, `Component not found: ${componentId}`, 'NOT_FOUND');

      const component = resolveComponent(cNode, child.variantProperties as Record<string, string> | undefined);

      const instance = component.createInstance();
      if (child.name) instance.name = child.name as string;
      if (child.width != null || child.height != null) {
        instance.resize(
          (child.width as number) ?? instance.width,
          (child.height as number) ?? instance.height,
        );
      }
      // Set component properties
      if (child.properties) {
        setComponentProperties(instance, child.properties as Record<string, string | boolean>);
      }
      insertOrAppend(parent, instance, child.index as number | undefined);
      inferChildSizing(instance, parent, child.layoutSizingHorizontal as string | undefined, child.layoutSizingVertical as string | undefined, ctx.hints, child.width != null, child.height != null);
      applySizingOverrides(instance, child);
      createdNode = instance;
      results.push({ id: instance.id, type: 'INSTANCE', name: instance.name });
    } else if (childType === 'ellipse') {
      const ellipse = figma.createEllipse();
      const result = await createShapeChild(ellipse, 'ELLIPSE', 'Ellipse', child, parent, ctx);
      createdNode = ellipse;
      results.push(result);
    } else if (childType === 'svg') {
      const svg = child.svg as string;
      assertHandler(svg, 'svg child requires svg parameter');
      const svgNode = figma.createNodeFromSvg(svg);
      svgNode.name = (child.name as string) ?? 'SVG';
      if (child.width != null || child.height != null) {
        svgNode.resize(
          (child.width as number) ?? svgNode.width,
          (child.height as number) ?? svgNode.height,
        );
      }
      insertOrAppend(parent, svgNode, child.index as number | undefined);
      inferChildSizing(svgNode, parent, child.layoutSizingHorizontal as string | undefined, child.layoutSizingVertical as string | undefined, ctx.hints, child.width != null, child.height != null);
      applySizingOverrides(svgNode, child);
      createdNode = svgNode;
      results.push({ id: svgNode.id, type: 'FRAME', name: svgNode.name });
    } else if (childType === 'star') {
      const star = figma.createStar();
      if (child.pointCount != null) star.pointCount = child.pointCount as number;
      if (child.innerRadius != null) star.innerRadius = child.innerRadius as number;
      const result = await createShapeChild(star, 'STAR', 'Star', child, parent, ctx);
      createdNode = star;
      results.push(result);
    } else if (childType === 'polygon') {
      const polygon = figma.createPolygon();
      if (child.pointCount != null) polygon.pointCount = child.pointCount as number;
      const result = await createShapeChild(polygon, 'POLYGON', 'Polygon', child, parent, ctx);
      createdNode = polygon;
      results.push(result);
    } else {
      // frame type (default)
      const frame = figma.createFrame();
      try {
        await setupFrame(frame, child, ctx);
        insertOrAppend(parent, frame, child.index as number | undefined);
        // Smart default sizing
        inferChildSizing(frame, parent, child.layoutSizingHorizontal as string | undefined, child.layoutSizingVertical as string | undefined, ctx.hints, child.width != null, child.height != null);
        // Explicit sizing overrides smart defaults (AFTER appendChild)
        applySizingOverrides(frame, child);
        // Recurse into nested children
        if (Array.isArray(child.children) && child.children.length > 0) {
          await createInlineChildren(frame, child.children, ctx, depth + 1);
        }
        createdNode = frame;
        results.push({ id: frame.id, type: 'FRAME', name: frame.name });
      } catch (e) {
        frame.remove();
        throw e;
      }
    }
    } catch (e) {
      // Clean up orphaned node on failure (frame type handles its own cleanup above)
      if (createdNode) {
        try { createdNode.remove(); } catch { /* already removed */ }
      }
      throw e;
    }

    // ── Per-child inline validation + self-healing ──
    if (createdNode) {
      validateChildNode(createdNode, parent, childPath, ctx);
    }
  }

  return results;
}

// ─── Post-creation root frame validation ───
// Checks the ROOT frame itself (not children — those are covered by per-child
// validateChildNode during createInlineChildren). Non-blocking.
function postCreationValidation(frame: FrameNode, warnings: string[]): void {
  try {
    const w = Math.round(frame.width);
    const h = Math.round(frame.height);

    // 1. Abnormal aspect ratio (likely a sizing/layout issue)
    if (h > 0 && w > 0) {
      const ratio = Math.max(w, h) / Math.min(w, h);
      if (ratio > 20) {
        warnings.push(`Root frame abnormal aspect ratio (${w}×${h}, ratio ${ratio.toFixed(0)}:1) — likely a sizing issue`);
      }
    }

    // 2. Root frame collapsed
    if (w <= 1 || h <= 1) {
      warnings.push(`Root frame collapsed to ${w}×${h} — check sizing (HUG parent + FILL child?)`);
    }

    // 3. Absolute-layout overflow (only for non-auto-layout roots)
    if (frame.layoutMode === 'NONE' && 'children' in frame) {
      for (const child of frame.children) {
        if ('width' in child && 'height' in child) {
          const cx = (child as any).x ?? 0;
          const cy = (child as any).y ?? 0;
          const cw = (child as any).width as number;
          const ch = (child as any).height as number;
          if (cx + cw > w + 2 || cy + ch > h + 2) {
            warnings.push(`Child "${child.name}" (${Math.round(cw)}×${Math.round(ch)}) overflows root (${w}×${h}) in absolute layout`);
          }
        }
      }
    }
  } catch {
    // Validation must never block creation
  }
}

/** Create a single frame with full pipeline (validate → setup → children → lint).
 *  @param skipLint Skip post-creation lint (used in batch mode to defer lint). */
async function createSingleFrame(params: Record<string, unknown>, skipLint = false): Promise<Record<string, unknown>> {
  const rootName = (params.name as string) ?? 'Frame';
  const preValidation = validateParams(params, rootName);

  // ── dryRun: validate + preview inferences without creating nodes ──
  if (params.dryRun) {
    const result: Record<string, unknown> = {
      dryRun: true,
      valid: !preValidation.hasConflict,
    };
    if (preValidation.hasConflict) {
      result.error = preValidation.conflictMessage;
    }
    if (preValidation.inferences.length > 0) {
      result.inferences = preValidation.inferences;
      const hasAmbiguity = preValidation.inferences.some(i => i.confidence === 'ambiguous');
      if (hasAmbiguity) {
        result.ambiguous = true;
        result.diff = formatDiff(preValidation.inferences);
        result.correctedPayload = buildCorrectedPayload(params, preValidation.inferences);
      }
    }
    return result;
  }

  if (preValidation.hasConflict) {
    throw new Error(preValidation.conflictMessage);
  }

  // ── Two-Path Authoring: branch on access tier for ambiguous inferences ──
  const hasAmbiguousInference = preValidation.inferences.some(i => i.confidence === 'ambiguous');
  if (hasAmbiguousInference) {
    const canEdit = !!(params._caps as Record<string, unknown> | undefined)?.edit;
    const diff = formatDiff(preValidation.inferences);
    const correctedPayload = buildCorrectedPayload(params, preValidation.inferences);

    if (canEdit) {
      // Edit-tier: auto-stage — create in a staging frame for later commit
      const stageFrame = figma.createFrame();
      stageFrame.name = `[staged] ${rootName}`;
      stageFrame.resize(1, 1);
      stageFrame.visible = false;
      // Store original parentId in plugin data for commit
      if (params.parentId) {
        stageFrame.setPluginData('stageTargetParentId', params.parentId as string);
      }
      stageFrame.setPluginData('stageOriginalParams', JSON.stringify(params));

      try {
        // Build the frame inside the stage container
        const ctx = await initCreateContext();
        const frame = figma.createFrame();
        const p = { ...params };
        await setupFrame(frame, p, ctx);
        stageFrame.appendChild(frame);

        if (Array.isArray(params.children) && params.children.length > 0) {
          await createInlineChildren(frame, params.children as unknown[], ctx);
        }

        return {
          id: stageFrame.id,
          status: 'staged',
          diff,
          correctedPayload,
          _typedHints: [{ type: 'warn' as const, message: `Ambiguous layout staged — use commit to finalize or discard.` }],
        };
      } catch (e) {
        stageFrame.remove();
        throw e;
      }
    } else {
      // Create-tier: reject with structured learning payload (not thrown)
      return {
        error: 'Ambiguous layout intent — review the diff and re-create with the corrected payload.',
        diff,
        correctedPayload,
      };
    }
  }

  const ctx = await initCreateContext();
  const frame = figma.createFrame();
  try {
    const p = { ...params };
    await setupFrame(frame, p, ctx);

    let parentNode: BaseNode | null = null;
    if (params.parentId) {
      parentNode = await findNodeByIdAsync(params.parentId as string);
      if (parentNode && 'appendChild' in parentNode) {
        (parentNode as FrameNode).appendChild(frame);
      }
    }

    inferChildSizing(frame, parentNode, params.layoutSizingHorizontal as string | undefined, params.layoutSizingVertical as string | undefined, ctx.hints, params.width != null, params.height != null);
    applySizingOverrides(frame, params);

    let childResults: Array<{ id: string; type: string; name: string }> | undefined;
    if (Array.isArray(params.children) && params.children.length > 0) {
      childResults = await createInlineChildren(frame, params.children as unknown[], ctx);
    }

    // ── Post-creation structural validation ──
    postCreationValidation(frame, ctx.warnings);

    const result = simplifyNode(frame);
    const out = result as unknown as Record<string, unknown>;
    if (ctx.libraryBindings.length > 0) out._libraryBindings = ctx.libraryBindings;
    // _hints removed — _typedHints carries the same info in structured form
    if (ctx.warnings.length > 0) out._warnings = ctx.warnings;
    if (childResults) out._children = childResults;

    const allInferences: Inference[] = [
      ...preValidation.inferences,
      ...structuredHintsToInferences(ctx.hints, rootName),
    ];
    if (allInferences.length > 0) {
      const ambiguousInferences = allInferences.filter(i => i.confidence === 'ambiguous');
      // Only include ambiguous inferences in response (deterministic ones are noise)
      if (ambiguousInferences.length > 0) {
        out._inferences = ambiguousInferences;
        out._diff = formatDiff(allInferences);
        out._correctedPayload = buildCorrectedPayload(params, allInferences);
      }
      out._inferenceCount = allInferences.length;
    }

    // Attach typed hints for batch aggregation — cap at 10 most important
    const typedHints: Hint[] = [
      ...structuredHintsToTyped(ctx.hints),
      ...ctx.typedHints,
    ];
    if (ctx.warnings.length > 0) {
      typedHints.push(...ctx.warnings.map(w => ({ type: 'error' as const, message: w })));
    }
    if (typedHints.length > 0) {
      const priority: Record<string, number> = { error: 0, warn: 1, suggest: 2, confirm: 3 };
      typedHints.sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9));
      const capped = typedHints.slice(0, 10);
      out._typedHints = capped;
      if (typedHints.length > 10) out._typedHintsTruncated = typedHints.length - 10;
    }

    if (!skipLint && childResults && childResults.length > 0) {
      try {
        // Build skipRules from pre-creation inferences to avoid redundant lint checks
        const skipRules = new Set<string>();
        for (const inf of preValidation.inferences) {
          if (inf.field === 'type' && inf.to === 'rectangle') {
            skipRules.add('spacer-frame');
          } else if (inf.field === 'layoutMode') {
            skipRules.add('no-autolayout');
          }
          const mapped = PRE_RULE_TO_LINT_RULE[inf.field];
          if (mapped) skipRules.add(mapped);
        }
        const lintSummary = await quickLintSummary(frame.id, true, skipRules.size > 0 ? skipRules : undefined);
        if (lintSummary) out._lintSummary = lintSummary;
      } catch { /* lint failure should not block creation */ }
    }

    // Preview hint: node is auto-focused in Figma viewport; AI can call export_image for visual verification
    if (!skipLint && !params.noPreview) {
      out._previewHint = `Use export_image(nodeId:"${frame.id}", scale:0.5) for visual verification`;
    }

    return out;
  } catch (e) {
    frame.remove();
    throw e;
  }
}

/** Create a single text node with full pipeline. */
async function createSingleText(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const ctx = await initCreateContext();
  const text = figma.createText();
  try {
    const p = { ...params };
    await setupText(text, p, ctx);

    // ── Parent append ──
    let parentNode: BaseNode | null = null;
    if (params.parentId) {
      parentNode = await findNodeByIdAsync(params.parentId as string);
      if (parentNode && 'appendChild' in parentNode) {
        (parentNode as FrameNode).appendChild(text);
      }
    }

    // ── Smart default sizing (AFTER appendChild) ──
    inferChildSizing(
      text, parentNode,
      params.layoutSizingHorizontal as string | undefined,
      params.layoutSizingVertical as string | undefined,
      ctx.hints,
      params.width != null, params.height != null,
    );
    applySizingOverrides(text, params);
    if (!params.textAutoResize && !params.width && parentNode && 'layoutMode' in parentNode
        && (parentNode as FrameNode).layoutMode === 'VERTICAL') {
      text.textAutoResize = 'HEIGHT';
    }

    const result = simplifyNode(text);
    const out = result as unknown as Record<string, unknown>;
    if (ctx.libraryBindings.length > 0) out._libraryBindings = ctx.libraryBindings;
    // _hints removed — _typedHints carries the same info
    if (ctx.warnings.length > 0) out._warnings = ctx.warnings;
    // Attach typed hints for batch aggregation — cap at 10
    const typedHints: Hint[] = [
      ...structuredHintsToTyped(ctx.hints),
      ...ctx.typedHints,
    ];
    if (ctx.warnings.length > 0) {
      typedHints.push(...ctx.warnings.map(w => ({ type: 'error' as const, message: w })));
    }
    if (typedHints.length > 0) out._typedHints = typedHints;
    return out;
  } catch (e) {
    text.remove();
    throw e;
  }
}

export function registerCreateHandlers(): void {

registerHandler('create_frame', async (params) => {
  // ── Batch mode: items[] array ──
  if (Array.isArray(params.items)) {
    const items = params.items as Array<Record<string, unknown>>;
    assertHandler(items.length > 0, 'items array must not be empty');
    assertHandler(items.length <= 20, 'Maximum 20 frames per batch');

    // Pre-validate all parentIds before starting batch creation
    const uniqueParentIds = [...new Set(items.map(i => i.parentId as string | undefined).filter(Boolean))] as string[];
    for (const pid of uniqueParentIds) {
      const node = await findNodeByIdAsync(pid);
      if (!node) throw new Error(`Batch aborted: parentId "${pid}" not found — no nodes were created`);
      if (!('appendChild' in node)) throw new Error(`Batch aborted: parentId "${pid}" is not a container — no nodes were created`);
    }

    const results: Array<{ id: string; name: string; ok: boolean; error?: string }> = [];
    const allHints: Hint[] = [];
    const allInferences: Inference[] = [];
    const progressId = items.length > 3 ? (params._commandId as string | undefined) : undefined;
    if (progressId) sendBatchProgress(progressId, 0, items.length);
    for (const [idx, item] of items.entries()) {
      try {
        const out = await createSingleFrame(item, true); // skip per-item lint
        results.push({ id: (out as any).id, name: (out as any).name, ok: true });
        // Collect typed hints from per-item results
        if (out._typedHints) {
          allHints.push(...(out._typedHints as Hint[]));
          delete out._typedHints;
        }
        // Collect inferences for aggregated skipRules
        if (out._inferences) {
          allInferences.push(...(out._inferences as Inference[]));
          delete out._inferences;
        }
      } catch (err) {
        results.push({
          id: '',
          name: (item.name as string) ?? 'Frame',
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (progressId && (idx + 1) % 3 === 0) sendBatchProgress(progressId, idx + 1, items.length);
    }
    if (progressId) sendBatchProgress(progressId, items.length, items.length);
    // Run lint once for all created frames (instead of per-item)
    const createdIds = results.filter(r => r.ok && r.id).map(r => r.id);
    let batchLintSummary: unknown = undefined;
    if (createdIds.length > 0) {
      try {
        // Build aggregated skipRules from all items' inferences
        const batchSkipRules = new Set<string>();
        for (const inf of allInferences) {
          if (inf.field === 'type' && inf.to === 'rectangle') batchSkipRules.add('spacer-frame');
          else if (inf.field === 'layoutMode') batchSkipRules.add('no-autolayout');
          const mapped = PRE_RULE_TO_LINT_RULE[inf.field];
          if (mapped) batchSkipRules.add(mapped);
        }
        const summaries = await Promise.all(
          createdIds.map(id => quickLintSummary(id, true, batchSkipRules.size > 0 ? batchSkipRules : undefined))
        );
        const perItem: Array<{ nodeId: string; violations: number; autoFixed: number }> = [];
        let totalViolations = 0;
        let totalAutoFixed = 0;
        for (let i = 0; i < createdIds.length; i++) {
          const s = summaries[i];
          const v = s?.violations ?? 0;
          const af = (s as any)?.autoFixed ?? 0;
          totalViolations += v;
          totalAutoFixed += af;
          if (v > 0 || af > 0) perItem.push({ nodeId: createdIds[i], violations: v, autoFixed: af });
        }
        if (totalViolations > 0 || totalAutoFixed > 0) {
          batchLintSummary = { violations: totalViolations, autoFixed: totalAutoFixed, perItem };
        }
      } catch { /* lint failure should not block batch */ }
    }
    const batchResult: Record<string, unknown> = { created: results.filter(r => r.ok).length, total: items.length, items: results };
    if (batchLintSummary) batchResult._lintSummary = batchLintSummary;
    // Aggregate hints: suppress confirmations, dedup suggest/warn, batch hardcoded colors
    const aggregated = aggregateHints(allHints);
    if (aggregated.length > 0) batchResult.warnings = aggregated;
    return batchResult;
  }

  // ── Single mode (default) ──
  return createSingleFrame(params as Record<string, unknown>);
});

registerHandler('create_text', async (params) => {
  // ── Batch mode: items[] array ──
  if (Array.isArray(params.items)) {
    const items = params.items as Array<Record<string, unknown>>;
    assertHandler(items.length > 0, 'items array must not be empty');
    assertHandler(items.length <= 50, 'Maximum 50 text nodes per batch');

    // Pre-validate all parentIds before starting batch creation
    const uniqueParentIds = [...new Set(items.map(i => i.parentId as string | undefined).filter(Boolean))] as string[];
    for (const pid of uniqueParentIds) {
      const node = await findNodeByIdAsync(pid);
      if (!node) throw new Error(`Batch aborted: parentId "${pid}" not found — no nodes were created`);
      if (!('appendChild' in node)) throw new Error(`Batch aborted: parentId "${pid}" is not a container — no nodes were created`);
    }

    const results: Array<{ id: string; name: string; ok: boolean; error?: string }> = [];
    const allHints: Hint[] = [];
    const textProgressId = items.length > 3 ? (params._commandId as string | undefined) : undefined;
    if (textProgressId) sendBatchProgress(textProgressId, 0, items.length);
    for (const [idx, item] of items.entries()) {
      try {
        const out = await createSingleText(item);
        results.push({ id: out.id as string, name: out.name as string, ok: true });
        // Collect typed hints
        if (out._typedHints) {
          allHints.push(...(out._typedHints as Hint[]));
          delete out._typedHints;
        }
      } catch (err) {
        results.push({
          id: '',
          name: (item.content as string) ?? (item.name as string) ?? 'Text',
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (textProgressId && (idx + 1) % 3 === 0) sendBatchProgress(textProgressId, idx + 1, items.length);
    }
    if (textProgressId) sendBatchProgress(textProgressId, items.length, items.length);
    const batchResult: Record<string, unknown> = { created: results.filter(r => r.ok).length, total: items.length, items: results };
    const aggregated = aggregateHints(allHints);
    if (aggregated.length > 0) batchResult.warnings = aggregated;
    return batchResult;
  }

  // ── Single mode (default) ──
  return createSingleText(params as Record<string, unknown>);
});

} // registerCreateHandlers
